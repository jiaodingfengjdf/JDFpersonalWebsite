/**
 * 个人 Agent 数据层：记忆 / 任务 / 笔记 / 技能 + 工具上下文 + 记忆抽取。
 *
 * 迁移分片 b-2：从 store.ts 整块搬出来。只吃注入的 `{ getState, setState, toast }`，
 * 对 store 只用 `import type`，因此没有运行时循环依赖，也能在 Node 里用假状态单测
 * （见 scripts/check-agent.ts）。
 *
 * 这里的函数都不碰 UI 与流式状态，只做「读状态 → 计算 → patch + 落盘」。
 */
import { createMessage } from '../api/client';
import { generateImage as generateImageApi } from '../api/image';
import { fetchPage as fetchPageApi, searchWeb } from '../api/tools';
import type { Conversation } from '../api/types';
import type { AgentNote, AgentTask, Memory, ToolContext } from '../agent/types';
import { isDuplicateMemory, parseMemoryExtraction } from '../agent/memory';
import { describeRecurrence, nextOccurrence } from '../agent/recurrence';
import { setSkillRegistry } from '../agent/skillRegistry';
import { BUILTIN_SKILLS, type Skill } from '../agent/skills';
import { kvSet } from '../lib/idb';
import { assistantText } from '../lib/message';
import { uid } from '../lib/uid';
import type { AppState } from './store';

/** 本机存储键（initStore 读同一批键，所以导出）。 */
export const AGENT_KEYS = {
  memories: 'agent:memories',
  tasks: 'agent:tasks',
  notes: 'agent:notes',
  skills: 'agent:skills',
} as const;

export interface AgentDeps {
  getState: () => AppState;
  setState: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  toast: (text: string, kind?: 'info' | 'error' | 'success') => void;
}

/** 任务可改字段（子任务勾选也走这里）。 */
export type TaskPatch = Partial<
  Pick<
    AgentTask,
    | 'title'
    | 'status'
    | 'notes'
    | 'dueAt'
    | 'reminderAt'
    | 'notified'
    | 'recurrence'
    | 'lastCompletedAt'
    | 'snoozeMinutes'
    | 'subtasks'
  >
>;

export interface SkillInput {
  name: string;
  emoji?: string;
  when: string;
  steps: string;
}

export interface AgentApi {
  /** 把记忆 / 笔记 / 技能写盘并刷新工具层可见的技能表。 */
  persist: () => void;
  setAgentOpen: (open: boolean) => void;
  clearTaskFocus: () => void;
  addMemory: (text: string, tags?: string[]) => Memory | null;
  deleteMemory: (id: string) => void;
  updateTask: (id: string, patch: TaskPatch) => AgentTask | null;
  /** 「完成一次」：普通任务标 done，周期任务推进到下一次；返回提示文案。 */
  completeTaskOnce: (task: AgentTask) => string;
  toggleSkill: (id: string) => void;
  deleteSkill: (id: string) => void;
  installSkills: (ids: string[]) => number;
  addSkill: (input: SkillInput) => Skill;
  addNote: (input: { title?: string; text: string }) => AgentNote;
  deleteNote: (id: string) => void;
  /** 注入给纯函数工具层的读写上下文。 */
  toolContext: () => ToolContext;
  /** 每轮结束后异步抽取长期记忆（失败由调用方 toast）。 */
  extractMemories: (conv: Conversation) => Promise<void>;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？、；：,.!?;:（）()"“”'']/g, '');
}

function gramSet(text: string): Set<string> {
  const normalized = normalizeForMatch(text);
  const set = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) set.add(normalized.slice(i, i + 2));
  return set;
}

/** 关键词 + 2-gram 相似度，够用且不需要向量化。 */
function memoryScore(memory: Memory, query: string): number {
  const q = normalizeForMatch(query);
  if (!q) return 0;
  const text = normalizeForMatch(memory.text);
  let score = text.includes(q) ? 3 : 0;
  const a = gramSet(query);
  const b = gramSet(memory.text);
  if (a.size > 0 && b.size > 0) {
    let shared = 0;
    for (const gram of a) if (b.has(gram)) shared += 1;
    score += shared / Math.max(a.size, b.size);
  }
  if (memory.tags.some((tag) => normalizeForMatch(tag).includes(q))) score += 0.8;
  return score;
}

const EXTRACTION_SYSTEM = [
  '你是一个长期记忆抽取器，只输出 JSON，不要任何解释。',
  '从对话里抽取「关于用户的稳定事实」：身份、所在地、职业、长期偏好、正在进行的目标、重要关系、习惯。',
  '不要抽取临时信息（今天的心情、一次性的问题）、不要抽取助理说过的话、不要抽取猜测。',
  '每条写成自包含的一句话，主语是「用户」，不超过 60 字。',
  '输出格式：JSON 数组，元素为 {"text": "...", "tags": ["..."]}，没有可记的就输出 []。',
  '最多 4 条。',
].join('\n');

export function createAgentStore(deps: AgentDeps): AgentApi {
  /** 任务高亮自动清除的计时器（面板打开时由外部设置）。 */
  let focusTimer: ReturnType<typeof setTimeout> | null = null;

  const persist = (): void => {
    const state = deps.getState();
    void kvSet(AGENT_KEYS.memories, state.memories);
    void kvSet(AGENT_KEYS.notes, state.notes);
    void kvSet(AGENT_KEYS.skills, state.skills);
    setSkillRegistry(state.skills);
  };

  const setAgentOpen = (open: boolean): void => {
    const state = deps.getState();
    deps.setState({ agentOpen: open, agentFocusTaskId: open ? state.agentFocusTaskId : null });
  };

  const clearTaskFocus = (): void => {
    if (focusTimer) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    deps.setState({ agentFocusTaskId: null });
  };

  const upsertMemory = (
    text: string,
    tags: string[] = [],
    source: Memory['source'] = 'auto',
    silent = true,
  ): Memory | null => {
    const state = deps.getState();
    const clean = text.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (clean.length < 2) return null;
    if (isDuplicateMemory(clean, state.memories)) {
      if (!silent) deps.toast('这条已经记过了', 'info');
      return null;
    }
    const now = Date.now();
    const memory: Memory = {
      id: uid('mem'),
      text: clean,
      tags: tags.filter((t) => typeof t === 'string' && t.trim()).slice(0, 4),
      source,
      createdAt: now,
      updatedAt: now,
      hits: 0,
    };
    deps.setState((s) => ({ memories: [memory, ...s.memories] }));
    persist();
    return memory;
  };

  /** 面板里手动添加 */
  const addMemory = (text: string, tags: string[] = []): Memory | null =>
    upsertMemory(text, tags, 'user', false);

  const deleteMemory = (id: string): void => {
    deps.setState((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
    persist();
  };

  const updateTask = (id: string, patch: TaskPatch): AgentTask | null => {
    const state = deps.getState();
    const existing = state.tasks.find((t) => t.id === id);
    if (!existing) return null;
    const updated: AgentTask = { ...existing, ...patch, updatedAt: Date.now() };
    deps.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
    persist();
    return updated;
  };

  const completeTaskOnce = (task: AgentTask): string => {
    const now = Date.now();
    if (task.recurrence) {
      const next = nextOccurrence(task.recurrence, now);
      updateTask(task.id, {
        status: 'todo',
        lastCompletedAt: now,
        reminderAt: next,
        dueAt: next,
        notified: false,
        snoozeMinutes: undefined,
      });
      return `已完成，下次：${describeRecurrence(task.recurrence)}`;
    }
    updateTask(task.id, { status: 'done', snoozeMinutes: undefined });
    return `已完成：${task.title}`;
  };

  const toggleSkill = (id: string): void => {
    const state = deps.getState();
    deps.setState({
      skills: state.skills.map((skill) =>
        skill.id === id ? { ...skill, enabled: !skill.enabled } : skill,
      ),
    });
    persist();
  };

  const deleteSkill = (id: string): void => {
    const state = deps.getState();
    const target = state.skills.find((skill) => skill.id === id);
    if (target?.builtin) {
      deps.toast('内置技能只能停用，不能删除', 'info');
      return;
    }
    deps.setState({ skills: state.skills.filter((skill) => skill.id !== id) });
    persist();
  };

  const installSkills = (ids: string[]): number => {
    const state = deps.getState();
    const have = new Set(state.skills.map((skill) => skill.id));
    const missing = BUILTIN_SKILLS.filter((skill) => ids.includes(skill.id) && !have.has(skill.id));
    if (missing.length === 0) return 0;
    deps.setState({ skills: [...state.skills, ...missing] });
    persist();
    return missing.length;
  };

  const addSkill = (input: SkillInput): Skill => {
    const state = deps.getState();
    const now = Date.now();
    const skill: Skill = {
      id: uid('skill'),
      name: input.name.trim().slice(0, 40),
      emoji: (input.emoji || '✨').slice(0, 4),
      when: input.when.trim().slice(0, 300),
      steps: input.steps.trim().slice(0, 1200),
      enabled: true,
      createdAt: now,
    };
    deps.setState({ skills: [...state.skills, skill] });
    persist();
    return skill;
  };

  const addNote = (input: { title?: string; text: string }): AgentNote => {
    const now = Date.now();
    const text = input.text.trim();
    const note: AgentNote = {
      id: uid('note'),
      title: (input.title ?? '').trim() || text.slice(0, 20) || '未命名笔记',
      text,
      createdAt: now,
      updatedAt: now,
    };
    deps.setState((s) => ({ notes: [note, ...s.notes] }));
    persist();
    return note;
  };

  const deleteNote = (id: string): void => {
    deps.setState((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    persist();
  };

  const searchMemoriesLocal = (query: string, limit = 8): Memory[] => {
    const state = deps.getState();
    const scored = state.memories
      .map((memory) => ({ memory, score: memoryScore(memory, query) }))
      .filter((item) => item.score > 0.25)
      .sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt)
      .slice(0, limit);

    if (scored.length > 0) {
      const hitIds = new Set(scored.map((item) => item.memory.id));
      deps.setState((s) => ({
        memories: s.memories.map((m) =>
          hitIds.has(m.id) ? { ...m, hits: m.hits + 1, lastUsedAt: Date.now() } : m,
        ),
      }));
      persist();
    }
    return scored.map((item) => item.memory);
  };

  /** 工具执行上下文：把状态读写能力注入给纯函数工具层。 */
  const toolContext = (): ToolContext => ({
    now: () => Date.now(),
    location: () => deps.getState().settings.location,
    webSearch: (query, options) => {
      const { settings } = deps.getState();
      return searchWeb({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        query,
        options,
      });
    },
    generateImage: (prompt, options) => {
      const { settings } = deps.getState();
      return generateImageApi({
        apiKey: settings.imageApiKey,
        baseUrl: settings.imageBaseUrl,
        model: settings.imageModel,
        quality: options?.quality ?? settings.imageQuality,
        aspectRatio: options?.aspectRatio ?? settings.imageAspect,
        images: options?.images,
        prompt,
      });
    },
    fetchPage: (url) => {
      const { settings } = deps.getState();
      return fetchPageApi({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        url,
      });
    },
    listMemories: () => deps.getState().memories,
    addMemory: ({ text, tags }) =>
      upsertMemory(text, tags ?? [], 'auto') ?? {
        id: '',
        text,
        tags: tags ?? [],
        source: 'auto',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        hits: 0,
      },
    searchMemories: (query, limit) => searchMemoriesLocal(query, limit ?? 8),
    deleteMemory: (id) => {
      const exists = deps.getState().memories.some((m) => m.id === id);
      if (exists) deleteMemory(id);
      return exists;
    },
    listNotes: (query?: string) => {
      const notes = deps.getState().notes;
      if (!query?.trim()) return notes;
      const q = normalizeForMatch(query);
      return notes.filter(
        (n) => normalizeForMatch(n.title).includes(q) || normalizeForMatch(n.text).includes(q),
      );
    },
    addNote: (input) => addNote(input),
  });

  /** 每轮结束后异步抽取记忆；失败由调用方决定提示方式。 */
  const extractMemories = async (conv: Conversation): Promise<void> => {
    const settings = deps.getState().settings;
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user' && !m.hidden);
    const lastAssistant = [...conv.messages]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.hidden && assistantText(m));
    const userText = (lastUser?.text ?? '').slice(0, 1500);
    if (!userText.trim()) return;

    const { text } = await createMessage({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      body: {
        model: settings.model,
        max_tokens: 600,
        thinking: { type: 'disabled' },
        system: EXTRACTION_SYSTEM,
        safety_check: settings.safety === 'high' ? { level: 'high' } : undefined,
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `用户：${userText}\n\n助理：${lastAssistant ? assistantText(lastAssistant).slice(0, 1200) : '（无）'}`,
            },
          ],
        },
      ],
    });

    let added = 0;
    for (const item of parseMemoryExtraction(text)) {
      if (added >= 4) break;
      if (upsertMemory(item.text, item.tags, 'auto')) added += 1;
    }
    if (added > 0) {
      deps.setState((s) => ({ streamRev: s.streamRev + 1 }));
    }
  };

  return {
    persist,
    setAgentOpen,
    clearTaskFocus,
    addMemory,
    deleteMemory,
    updateTask,
    completeTaskOnce,
    toggleSkill,
    deleteSkill,
    installSkills,
    addSkill,
    addNote,
    deleteNote,
    toolContext,
    extractMemories,
  };
}

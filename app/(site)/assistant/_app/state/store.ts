/**
 * 全局状态（无第三方状态库）：一个极小的可观察 store + React 18/19 的 useSyncExternalStore。
 *
 * 设计原因：
 * - 会话数据只在本机（IndexedDB），流式 token 高频更新，不能每个 delta 都落盘；
 * - 流式消息对象就地修改 + streamRev 计数触发重渲染，落盘只在「结束 / 中断 / 定时」时发生。
 */
import { useSyncExternalStore } from 'react';
import { kvGet, kvSet } from '../lib/idb';
import {
  DEFAULT_SETTINGS,
  type Attachment,
  type Conversation,
  type Settings,
} from '../api/types';
import { uid } from '../lib/uid';
import { themeHost } from '../lib/themeHost';
import type { AgentNote, AgentTask, Memory } from '../agent/types';
import { executeTool } from '../agent/tools';
import { nextOccurrence } from '../agent/recurrence';
import { BUILTIN_SKILLS, type Skill } from '../agent/skills';
import { setSkillRegistry } from '../agent/skillRegistry';
import { createTts } from './tts';
import { createSend } from './send';
import { createArchive } from './archive';
import { AGENT_KEYS, createAgentStore, type SkillInput, type TaskPatch } from './agentStore';
import {
  INDEX_KEY,
  convKey,
  createConversations,
  newConversation,
  type ConversationIndexItem,
} from './conversations';
import {
  abortPrevious,
  nextRunId,
  runStream as turnRunStream,
  type StreamRunOptions,
  type TurnDeps,
} from './turn';

const SETTINGS_KEY = 'settings';

export type View = 'chat' | 'settings';

/** 会话列表项的定义在 conversations.ts，这里转出保持旧引用可用。 */
export type { ConversationIndexItem } from './conversations';

export interface ToastItem {
  id: string;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface TtsState {
  messageId: string | null;
  phase: 'loading' | 'playing' | null;
}

/** 到点触发的任务提醒（应用内横幅） */
export interface ActiveReminder {
  taskId: string;
  title: string;
  at: number;
  notes?: string;
}

export interface AppState {
  ready: boolean;
  settings: Settings;
  index: ConversationIndexItem[];
  conversation: Conversation | null;
  view: View;
  drawerOpen: boolean;
  /** 个人 Agent 面板（任务 / 记忆 / 笔记） */
  agentOpen: boolean;
  /** 需要高亮的任务（从通知点进来时） */
  agentFocusTaskId: string | null;
  memories: Memory[];
  tasks: AgentTask[];
  notes: AgentNote[];
  skills: Skill[];
  /** 当前弹出的任务提醒 */
  reminder: ActiveReminder | null;
  toasts: ToastItem[];
  streaming: boolean;
  streamingMessageId: string | null;
  /** 递增计数器：流式过程中触发重渲染 */
  streamRev: number;
  tts: TtsState;
}

function initialState(): AppState {
  return {
    ready: false,
    settings: { ...DEFAULT_SETTINGS },
    index: [],
    conversation: null,
    view: 'chat',
    drawerOpen: false,
    agentOpen: false,
    agentFocusTaskId: null,
    memories: [],
    tasks: [],
    notes: [],
    skills: [],
    reminder: null,
    toasts: [],
    streaming: false,
    streamingMessageId: null,
    streamRev: 0,
    tts: { messageId: null, phase: null },
  };
}

let state: AppState = initialState();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
}

/* ---------------- 自动落盘（去抖） ---------------- */

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistPending = false;

/**
 * 任何消息/会话变化后调用：400ms 合并成一次写入。
 * 不再依赖「流式结束」这个单点，App 被系统杀掉前也会尽量落盘。
 */
function schedulePersist(): void {
  persistPending = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, 400);
}

async function flushPersist(): Promise<void> {
  if (!persistPending) return;
  persistPending = false;
  try {
    await persistConversation(state.conversation);
    agent.persist();
  } catch {
    /* 存储失败不打断对话 */
  }
}

/** 立即落盘（页面隐藏 / 退出 / 手动重要操作后） */
export async function flushNow(): Promise<void> {
  persistPending = true;
  await flushPersist();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getState(): AppState {
  return state;
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */

export function toast(text: string, kind: ToastItem['kind'] = 'info'): void {
  const item: ToastItem = { id: uid('toast'), text, kind };
  setState((s) => ({ toasts: [...s.toasts, item].slice(-3) }));
  setTimeout(() => {
    setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== item.id) }));
  }, kind === 'error' ? 5200 : 3000);
}

export function dismissToast(id: string): void {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/* ------------------------------------------------------------------ */
/* 持久化                                                             */
/* ------------------------------------------------------------------ */

function saveSettingsSoon(): void {
  void kvSet(SETTINGS_KEY, state.settings);
}

/* ------------------------------------------------------------------ */
/* 初始化                                                             */
/* ------------------------------------------------------------------ */

export async function initStore(): Promise<void> {
  const [savedSettings, savedIndex, savedMemories, savedTasks, savedNotes, savedSkills] =
    await Promise.all([
    kvGet<Partial<Settings>>(SETTINGS_KEY),
    kvGet<ConversationIndexItem[]>(INDEX_KEY),
    kvGet<Memory[]>(AGENT_KEYS.memories),
    kvGet<AgentTask[]>(AGENT_KEYS.tasks),
    kvGet<AgentNote[]>(AGENT_KEYS.notes),
    kvGet<Skill[]>(AGENT_KEYS.skills),
  ]);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(savedSettings ?? {}) };
  // 分享用：?demo=1 直接进演示模式（不写盘，刷新后恢复原设置）
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') settings.mockMode = true;
  const index = (savedIndex ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt);

  let conversation: Conversation | null = null;
  if (index.length > 0) {
    conversation = (await kvGet<Conversation>(convKey(index[0].id))) ?? null;
  }
  if (!conversation) conversation = newConversation();

  const skills = savedSkills && savedSkills.length > 0 ? savedSkills : BUILTIN_SKILLS;
  let memories = savedMemories ?? [];
  let tasks = savedTasks ?? [];
  const notes = savedNotes ?? [];
  // 演示模式首次打开时塞一点样例，方便看清 Agent 面板长什么样
  if (settings.mockMode && memories.length === 0 && tasks.length === 0) {
    memories = DEMO_MEMORIES();
  }
  // 演示/调试用：?demo=1&remind=6 → 6 秒后触发一条提醒，便于验证主动性链路
  const remindIn = Number(params.get('remind'));
  if (settings.mockMode && Number.isFinite(remindIn) && remindIn > 0) {
    const now = Date.now();
    tasks = [
      {
        id: uid('task'),
        title: '喝口水，站起来走两分钟',
        status: 'todo',
        notes: '演示提醒：这是 6 秒前安排的一个提醒',
        reminderAt: now + remindIn * 1000,
        createdAt: now,
        updatedAt: now,
      },
      ...tasks,
    ];
  }

  setState({ ready: true, settings, index, conversation, memories, notes, skills });
  setSkillRegistry(skills);
  applyTheme(settings.theme);

  window.addEventListener('beforeunload', () => {
    void flushNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushNow();
  });

  // 跟随系统主题：系统切换深/浅色时同步（仅 auto 模式）
  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => {
      if (state.settings.theme === 'auto') applyTheme('auto');
    });

  // 后台清掉「点了新建对话但没发消息」留下的空白会话记录（不阻塞启动，失败也无所谓）
  void conversations.pruneOrphans().catch(() => {});
}

export function applyTheme(theme: Settings['theme']): void {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  const dark = theme === 'dark' || (theme === 'auto' && prefersDark);
  themeHost()?.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0d12' : '#f6f7fb');
}

export function setView(view: View): void {
  setState({ view, drawerOpen: false });
}

export function setDrawer(open: boolean): void {
  setState({ drawerOpen: open });
}

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  saveSettingsSoon();
  if (patch.theme) applyTheme(settings.theme);
}

/* ------------------------------------------------------------------ */
/* 会话管理                                                           */
/* ------------------------------------------------------------------ */

let streamAbort: AbortController | null = null;
/** 递增的流标识：只有最新一次 runStream 能写入消息，避免并发流把同一段文本写两遍。 */
let streamRunId = 0;

export function isStreaming(): boolean {
  return state.streaming;
}

/* ------------------------------------------------------------------ */
/* 会话管理 —— 实现见 conversations.ts，这里只做接线                     */
/* ------------------------------------------------------------------ */

const conversations = createConversations({
  getState: () => state,
  setState,
  toast,
  stopStreaming,
});

/** 薄封装：turn.ts 与去抖落盘都走这里，签名保持不变。 */
function persistConversation(conv?: Conversation | null): Promise<void> {
  return conversations.persistConversation(conv);
}

export async function startNewConversation(): Promise<void> {
  await conversations.startNewConversation();
}

export async function openConversation(id: string): Promise<void> {
  await conversations.openConversation(id);
}

export async function removeConversation(id: string): Promise<void> {
  await conversations.removeConversation(id);
}

export function renameConversation(title: string): void {
  conversations.renameConversation(title);
}

/* ------------------------------------------------------------------ */
/* 发送与流式                                                          */
/* ------------------------------------------------------------------ */

function ensureReady(): boolean {
  if (state.streaming) {
    toast('正在生成回答，请先停止', 'info');
    return false;
  }
  if (!state.settings.apiKey.trim() && !state.settings.mockMode) {
    toast('请先在设置里填写 DeepSeek API Key（或打开演示模式）', 'error');
    setState({ view: 'settings' });
    return false;
  }
  return true;
}

let flushQueued = false;

function flushSoon(): void {
  if (flushQueued) return;
  flushQueued = true;
  requestAnimationFrame(() => {
    flushQueued = false;
    setState((s) => ({ streamRev: s.streamRev + 1 }));
    schedulePersist();
  });
}

/* ------------------------------------------------------------------ */
/* runStream 接线：turn.ts 只吃这套函数，不反向 import store              */
/* ------------------------------------------------------------------ */

const turnDeps: TurnDeps = {
  getState: () => state,
  setState,
  flushSoon,
  schedulePersist,
  nextRunId: () => (streamRunId = nextRunId(streamRunId)),
  isCurrent: (runId) => runId === streamRunId,
  abortPrev: () => {
    streamAbort = abortPrevious(streamAbort);
    return streamAbort;
  },
  clearStream: (controller) => {
    if (streamAbort === controller) streamAbort = null;
  },
  executeTool: (name, input, ctx) => executeTool(name, input, ctx),
  toolContext,
  speakMessage,
  extractMemories,
  persistConversation,
  toast,
};

/** 薄封装：对外签名不变，逻辑全部在 turn.ts（可在 Node 里注入假 deps 单测）。 */
function runStream(conv: Conversation, options: StreamRunOptions): Promise<void> {
  return turnRunStream(conv, options, turnDeps);
}

/* ------------------------------------------------------------------ */
/* 发送入口 —— 实现见 send.ts，这里只做接线                            */
/* ------------------------------------------------------------------ */

const send = createSend({
  getState: () => state,
  setState,
  toast,
  ensureReady,
  runStream,
});

export function sendMessage(text: string, attachments: Attachment[] = []): Promise<boolean> {
  return send.sendMessage(text, attachments);
}

export function regenerate(): Promise<void> {
  return send.regenerate();
}

export function continueGeneration(): Promise<void> {
  return send.continueGeneration();
}

export function editUserMessage(messageId: string, text: string): Promise<void> {
  return send.editUserMessage(messageId, text);
}

export function stopStreaming(): void {
  if (streamAbort) {
    streamAbort.abort();
    streamAbort = null;
  }
}

/* ------------------------------------------------------------------ */
/* 朗读（TTS）—— 实现在 tts.ts，这里只做接线                          */
/* ------------------------------------------------------------------ */

const ttsApi = createTts({ getState: () => state, setState, toast });

/** 朗读这条消息；正在朗读同一条时则停止（签名保持不变，UI 不用改）。 */
function speakMessage(messageId: string): Promise<void> {
  return ttsApi.speakMessage(messageId);
}

/** 立刻停掉当前朗读。 */
function stopSpeaking(): void {
  ttsApi.stopSpeaking();
}

export { speakMessage, stopSpeaking };

/* ------------------------------------------------------------------ */
/* 导入导出 —— 实现见 archive.ts，这里只做接线                           */
/* ------------------------------------------------------------------ */

const archive = createArchive({ getState: () => state, setState, updateSettings });

export type { ExportBundle } from './archive';

export function exportAll() {
  return archive.exportAll();
}

export function importAll(raw: string) {
  return archive.importAll(raw);
}

export function clearAllData(): Promise<void> {
  return archive.clearAllData();
}

/* ------------------------------------------------------------------ */
/* 个人 Agent：实现见 agentStore.ts，这里只做接线                       */
/* ------------------------------------------------------------------ */

const agent = createAgentStore({ getState: () => state, setState, toast });

/** 从通知点进来：打开面板并高亮对应任务。 */
export function setAgentOpen(open: boolean): void {
  agent.setAgentOpen(open);
}

/** 清掉高亮（面板关闭或用户手动切换时）。 */
export function clearTaskFocus(): void {
  agent.clearTaskFocus();
}

/** 面板里手动添加一条记忆。 */
export function addMemory(text: string, tags: string[] = []) {
  return agent.addMemory(text, tags);
}

export function deleteMemory(id: string): void {
  agent.deleteMemory(id);
}

export function updateTask(id: string, patch: TaskPatch) {
  return agent.updateTask(id, patch);
}

export function toggleSkill(id: string): void {
  agent.toggleSkill(id);
}

export function deleteSkill(id: string): void {
  agent.deleteSkill(id);
}

export function installSkills(ids: string[]): number {
  return agent.installSkills(ids);
}

export function addSkill(input: SkillInput) {
  return agent.addSkill(input);
}

export function addNote(input: { title?: string; text: string }) {
  return agent.addNote(input);
}

export function deleteNote(id: string): void {
  agent.deleteNote(id);
}

/* turn.ts 只认这两个能力，函数声明保证在 turnDeps 初始化前已可引用。 */
function toolContext() {
  return agent.toolContext();
}

function extractMemories(conv: Conversation) {
  return agent.extractMemories(conv);
}

/* ------------------------------------------------------------------ */
/* 演示模式样例数据                                                     */
/* ------------------------------------------------------------------ */

function DEMO_MEMORIES(): Memory[] {
  const now = Date.now();
  return [
    {
      id: uid('mem'),
      text: '用户习惯用 VS Code 写 Go，接口文档偏好 OpenAPI。',
      tags: ['工作方式'],
      source: 'auto',
      createdAt: now - 86400000 * 2,
      updatedAt: now - 86400000 * 2,
      hits: 3,
    },
    {
      id: uid('mem'),
      text: '用户偏好先给结论再给理由，不喜欢客套话。',
      tags: ['偏好'],
      source: 'user',
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
      hits: 5,
    },
    {
      id: uid('mem'),
      text: '用户正在把私人 AI 助理做成手机 App，想上线给朋友用。',
      tags: ['项目'],
      source: 'auto',
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      hits: 1,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 主动性：到点提醒                                                     */
/* ------------------------------------------------------------------ */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

/** 用户点「开启系统通知」时申请权限；失败也不影响应用内横幅。 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

// 提醒横幅本身随「任务/提醒功能」一起下线了（见 App.tsx）；下面三个函数是留下的
// 出口，重建主动性链路时由轮询/通知动作调用。

export function dismissReminder(): void {
  const active = state.reminder;
  // 周期任务被「关掉」时也把提醒推进到下一次，避免同一时段反复弹
  if (active) {
    const task = state.tasks.find((t) => t.id === active.taskId);
    if (task?.recurrence) {
      updateTask(task.id, {
        reminderAt: nextOccurrence(task.recurrence, Date.now()),
        notified: false,
      });
    } else if (task?.snoozeMinutes) {
      // 「每 N 分钟直到完成」：关掉也要再排一次
      updateTask(task.id, {
        reminderAt: Date.now() + task.snoozeMinutes * 60_000,
        notified: false,
      });
    }
  }
  setState({ reminder: null });
}

export function completeReminder(): void {
  const active = state.reminder;
  if (!active) return;
  const task = state.tasks.find((t) => t.id === active.taskId);
  if (task) {
    const message = agent.completeTaskOnce(task);
    toast(message, 'success');
  }
  setState({ reminder: null });
}

export function snoozeReminder(minutes = 10): void {
  const active = state.reminder;
  if (!active) return;
  updateTask(active.taskId, { reminderAt: Date.now() + minutes * 60_000, notified: false });
  setState({ reminder: null });
  toast(`${minutes} 分钟后再说`, 'info');
}

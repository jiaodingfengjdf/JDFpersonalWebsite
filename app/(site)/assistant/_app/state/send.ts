/**
 * 发送入口：把用户输入 / 重新生成 / 继续生成 / 编辑重发拼成「一条新消息 + 一目标回答」，
 * 然后交给 `runStream` 跑流。
 *
 * 迁移分片 d：从 store.ts 搬出来。这里只做「组装 + 守卫」，流式过程与状态推送都在 turn.ts。
 * 依赖注入 `{ getState, setState, toast, ensureReady, runStream }`，可在 Node 里用假 deps 单测
 * （见 scripts/check-send.ts）。
 */
import type { AssistantBlock, Attachment, ChatMessage, Conversation } from '../api/types';
import { uid } from '../lib/uid';
import type { AppState } from './store';
import { createAssistantMessage, type StreamRunOptions } from './turn';

export interface SendDeps {
  getState: () => AppState;
  setState: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  toast: (text: string, kind?: 'info' | 'error' | 'success') => void;
  /** 能不能发：是否正在生成、有没有 API Key / 演示模式。失败时自己负责提示与跳设置页。 */
  ensureReady: () => boolean;
  runStream: (conv: Conversation, options: StreamRunOptions) => Promise<void>;
}

export interface SendApi {
  sendMessage: (text: string, attachments?: Attachment[]) => Promise<boolean>;
  regenerate: () => Promise<void>;
  continueGeneration: () => Promise<void>;
  editUserMessage: (messageId: string, text: string) => Promise<void>;
}

/** 手机上连点发送的防抖窗口。 */
const SEND_DEDUPE_MS = 600;

export function createSend(deps: SendDeps): SendApi {
  /** 防连点：同一段文本在极短时间内重复提交时忽略。 */
  let lastSend: { text: string; at: number } | null = null;

  const newAssistantMessage = (): ChatMessage =>
    createAssistantMessage(deps.getState().settings.model);

  const sendMessage = async (text: string, attachments: Attachment[] = []): Promise<boolean> => {
    if (!deps.ensureReady()) return false;
    const conv = deps.getState().conversation;
    if (!conv) return false;
    const clean = text.trim();
    if (!clean && attachments.length === 0) return false;
    // 手机上容易连点发送：正在生成时忽略新提交，避免两个流同时写一条消息
    if (deps.getState().streaming) {
      deps.toast('还在回复中，等这条结束再发', 'info');
      return false;
    }
    const now = Date.now();
    if (lastSend && lastSend.text === clean && now - lastSend.at < SEND_DEDUPE_MS) return false;
    lastSend = { text: clean, at: now };

    const userMessage: ChatMessage = {
      id: uid('msg'),
      role: 'user',
      createdAt: Date.now(),
      blocks: [],
      text: clean,
      attachments,
    };
    const assistant = newAssistantMessage();
    conv.messages = [...conv.messages, userMessage, assistant];
    deps.setState({ conversation: { ...conv }, view: 'chat' });

    // 不阻塞调用方：流式过程通过 store 推送，输入框可以立刻清空
    void deps.runStream(conv, { mode: 'new', target: assistant });
    return true;
  };

  const regenerate = async (): Promise<void> => {
    if (!deps.ensureReady()) return;
    const conv = deps.getState().conversation;
    if (!conv) return;
    let lastAssistant = -1;
    for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
      if (conv.messages[i].role === 'assistant') {
        lastAssistant = i;
        break;
      }
    }
    if (lastAssistant < 0) return;
    conv.messages = conv.messages.slice(0, lastAssistant);
    const assistant = newAssistantMessage();
    conv.messages = [...conv.messages, assistant];
    deps.setState({ conversation: { ...conv } });
    await deps.runStream(conv, { mode: 'new', target: assistant });
  };

  const continueGeneration = async (): Promise<void> => {
    if (!deps.ensureReady()) return;
    const conv = deps.getState().conversation;
    if (!conv) return;
    const last = conv.messages[conv.messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    // 用过联网工具的回答不能续写：历史里没有可回放的 search 结果
    if (last.usedTools) {
      deps.toast('这条回答用过联网工具，不能继续生成，请重新生成', 'error');
      return;
    }
    const base = (last.blocks as AssistantBlock[]).slice();
    last.error = undefined;
    last.aborted = false;
    await deps.runStream(conv, { mode: 'continue', target: last, baseBlocks: base });
  };

  const editUserMessage = async (messageId: string, text: string): Promise<void> => {
    if (!deps.ensureReady()) return;
    const conv = deps.getState().conversation;
    if (!conv) return;
    const index = conv.messages.findIndex((m) => m.id === messageId);
    if (index < 0) return;
    const original = conv.messages[index];
    // 截断到被编辑的这条，再补一条新的回答目标
    conv.messages = conv.messages.slice(0, index + 1);
    original.text = text;
    const assistant = newAssistantMessage();
    conv.messages = [...conv.messages, assistant];
    deps.setState({ conversation: { ...conv } });
    await deps.runStream(conv, { mode: 'new', target: assistant });
  };

  return { sendMessage, regenerate, continueGeneration, editUserMessage };
}

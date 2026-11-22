/**
 * 会话管理：新建 / 打开 / 删除 / 重命名 + 索引维护 + 落盘。
 *
 * 迁移分片 c-1：从 store.ts 整块搬出来。纯函数（`newConversation` / `convKey` /
 * `indexItemOf` / `upsertIndex`）直接导出；只有需要读写全局状态与落盘的部分走
 * `createConversations({ getState, setState, toast, stopStreaming })` 工厂。
 *
 * 设计要点：
 * - 切会话前必须先掐掉正在跑的流（`deps.stopStreaming`），否则旧流会往新会话里写；
 * - 索引永远由 `upsertIndex` 统一维护（按 updatedAt 倒序），删除/导入都复用它。
 */
import type { Conversation } from '../api/types';
import { kvDel, kvGet, kvKeys, kvSet } from '../lib/idb';
import { previewOf } from '../lib/message';
import { uid } from '../lib/uid';
import type { AppState } from './store';

/** 会话明细的存储键前缀（`conversation:<id>`）。 */
export const CONV_PREFIX = 'conversation:';
/** 会话索引的存储键（列表页只读它）。 */
export const INDEX_KEY = 'conversation_index';

export interface ConversationIndexItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
  titled?: boolean;
}

export function convKey(id: string): string {
  return `${CONV_PREFIX}${id}`;
}

export function newConversation(): Conversation {
  const now = Date.now();
  return { id: uid('conv'), title: '新对话', createdAt: now, updatedAt: now, messages: [] };
}

/** 会话 → 列表项（预览取第一条用户消息）。 */
export function indexItemOf(conv: Conversation): ConversationIndexItem {
  const firstUser = conv.messages.find((m) => m.role === 'user');
  return {
    id: conv.id,
    title: conv.title || '新对话',
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
    preview: firstUser ? previewOf(firstUser) : '',
    titled: conv.titled,
  };
}

/** 把会话插到索引最前，按 updatedAt 倒序重排。 */
export function upsertIndex(
  index: ConversationIndexItem[],
  conv: Conversation,
): ConversationIndexItem[] {
  const item = indexItemOf(conv);
  const rest = index.filter((c) => c.id !== conv.id);
  return [item, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface ConversationDeps {
  getState: () => AppState;
  setState: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  toast: (text: string, kind?: 'info' | 'error' | 'success') => void;
  /** 切会话前先停掉正在生成的那条流。 */
  stopStreaming: () => void;
}

export interface ConversationApi {
  /** 写会话 + 刷新索引 + 落盘（默认写当前会话）。 */
  persistConversation: (conv?: Conversation | null) => Promise<void>;
  startNewConversation: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  renameConversation: (title: string) => void;
  /**
   * 清掉「没进索引、也没发过任何消息」的空白会话记录。
   * 早期每次点「新建对话」都会写一条记录，只有发出第一条消息才进索引，
   * 用户中途放弃就留下看不见的孤儿；这里只删空白的，带消息的一律保留。
   */
  pruneOrphans: () => Promise<number>;
}

export function createConversations(deps: ConversationDeps): ConversationApi {
  const persistConversation = async (
    conv: Conversation | null = deps.getState().conversation,
  ): Promise<void> => {
    if (!conv) return;
    conv.updatedAt = Date.now();
    await kvSet(convKey(conv.id), conv);
    const index = upsertIndex(deps.getState().index, conv);
    deps.setState({ index });
    await kvSet(INDEX_KEY, index);
  };

  const startNewConversation = async (): Promise<void> => {
    deps.stopStreaming();
    const conv = deps.getState().conversation;
    // 当前就是个空白新会话：不重复建，直接回聊天页
    if (conv && conv.messages.length === 0 && !conv.titled) {
      deps.setState({ view: 'chat', drawerOpen: false });
      return;
    }
    const next = newConversation();
    deps.setState({ conversation: next, view: 'chat', drawerOpen: false });
    await kvSet(convKey(next.id), next);
  };

  const openConversation = async (id: string): Promise<void> => {
    if (deps.getState().conversation?.id === id) {
      deps.setState({ drawerOpen: false, view: 'chat' });
      return;
    }
    deps.stopStreaming();
    const conv = await kvGet<Conversation>(convKey(id));
    if (!conv) {
      deps.toast('会话不存在或已被删除', 'error');
      return;
    }
    deps.setState({ conversation: conv, drawerOpen: false, view: 'chat' });
  };

  const removeConversation = async (id: string): Promise<void> => {
    await kvDel(convKey(id));
    const index = deps.getState().index.filter((c) => c.id !== id);
    deps.setState({ index });
    await kvSet(INDEX_KEY, index);
    if (deps.getState().conversation?.id !== id) return;

    const nextId = index[0]?.id;
    if (nextId) {
      const conv = await kvGet<Conversation>(convKey(nextId));
      deps.setState({ conversation: conv ?? newConversation() });
      return;
    }
    // 删空了：留一个空会话，避免界面没有可写的容器
    const conv = newConversation();
    deps.setState({ conversation: conv });
    await kvSet(convKey(conv.id), conv);
  };

  const renameConversation = (title: string): void => {
    const conv = deps.getState().conversation;
    if (!conv) return;
    conv.title = title.trim() || '未命名对话';
    deps.setState({ conversation: { ...conv } });
    void persistConversation(conv);
  };

  const pruneOrphans = async (): Promise<number> => {
    const state = deps.getState();
    const keep = new Set(state.index.map((item) => convKey(item.id)));
    if (state.conversation) keep.add(convKey(state.conversation.id));
    let removed = 0;
    for (const key of await kvKeys()) {
      if (!key.startsWith(CONV_PREFIX) || keep.has(key)) continue;
      const conv = await kvGet<Conversation>(key);
      // 只删空白的：带消息的孤儿宁可留着，也不冒删数据的风险
      if (conv && conv.messages.length === 0) {
        await kvDel(key);
        removed += 1;
      }
    }
    return removed;
  };

  return {
    persistConversation,
    startNewConversation,
    openConversation,
    removeConversation,
    renameConversation,
    pruneOrphans,
  };
}

/**
 * 导入导出：整库备份 / 还原 / 清空。
 *
 * 迁移分片 c-2：从 store.ts 搬出来。只吃注入的 `{ getState, setState, updateSettings }`，
 * 存储读写直接用 `kvGet/kvSet/kvDel` + conversations.ts 的键与索引工具，
 * 因此可以在 Node 里用内存 localStorage 单测（见 scripts/check-archive.ts）。
 *
 * 兼容策略：导出的 JSON 是唯一对外契约，字段只增不减；导入端对脏数据一律跳过而不是抛错。
 */
import type { Conversation, Settings } from '../api/types';
import { kvDel, kvGet, kvSet } from '../lib/idb';
import type { AppState } from './store';
import {
  INDEX_KEY,
  convKey,
  indexItemOf,
  newConversation,
  type ConversationIndexItem,
} from './conversations';

/** 备份文件格式：`app` + `version` 是给未来迁移用的护身符。 */
export interface ExportBundle {
  app: 'deepseek-pocket-assistant';
  version: 1;
  exportedAt: string;
  settings: Omit<Settings, 'apiKey'>;
  conversations: Conversation[];
}

export interface ArchiveDeps {
  getState: () => AppState;
  setState: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  /** 复用 store 的设置写入（含落盘与主题应用）。 */
  updateSettings: (patch: Partial<Settings>) => void;
}

export interface ArchiveApi {
  exportAll: () => Promise<ExportBundle>;
  importAll: (raw: string) => Promise<{ imported: number }>;
  clearAllData: () => Promise<void>;
}

export function createArchive(deps: ArchiveDeps): ArchiveApi {
  const exportAll = async (): Promise<ExportBundle> => {
    const state = deps.getState();
    const conversations: Conversation[] = [];
    for (const item of state.index) {
      const conv = await kvGet<Conversation>(convKey(item.id));
      if (conv) conversations.push(conv);
    }
    // 当前会话可能还没进索引（比如刚建的），补一把
    if (state.conversation && !conversations.some((c) => c.id === state.conversation?.id)) {
      conversations.push(state.conversation);
    }
    // 导出永不包含 API Key：备份文件可能被随手发出去
    const { apiKey: _apiKey, ...settings } = state.settings;
    return {
      app: 'deepseek-pocket-assistant',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      conversations,
    };
  };

  const importAll = async (raw: string): Promise<{ imported: number }> => {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('文件不是合法的 JSON');
    }
    const bundle = data as Partial<ExportBundle>;
    if (!bundle || !Array.isArray(bundle.conversations)) {
      throw new Error('不是本 App 导出的会话文件');
    }

    const imported: Conversation[] = [];
    for (const conv of bundle.conversations) {
      // 脏数据跳过：宁可少导入，也不要把会话列表搞崩
      if (!conv || typeof conv.id !== 'string' || !Array.isArray(conv.messages)) continue;
      const fixed: Conversation = {
        id: conv.id,
        title: conv.title || '导入的对话',
        createdAt: conv.createdAt || Date.now(),
        updatedAt: conv.updatedAt || Date.now(),
        messages: conv.messages,
        titled: conv.titled,
      };
      await kvSet(convKey(fixed.id), fixed);
      imported.push(fixed);
    }

    const index = imported
      .map(indexItemOf)
      .concat(deps.getState().index.filter((i) => !imported.some((c) => c.id === i.id)))
      .sort((a, b) => b.updatedAt - a.updatedAt) as ConversationIndexItem[];
    deps.setState({ index });
    await kvSet(INDEX_KEY, index);

    if (bundle.settings) deps.updateSettings(bundle.settings);
    const first = imported.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (first) deps.setState({ conversation: first, view: 'chat' });
    return { imported: imported.length };
  };

  const clearAllData = async (): Promise<void> => {
    const state = deps.getState();
    for (const item of state.index) await kvDel(convKey(item.id));
    if (state.conversation) await kvDel(convKey(state.conversation.id));
    await kvDel(INDEX_KEY);
    const conv = newConversation();
    deps.setState({ index: [], conversation: conv });
    await kvSet(convKey(conv.id), conv);
  };

  return { exportAll, importAll, clearAllData };
}

/**
 * 站内写入草稿：两步确认写（prepare → confirm）的中间态。
 *
 * - prepare_* 工具只生成草稿、绝不写库；confirm_* 凭草稿 id 执行一次写入。
 * - 草稿只存本机内存（随页面刷新消失），单次消费，30 分钟过期。
 * - 取消没有任何副作用：草稿过期或被丢弃后，confirm 会直接报「草稿已失效」。
 */
import { uid } from '../lib/uid';

export type WriteDraftKind = 'ledger' | 'chatter' | 'collection' | 'post';

/** 草稿默认有效期：30 分钟。 */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

/** 一次会话里最多保留的草稿数，超了先淘汰最旧的。 */
const MAX_DRAFTS = 20;

export interface WriteDraft {
  id: string;
  kind: WriteDraftKind;
  /** 已校验、可直接发给写接口的请求体。 */
  payload: Record<string, unknown>;
  /** 给人看的预览文案（确认卡与模型回复共用）。 */
  preview: string;
  createdAt: number;
}

const drafts = new Map<string, WriteDraft>();

function prune(now: number): void {
  for (const [id, draft] of drafts) {
    if (now - draft.createdAt > DRAFT_TTL_MS) drafts.delete(id);
  }
  while (drafts.size > MAX_DRAFTS) {
    const oldest = drafts.keys().next().value;
    if (oldest === undefined) break;
    drafts.delete(oldest);
  }
}

export function createDraft(
  kind: WriteDraftKind,
  payload: Record<string, unknown>,
  preview: string,
  now: number = Date.now(),
): WriteDraft {
  prune(now);
  const draft: WriteDraft = { id: uid('draft'), kind, payload, preview, createdAt: now };
  drafts.set(draft.id, draft);
  return draft;
}

/** 只读查看草稿（不消费），过期返回 undefined。 */
export function peekDraft(id: string, now: number = Date.now()): WriteDraft | undefined {
  prune(now);
  return drafts.get(id);
}

/** 取出并消费草稿：成功执行一次写入后草稿即失效，重复确认会报「已失效」。 */
export function takeDraft(id: string, now: number = Date.now()): WriteDraft | undefined {
  const draft = peekDraft(id, now);
  if (!draft) return undefined;
  drafts.delete(id);
  return draft;
}

/** 丢弃草稿（用户点取消时调用），不存在或已过期也视为成功。 */
export function discardDraft(id: string, now: number = Date.now()): boolean {
  prune(now);
  return drafts.delete(id);
}

/** 仅测试用：清空全部草稿。 */
export function clearDraftsForTest(): void {
  drafts.clear();
}

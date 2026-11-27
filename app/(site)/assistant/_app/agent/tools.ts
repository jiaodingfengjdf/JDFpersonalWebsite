/**
 * 客户端工具（tool use）实现。
 *
 * - `CLIENT_TOOL_SCHEMAS` 原样塞进 Messages 请求的 `tools: [...]`
 *   （Anthropic 格式：`{ name, description, input_schema }`）。
 * - 模型返回 `tool_use` 块后，由 `executeTool` 分发执行，结果回填成 `tool_result`。
 * - 约定：`run` 永不 reject。所有异常在 `guard` 里兜住，转成 `{ ok: false, content: '中文原因' }`。
 * - `content` 是给模型看的纯文本：列表一律 `- ` 开头逐行，最多 20 条，超出写「（还有 N 条）」，
 *   时间统一 `YYYY-MM-DD HH:mm`（浏览器本地时区）。
 */
import type {
  AgentNote,
  Memory,
  ToolContext,
  ToolDefinition,
  ToolResult,
  ToolSchema,
} from './types';
import { createDraft, discardDraft, takeDraft, type WriteDraftKind } from './drafts';
import {
  describeSiteAdminError,
  siteAdminRequest,
  SiteAdminApiError,
} from '@/lib/site-admin-request';
import { transactionInput } from '@/server/modules/ledger/contracts';
import { createChatterInput } from '@/server/modules/chatters/contracts';
import { collectionInput } from '@/server/modules/collection/contracts';
import { createPostInput } from '@/server/modules/posts/contracts';

/* ------------------------------------------------------------------ */
/* 通用工具函数                                                        */
/* ------------------------------------------------------------------ */

/** 列表类输出最多渲染多少行。 */
const MAX_LINES = 20;

const WEEKDAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];


function ok(content: string, data?: unknown): ToolResult {
  return data === undefined ? { ok: true, content } : { ok: true, content, data };
}

function fail(content: string, data?: unknown): ToolResult {
  return data === undefined ? { ok: false, content } : { ok: false, content, data };
}

/** 接口返回的数组字段可能是 undefined，统一成一个安全数组。 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** 把任意异常转成一句可读的中文原因。 */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  return '未知错误';
}

/** 统一的执行外壳：任何异常都不会冒泡成 rejected Promise。 */
async function guard(label: string, fn: () => ToolResult | Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return fail(`${label}失败：${errorText(err)}`);
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 毫秒 → `YYYY-MM-DD HH:mm`（本地时区）。 */
function formatStamp(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    ` ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}


/* ------------------------------------------------------------------ */
/* 输入读取（宽容 + 明确）                                             */
/* ------------------------------------------------------------------ */

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value === 'string') return value.trim();
  if (isFiniteNumber(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // 模型有时会把单个参数写成数组（["过敏","跑步"]）：拼成空格分隔的关键词，而不是当成空值
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : isFiniteNumber(item) ? String(item) : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function pickAnyText(input: Record<string, unknown>): string {
  for (const key of ['keywords', 'keyword', 'q', 'term', 'text', 'value', 'input']) {
    const hit = readString(input, key);
    if (hit) return hit;
  }
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = readString({ v: value }, 'v');
      if (joined) return joined;
    }
  }
  return '';
}

function readInt(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = input[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readTags(input: Record<string, unknown>, key: string, max = 4, maxLen = 12): string[] {
  const raw = input[key];
  if (!Array.isArray(raw)) return [];
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim();
    if (!tag) continue;
    const clipped = Array.from(tag).slice(0, maxLen).join('');
    if (tags.includes(clipped)) continue;
    tags.push(clipped);
    if (tags.length >= max) break;
  }
  return tags;
}

/* ------------------------------------------------------------------ */
/* 站内写入（两步确认）：prepare_* 只生成草稿，confirm_* 凭草稿执行   */
/* ------------------------------------------------------------------ */

/** 草稿在确认卡与模型回复里的展示字段；options 存在时渲染成下拉框。 */
export interface PreviewField {
  key: string;
  label: string;
  value: string;
  options?: Array<{ value: string; label: string }>;
}

export interface WritePreviewData {
  draftId: string;
  kind: WriteDraftKind;
  confirmTool: string;
  title: string;
  fields: PreviewField[];
}

function writePreviewResult(
  content: string,
  preview: WritePreviewData,
): ToolResult {
  return { ok: true, content, data: { writePreview: preview } };
}

/** zod 校验失败 → 一句中文原因（取第一条 issue）。 */
function zodMessage(err: unknown): string | null {
  if (typeof err !== 'object' || err === null || (err as { name?: unknown }).name !== 'ZodError') {
    return null;
  }
  const issues = (err as { issues?: Array<{ path?: unknown; message?: unknown }> }).issues;
  const first = Array.isArray(issues) ? issues[0] : undefined;
  if (!first) return '输入不符合要求，请检查后重试。';
  const path = Array.isArray(first.path) ? first.path.join('.') : '';
  const message = typeof first.message === 'string' ? first.message : '输入不符合要求';
  return path ? `${path}：${message}` : message;
}

/** 管理接口调用失败 → 一句中文原因（401 登录失效、409 重复、422 校验、503 只读）。 */
function adminErrorText(err: unknown): string {
  if (err instanceof SiteAdminApiError && err.status === 409) {
    return '这笔数据可能已经存在（编号重复），请先在站内核对，不要重复提交。';
  }
  return describeSiteAdminError(err);
}

/** 解析模型给的发生时间：毫秒时间戳 / ISO 字符串 / 仅日期，空值返回 undefined。 */
function parseOccurredMs(input: Record<string, unknown>, now: number): number | undefined {
  const rawMs = input.occurred_at;
  if (isFiniteNumber(rawMs) && rawMs > 0) return Math.round(rawMs);
  if (typeof rawMs === 'string' && rawMs.trim()) {
    const parsed = Number(rawMs.trim());
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  const raw = readString(input, 'occurred');
  if (!raw) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00`
    : raw.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

/** 读一个数字字段（数字或数字字符串），读不到返回 undefined。 */
function readAmount(input: Record<string, unknown>, key: string): number | undefined {
  const raw = input[key];
  if (isFiniteNumber(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw.trim().replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

interface LedgerAccountOption {
  id: number;
  name: string;
  kind: string;
}

interface LedgerCategoryOption {
  id: number;
  name: string;
  kind: string;
}

/** 拉取账本的账户与分类（prepare/confirm 共用；失败时直接抛中文原因）。 */
async function fetchLedgerOptions(): Promise<{
  accounts: LedgerAccountOption[];
  categories: LedgerCategoryOption[];
}> {
  const [accounts, categories] = await Promise.all([
    siteAdminRequest<LedgerAccountOption[]>('/api/admin/ledger/accounts?includeArchived=0'),
    siteAdminRequest<LedgerCategoryOption[]>('/api/admin/ledger/categories'),
  ]);
  return { accounts: asArray(accounts), categories: asArray(categories) };
}

function optionLines(
  label: string,
  options: Array<{ id: number; name: string; kind?: string }>,
): string {
  if (options.length === 0) return `${label}：暂无`;
  return `${label}：${options.map((o) => `${o.name}（id ${o.id}${o.kind ? `，${o.kind}` : ''}）`).join('、')}`;
}

/** 构建一条账本流水的校验后输入：解析账户/分类（id 或名字）、校验金额与时间。 */
async function buildLedgerInput(
  input: Record<string, unknown>,
  now: number,
): Promise<{
  parsed: ReturnType<typeof transactionInput.parse>;
  accountName: string;
  categoryName: string;
  options: { accounts: LedgerAccountOption[]; categories: LedgerCategoryOption[] };
}> {
  const options = await fetchLedgerOptions();
  const kindRaw = readString(input, 'kind');
  const kind = kindRaw === 'income' ? 'income' : 'expense';

  const accountId = readAmount(input, 'account_id');
  const accountNameInput = readString(input, 'account_name');
  const account =
    accountId !== undefined
      ? options.accounts.find((a) => a.id === accountId)
      : accountNameInput
        ? options.accounts.find((a) => a.name === accountNameInput)
        : undefined;
  if (!account) {
    const hint = accountId !== undefined
      ? `没有 id 为 ${accountId} 的账户`
      : accountNameInput
        ? `没有名字叫「${accountNameInput}」的账户`
        : '没有指定账户';
    throw new Error(
      `${hint}。${optionLines('可用账户', options.accounts)}；请先用 list_ledger_options 查看。`,
    );
  }

  const categoryId = readAmount(input, 'category_id');
  const categoryNameInput = readString(input, 'category_name');
  let category: LedgerCategoryOption | undefined;
  if (categoryId !== undefined) {
    category = options.categories.find((c) => c.id === categoryId);
    if (!category) throw new Error(`没有 id 为 ${categoryId} 的分类。${optionLines('可用分类', options.categories)}`);
  } else if (categoryNameInput) {
    category = options.categories.find((c) => c.name === categoryNameInput && c.kind === kind);
    if (!category) {
      throw new Error(
        `没有名字叫「${categoryNameInput}」的${kind === 'income' ? '收入' : '支出'}分类。${optionLines('可用分类', options.categories.filter((c) => c.kind === kind))}`,
      );
    }
  }
  if (category && category.kind !== kind) {
    throw new Error(`分类「${category.name}」是${category.kind === 'income' ? '收入' : '支出'}分类，不能记${kind === 'income' ? '收入' : '支出'}。`);
  }

  const amount = readAmount(input, 'amount');
  const occurredAt = parseOccurredMs(input, now) ?? now;
  const externalId = readString(input, 'external_id');
  const parsed = transactionInput.parse({
    account_id: account.id,
    category_id: category ? category.id : null,
    kind,
    amount: amount ?? NaN,
    occurred_at: occurredAt,
    merchant: readString(input, 'merchant'),
    note: readString(input, 'note'),
    tags: readTags(input, 'tags', 10, 20),
    external_id: externalId || undefined,
  });
  return {
    parsed,
    accountName: account.name,
    categoryName: category ? category.name : '未分类',
    options,
  };
}

/** prepare 阶段的相似流水提醒：同商家、同金额、同一天已有记录时提示可能重复。 */
async function duplicateWarning(
  merchant: string,
  amount: number,
  occurredAt: number,
): Promise<string | undefined> {
  if (!merchant) return undefined;
  const month = new Date(occurredAt);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const dayKey = `${monthKey}-${String(month.getDate()).padStart(2, '0')}`;
  try {
    const res = await siteAdminRequest<{ items?: Array<Record<string, unknown>> }>(
      `/api/admin/ledger/transactions?month=${monthKey}&q=${encodeURIComponent(merchant)}&limit=20`,
    );
    const hit = asArray<Record<string, unknown>>(res.items).find((item) => {
      const sameAmount = Math.abs(Number(item.amount) - amount) < 0.005;
      const at = Number(item.occurred_at);
      if (!sameAmount || !Number.isFinite(at)) return false;
      return formatStamp(at).startsWith(dayKey);
    });
    if (!hit) return undefined;
    return `提醒：${dayKey} 已有一笔「${merchant}」${Number(hit.amount)} 元的流水（id ${String(hit.id ?? '')}），可能是同一张账单，请确认不是重复入账。`;
  } catch {
    return undefined;
  }
}

function ledgerPreviewText(
  parsed: ReturnType<typeof transactionInput.parse>,
  accountName: string,
  categoryName: string,
  draftId: string,
  warning?: string,
): string {
  const lines = [
    '【待确认】记一笔账',
    `- 收支：${parsed.kind === 'income' ? '收入' : '支出'}`,
    `- 金额：${parsed.kind === 'income' ? '+' : '-'}${parsed.amount.toFixed(2)} 元`,
    `- 账户：${accountName}`,
    `- 分类：${categoryName}`,
    `- 日期：${formatStamp(parsed.occurred_at)}`,
    `- 商家：${parsed.merchant || '（未填）'}`,
  ];
  if (parsed.note) lines.push(`- 备注：${parsed.note}`);
  if (parsed.external_id) lines.push(`- 去重编号：${parsed.external_id}`);
  if (warning) lines.push(warning);
  lines.push(
    '',
    '请把以上内容展示给用户确认：用户明确说「确认」或点确认卡片后，再调用 confirm_ledger_transaction（draft_id 用下面的编号）执行；',
    '用户说修改时，按新值重新调用 prepare_ledger_transaction；用户说取消时，不要调用确认。',
    `草稿编号：${draftId}`,
  );
  return lines.join('\n');
}

/** 标题转 slug：小写、空格变连字符、只留字母数字与连字符；中文标题兜底用时间戳。 */
function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return slug || `post-${Date.now().toString(36)}`;
}

/**
 * confirm_* 的通用收尾：取草稿（单次消费）→ 合并覆盖字段 → 重新校验 → POST 写接口。
 * 覆盖字段只接受白名单里的键；草稿不存在、种类不对、校验失败都返回中文原因。
 */
async function confirmDraftWrite<T extends Record<string, unknown>>(args: {
  draftId: string;
  expectedKind: WriteDraftKind;
  overrides: Record<string, unknown>;
  allowedOverrideKeys: string[];
  validate: (payload: Record<string, unknown>) => T;
  path: string;
  success: (created: Record<string, unknown>) => string;
}): Promise<ToolResult> {
  const draft = takeDraft(args.draftId);
  if (!draft) {
    return fail('草稿已失效或不存在（可能已确认过、已取消或超过 30 分钟）：请重新准备一次写入，再让用户确认。');
  }
  if (draft.kind !== args.expectedKind) {
    return fail(`草稿种类不对：这个草稿是「${draft.kind}」，不能用这个确认工具执行。`);
  }
  const merged: Record<string, unknown> = { ...draft.payload };
  for (const key of args.allowedOverrideKeys) {
    if (args.overrides[key] !== undefined && args.overrides[key] !== '') {
      merged[key] = args.overrides[key];
    }
  }
  let payload: T;
  try {
    payload = args.validate(merged);
  } catch (err) {
    const message = zodMessage(err);
    return fail(message ? `确认前校验失败：${message}` : '确认前校验失败，请重新准备。');
  }
  try {
    const created = await siteAdminRequest<Record<string, unknown>>(args.path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return ok(args.success(created ?? {}), created ?? {});
  } catch (err) {
    return fail(`写入失败：${adminErrorText(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/* 时间解析：ISO 8601 字符串 → 毫秒                                     */
/* ------------------------------------------------------------------ */



/**
 * 解析模型给的时间。
 *
 * 约定（写进集成说明，因为模型和用户都容易踩）：
 * - `2026-11-22T18:00` / `2026-11-22T18:00:00`（无时区）→ 按**本地时区**理解（ES 规范对 date-time 形态的规定）。
 * - `2026-11-22T18:00:00Z` / `+08:00` → 按给定偏移。
 * - `2026-11-22`（仅日期）→ 本地 00:00（ES 规范原本当 UTC，这里按用户直觉改成本地）。
 * - `2026-11-22 18:00`（空格分隔）→ 归一成 `T` 形式再解析，避免 Safari 等引擎解析失败。
 * - 空值 → `{ ok: true, ms: undefined }`（视为「没给」）。
 */

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function collapse(text: string, max?: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (max === undefined || flat.length <= max) return flat;
  return `${Array.from(flat).slice(0, max).join('')}…`;
}

/** 截断成最多 `limit` 行，多出来的写「（还有 N 条）」。 */
function renderList(lines: string[], limit = MAX_LINES): string[] {
  const head = lines.slice(0, limit);
  const rest = lines.length - head.length;
  return rest > 0 ? [...head, `（还有 ${rest} 条）`] : head;
}

function memoryLine(memory: Memory): string {
  return `- ${collapse(memory.text)}（id: ${memory.id}）`;
}


function noteLine(note: AgentNote): string {
  const title = collapse(note.title) || '未命名笔记';
  const preview = collapse(note.text, 60);
  return preview ? `- ${title}（id: ${note.id}）：${preview}` : `- ${title}（id: ${note.id}）`;
}

function resolvedTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone ? zone : '未知';
  } catch {
    return '未知';
  }
}

/* ------------------------------------------------------------------ */
/* 工具定义                                                            */
/* ------------------------------------------------------------------ */

const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  /* ---------------------------------------------------------------- */
  remember: {
    schema: {
      name: 'remember',
      description:
        '把一条关于用户的长期事实写入长期记忆（跨会话保留）。当用户透露稳定偏好、身份/职业、重要日期、健康信息、习惯、称呼，或明确说「记住这件事」时调用。一句话一条、自包含（不要写「他」「上次说的那个」），不要记一次性闲聊、临时情绪或任务本身。',
      input_schema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '一句话事实，自包含，例如「用户对花生过敏」「用户每周三晚上打羽毛球」。',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '可选标签，最多 4 个，每个不超过 12 字，例如 ["健康","饮食"]。',
          },
        },
        required: ['text'],
      },
    },
    run: (input, ctx) =>
      guard('保存记忆', () => {
        const text = readString(input, 'text');
        if (!text) return fail('text 不能为空：请把要记住的事实写成一句话。');
        const tags = readTags(input, 'tags');
        const memory = ctx.addMemory(tags.length > 0 ? { text, tags } : { text });
        return ok(`已记住：${text}`, memory);
      }),
  },

  /* ---------------------------------------------------------------- */
  search_memory: {
    schema: {
      name: 'search_memory',
      description:
        '按关键词在长期记忆里检索。回答任何依赖用户个人背景/偏好/经历的问题之前，或不确定是否记过某事时，先调用它；用户问「你还记得…吗」时也用它。多条关键词用空格分隔。',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词，例如「过敏」「跑步 习惯」。' },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            description: '最多返回几条，默认 8。',
          },
        },
        required: ['query'],
      },
    },
    run: (input, ctx) =>
      guard('检索记忆', () => {
        const query = readString(input, 'query') || pickAnyText(input);
        if (!query) {
          return fail(
            `query 不能为空（模型这次传的是 ${JSON.stringify(input).slice(0, 120)}）`,
          );
        }
        const limit = readInt(input, 'limit', 8, 1, MAX_LINES);
        const hits = ctx.searchMemories(query, limit);
        if (hits.length === 0) return ok('没有匹配的记忆', []);
        const lines = renderList(hits.map(memoryLine));
        return ok([`找到 ${hits.length} 条记忆：`, ...lines].join('\n'), hits);
      }),
  },

  /* ---------------------------------------------------------------- */
  forget_memory: {
    schema: {
      name: 'forget_memory',
      description:
        '删除一条长期记忆。只在用户明确要求忘记/删除某条信息时调用（不要自己判断该忘就删）。需要 id，可先用 search_memory 查出来。',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '要删除的记忆 id（由 search_memory 返回）。' },
        },
        required: ['id'],
      },
    },
    run: (input, ctx) =>
      guard('删除记忆', () => {
        const id = readString(input, 'id');
        if (!id) return fail('id 不能为空：先用 search_memory 查到记忆 id。');
        const removed = ctx.deleteMemory(id);
        if (!removed) {
          return fail(`没有找到 id 为「${id}」的记忆，先用 search_memory 确认 id 是否正确。`);
        }
        return ok(`已删除记忆（id: ${id}）`, { id });
      }),
  },

  /* ---------------------------------------------------------------- */
  add_task: {
    schema: {
      name: 'add_task',
      description:
        '新增一条待办任务（行动项、提醒、计划）。用户提到要做的事或要求提醒时调用。',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题，简洁明确。' },
          notes: { type: 'string', description: '可选补充说明。' },
          dueAt: {
            type: 'string',
            description: '可选截止时间，ISO 8601 格式如 2026-12-01T09:00。',
          },
        },
        required: ['title'],
      },
    },
    run: (input, ctx) =>
      guard('创建任务', () => {
        const title = readString(input, 'title') || pickAnyText(input);
        if (!title) return fail('title 不能为空：请提供任务标题。');
        const notes = readString(input, 'notes');
        const rawDue = readString(input, 'dueAt');
        let dueAt: number | undefined;
        if (rawDue) {
          const normalized = /^\d{4}-\d{2}-\d{2}$/.test(rawDue)
            ? `${rawDue}T00:00:00`
            : rawDue.replace(' ', 'T');
          const parsed = Date.parse(normalized);
          if (!Number.isNaN(parsed)) dueAt = parsed;
        }
        const task = ctx.addTask({ title, notes: notes || undefined, dueAt });
        const dueLabel = task.dueAt ? ` · 截止 ${formatStamp(task.dueAt)}` : '';
        return ok(`已创建任务：${task.title}${dueLabel}（id: ${task.id}）`, task);
      }),
  },

  /* ---------------------------------------------------------------- */
  list_tasks: {
    schema: {
      name: 'list_tasks',
      description: '查看用户的待办任务列表。',
      input_schema: {
        type: 'object',
        properties: {
          includeDone: {
            type: 'boolean',
            description: '是否包含已完成任务，默认 false。',
          },
        },
      },
    },
    run: (input, ctx) =>
      guard('查询任务', () => {
        const includeDone = Boolean(input.includeDone);
        const tasks = ctx.listTasks(includeDone);
        if (tasks.length === 0) {
          return ok(includeDone ? '还没有任何任务' : '当前没有未完成的待办任务', []);
        }
        const lines = renderList(
          tasks.map((t) => {
            const due = t.dueAt ? ` · 截止 ${formatStamp(t.dueAt)}` : '';
            return `- [${t.status}] ${collapse(t.title)}${due}（id: ${t.id}）`;
          }),
        );
        return ok([`共 ${tasks.length} 条任务：`, ...lines].join('\n'), tasks);
      }),
  },

  /* ---------------------------------------------------------------- */
  complete_task: {
    schema: {
      name: 'complete_task',
      description: '将指定任务标记为已完成（需要任务 id，可先用 list_tasks 查询）。',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id。' },
        },
        required: ['id'],
      },
    },
    run: (input, ctx) =>
      guard('完成任务', () => {
        const id = readString(input, 'id');
        if (!id) return fail('id 不能为空：请先用 list_tasks 查询任务 id。');
        const res = ctx.completeTask(id);
        return res.ok ? ok(res.message, { id }) : fail(res.message);
      }),
  },

  /* ---------------------------------------------------------------- */
  add_note: {
    schema: {
      name: 'add_note',
      description:
        '把一段内容存成笔记（长文本、摘录、灵感、会议记录）。用户说「记一下 / 存成笔记 / 帮我保存这段」时调用；短小的个人事实应该用 remember，有截止时间的行动项应该用 add_task。',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '笔记正文，可以多段。' },
          title: { type: 'string', description: '可选标题，不传则自动取正文开头。' },
        },
        required: ['text'],
      },
    },
    run: (input, ctx) =>
      guard('保存笔记', () => {
        const text = readString(input, 'text');
        if (!text) return fail('text 不能为空：请提供笔记正文。');
        const title = readString(input, 'title');
        const note = ctx.addNote(title ? { title, text } : { text });
        return ok(`已保存笔记：${collapse(note.title) || '未命名笔记'}（id: ${note.id}）`, note);
      }),
  },

  /* ---------------------------------------------------------------- */
  list_notes: {
    schema: {
      name: 'list_notes',
      description:
        '按关键词查笔记，返回标题与内容片段。用户问「我之前记的…」「上次那个笔记」时调用；不带 query 就返回最近的笔记。',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '可选关键词；不传则列出最近笔记。' },
        },
      },
    },
    run: (input, ctx) =>
      guard('查询笔记', () => {
        const query = readString(input, 'query');
        const notes = ctx.listNotes(query || undefined);
        if (notes.length === 0) {
          return ok(query ? `没有匹配「${query}」的笔记` : '还没有笔记', []);
        }
        const lines = renderList(notes.map(noteLine));
        return ok([`共 ${notes.length} 条笔记：`, ...lines].join('\n'), notes);
      }),
  },

  /* ---------------------------------------------------------------- */
  generate_image: {
    schema: {
      name: 'generate_image',
      description:
        '调用 GPT Image 生成/编辑图片：用户说「画一张…」「生成一张图」「把这张图改成…」时调用。返回图片 URL，正文里用 Markdown 图片语法展示。提示词要具体（主体、风格、光线、构图、比例）。',
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '画面描述，越具体越好，可中英文。' },
          aspectRatio: {
            type: 'string',
            description: '比例或像素，例如 16:9 / 1024x1024 / 1024x1536，缺省用设置里的值。',
          },
          quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] },
        },
        required: ['prompt'],
      },
    },
    run: (input, ctx) =>
      guard('生成图片', async () => {
        const prompt = readString(input, 'prompt');
        if (!prompt) return fail('prompt 不能为空：请描述想画什么。');
        const aspectRatio = readString(input, 'aspectRatio');
        const quality = readString(input, 'quality');
        const result = await ctx.generateImage(prompt, {
          aspectRatio: aspectRatio || undefined,
          quality: quality || undefined,
        });
        if (result.urls.length === 0) return fail('没有拿到图片 URL');
        const lines = result.urls.map((url, index) => `!${'[image ' + (index + 1) + ']'}(${url})`);
        const caption = `已生成 ${result.urls.length} 张图${result.credits ? `，消耗 ${result.credits} 积分` : ''}：`;
        return ok([caption, '', ...lines, '', ...result.urls].join('\n'), result);
      }),
  },

  web_search: {
    schema: {
      name: 'web_search',
      description:
        '用 DeepSeek Search 接口搜索实时网页，返回标题、链接、摘要与正文片段。需要最新资料、核对事实、找来源时调用；用户给出具体网址时改用 read_page。支持 site:/lang:/after:/before: 等搜索语法。',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索词，1-128 字符，可带搜索语法。' },
          count: { type: 'integer', minimum: 1, maximum: 50, description: '返回条数，默认 8。' },
        },
        required: ['query'],
      },
    },
    run: (input, ctx) =>
      guard('搜索网页', async () => {
        const query = readString(input, 'query');
        if (!query) return fail('query 不能为空：请给出搜索词。');
        const rawCount = Number(input['count']);
        const count = Number.isFinite(rawCount) ? Math.min(50, Math.max(1, Math.round(rawCount))) : 8;
        const res = await ctx.webSearch(query, { count, needContent: true });
        if (res.results.length === 0) return ok('没有搜到结果（可换个说法或放宽时间范围）', res);
        const lines = res.results.slice(0, 8).map((item, index) => {
          const digest = (item.summary || item.snippet || item.content || '').slice(0, 300);
          return `${index + 1}. ${item.title}\n   ${item.url}\n   ${digest}`;
        });
        return ok(`搜索结果 ${res.results.length} 条：\n${lines.join('\n')}`, res);
      }),
  },

  read_page: {
    schema: {
      name: 'read_page',
      description:
        '用 DeepSeek Fetch 接口抓取一个网页并返回 Markdown 正文。用户贴了链接、要求总结某个页面时调用；被站点拦截或没有正文时会报错。',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要抓取的 http/https 链接。' },
        },
        required: ['url'],
      },
    },
    run: (input, ctx) =>
      guard('抓取网页', async () => {
        const url = readString(input, 'url');
        if (!url) return fail('url 不能为空：请给出要抓取的链接。');
        const page = await ctx.fetchPage(url);
        const body = (page.content || '').trim();
        if (!body) return fail('抓到的页面没有可提取的正文');
        return ok(`# ${page.title || url}\n\n${body.slice(0, 4000)}`, {
          title: page.title,
          chars: body.length,
        });
      }),
  },

  site_query: {
    schema: {
      name: 'site_query',
      description:
        '查询用户自己站点上的结构化数据：行情（自选基金/股票/指数）、账本（本月收支）、收藏、新闻、NBA 赛程、每日简报。用户问「我的基金怎么样」「这个月花了多少」「今天有什么新闻」「今天有比赛吗」这类问题时调用。查站内文章请用 site_search，不要用这个工具。账本需要站点处于管理员登录状态，未登录会返回提示。',
      input_schema: {
        type: 'object',
        properties: {
          resource: {
            type: 'string',
            enum: ['digest', 'market', 'ledger', 'collection', 'news', 'nba'],
            description: '要查询的资源类型。',
          },
          limit: {
            type: 'number',
            description: '可选，最多返回多少条，默认 8，最大 20。',
          },
        },
        required: ['resource'],
      },
    },
    run: (input) =>
      guard('查询站点数据', async () => {
        const resource = readString(input, 'resource');
        const limitRaw = Number(input.limit);
        const limit = Number.isFinite(limitRaw) ? Math.min(20, Math.max(1, limitRaw)) : 8;
        const endpoints: Record<string, string> = {
          digest: '/api/digest',
          market: '/api/market',
          ledger: '/api/admin/ledger/summary',
          collection: `/api/collection?size=${limit}`,
          news: `/api/news?limit=${limit}`,
          nba: '/api/nba',
        };
        const path = endpoints[resource];
        if (!path) {
          return fail(`不支持的资源「${resource}」，可选：${Object.keys(endpoints).join(', ')}`);
        }

        const response = await fetch(path, { credentials: 'include' });
        if (!response.ok) {
          return fail(
            response.status === 401
              ? '需要先在站点后台登录管理员，才能查账本等私人数据。'
              : `站点接口返回 HTTP ${response.status}`,
          );
        }
        const data = (await response.json()) as Record<string, unknown>;

        const lines: string[] = [];
        if (resource === 'market') {
          const items = asArray<Record<string, unknown>>(data.items);
          for (const item of items.slice(0, limit)) {
            lines.push(
              `- ${item.name}：${item.price}（${Number(item.change_pct) >= 0 ? '+' : ''}${item.change_pct}%）${item.stale ? ' 缓存' : ''}`,
            );
          }
        } else if (resource === 'ledger') {
          lines.push(
            `- ${data.month} 收入 ${data.income}，支出 ${data.expense}，结余 ${data.balance}`,
          );
          const categories = asArray<Record<string, unknown>>(data.by_category).slice(0, limit);
          for (const item of categories) {
            lines.push(`- ${item.category_name}（${item.kind}）：${item.total}`);
          }
        } else if (resource === 'collection') {
          for (const item of asArray<Record<string, unknown>>(data.items).slice(0, limit)) {
            lines.push(`- ${item.title}（${item.kind} / ${item.status}）`);
          }
        } else if (resource === 'news') {
          for (const item of asArray<Record<string, unknown>>(data.items).slice(0, limit)) {
            lines.push(`- ${item.title} —— ${item.source_name}`);
          }
        } else if (resource === 'nba') {
          const games = asArray<Record<string, unknown>>(data.games);
          for (const game of games.slice(0, limit)) {
            lines.push(
              `- ${game.away_name} @ ${game.home_name}：${
                game.status === 'scheduled' ? '未开始' : `${game.away_score}-${game.home_score}`
              }${game.follow ? '（关注）' : ''}`,
            );
          }
        } else {
          const ledger = data.ledger as Record<string, unknown> | null;
          if (ledger) {
            lines.push(
              `- 账本 ${ledger.month}：收入 ${ledger.income}，支出 ${ledger.expense}，结余 ${ledger.balance}`,
            );
          }
          const market = asArray<Record<string, unknown>>(data.market).slice(0, 4);
          if (market.length > 0) {
            lines.push(
              `- 行情：${market.map((item) => `${item.name} ${item.price}（${Number(item.change_pct) >= 0 ? '+' : ''}${item.change_pct}%）`).join('；')}`,
            );
          }
          const games = asArray<Record<string, unknown>>(data.nba).slice(0, 3);
          if (games.length > 0) {
            lines.push(
              `- NBA：${games.map((game) => `${game.away_name}@${game.home_name}${game.status === 'scheduled' ? '' : ` ${game.away_score}-${game.home_score}`}`).join('；')}`,
            );
          }
          const news = asArray<Record<string, unknown>>(data.news).slice(0, 5);
          if (news.length > 0) {
            lines.push('- 新闻：');
            for (const item of news) lines.push(`  - ${item.title}（${item.source}）`);
          }
        }

        if (lines.length === 0) return ok('查询成功，但站点上还没有对应的数据。');
        return ok(lines.slice(0, MAX_LINES + 6).join('\n'), { resource });
      }),
  },

  site_search: {
    schema: {
      name: 'site_search',
      description:
        '在用户自己的个人网站里按关键词搜索站内知识：已发布文章、公开收藏、订阅新闻、书架、播客、游戏、影视、相册、书签、已发布碎碎念与自选行情，返回带来源链接的结果（最多 5 条）。用户问「我站里写过什么」「关于 XX 的文章」「我的收藏里有没有 XX」「站里关于 XX 的新闻」「书架上有没有 XX 这本书」这类问题时调用。只读，不会改站内数据；需要站长登录，未登录会返回提示。',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，例如「智能体」「NBA」。',
          },
          limit: {
            type: 'number',
            description: '可选，最多返回多少条，默认 5，最大 5。',
          },
        },
        required: ['query'],
      },
    },
    run: (input) =>
      guard('搜索站内知识', async () => {
        const query = readString(input, 'query') || pickAnyText(input);
        if (!query) return fail('搜索关键词不能为空：请给出要查的词。');
        const limitRaw = Number(input.limit);
        const limit = Number.isFinite(limitRaw) ? Math.min(5, Math.max(1, limitRaw)) : 5;
        const response = await fetch(
          `/api/assistant/site-knowledge?q=${encodeURIComponent(query)}&limit=${limit}`,
          { credentials: 'include' },
        );
        if (!response.ok) {
          return fail(
            response.status === 401
              ? '站内知识搜索需要站长登录。'
              : `站内知识接口返回 HTTP ${response.status}`,
          );
        }
        const data = (await response.json()) as {
          query?: string;
          total?: number;
          results?: Array<{
            kind?: string;
            title?: string;
            snippet?: string;
            url?: string;
            source?: string;
          }>;
        };
        const results = asArray<Record<string, unknown>>(data.results);
        if (results.length === 0) {
          return ok(`站内没有找到和「${query}」相关的内容。`);
        }
        const kindLabel: Record<string, string> = {
          post: '文章',
          collection: '收藏',
          news: '新闻',
          library: '书架',
          podcast: '播客',
          game: '游戏',
          watch: '影视',
          album: '相册',
          bookmark: '书签',
          chatter: '碎碎念',
          market: '自选行情',
        };
        const lines = results.map((item) => {
          const kind = kindLabel[String(item.kind ?? '')] ?? '站内';
          const title = String(item.title ?? '（无标题）');
          const snippet = String(item.snippet ?? '').trim();
          const url = String(item.url ?? '');
          return `- ${title}（${kind}）：${snippet}${url ? ` —— ${url}` : ''}`;
        });
        const total = typeof data.total === 'number' ? data.total : results.length;
        if (total > results.length) lines.push(`（共 ${total} 条，仅列出前 ${results.length} 条）`);
        return ok(lines.join('\n'), { query, total });
      }),
  },

  /* ---------------------------------------------------------------- */
  /* 站内写入：两步确认（prepare → confirm）                         */
  /* ---------------------------------------------------------------- */
  list_ledger_options: {
    schema: {
      name: 'list_ledger_options',
      description:
        '列出账本的可用账户与分类（id、名字、收支类型）。准备记账之前、不知道账户或分类 id 时先调用它；不要猜 id。',
      input_schema: { type: 'object', properties: {} },
    },
    run: (_input, ctx) =>
      guard('查询账本账户与分类', async () => {
        void ctx;
        const { accounts, categories } = await fetchLedgerOptions();
        const lines = [
          optionLines('账户', accounts),
          optionLines('收入分类', categories.filter((c) => c.kind === 'income')),
          optionLines('支出分类', categories.filter((c) => c.kind === 'expense')),
        ];
        return ok(lines.join('\n'), { accounts, categories });
      }),
  },

  /* ---------------------------------------------------------------- */
  prepare_ledger_transaction: {
    schema: {
      name: 'prepare_ledger_transaction',
      description:
        '准备记一笔账（只生成草稿，不写库）。用户说「记一笔账」「帮我记账」或上传账单让你记账时调用：先从账单图片/PDF 或用户的话里读出金额、商家、日期、收支类型，再用 list_ledger_options 查到账户/分类 id 后调用。调用后把预览展示给用户，等用户明确确认后再调用 confirm_ledger_transaction。账单类写入请传 external_id，格式 bill:<商家>:<YYYYMMDD>:<金额>，用于同一张账单去重。',
      input_schema: {
        type: 'object',
        properties: {
          account_id: { type: 'number', description: '账户 id（与 account_name 二选一，优先用 id）。' },
          account_name: { type: 'string', description: '账户名字，例如「微信」「招商银行」。' },
          category_id: { type: 'number', description: '分类 id（与 category_name 二选一）。' },
          category_name: { type: 'string', description: '分类名字，例如「餐饮」「工资」。' },
          kind: { type: 'string', enum: ['income', 'expense'], description: '收支类型，默认 expense。' },
          amount: { type: 'number', description: '金额，0.01～100000000。' },
          occurred_at: { type: 'number', description: '发生时间毫秒时间戳。' },
          occurred: { type: 'string', description: '发生时间，如 2026-11-27T12:30 或 2026-11-27。' },
          merchant: { type: 'string', description: '商家，不超过 120 字。' },
          note: { type: 'string', description: '备注，不超过 500 字。' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签，最多 10 个。' },
          external_id: { type: 'string', description: '去重编号，账单用 bill:<商家>:<YYYYMMDD>:<金额>。' },
        },
        required: ['amount'],
      },
    },
    run: (input, ctx) =>
      guard('准备记账', async () => {
        let built;
        try {
          built = await buildLedgerInput(input, ctx.now());
        } catch (err) {
          const message = zodMessage(err);
          return fail(message ? `记账信息有问题：${message}` : errorText(err));
        }
        const { parsed, accountName, categoryName, options } = built;
        const warning = await duplicateWarning(parsed.merchant, parsed.amount, parsed.occurred_at);
        const draft = createDraft('ledger', parsed as unknown as Record<string, unknown>, '');
        const preview = ledgerPreviewText(parsed, accountName, categoryName, draft.id, warning);
        draft.preview = preview;
        const fields: PreviewField[] = [
          { key: 'kind', label: '收支', value: parsed.kind === 'income' ? '收入' : '支出' },
          { key: 'amount', label: '金额（元）', value: parsed.amount.toFixed(2) },
          {
            key: 'account_id',
            label: '账户',
            value: String(parsed.account_id),
            options: options.accounts.map((a) => ({ value: String(a.id), label: a.name })),
          },
          {
            key: 'category_id',
            label: '分类',
            value: parsed.category_id === null ? '' : String(parsed.category_id),
            options: [
              { value: '', label: '未分类' },
              ...options.categories
                .filter((c) => c.kind === parsed.kind)
                .map((c) => ({ value: String(c.id), label: c.name })),
            ],
          },
          { key: 'occurred', label: '日期', value: formatStamp(parsed.occurred_at) },
          { key: 'merchant', label: '商家', value: parsed.merchant || '（未填）' },
          { key: 'note', label: '备注', value: parsed.note || '（无）' },
        ];
        return writePreviewResult(preview, {
          draftId: draft.id,
          kind: 'ledger',
          confirmTool: 'confirm_ledger_transaction',
          title: '记一笔账',
          fields,
        });
      }),
  },

  /* ---------------------------------------------------------------- */
  confirm_ledger_transaction: {
    schema: {
      name: 'confirm_ledger_transaction',
      description:
        '确认并执行记账（真正写库）。只能在用户看过 prepare_ledger_transaction 的预览、并明确说「确认」之后调用；用户说修改时改调 prepare，不要直接调这个。draft_id 是草稿编号；其余字段都是可选覆盖（用户临时改账户、分类、金额时用）。',
      input_schema: {
        type: 'object',
        properties: {
          draft_id: { type: 'string', description: 'prepare 返回的草稿编号。' },
          account_id: { type: 'number', description: '可选覆盖：账户 id。' },
          account_name: { type: 'string', description: '可选覆盖：账户名字。' },
          category_id: { type: 'number', description: '可选覆盖：分类 id。' },
          category_name: { type: 'string', description: '可选覆盖：分类名字。' },
          kind: { type: 'string', enum: ['income', 'expense'], description: '可选覆盖：收支类型。' },
          amount: { type: 'number', description: '可选覆盖：金额。' },
          occurred_at: { type: 'number', description: '可选覆盖：发生时间毫秒时间戳。' },
          occurred: { type: 'string', description: '可选覆盖：发生时间，如 2026-11-27T12:30。' },
          merchant: { type: 'string', description: '可选覆盖：商家。' },
          note: { type: 'string', description: '可选覆盖：备注。' },
        },
        required: ['draft_id'],
      },
    },
    run: (input, ctx) =>
      guard('确认记账', async () => {
        const draftId = readString(input, 'draft_id');
        if (!draftId) return fail('draft_id 不能为空：请用 prepare_ledger_transaction 返回的草稿编号。');
        const draft = takeDraft(draftId);
        if (!draft) {
          return fail('草稿已失效或不存在（可能已确认过、已取消或超过 30 分钟）：请重新准备一次记账，再让用户确认。');
        }
        if (draft.kind !== 'ledger') {
          return fail(`草稿种类不对：这个草稿是「${draft.kind}」，不能用来记账。`);
        }
        const merged: Record<string, unknown> = { ...draft.payload };
        for (const key of [
          'account_id', 'account_name', 'category_id', 'category_name', 'kind',
          'amount', 'occurred_at', 'occurred', 'merchant', 'note',
        ]) {
          if (input[key] !== undefined && input[key] !== '') merged[key] = input[key];
        }
        // 用名字覆盖时，旧 id 不再生效
        if (typeof merged.account_name === 'string' && merged.account_name.trim()) {
          delete merged.account_id;
        }
        if (typeof merged.category_name === 'string' && merged.category_name.trim()) {
          delete merged.category_id;
        }
        let built;
        try {
          built = await buildLedgerInput(merged, ctx.now());
        } catch (err) {
          const message = zodMessage(err);
          return fail(message ? `确认前校验失败：${message}` : `确认前校验失败：${errorText(err)}`);
        }
        try {
          const created = await siteAdminRequest<Record<string, unknown>>(
            '/api/admin/ledger/transactions',
            { method: 'POST', body: JSON.stringify(built.parsed) },
          );
          const kindLabel = built.parsed.kind === 'income' ? '收入' : '支出';
          return ok(
            `已记账：${kindLabel} ${built.parsed.amount.toFixed(2)} 元（${built.accountName} · ${built.categoryName}），${formatStamp(built.parsed.occurred_at)}，商家 ${built.parsed.merchant || '（未填）'}。流水 id：${String(created.id ?? '')}，可在 /ledger 查看。`,
            created,
          );
        } catch (err) {
          return fail(`记账失败：${adminErrorText(err)}`);
        }
      }),
  },

  /* ---------------------------------------------------------------- */
  prepare_chatter: {
    schema: {
      name: 'prepare_chatter',
      description:
        '准备发一条碎碎念（只生成草稿，不写库）。用户说「发一条碎碎念」「帮我发个动态」时调用。默认只存草稿；用户明确说「直接发布」时 status 才传 published。调用后展示预览，等用户确认后再调用 confirm_chatter。',
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '碎碎念正文，1～10000 字。' },
          mood: { type: 'string', description: '可选心情，不超过 100 字。' },
          status: { type: 'string', enum: ['draft', 'published'], description: '默认 draft（草稿）；用户明确说直接发布时才用 published。' },
        },
        required: ['content'],
      },
    },
    run: (input, _ctx) =>
      guard('准备碎碎念', () => {
        let parsed;
        try {
          parsed = createChatterInput.parse({
            content: readString(input, 'content'),
            mood: readString(input, 'mood'),
            status: readString(input, 'status') === 'published' ? 'published' : 'draft',
          });
        } catch (err) {
          const message = zodMessage(err);
          return fail(message ? `碎碎念内容有问题：${message}` : '碎碎念内容不符合要求。');
        }
        const statusLabel = parsed.status === 'published' ? '直接发布' : '存为草稿';
        const draft = createDraft('chatter', parsed as unknown as Record<string, unknown>, '');
        const preview = [
          '【待确认】发一条碎碎念',
          `- 状态：${statusLabel}`,
          `- 心情：${parsed.mood || '（无）'}`,
          `- 内容：${collapse(parsed.content, 500)}`,
          '',
          '请把以上内容展示给用户确认：用户明确说「确认」或点确认卡片后，再调用 confirm_chatter；',
          '用户说修改时，按新值重新调用 prepare_chatter；用户说取消时，不要调用确认。',
          `草稿编号：${draft.id}`,
        ].join('\n');
        draft.preview = preview;
        return writePreviewResult(preview, {
          draftId: draft.id,
          kind: 'chatter',
          confirmTool: 'confirm_chatter',
          title: '发一条碎碎念',
          fields: [
            { key: 'content', label: '内容', value: collapse(parsed.content, 200) },
            { key: 'mood', label: '心情', value: parsed.mood || '（无）' },
            {
              key: 'status',
              label: '状态',
              value: parsed.status,
              options: [
                { value: 'draft', label: '存为草稿' },
                { value: 'published', label: '直接发布' },
              ],
            },
          ],
        });
      }),
  },

  /* ---------------------------------------------------------------- */
  confirm_chatter: {
    schema: {
      name: 'confirm_chatter',
      description:
        '确认并执行发碎碎念（真正写库）。只能在用户看过 prepare_chatter 的预览、并明确说「确认」之后调用。draft_id 是草稿编号；content、mood、status 可选覆盖。',
      input_schema: {
        type: 'object',
        properties: {
          draft_id: { type: 'string', description: 'prepare 返回的草稿编号。' },
          content: { type: 'string', description: '可选覆盖：正文。' },
          mood: { type: 'string', description: '可选覆盖：心情。' },
          status: { type: 'string', enum: ['draft', 'published'], description: '可选覆盖：状态。' },
        },
        required: ['draft_id'],
      },
    },
    run: (input) =>
      guard('确认发碎碎念', () =>
        confirmDraftWrite({
          draftId: readString(input, 'draft_id'),
          expectedKind: 'chatter',
          overrides: input,
          allowedOverrideKeys: ['content', 'mood', 'status'],
          validate: (payload) => createChatterInput.parse(payload),
          path: '/api/admin/chatters',
          success: (created) => {
            const status = String(created.status ?? 'draft');
            return `已${status === 'published' ? '发布' : '保存为草稿'}碎碎念（id：${String(created.id ?? '')}），可在 /moments 查看。`;
          },
        }),
      ),
  },

  /* ---------------------------------------------------------------- */
  prepare_collection: {
    schema: {
      name: 'prepare_collection',
      description:
        '准备加一条收藏（只生成草稿，不写库）。用户说「收藏这个」「帮我存到收藏里」时调用。调用后展示预览，等用户确认后再调用 confirm_collection。',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题，必填，1～200 字。' },
          url: { type: 'string', description: '链接，可选。' },
          kind: { type: 'string', enum: ['link', 'movie', 'music', 'book', 'product', 'idea'], description: '类型，默认 link。' },
          author: { type: 'string', description: '作者，可选。' },
          category_id: { type: 'number', description: '可选分类 id。' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签，最多 20 个。' },
          rating: { type: 'number', description: '评分 0～5，默认 0。' },
          status: { type: 'string', enum: ['saved', 'doing', 'done', 'dropped'], description: '状态，默认 saved。' },
          note: { type: 'string', description: '备注，不超过 2000 字。' },
          is_public: { type: 'boolean', description: '是否公开，默认 true。' },
        },
        required: ['title'],
      },
    },
    run: (input, _ctx) =>
      guard('准备收藏', () => {
        let parsed;
        try {
          parsed = collectionInput.parse({
            title: readString(input, 'title'),
            url: readString(input, 'url'),
            kind: readString(input, 'kind') || 'link',
            author: readString(input, 'author'),
            category_id: readAmount(input, 'category_id') ?? null,
            tags: readTags(input, 'tags', 20, 30),
            rating: readAmount(input, 'rating') ?? 0,
            status: readString(input, 'status') || 'saved',
            note: readString(input, 'note'),
            is_public: input.is_public !== false,
          });
        } catch (err) {
          const message = zodMessage(err);
          return fail(message ? `收藏内容有问题：${message}` : '收藏内容不符合要求。');
        }
        const kindLabel: Record<string, string> = {
          link: '链接', movie: '电影', music: '音乐', book: '图书', product: '好物', idea: '想法',
        };
        const draft = createDraft('collection', parsed as unknown as Record<string, unknown>, '');
        const preview = [
          '【待确认】加一条收藏',
          `- 标题：${parsed.title}`,
          `- 类型：${kindLabel[parsed.kind] ?? parsed.kind}`,
          `- 链接：${parsed.url || '（无）'}`,
          `- 作者：${parsed.author || '（无）'}`,
          `- 备注：${parsed.note ? collapse(parsed.note, 200) : '（无）'}`,
          '',
          '请把以上内容展示给用户确认：用户明确说「确认」或点确认卡片后，再调用 confirm_collection；',
          '用户说修改时，按新值重新调用 prepare_collection；用户说取消时，不要调用确认。',
          `草稿编号：${draft.id}`,
        ].join('\n');
        draft.preview = preview;
        return writePreviewResult(preview, {
          draftId: draft.id,
          kind: 'collection',
          confirmTool: 'confirm_collection',
          title: '加一条收藏',
          fields: [
            { key: 'title', label: '标题', value: parsed.title },
            { key: 'kind', label: '类型', value: parsed.kind },
            { key: 'url', label: '链接', value: parsed.url || '（无）' },
            { key: 'author', label: '作者', value: parsed.author || '（无）' },
            { key: 'note', label: '备注', value: parsed.note ? collapse(parsed.note, 120) : '（无）' },
          ],
        });
      }),
  },

  /* ---------------------------------------------------------------- */
  confirm_collection: {
    schema: {
      name: 'confirm_collection',
      description:
        '确认并执行加收藏（真正写库）。只能在用户看过 prepare_collection 的预览、并明确说「确认」之后调用。draft_id 是草稿编号；title、url、kind、author、status、note 可选覆盖。',
      input_schema: {
        type: 'object',
        properties: {
          draft_id: { type: 'string', description: 'prepare 返回的草稿编号。' },
          title: { type: 'string', description: '可选覆盖：标题。' },
          url: { type: 'string', description: '可选覆盖：链接。' },
          kind: { type: 'string', enum: ['link', 'movie', 'music', 'book', 'product', 'idea'], description: '可选覆盖：类型。' },
          author: { type: 'string', description: '可选覆盖：作者。' },
          status: { type: 'string', enum: ['saved', 'doing', 'done', 'dropped'], description: '可选覆盖：状态。' },
          note: { type: 'string', description: '可选覆盖：备注。' },
        },
        required: ['draft_id'],
      },
    },
    run: (input) =>
      guard('确认加收藏', () =>
        confirmDraftWrite({
          draftId: readString(input, 'draft_id'),
          expectedKind: 'collection',
          overrides: input,
          allowedOverrideKeys: ['title', 'url', 'kind', 'author', 'status', 'note'],
          validate: (payload) => collectionInput.parse(payload),
          path: '/api/admin/collection',
          success: (created) => `已加入收藏：「${String(created.title ?? '')}」（id：${String(created.id ?? '')}）。`,
        }),
      ),
  },

  /* ---------------------------------------------------------------- */
  prepare_post_draft: {
    schema: {
      name: 'prepare_post_draft',
      description:
        '准备存一篇新文章草稿（只生成草稿，不发布、不写库）。用户说「帮我写篇文章」「存个草稿」时调用；slug 不给会自动生成。调用后展示预览，等用户确认后再调用 confirm_post_draft。注意：这个工具只存草稿，永远不会直接发布。',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '文章标题，必填，1～200 字。' },
          slug: { type: 'string', description: '可选网址后缀，不给自动生成。' },
          description: { type: 'string', description: '可选摘要，不超过 5000 字。' },
          content: { type: 'string', description: '可选正文（Markdown）。' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签，最多 50 个。' },
          category_id: { type: 'number', description: '可选分类 id。' },
        },
        required: ['title'],
      },
    },
    run: (input, _ctx) =>
      guard('准备文章草稿', () => {
        const title = readString(input, 'title');
        let parsed;
        try {
          parsed = createPostInput.parse({
            title,
            slug: readString(input, 'slug') || slugifyTitle(title),
            description: readString(input, 'description'),
            content: readString(input, 'content'),
            tags: readTags(input, 'tags', 50, 100),
            category_id: readAmount(input, 'category_id') ?? undefined,
            status: 'draft',
          });
        } catch (err) {
          const message = zodMessage(err);
          return fail(message ? `文章草稿有问题：${message}` : '文章草稿不符合要求。');
        }
        const draft = createDraft('post', parsed as unknown as Record<string, unknown>, '');
        const preview = [
          '【待确认】存一篇新文章草稿（只存草稿，不发布）',
          `- 标题：${parsed.title}`,
          `- 网址后缀：${parsed.slug}`,
          `- 摘要：${parsed.description ? collapse(parsed.description, 200) : '（无）'}`,
          `- 标签：${parsed.tags.length > 0 ? parsed.tags.join('、') : '（无）'}`,
          `- 正文：${parsed.content ? `${parsed.content.length} 字` : '（空）'}`,
          '',
          '请把以上内容展示给用户确认：用户明确说「确认」或点确认卡片后，再调用 confirm_post_draft；',
          '用户说修改时，按新值重新调用 prepare_post_draft；用户说取消时，不要调用确认。',
          `草稿编号：${draft.id}`,
        ].join('\n');
        draft.preview = preview;
        return writePreviewResult(preview, {
          draftId: draft.id,
          kind: 'post',
          confirmTool: 'confirm_post_draft',
          title: '存一篇新文章草稿',
          fields: [
            { key: 'title', label: '标题', value: parsed.title },
            { key: 'slug', label: '网址后缀', value: parsed.slug },
            { key: 'description', label: '摘要', value: parsed.description ? collapse(parsed.description, 120) : '（无）' },
            { key: 'tags', label: '标签', value: parsed.tags.length > 0 ? parsed.tags.join('、') : '（无）' },
          ],
        });
      }),
  },

  /* ---------------------------------------------------------------- */
  confirm_post_draft: {
    schema: {
      name: 'confirm_post_draft',
      description:
        '确认并执行存文章草稿（真正写库，只存草稿、不发布）。只能在用户看过 prepare_post_draft 的预览、并明确说「确认」之后调用。draft_id 是草稿编号；title、slug、description、content、tags 可选覆盖。',
      input_schema: {
        type: 'object',
        properties: {
          draft_id: { type: 'string', description: 'prepare 返回的草稿编号。' },
          title: { type: 'string', description: '可选覆盖：标题。' },
          slug: { type: 'string', description: '可选覆盖：网址后缀。' },
          description: { type: 'string', description: '可选覆盖：摘要。' },
          content: { type: 'string', description: '可选覆盖：正文。' },
          tags: { type: 'array', items: { type: 'string' }, description: '可选覆盖：标签。' },
        },
        required: ['draft_id'],
      },
    },
    run: (input) =>
      guard('确认存文章草稿', () =>
        confirmDraftWrite({
          draftId: readString(input, 'draft_id'),
          expectedKind: 'post',
          overrides: input,
          allowedOverrideKeys: ['title', 'slug', 'description', 'content', 'tags'],
          validate: (payload) => createPostInput.parse({ ...payload, status: 'draft' }),
          path: '/api/admin/posts',
          success: (created) =>
            `已保存文章草稿：「${String(created.title ?? '')}」（id：${String(created.id ?? '')}），请到后台编辑后发布。`,
        }),
      ),
  },

  /* ---------------------------------------------------------------- */
  discard_draft: {
    schema: {
      name: 'discard_draft',
      description:
        '取消一次待确认的写入（丢弃草稿，不写库、没有任何副作用）。用户说「取消」「算了」「不用了」时调用。',
      input_schema: {
        type: 'object',
        properties: {
          draft_id: { type: 'string', description: '要取消的草稿编号。' },
        },
        required: ['draft_id'],
      },
    },
    run: (input) =>
      guard('取消写入', () => {
        const draftId = readString(input, 'draft_id');
        if (!draftId) return fail('draft_id 不能为空。');
        discardDraft(draftId);
        return ok('已取消这次写入，没有改动任何数据。');
      }),
  },

  get_time: {
    schema: {
      name: 'get_time',
      description:
        '获取当前本地时间、星期、时区和用户所在地。任何涉及「现在几点 / 今天几号 / 还有几天」的推算，或要往 add_task、update_task 里写具体日期之前，都先调用它，不要凭猜测填日期。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    run: (_input, ctx) =>
      guard('读取时间', () => {
        const now = ctx.now();
        const timeZone = resolvedTimeZone();
        const location = `${ctx.location()}`.trim();
        const lines = [
          `本地时间：${formatStamp(now)}`,
          `星期：${WEEKDAYS_ZH[new Date(now).getDay()] || '未知'}`,
          `时区：${timeZone}`,
          `地点：${location || '未设置'}`,
          `毫秒时间戳：${now}`,
        ];
        return ok(lines.join('\n'), { now, timeZone, location: location || null });
      }),
  },
};

const TOOL_NAMES = Object.keys(TOOL_DEFINITIONS);

/** 可用工具名，用于未知工具时的提示。 */
const AVAILABLE_TOOLS = TOOL_NAMES.join(', ');

/**
 * 传给模型的工具定义列表（Anthropic/DeepSeek Messages 格式）。
 * 直接 `tools: CLIENT_TOOL_SCHEMAS`。
 */
export const CLIENT_TOOL_SCHEMAS: ToolSchema[] = TOOL_NAMES.map(
  (name) => TOOL_DEFINITIONS[name].schema,
);

/**
 * 按名字执行工具。未知工具、参数错误、内部异常都返回 `ok: false`，永不 reject。
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const definition = TOOL_DEFINITIONS[name];
  if (!definition) {
    return fail(`未知工具「${String(name)}」。可用工具：${AVAILABLE_TOOLS}`, {
      available: TOOL_NAMES,
    });
  }

  const safeInput: Record<string, unknown> =
    input && typeof input === 'object' ? input : {};

  try {
    return await definition.run(safeInput, ctx);
  } catch (err) {
    return fail(`执行工具「${name}」失败：${errorText(err)}`);
  }
}

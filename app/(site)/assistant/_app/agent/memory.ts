/**
 * 长期记忆 / 任务的纯函数层：归一化、判重、提示词段落构建、模型抽取结果解析。
 *
 * 这里不依赖 store、不碰 DOM（只用 `Date` 本地时区格式化），方便在 Node 里单测。
 * 注入系统提示词的顺序：`buildMemorySection(...)` + `buildTaskSection(...)`。
 */
import type { AgentTask, Memory } from './types';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** Jaccard 判重阈值（2-gram）。0.82 对中文短句足够，略微保守以免误合并。 */
const DUPLICATE_THRESHOLD = 0.82;

/** 注入提示词的记忆条数上限（与 selectMemoriesForPrompt 默认一致）。 */
const MAX_MEMORY_LINES = 40;
/** 注入提示词的任务条数上限。 */
const MAX_TASK_LINES = 10;

const DEFAULT_MAX_COUNT = 40;
const DEFAULT_MAX_CHARS = 1200;

/** 抽取结果的条数/长度边界。 */
const MAX_EXTRACTED = 8;
const MIN_MEMORY_LENGTH = 4;
const MAX_MEMORY_LENGTH = 120;
const MAX_TAG_COUNT = 4;
const MAX_TAG_LENGTH = 12;

/**
 * 末尾标点/空白。归一化时剥掉，避免「用户喜欢跑步。」和「用户喜欢跑步」被判成两条。
 * 只剥尾部，不动中间。
 */
const TRAILING_PUNCT_RE =
  /[\s，,。.、；;：:！!？?…‥·~～\-—－_"'“”‘’（）()［］\[\]【】{}｛｝<>《》「」『』|/\\]+$/u;

/** 至少含一个文字或数字，用来过滤「……」「！！！」这类纯标点。 */
const HAS_WORD_RE = /[\p{L}\p{N}]/u;

/** 疑问句：以问号结尾（归一化会剥掉问号，所以必须在原文上判断）。 */
const QUESTION_TAIL_RE = /[?？]\s*$/u;

/** 元描述开头：把「用户问/用户说」当事实记下来没有价值。 */
const META_PREFIX_RE = /^用户(?:问|说)/u;

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

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

function safeNumber(value: number | undefined): number {
  return isFiniteNumber(value) ? value : 0;
}

/** 压平空白（含全角空格），保留大小写。 */
function collapseWhitespace(text: string): string {
  return text.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* 归一化与判重                                                        */
/* ------------------------------------------------------------------ */

/**
 * 归一到判重用的稳定形式：全角空格转半角、连续空白合一、去首尾空白、剥掉末尾标点。
 *
 * 注意：**不**转小写（中文无大小写概念，转了只会破坏原样展示），
 * 英文的大小写差异放到 `isDuplicateMemory` 比较时再折叠。
 */
export function normalizeMemory(text: string): string {
  if (typeof text !== 'string') return '';
  const collapsed = collapseWhitespace(text);
  if (!collapsed) return '';
  return collapsed.replace(TRAILING_PUNCT_RE, '').trim();
}

/** 比较用的折叠形式：中文不受影响，英文大小写归一。 */
function foldCase(text: string): string {
  return text.toLowerCase();
}

/**
 * 判重用的比较键：归一化 → 折叠大小写 → 去掉残留空白。
 *
 * 去掉空白是为了让「用户喜欢跑步」和「用户喜欢 跑步」这种多打一个空格的同一条事实
 * 也能判成重复（`normalizeMemory` 按契约只做「连续空白合一」）。
 */
function dedupeKey(text: string): string {
  return foldCase(normalizeMemory(text)).replace(/\s+/g, '');
}

/** 按码点取 2-gram 集合（`Array.from` 保证 emoji / 生僻字不被劈开）。 */
function bigrams(text: string): Set<string> {
  const chars = Array.from(text);
  const grams = new Set<string>();
  for (let i = 0; i + 1 < chars.length; i += 1) {
    grams.add(chars[i] + chars[i + 1]);
  }
  return grams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 判重的核心实现：对一组已存在的文本比较。 */
function isDuplicateText(text: string, existingTexts: readonly string[]): boolean {
  const targetKey = dedupeKey(text);
  if (!targetKey) return false;

  const targetGrams = bigrams(targetKey);

  for (const other of existingTexts) {
    const otherKey = dedupeKey(other);
    if (!otherKey) continue;

    if (otherKey === targetKey) return true;
    if (jaccardSimilarity(targetGrams, bigrams(otherKey)) >= DUPLICATE_THRESHOLD) return true;
  }

  return false;
}

/**
 * 这条记忆是否与已有记忆重复。
 *
 * - 比较键 = 归一化后折叠大小写、去空白；键完全相同 → `true`
 * - 否则 2-gram Jaccard ≥ 0.82 → `true`（中文短句效果足够，阈值偏保守以免误合并）
 */
export function isDuplicateMemory(text: string, existing: Memory[]): boolean {
  if (!Array.isArray(existing) || existing.length === 0) return false;
  const texts: string[] = [];
  for (const memory of existing) {
    if (memory && typeof memory.text === 'string') texts.push(memory.text);
  }
  return isDuplicateText(text, texts);
}

/* ------------------------------------------------------------------ */
/* 注入提示词                                                          */
/* ------------------------------------------------------------------ */

/**
 * 选出要注入系统提示词的记忆：
 * 去重 → 按 `hits` 降序、`updatedAt` 降序 → 取前 `maxCount`（默认 40）
 * → 按字符预算 `text.length + 2` 累加截断（默认 1200 字，至少保留第一条）。
 */
export function selectMemoriesForPrompt(
  memories: Memory[],
  maxCount: number = DEFAULT_MAX_COUNT,
  maxChars: number = DEFAULT_MAX_CHARS,
): Memory[] {
  const source = Array.isArray(memories) ? memories : [];

  const countLimit = Number.isFinite(maxCount)
    ? Math.max(0, Math.floor(maxCount))
    : DEFAULT_MAX_COUNT;
  const charLimit = Number.isFinite(maxChars)
    ? Math.max(0, Math.floor(maxChars))
    : DEFAULT_MAX_CHARS;
  if (countLimit === 0 || charLimit === 0) return [];

  // 1) 去重（保留首次出现的条目，调用方应按 store 顺序传入）
  const unique: Memory[] = [];
  const uniqueTexts: string[] = [];
  for (const memory of source) {
    if (!memory || typeof memory.text !== 'string') continue;
    if (!normalizeMemory(memory.text)) continue;
    if (isDuplicateText(memory.text, uniqueTexts)) continue;
    unique.push(memory);
    uniqueTexts.push(memory.text);
  }

  // 2) 排序：hits 降序，其次 updatedAt 降序
  unique.sort((a, b) => {
    const byHits = safeNumber(b.hits) - safeNumber(a.hits);
    if (byHits !== 0) return byHits;
    return safeNumber(b.updatedAt) - safeNumber(a.updatedAt);
  });

  // 3) 条数截断 + 字符预算截断
  const selected: Memory[] = [];
  let used = 0;
  for (const memory of unique.slice(0, countLimit)) {
    const cost = memory.text.length + 2;
    if (selected.length > 0 && used + cost > charLimit) break;
    selected.push(memory);
    used += cost;
  }
  return selected;
}

/**
 * 「关于用户」段。空数组返回 `''`（调用方直接跳过拼接）。
 * 最多 40 条（上游已截断，这里再兜一层）。
 */
export function buildMemorySection(memories: Memory[]): string {
  const source = Array.isArray(memories) ? memories : [];
  const lines: string[] = [];

  for (const memory of source) {
    if (!memory || typeof memory.text !== 'string') continue;
    const text = collapseWhitespace(memory.text);
    if (!text) continue;
    lines.push(`- ${text}`);
    if (lines.length >= MAX_MEMORY_LINES) break;
  }

  if (lines.length === 0) return '';
  return `## 关于用户（长期记忆）\n${lines.join('\n')}`;
}

/**
 * 「当前任务」段：只取 `status !== 'done'`，按 `dueAt` 升序（无 dueAt 排最后），最多 10 条。
 * 空列表返回 `''`。
 */
export function buildTaskSection(tasks: AgentTask[], now: number): string {
  const source = Array.isArray(tasks) ? tasks : [];
  const nowMs = isFiniteNumber(now) ? now : Date.now();

  const pending = source.filter((task) => task && task.status !== 'done');
  const sorted = [...pending].sort((a, b) => {
    const aDue = isFiniteNumber(a.dueAt) ? a.dueAt : Number.POSITIVE_INFINITY;
    const bDue = isFiniteNumber(b.dueAt) ? b.dueAt : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return safeNumber(a.createdAt) - safeNumber(b.createdAt);
  });

  const lines: string[] = [];
  for (const task of sorted.slice(0, MAX_TASK_LINES)) {
    const title = collapseWhitespace(task.title) || '未命名任务';
    let when: string;
    if (isFiniteNumber(task.dueAt)) {
      when =
        task.dueAt < nowMs
          ? `已逾期 · 截止 ${formatStamp(task.dueAt)}`
          : `截止 ${formatStamp(task.dueAt)}`;
    } else {
      when = '无截止';
    }
    lines.push(`- [${task.status}] ${title}（${when}）`);
  }

  if (lines.length === 0) return '';
  return `## 当前任务\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/* 模型抽取结果解析                                                     */
/* ------------------------------------------------------------------ */

export interface ExtractedMemory {
  text: string;
  tags: string[];
}

interface RawCandidate {
  text: string;
  tags: unknown[];
}

/**
 * 从 JSON 文本里取出可解析的值。
 *
 * 支持：整体 JSON、```json 围栏```、JSON 前后夹带说明文字。
 * 解析失败返回 `undefined`（调用方转成 `[]`，绝不抛错）。
 */
function extractJsonValue(raw: string): unknown {
  const fenced = /```[a-zA-Z0-9_+-]*[ \t]*\r?\n?([\s\S]*?)```/.exec(raw);
  const body = fenced && fenced[1].trim() ? fenced[1] : raw.replace(/```/g, '');
  const text = body.trim();
  if (!text) return undefined;

  const firstArray = text.indexOf('[');
  const firstObject = text.indexOf('{');
  let start = -1;
  if (firstArray === -1) start = firstObject;
  else if (firstObject === -1) start = firstArray;
  else start = Math.min(firstArray, firstObject);
  if (start === -1) return undefined;

  const tail = text.slice(start).trim();
  const candidates = [tail];

  // 尾部可能还有解释文字：截到最后一个 `]` / `}` 再试一次
  const end = Math.max(tail.lastIndexOf(']'), tail.lastIndexOf('}'));
  if (end > 0 && end < tail.length - 1) candidates.push(tail.slice(0, end + 1).trim());

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // 试下一个候选，最后返回 undefined
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 找到候选数组：数组本身、`{memories:[...]}`、或单个 `{text,tags}`。 */
function pickItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];

  for (const key of ['memories', 'items', 'results', 'facts', 'data']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  if (typeof record['text'] === 'string') return [record];
  return [];
}

function readCandidateText(record: Record<string, unknown>): string {
  for (const key of ['text', 'memory', 'content', 'fact']) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

function readCandidateTags(record: Record<string, unknown>): unknown[] {
  const value = record['tags'] ?? record['tag'];
  return Array.isArray(value) ? value : [];
}

function toCandidates(payload: unknown): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  for (const item of pickItems(payload)) {
    if (typeof item === 'string') {
      candidates.push({ text: item, tags: [] });
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    candidates.push({ text: readCandidateText(record), tags: readCandidateTags(record) });
  }
  return candidates;
}

/** 只保留字符串标签：去空、去重、每个 ≤ 12 字、最多 4 个。 */
function cleanTags(raw: unknown[]): string[] {
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clipped = Array.from(item.trim()).slice(0, MAX_TAG_LENGTH).join('').trim();
    if (!clipped) continue;
    if (tags.includes(clipped)) continue;
    tags.push(clipped);
    if (tags.length >= MAX_TAG_COUNT) break;
  }
  return tags;
}

function truncateText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join('').trim();
}

/**
 * 解析模型给出的「记忆抽取」结果，做安全过滤。
 *
 * 支持的输入形态：
 * - 纯数组：`["用户喜欢跑步", {"text":"用户对花生过敏","tags":["健康"]}]`
 * - 对象：`{"memories":[...]}`（兼容 `items` / `results` / `facts` / `data` 键）
 * - 单个对象：`{"text":"...","tags":[...]}`
 * - 任一形态包在 ```json 围栏里，或前后夹带说明文字
 * - 元素也可以是字符串
 *
 * 过滤：非字符串/空、归一化后 < 4 字、> 120 字截断、疑问句、以「用户问/用户说」开头的元描述、纯标点。
 * 最多 8 条，内部按 `isDuplicateMemory` 去重。
 */
export function parseMemoryExtraction(raw: string): ExtractedMemory[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];

  const payload = extractJsonValue(raw);
  if (payload === undefined) return [];

  const results: ExtractedMemory[] = [];
  const collectedTexts: string[] = [];

  for (const candidate of toCandidates(payload)) {
    if (results.length >= MAX_EXTRACTED) break;
    if (typeof candidate.text !== 'string') continue;

    const flat = collapseWhitespace(candidate.text);
    if (!flat) continue;

    // 疑问句 / 元描述 / 纯标点：先在原文上判定（归一化会剥掉问号）
    if (QUESTION_TAIL_RE.test(flat)) continue;
    if (META_PREFIX_RE.test(flat)) continue;
    if (!HAS_WORD_RE.test(flat)) continue;

    const normalized = normalizeMemory(flat);
    if (normalized.length < MIN_MEMORY_LENGTH) continue;

    const text = truncateText(flat, MAX_MEMORY_LENGTH);
    if (!text) continue;
    if (isDuplicateText(text, collectedTexts)) continue;

    collectedTexts.push(text);
    results.push({ text, tags: cleanTags(candidate.tags) });
  }

  return results;
}

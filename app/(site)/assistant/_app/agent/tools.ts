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

  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */

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

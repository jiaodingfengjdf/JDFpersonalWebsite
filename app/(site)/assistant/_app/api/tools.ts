/**
 * DeepSeek Search / Fetch（独立 JSON API）。
 *
 * - POST {base}/v1/tools/search → 结构化搜索结果（按成功次数计费）
 * - POST {base}/v1/tools/fetch  → 网页 Markdown 正文（按成功次数计费）
 *
 * 鉴权与对话接口一致：Authorization: Bearer <API Key>。
 * 这里只做薄封装 + 错误归一化，业务侧（Agent 工具、UI）决定怎么展示。
 */
import { ApiError } from './voice';

export interface SearchResult {
  rerankScore: number;
  title: string;
  url: string;
  snippet: string;
  summary: string;
  content: string;
  siteName: string | null;
  siteIcon: string | null;
  date: string | null;
  authority: number;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface FetchedPage {
  title: string;
  content: string;
}

export interface SearchOptions {
  count?: number;
  needContent?: boolean;
  oriQuestion?: string;
  localization?: string;
}

interface RawSearchItem {
  rerank_score?: number;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string | null;
  site_icon?: string | null;
  date?: string | null;
  authority?: number;
}

interface ApiErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return `${base}${path}`;
}

async function postJson<T>(
  url: string,
  apiKey: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('请求已取消', { code: 'aborted' });
    }
    throw new ApiError('网络请求失败：检查网络或 Base URL 是否正确', { code: 'network' });
  }

  if (!response.ok) {
    let payload: ApiErrorBody | null = null;
    try {
      payload = (await response.json()) as ApiErrorBody;
    } catch {
      payload = null;
    }
    const message = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new ApiError(friendlyToolsError(response.status, message), {
      status: response.status,
      code: payload?.error?.code ?? `http_${response.status}`,
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('返回内容不是合法 JSON', { code: 'bad_json' });
  }
}

function friendlyToolsError(status: number, fallback: string): string {
  switch (status) {
    case 400:
      return `请求不合法：${fallback}`;
    case 401:
      return 'API Key 无效或缺失，请到设置页检查';
    case 402:
      return '账号余额不足，请充值后重试';
    case 403:
      return `Fetch 被安全策略拒绝：${fallback}`;
    case 404:
      return '抓不到网页内容（链接不可用、被站点拦截或没有可提取正文）';
    case 408:
      return '读取请求体超时，请稍后重试';
    case 413:
      return '请求体过大';
    case 429:
      return '触发限速（Search 100 QPS / Fetch 25 QPS），请稍后重试';
    case 500:
      return '服务端内部错误，请稍后重试';
    case 504:
      return '下游请求超时，请稍后重试';
    default:
      return fallback;
  }
}

/** Fetch 只接受 http/https、带 host、且不能带账号密码的 URL。 */
export function isFetchableUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || value.length > 8192) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (!url.hostname) return false;
  if (url.username || url.password) return false;
  return true;
}

export async function searchWeb(args: {
  apiKey: string;
  baseUrl: string;
  query: string;
  options?: SearchOptions;
  signal?: AbortSignal;
}): Promise<SearchResponse> {
  const query = args.query.trim();
  if (!query) throw new ApiError('搜索词不能为空', { code: 'invalid_query' });
  if (query.length > 128) throw new ApiError('搜索词最多 128 个字符', { code: 'invalid_query' });

  const count = args.options?.count ?? 8;
  const body: Record<string, unknown> = {
    query,
    count: Math.min(50, Math.max(1, Math.round(count))),
    need_content: args.options?.needContent ?? true,
  };
  if (args.options?.oriQuestion) body.ori_question = args.options.oriQuestion.slice(0, 128);
  if (args.options?.localization) body.localization = args.options.localization;

  const raw = await postJson<{ results?: RawSearchItem[] }>(
    joinUrl(args.baseUrl, '/v1/tools/search'),
    args.apiKey,
    body,
    args.signal,
  );

  const results = (raw.results ?? []).map((item) => ({
    rerankScore: Number(item.rerank_score ?? 0),
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.snippet ?? '',
    summary: item.summary ?? '',
    content: item.content ?? '',
    siteName: item.site_name ?? null,
    siteIcon: item.site_icon ?? null,
    date: item.date ?? null,
    authority: Number(item.authority ?? -1),
  }));

  return { results };
}

export async function fetchPage(args: {
  apiKey: string;
  baseUrl: string;
  url: string;
  signal?: AbortSignal;
}): Promise<FetchedPage> {
  if (!isFetchableUrl(args.url)) {
    throw new ApiError('只支持 http/https 链接（不能带用户名密码）', { code: 'invalid_url' });
  }
  const raw = await postJson<{ title?: string; content?: string }>(
    joinUrl(args.baseUrl, '/v1/tools/fetch'),
    args.apiKey,
    { url: args.url.trim() },
    args.signal,
  );
  return { title: raw.title ?? '', content: raw.content ?? '' };
}

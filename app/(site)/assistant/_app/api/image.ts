/**
 * GPT Image 系列生图接口（第三方 Grsai 网关）。
 *
 * POST {base}/v1/api/generate
 * Authorization: Bearer <grsai key>
 *
 * 返回 { id, status: running|succeeded|failed|violation, results: [{url}], usage:{credits}, progress?, error? }
 * replyType=json 时同步等结果；stream/async 暂不接入。
 */
import { ApiError } from './voice';

export const IMAGE_MODELS = [
  'gpt-image-2',
  'gpt-image-2-vip',
  'gpt-image-2.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.6',
  'gpt-image-2.6-flare',
  'gpt-image-2.6-sunburst',
] as const;

export const IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export interface ImageResult {
  id: string;
  status: string;
  urls: string[];
  credits?: number;
  progress?: number;
  error?: string;
}

interface RawGenerate {
  id?: string;
  status?: string;
  results?: Array<{ url?: string }>;
  usage?: { credits?: number };
  progress?: number;
  error?: string;
}

export function isImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export async function generateImage(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  quality?: string;
  images?: string[];
  signal?: AbortSignal;
}): Promise<ImageResult> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new ApiError('提示词不能为空', { code: 'invalid_prompt' });

  const base = (args.baseUrl || 'https://grsai.dakka.com.cn').trim().replace(/\/+$/, '');
  const body: Record<string, unknown> = {
    model: args.model || 'gpt-image-2.6',
    prompt,
    replyType: 'json',
  };
  if (args.aspectRatio) body.aspectRatio = args.aspectRatio;
  if (args.quality) body.quality = args.quality;
  if (args.images && args.images.length > 0) body.images = args.images.slice(0, 4);

  let response: Response;
  try {
    response = await fetch(`${base}/v1/api/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('请求已取消', { code: 'aborted' });
    }
    throw new ApiError('连不上生图服务：检查网络或 Base URL', { code: 'network' });
  }

  let payload: RawGenerate | { error?: string } | null = null;
  try {
    payload = (await response.json()) as RawGenerate;
  } catch {
    payload = null;
  }

  const raw = (payload ?? {}) as RawGenerate;
  const urls = (raw.results ?? []).map((item) => item.url ?? '').filter(isImageUrl);

  if (!response.ok) {
    const reason =
      raw.error ||
      (payload as { error?: string } | null)?.error ||
      (response.status === 401
        ? 'API Key 无效'
        : response.status === 402
          ? '积分不足'
          : `HTTP ${response.status}`);
    throw new ApiError(friendly(reason, response.status), {
      status: response.status,
      code: `image_${response.status}`,
    });
  }

  if (raw.status === 'violation') {
    throw new ApiError(`提示词或参考图被判定违规：${raw.error ?? ''}`.trim(), { code: 'violation' });
  }
  if (raw.status === 'failed') {
    throw new ApiError(`生图失败：${raw.error ?? '未知原因'}`, { code: 'image_failed' });
  }
  if (raw.status === 'running' && urls.length === 0) {
    throw new ApiError(`任务已提交但仍在生成（任务 id：${raw.id ?? '未知'}），稍后重试或改用异步查询`, {
      code: 'image_running',
    });
  }

  return {
    id: raw.id ?? '',
    status: raw.status ?? 'succeeded',
    urls,
    credits: raw.usage?.credits,
    progress: raw.progress,
    error: raw.error,
  };
}

function friendly(reason: string, status: number): string {
  if (status === 429) return '生图服务限速，请稍后重试';
  if (status >= 500) return `生图服务异常（${status}），请稍后重试`;
  return `生图请求失败：${reason}`;
}

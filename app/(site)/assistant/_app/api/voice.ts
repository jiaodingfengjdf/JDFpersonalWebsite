/**
 * DeepSeek 语音 API 封装（TTS + ASR）。
 *
 * 文档路径：
 * - POST {apiRoot}/v1/tools/tts —— 文本转语音，流式返回音频
 * - POST {apiRoot}/v1/tools/asr —— 语音转文本，multipart/form-data
 *
 * 限制：
 * - TTS 计费按字符：汉字算 2、其他算 1，单次上限 10000 计费字符，请求体 ≤64KiB；
 *   因此对外提供 `truncateForTts()` 先截断到 9000 计费字符（给调用方留余量）。
 * - ASR 只接受 WAV（16kHz 16-bit 单声道最佳），必须先经 `blobToWav16k()` 转换；单文件 ≤8MiB。
 * - 音频已经开始返回后流中断，按失败处理（不返回半截音频）。
 * - 不实现 WebSocket TTS。
 */

/** 默认服务地址。 */
const DEFAULT_API_ROOT = 'https://api.deepseek.com';
/** TTS 计费字符硬上限。 */
const TTS_BILLING_LIMIT = 10000;
/** 调用方默认截断目标（留 1000 余量）。 */
const TTS_TRUNCATE_DEFAULT = 9000;
/** TTS 请求体上限 64KiB。 */
const TTS_BODY_LIMIT_BYTES = 64 * 1024;
/** ASR 单文件上限 8MiB。 */
const ASR_MAX_BYTES = 8 * 1024 * 1024;

/** 语音接口错误：带 HTTP 状态码和稳定的业务 code，message 为可直接展示的中文。 */
export class ApiError extends Error {
  status?: number;
  code?: string;
  /** 服务端返回的原始错误片段（截断后），便于排查。 */
  detail?: unknown;

  constructor(
    message: string,
    options: { status?: number; code?: string; detail?: unknown; name?: string } = {},
  ) {
    super(message);
    this.name = options.name ?? 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
    // 兼容 target 低于 ES2015 时的 instanceof 判定。
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export type VoiceId = 'stella' | 'tide';
export type TtsFormat = 'wav' | 'pcm';

export interface SynthesizeSpeechArgs {
  apiKey: string;
  baseUrl: string;
  useProxy?: boolean;
  text: string;
  voiceId?: VoiceId;
  format?: TtsFormat;
  /** 是否过滤 Markdown 标记（默认 true）。 */
  filterMarkdown?: boolean;
  signal?: AbortSignal;
  /** 已接收字节数，用于下载进度。 */
  onProgress?: (receivedBytes: number) => void;
}

export interface TranscribeSpeechArgs {
  apiKey: string;
  baseUrl: string;
  useProxy?: boolean;
  /** 必须是 WAV（16k 16-bit 单声道最佳），≤8MiB。 */
  audio: Blob;
  filename?: string;
  signal?: AbortSignal;
}

export interface TranscriptionResult {
  text: string;
  duration_ms: number;
  request_id?: string;
}

/* ------------------------------------------------------------------ */
/* base URL 归一化                                                      */
/* ------------------------------------------------------------------ */

/**
 * 归一化 API 根地址：去尾部 `/`、去尾部 `/v1`、去尾部 `/anthropic`。
 * 例：`https://api.deepseek.com/v1/` → `https://api.deepseek.com`。
 * 空值回退到默认地址。
 */
export function apiRoot(baseUrl: string): string {
  let root = (baseUrl ?? '').trim();
  if (!root) return DEFAULT_API_ROOT;

  // 用户可能只填了 api.deepseek.com，补默认 https
  if (!/^https?:\/\//i.test(root)) root = `https://${root}`;

  // 允许用户填 /v1/anthropic/ 这类组合，循环剥干净（最多几轮，防止死循环）。
  for (let i = 0; i < 8; i += 1) {
    const before = root;
    root = root.replace(/\/+$/, '');
    if (/\/v1$/i.test(root)) {
      root = root.slice(0, -3);
      continue;
    }
    if (/\/anthropic$/i.test(root)) {
      root = root.slice(0, -'/anthropic'.length);
      continue;
    }
    root = root.replace(/\/+$/, '');
    if (root === before) break;
  }

  return root || DEFAULT_API_ROOT;
}

/* ------------------------------------------------------------------ */
/* 计费字符 / 截断                                                      */
/* ------------------------------------------------------------------ */

/** 汉字（含扩展 A、兼容区）。用码点区间而非 \p{Script=Han}，避免依赖 unicode 属性转义。 */
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
/** 截断后需要清理的尾部分隔符/标点。 */
const TRAILING_NOISE_RE = /[\s,，、;；:：.。!！?？~～\-—_]+$/;

function charCost(ch: string): number {
  return HAN_RE.test(ch) ? 2 : 1;
}

/**
 * 计算 TTS 计费字符数：汉字算 2，其他算 1（含空格、标点、emoji 码点）。
 */
export function billingLength(text: string): number {
  let total = 0;
  for (const ch of text) total += charCost(ch);
  return total;
}

/**
 * 按计费规则截断到 `limit` 计费字符以内，超长时裁掉尾部并在末尾追加 `…`。
 * 默认 limit=9000（硬上限 10000）。未超长时原样返回。
 */
export function truncateForTts(text: string, limit: number = TTS_TRUNCATE_DEFAULT): string {
  const input = text ?? '';
  const max = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : TTS_TRUNCATE_DEFAULT));
  if (billingLength(input) <= max) return input;

  const budget = Math.max(0, max - 1); // 给省略号留 1 个计费字符
  let used = 0;
  let out = '';
  for (const ch of input) {
    const cost = charCost(ch);
    if (used + cost > budget) break;
    out += ch;
    used += cost;
  }

  return `${out.replace(TRAILING_NOISE_RE, '')}…`;
}

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(source: unknown, key: string): string | undefined {
  const record = asRecord(source);
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(source: unknown, key: string): number | undefined {
  const record = asRecord(source);
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 从错误响应里尽量抽出可读信息（`error.message` / `message` / `detail`）。 */
function extractDetail(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const nested = asRecord(asRecord(parsed)?.error);
    const message =
      readString(nested, 'message') ??
      readString(parsed, 'message') ??
      readString(parsed, 'detail') ??
      readString(parsed, 'msg');
    if (message) return message.slice(0, 300);
  } catch {
    /* 非 JSON，直接用原文 */
  }
  return trimmed.slice(0, 300);
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    return extractDetail(await response.text());
  } catch {
    return undefined;
  }
}

function abortError(): ApiError {
  return new ApiError('请求已取消', { code: 'aborted', name: 'AbortError' });
}

function requireApiKey(apiKey: string): string {
  const key = (apiKey ?? '').trim();
  if (!key) {
    throw new ApiError('请先在设置中填写 API Key', { code: 'no_api_key' });
  }
  return key;
}

/** 拼接错误信息：中文主句 + 服务端细节。 */
function withDetail(message: string, detail?: string): string {
  return detail ? `${message}（${detail}）` : message;
}

/* ------------------------------------------------------------------ */
/* TTS                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 文本转语音，流式读取并累积成 Blob。
 * `format: 'pcm'` 时返回 24kHz / 16-bit / 单声道裸 PCM（无 WAV 头），由播放层自行包装。
 */
export async function synthesizeSpeech(args: SynthesizeSpeechArgs): Promise<Blob> {
  const trimmedKey = (args.apiKey ?? '').trim();
  const viaProxy = Boolean(args.useProxy && !trimmedKey);
  const apiKey = viaProxy ? '' : requireApiKey(args.apiKey);
  const text = (args.text ?? '').trim();
  if (!text) {
    throw new ApiError('没有可朗读的文本', { code: 'empty_text' });
  }

  const billed = billingLength(text);
  if (billed > TTS_BILLING_LIMIT) {
    throw new ApiError(
      `文本过长（${billed} 计费字符），语音合成单次上限为 ${TTS_BILLING_LIMIT} 计费字符，请先截断`,
      { code: 'text_too_long' },
    );
  }

  const format: TtsFormat = args.format ?? 'wav';
  const payload = {
    text,
    voice_id: args.voiceId ?? 'stella',
    format,
    filter_markdown: args.filterMarkdown ?? true,
  };

  const bodyBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bodyBytes > TTS_BODY_LIMIT_BYTES) {
    throw new ApiError(
      `请求体过大（${Math.ceil(bodyBytes / 1024)}KiB），语音合成上限为 64KiB，请缩短文本`,
      { code: 'request_too_large' },
    );
  }

  if (args.signal?.aborted) throw abortError();

  let response: Response;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'audio/*, application/json',
    };
    if (!viaProxy) headers.Authorization = `Bearer ${apiKey}`;
    response = await fetch(
      viaProxy ? '/api/assistant/proxy/tts' : `${apiRoot(args.baseUrl)}/v1/tools/tts`,
      {
        method: 'POST',
        credentials: viaProxy ? 'same-origin' : undefined,
        headers,
        body: JSON.stringify(payload),
        signal: args.signal,
      },
    );
  } catch (err) {
    if (args.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw abortError();
    }
    throw new ApiError('语音合成请求失败，请检查网络连接后重试', {
      code: 'network_error',
    });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw mapTtsError(response.status, detail);
  }

  const headerType = (response.headers.get('content-type') ?? '').toLowerCase();
  // 少数情况会用 200 返回 JSON 错误体，这里提前拦掉，避免把 JSON 当音频。
  if (headerType.includes('application/json')) {
    const detail = await readErrorDetail(response);
    throw new ApiError(withDetail('语音合成失败：服务端未返回音频', detail), {
      status: response.status,
      code: 'not_audio',
      detail,
    });
  }

  const mimeType = format === 'pcm' ? 'audio/pcm' : headerType.split(';')[0]?.trim() || 'audio/wav';
  const parts: BlobPart[] = [];
  let received = 0;

  const stream = response.body;
  if (stream) {
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          parts.push(value);
          received += value.byteLength;
          args.onProgress?.(received);
        }
      }
    } catch (err) {
      // 音频已开始返回后中断 → 整体失败，不返回半截音频。
      void reader.cancel().catch(() => {});
      if (args.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw abortError();
      }
      throw new ApiError('语音合成中断，请重试', {
        code: 'stream_failed',
        detail: err instanceof Error ? err.message.slice(0, 200) : undefined,
      });
    }
  } else {
    // 极少数环境不支持流式 body，退回一次性读取。
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 0) {
      parts.push(buffer);
      received = buffer.byteLength;
      args.onProgress?.(received);
    }
  }

  if (received === 0) {
    throw new ApiError('语音合成返回了空音频，请重试', { code: 'empty_audio' });
  }

  return new Blob(parts, { type: mimeType });
}

function mapTtsError(status: number, detail?: string): ApiError {
  const options = { status, detail };
  if (status === 400) {
    if (detail && /content\s*exists\s*risk/i.test(detail)) {
      return new ApiError('内容未通过审核，请修改文本后重试', {
        ...options,
        code: 'content_risk',
      });
    }
    return new ApiError(withDetail('语音合成为空或请求无效（可能没有可朗读的文本）', detail), {
      ...options,
      code: 'bad_request',
    });
  }
  if (status === 401 || status === 403) {
    return new ApiError('API Key 无效或没有语音接口权限', { ...options, code: 'unauthorized' });
  }
  if (status === 429) {
    return new ApiError('语音合成请求过于频繁，请稍后再试', { ...options, code: 'rate_limited' });
  }
  if (status === 503) {
    return new ApiError('语音合成服务繁忙或暂不可用，请稍后再试', {
      ...options,
      code: 'unavailable',
    });
  }
  if (status === 504) {
    return new ApiError('语音合成服务超时，请稍后再试', { ...options, code: 'gateway_timeout' });
  }
  return new ApiError(withDetail(`语音合成失败（HTTP ${status}）`, detail), {
    ...options,
    code: 'http_error',
  });
}

/* ------------------------------------------------------------------ */
/* ASR                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 语音转文本。
 * multipart 字段名必须是 `file`；不要手动设置 Content-Type（交给浏览器带 boundary）。
 */
export async function transcribeSpeech(args: TranscribeSpeechArgs): Promise<TranscriptionResult> {
  const trimmedKey = (args.apiKey ?? '').trim();
  const viaProxy = Boolean(args.useProxy && !trimmedKey);
  const apiKey = viaProxy ? '' : requireApiKey(args.apiKey);

  const audio = args.audio;
  if (!audio || typeof audio.size !== 'number' || audio.size === 0) {
    throw new ApiError('没有可识别的音频', { code: 'empty_audio' });
  }
  if (audio.size > ASR_MAX_BYTES) {
    throw new ApiError(
      `音频过大（${(audio.size / 1024 / 1024).toFixed(1)}MiB），语音识别单次上限为 8MiB，请缩短录音`,
      { code: 'audio_too_large' },
    );
  }

  if (args.signal?.aborted) throw abortError();

  const filename = args.filename?.trim() || 'speech.wav';
  const form = new FormData();
  form.append('file', audio, filename);

  let response: Response;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!viaProxy) headers.Authorization = `Bearer ${apiKey}`;
    response = await fetch(
      viaProxy ? '/api/assistant/proxy/asr' : `${apiRoot(args.baseUrl)}/v1/tools/asr`,
      {
        method: 'POST',
        credentials: viaProxy ? 'same-origin' : undefined,
        headers,
        body: form,
        signal: args.signal,
      },
    );
  } catch (err) {
    if (args.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw abortError();
    }
    throw new ApiError('语音识别请求失败，请检查网络连接后重试', { code: 'network_error' });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw mapAsrError(response.status, detail);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new ApiError('语音识别结果无法解析，请重试', { status: response.status, code: 'bad_json' });
  }

  const text = readString(parsed, 'text');
  if (text === undefined) {
    throw new ApiError('语音识别结果缺少文本字段', {
      status: response.status,
      code: 'bad_payload',
    });
  }

  const duration = readNumber(parsed, 'duration_ms');
  const requestId = readString(parsed, 'request_id');

  return {
    text,
    duration_ms: duration ?? 0,
    ...(requestId ? { request_id: requestId } : {}),
  };
}

function mapAsrError(status: number, detail?: string): ApiError {
  const options = { status, detail };
  if (status === 400) {
    return new ApiError(withDetail('语音识别请求无效（音频格式不受支持或无法解析）', detail), {
      ...options,
      code: 'bad_request',
    });
  }
  if (status === 401 || status === 403) {
    return new ApiError('API Key 无效或没有语音接口权限', { ...options, code: 'unauthorized' });
  }
  if (status === 408) {
    return new ApiError('语音识别超时，请稍后重试', { ...options, code: 'timeout' });
  }
  if (status === 413) {
    return new ApiError('音频过大，服务器拒绝处理（上限 8MiB）', {
      ...options,
      code: 'audio_too_large',
    });
  }
  if (status === 429) {
    return new ApiError('语音识别请求过于频繁，请稍后再试', { ...options, code: 'rate_limited' });
  }
  if (status === 503) {
    return new ApiError('语音识别服务繁忙或暂不可用，请稍后再试', {
      ...options,
      code: 'unavailable',
    });
  }
  if (status === 504) {
    return new ApiError('语音识别服务超时，请稍后再试', { ...options, code: 'gateway_timeout' });
  }
  return new ApiError(withDetail(`语音识别失败（HTTP ${status}）`, detail), {
    ...options,
    code: 'http_error',
  });
}

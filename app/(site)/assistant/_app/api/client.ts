/**
 * DeepSeek Chatbot 全家桶 —— Messages（Anthropic 兼容）协议客户端。
 *
 * 端点：POST {baseUrl}/anthropic/v1/messages
 * 文档：https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot
 */
import { iterateSse } from '../lib/sse';
import { ASSISTANT_DEFAULT_MODEL, assistantModelDisplayName } from '@/lib/assistant-models';
import type {
  AssistantBlock,
  Citation,
  CreateMessageRequest,
  DeltaKind,
  StopReason,
  StreamEvent,
  Usage,
} from './types';
import { ApiError, apiRoot } from './voice';

// 全局统一的 API 错误与 baseUrl 归一化（定义在 voice.ts，供语音/文件/对话共用，
// 保证跨模块 instanceof 判定有效）。
export { ApiError, apiRoot };

export interface ChatResult {
  id?: string;
  model?: string;
  blocks: AssistantBlock[];
  stopReason: StopReason;
  usage?: Usage;
  title?: string;
  /** 是否用过服务端联网工具（用过则不能「继续生成」）。 */
  usedTools: boolean;
  /** 请求的模型不可用时已自动回落到默认模型，给 UI 的提示（无回落时为空）。 */
  fallbackNotice?: string;
}

export interface NonStreamArgs {
  apiKey: string;
  baseUrl: string;
  useProxy?: boolean;
  body: Omit<CreateMessageRequest, 'messages' | 'stream'>;
  messages: CreateMessageRequest['messages'];
  signal?: AbortSignal;
  /** 覆盖默认客户端超时（仅测试用；生产默认 55 秒）。 */
  timeoutMs?: number;
}

export interface NonStreamResult {
  blocks: AssistantBlock[];
  stopReason: StopReason;
  usage?: Usage;
  text: string;
  /** 请求的模型不可用时已自动回落到默认模型，给 UI 的提示（无回落时为空）。 */
  fallbackNotice?: string;
}

/** 客户端超时：小于代理的 60 秒，超时后给友好提示而不是等服务端掐断。 */
export const CLIENT_TIMEOUT_MS = 55_000;
/** 429/503 只重试一次。 */
const MAX_RETRIES = 1;
const RETRYABLE_STATUSES = new Set([429, 503]);
const RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TimeoutHandle {
  signal: AbortSignal;
  timedOut: () => boolean;
  cancel: () => void;
}

/**
 * 合并用户取消信号与超时信号。超时触发时 timedOut() 为真，
 * 调用方据此区分「用户主动停止」与「请求超时」。
 */
function withClientTimeout(
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): TimeoutHandle {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  const cancel = () => clearTimeout(timer);

  let signal: AbortSignal = timeoutController.signal;
  if (userSignal) {
    if (typeof AbortSignal.any === 'function') {
      signal = AbortSignal.any([userSignal, timeoutController.signal]);
    } else {
      const combined = new AbortController();
      const abortCombined = () => combined.abort();
      userSignal.addEventListener('abort', abortCombined, { once: true });
      timeoutController.signal.addEventListener('abort', abortCombined, { once: true });
      signal = combined.signal;
    }
  }
  return { signal, timedOut: () => timedOut, cancel };
}

function errorMessageOf(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    return String(
      (payload as { error?: { message?: string } }).error?.message ??
        (payload as { message?: string }).message ??
        '',
    );
  }
  return typeof payload === 'string' ? payload : '';
}

/** 只有「模型不存在/不支持」这类错误才触发回落；其他 400（如内容审核）不回落。 */
function isModelNotFound(status: number, message: string): boolean {
  if (status !== 404 && status !== 400) return false;
  return (
    /model/i.test(message) &&
    /(not found|does not exist|unknown|invalid|unsupported|不存在|未知)/i.test(message)
  );
}

interface PostMessagesArgs {
  url: string;
  headers: Record<string, string>;
  credentials?: RequestCredentials;
  payload: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 用户主动取消时抛出的提示（流式「已停止生成」，非流式「已取消」）。 */
  abortMessage: string;
}

interface PostMessagesResult {
  res: Response;
  fallbackNotice?: string;
  /** 成功返回时调用方持有它：流式读完后再 cancel；失败时本函数已自行 cancel。 */
  timeout: TimeoutHandle;
}

/**
 * 发一次 Messages 请求，带 429/503 一次指数退避重试、55 秒客户端超时、
 * 模型不存在时一次回落到默认模型。成功时返回响应（res.ok 一定为真），
 * 终态失败时抛 ApiError。
 */
async function postMessages(args: PostMessagesArgs): Promise<PostMessagesResult> {
  const timeoutMs = args.timeoutMs ?? CLIENT_TIMEOUT_MS;
  const timeout = withClientTimeout(args.signal, timeoutMs);
  let retries = 0;
  let fallbackUsed = false;
  let fallbackNotice: string | undefined;
  let payload = args.payload;
  try {
    for (;;) {
      let res: Response;
      try {
        res = await fetch(args.url, {
          method: 'POST',
          credentials: args.credentials,
          headers: args.headers,
          body: JSON.stringify(payload),
          signal: timeout.signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          if (timeout.timedOut()) {
            throw new ApiError(
              `请求超时（${Math.round(timeoutMs / 1000)} 秒），请重试或切换到更快的模型`,
              { code: 'client_timeout' },
            );
          }
          throw new ApiError(args.abortMessage, { code: 'aborted' });
        }
        throw new ApiError(`网络请求失败：${(err as Error).message}`, { code: 'network_error' });
      }

      if (res.ok) return { res, fallbackNotice, timeout };

      const errorPayload = await readErrorPayload(res);
      const message = errorMessageOf(errorPayload);

      if (RETRYABLE_STATUSES.has(res.status) && retries < MAX_RETRIES) {
        retries += 1;
        await sleep(RETRY_DELAY_MS * retries);
        continue;
      }
      if (
        !fallbackUsed &&
        payload.model !== ASSISTANT_DEFAULT_MODEL &&
        isModelNotFound(res.status, message)
      ) {
        fallbackUsed = true;
        fallbackNotice = `模型「${String(payload.model)}」不可用，已自动切换到 ${assistantModelDisplayName(ASSISTANT_DEFAULT_MODEL)} 继续生成`;
        payload = { ...payload, model: ASSISTANT_DEFAULT_MODEL };
        continue;
      }
      throw friendlyHttpError(res.status, errorPayload);
    }
  } catch (err) {
    timeout.cancel();
    throw err;
  }
}

/**
 * 非流式请求（用在后台的记忆抽取、标题补全这类小任务上）。
 * 与流式共用同一套鉴权头与错误映射。
 */
export async function createMessage(args: NonStreamArgs): Promise<NonStreamResult> {
  const { apiKey, baseUrl, useProxy, body, messages, signal } = args;
  const trimmedKey = apiKey.trim();
  const viaProxy = Boolean(useProxy && !trimmedKey);
  if (!trimmedKey && !viaProxy) throw new ApiError('缺少 API Key', { code: 'no_api_key' });

  const url = viaProxy ? '/api/assistant/proxy/messages' : `${apiRoot(baseUrl)}/anthropic/v1/messages`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'files-api-2025-04-14',
  };
  if (!viaProxy) headers['x-api-key'] = trimmedKey;

  const { res, fallbackNotice, timeout } = await postMessages({
    url,
    headers,
    credentials: viaProxy ? 'same-origin' : undefined,
    payload: { ...body, messages, stream: false },
    signal,
    timeoutMs: args.timeoutMs,
    abortMessage: '已取消',
  });

  try {
    const payload = (await res.json()) as {
      content?: AssistantBlock[];
      stop_reason?: StopReason;
      usage?: Usage;
      error?: { message?: string };
    };
    if (payload.error) {
      throw new ApiError(payload.error.message ?? '服务端返回错误', { code: 'stream_error' });
    }
    const blocks = (payload.content ?? []).filter(Boolean);
    const text = blocks
      .filter((b): b is Extract<AssistantBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { blocks, stopReason: payload.stop_reason ?? null, usage: payload.usage, text, fallbackNotice };
  } finally {
    timeout.cancel();
  }
}

export interface ChatCallbacks {
  onStart?: (message: { id?: string; model?: string; usage?: Usage }) => void;
  onBlockStart?: (index: number, block: AssistantBlock) => void;
  onDelta?: (index: number, delta: DeltaKind) => void;
  onBlockStop?: (index: number) => void;
  onFinal?: (delta: { stop_reason: StopReason; title?: string }, usage?: Usage) => void;
}

/** 把增量合并进内容块（就地修改）。 */
export function applyDeltaToBlock(block: AssistantBlock, delta: DeltaKind): void {
  switch (delta.type) {
    case 'text_delta':
      if (block.type === 'text') block.text += String(delta.text ?? '');
      break;
    case 'thinking_delta':
      if (block.type === 'thinking') block.thinking += String(delta.thinking ?? '');
      break;
    case 'signature_delta':
      if (block.type === 'thinking') block.signature = String(delta.signature ?? '');
      break;
    case 'input_json_delta': {
      // 工具调用参数是流式分片（partial_json）：逐片拼接并尝试解析，
      // 否则 tool_use.input 永远是空对象，工具会拿到 {} 而报「参数为空」。
      if (block.type === 'tool_use') {
        const carrier = block as unknown as { partialJson?: string; input?: unknown };
        const next = (carrier.partialJson ?? '') + String((delta as { partial_json?: string }).partial_json ?? '');
        carrier.partialJson = next;
        try {
          carrier.input = JSON.parse(next);
        } catch {
          // 还没拼完，等下一片
        }
      }
      break;
    }
    case 'citations_delta': {
      const citation = (delta as { citation?: Citation }).citation;
      if (block.type === 'text' && citation) {
        block.citations = [...(block.citations ?? []), citation];
      }
      break;
    }
    default:
      break;
  }
}

const TOOL_BLOCK_TYPES = new Set([
  'server_tool_use',
  'web_search_tool_result',
  'web_fetch_tool_result',
]);

export interface StreamMessageArgs {
  apiKey: string;
  baseUrl: string;
  useProxy?: boolean;
  /** 完整请求体（不含 messages），例如 model / thinking / tools / safety_check / title / system。 */
  body: Omit<CreateMessageRequest, 'messages'>;
  messages: CreateMessageRequest['messages'];
  signal?: AbortSignal;
  callbacks?: ChatCallbacks;
  /** 覆盖默认客户端超时（仅测试用；生产默认 55 秒）。 */
  timeoutMs?: number;
}

function friendlyHttpError(status: number, payload: unknown): ApiError {
  const raw =
    payload && typeof payload === 'object'
      ? ((payload as { error?: { message?: string } }).error?.message ??
        (payload as { message?: string }).message ??
        '')
      : typeof payload === 'string'
        ? payload
        : '';
  const message = String(raw || '').slice(0, 500);

  if (status === 400) {
    if (/Content Exists Risk/i.test(message)) {
      return new ApiError('输入内容未通过内容安全审核（Content Exists Risk），请调整后重试', {
        status,
        code: 'content_risk',
        detail: payload,
      });
    }
    return new ApiError(message || '请求不合法（400）', { status, code: 'bad_request', detail: payload });
  }
  if (status === 401 || status === 403) {
    return new ApiError('API Key 无效或无权限，请到「设置」检查 API Key', {
      status,
      code: 'unauthorized',
      detail: payload,
    });
  }
  if (status === 402) {
    return new ApiError('账户余额不足，请到 DeepSeek 开放平台充值', {
      status,
      code: 'insufficient_balance',
      detail: payload,
    });
  }
  if (status === 429) {
    return new ApiError('请求过于频繁（并发或速率超限），请稍后重试', {
      status,
      code: 'rate_limited',
      detail: payload,
    });
  }
  if (status === 503) return new ApiError('服务繁忙，请稍后重试（503）', { status, code: 'busy', detail: payload });
  if (status === 504) return new ApiError('服务处理超时，请重试（504）', { status, code: 'timeout', detail: payload });
  if (status >= 500) return new ApiError(`服务异常（${status}），请稍后重试`, { status, code: 'server_error', detail: payload });
  return new ApiError(message || `请求失败（${status}）`, { status, code: 'http_error', detail: payload });
}

async function readErrorPayload(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * 发起一次流式对话，边解析边通过 callbacks 推送，最终返回完整内容块。
 * 抛 ApiError：网络失败、HTTP 错误、流内 error 事件、流被中途关闭。
 */
export async function streamMessage(args: StreamMessageArgs): Promise<ChatResult> {
  const { apiKey, baseUrl, useProxy, body, messages, signal, callbacks } = args;
  const trimmedKey = apiKey.trim();
  const viaProxy = Boolean(useProxy && !trimmedKey);
  if (!trimmedKey && !viaProxy) throw new ApiError('请先在「设置」里填写 DeepSeek API Key', { code: 'no_api_key' });

  const url = viaProxy ? '/api/assistant/proxy/messages' : `${apiRoot(baseUrl)}/anthropic/v1/messages`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    // 引用 Files API 上传的文档/图片时必须携带（文档：文件解析 / 图像理解）
    'anthropic-beta': 'files-api-2025-04-14',
  };
  if (!viaProxy) headers['x-api-key'] = trimmedKey;

  let res: Response;
  let fallbackNotice: string | undefined;
  let timeout: TimeoutHandle;
  try {
    ({ res, fallbackNotice, timeout } = await postMessages({
      url,
      headers,
      credentials: viaProxy ? 'same-origin' : undefined,
      payload: { ...body, messages, stream: true },
      signal,
      timeoutMs: args.timeoutMs,
      abortMessage: '已停止生成',
    }));
  } catch (err) {
    // postMessages 已把超时/取消/网络失败转成 ApiError，直接透传。
    throw err;
  }

  if (!res.body) {
    throw new ApiError('响应为空', { code: 'empty_response' });
  }

  const blocks: AssistantBlock[] = [];
  let stopReason: StopReason = null;
  let usage: Usage | undefined;
  let title: string | undefined;
  let messageId: string | undefined;
  let model: string | undefined;
  let finished = false;
  let usedTools = false;
  let streamError: ApiError | null = null;

  const setBlock = (index: number, block: AssistantBlock) => {
    blocks[index] = block;
  };

  try {
    for await (const frame of iterateSse(res.body)) {
    if (!frame.data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(frame.data);
    } catch {
      continue;
    }
    // 无名帧：等待生成超时前的 {"error":{"message":...}}
    const maybeError = (parsed as { error?: { message?: string } }).error;
    if (!('type' in (parsed as object)) && maybeError) {
      throw new ApiError(maybeError.message || '服务端返回错误', { code: 'stream_error' });
    }

    const event = parsed as StreamEvent;
    switch (event.type) {
      case 'message_start': {
        messageId = event.message?.id;
        model = event.message?.model;
        for (const [i, block] of (event.message?.content ?? []).entries()) {
          setBlock(i, structuredClone(block) as AssistantBlock);
        }
        callbacks?.onStart?.({ id: messageId, model, usage: event.message?.usage });
        break;
      }
      case 'content_block_start': {
        if (TOOL_BLOCK_TYPES.has(event.content_block.type)) usedTools = true;
        setBlock(event.index, structuredClone(event.content_block) as AssistantBlock);
        // 必须给调用方一份独立副本：下面 content_block_delta 会往内部块里追加文本，
        // 若共用同一对象，调用方再追加一次就会出现「你好你好」式的重复。
        const snapshot = blocks[event.index];
        callbacks?.onBlockStart?.(
          event.index,
          snapshot ? (structuredClone(snapshot) as AssistantBlock) : snapshot,
        );
        break;
      }
      case 'content_block_delta': {
        const block = blocks[event.index];
        if (block) {
          applyDeltaToBlock(block, event.delta);
          callbacks?.onDelta?.(event.index, event.delta);
        }
        break;
      }
      case 'content_block_stop': {
        callbacks?.onBlockStop?.(event.index);
        break;
      }
      case 'message_delta': {
        stopReason = event.delta?.stop_reason ?? stopReason;
        usage = event.usage ?? usage;
        title = event.delta?.title ?? title;
        callbacks?.onFinal?.({ stop_reason: stopReason, title }, usage);
        break;
      }
      case 'message_stop': {
        finished = true;
        break;
      }
      case 'error': {
        streamError = new ApiError(event.error?.message || '生成过程出错', {
          code: event.error?.type ?? 'stream_error',
          detail: event,
        });
        usage = event.usage ?? usage;
        break;
      }
      default:
        break;
    }
    if (finished) break;
  }

    if (streamError) throw streamError;
    if (!finished) {
      throw new ApiError('流式响应被中断（未收到 message_stop），可点击「继续」或重新生成', {
        code: 'incomplete_stream',
      });
    }

    return {
      id: messageId,
      model,
      blocks: blocks.filter(Boolean),
      stopReason,
      usage,
      title,
      usedTools,
      fallbackNotice,
    };
  } catch (err) {
    // 流中途被掐断：超时（55 秒无数据）与用户主动停止要区分提示。
    if ((err as Error).name === 'AbortError') {
      if (timeout.timedOut()) {
        throw new ApiError('请求超时（55 秒），请重试或切换到更快的模型', {
          code: 'client_timeout',
        });
      }
      throw new ApiError('已停止生成', { code: 'aborted' });
    }
    throw err;
  } finally {
    timeout.cancel();
  }
}

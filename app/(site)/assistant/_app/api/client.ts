/**
 * DeepSeek Chatbot 全家桶 —— Messages（Anthropic 兼容）协议客户端。
 *
 * 端点：POST {baseUrl}/anthropic/v1/messages
 * 文档：https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot
 */
import { iterateSse } from '../lib/sse';
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
}

export interface NonStreamArgs {
  apiKey: string;
  baseUrl: string;
  body: Omit<CreateMessageRequest, 'messages' | 'stream'>;
  messages: CreateMessageRequest['messages'];
  signal?: AbortSignal;
}

export interface NonStreamResult {
  blocks: AssistantBlock[];
  stopReason: StopReason;
  usage?: Usage;
  text: string;
}

/**
 * 非流式请求（用在后台的记忆抽取、标题补全这类小任务上）。
 * 与流式共用同一套鉴权头与错误映射。
 */
export async function createMessage(args: NonStreamArgs): Promise<NonStreamResult> {
  const { apiKey, baseUrl, body, messages, signal } = args;
  if (!apiKey.trim()) throw new ApiError('缺少 API Key', { code: 'no_api_key' });

  let res: Response;
  try {
    res = await fetch(`${apiRoot(baseUrl)}/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'files-api-2025-04-14',
      },
      body: JSON.stringify({ ...body, messages, stream: false }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new ApiError('已取消', { code: 'aborted' });
    throw new ApiError(`网络请求失败：${(err as Error).message}`, { code: 'network_error' });
  }

  if (!res.ok) throw friendlyHttpError(res.status, await readErrorPayload(res));

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
  return { blocks, stopReason: payload.stop_reason ?? null, usage: payload.usage, text };
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
  /** 完整请求体（不含 messages），例如 model / thinking / tools / safety_check / title / system。 */
  body: Omit<CreateMessageRequest, 'messages'>;
  messages: CreateMessageRequest['messages'];
  signal?: AbortSignal;
  callbacks?: ChatCallbacks;
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
  const { apiKey, baseUrl, body, messages, signal, callbacks } = args;
  if (!apiKey.trim()) throw new ApiError('请先在「设置」里填写 DeepSeek API Key', { code: 'no_api_key' });

  const url = `${apiRoot(baseUrl)}/anthropic/v1/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        // 引用 Files API 上传的文档/图片时必须携带（文档：文件解析 / 图像理解）
        'anthropic-beta': 'files-api-2025-04-14',
      },
      body: JSON.stringify({ ...body, messages, stream: true }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new ApiError('已停止生成', { code: 'aborted' });
    }
    throw new ApiError(`网络请求失败：${(err as Error).message}`, { code: 'network_error' });
  }

  if (!res.ok) {
    throw friendlyHttpError(res.status, await readErrorPayload(res));
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
  };
}

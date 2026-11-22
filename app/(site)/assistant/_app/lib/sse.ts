/**
 * 极简 SSE 解析器：DeepSeek /anthropic/v1/messages 的流式响应。
 *
 * 协议要点（文档「流式输出与 Token 用量」）：
 * - 每个事件形如 `event: xxx\ndata: {...}\n\n`，可能穿插 `: keep-alive` 注释；
 * - 没有 `data: [DONE]`；
 * - 等待生成超时前，服务端可能发一个「没有 event 名、也没有顶层 type」的 data 帧，内容是 {error:{message}}。
 */

export interface SseFrame {
  /** 事件名，注释/无名帧为空字符串 */
  event: string;
  /** 未解析的 data 载荷（多行 data 以 \n 连接） */
  data: string;
}

export async function* iterateSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];

  const flush = (): SseFrame | null => {
    if (!eventName && dataLines.length === 0) return null;
    const frame: SseFrame = { event: eventName, data: dataLines.join('\n') };
    eventName = '';
    dataLines = [];
    return frame;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 统一换行，兼容 \r\n
      buffer = buffer.replace(/\r\n/g, '\n');

      let idx = buffer.indexOf('\n');
      while (idx !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf('\n');

        if (line === '') {
          const frame = flush();
          if (frame) yield frame;
          continue;
        }
        if (line.startsWith(':')) continue; // keep-alive 注释
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
          continue;
        }
        // 其它字段（id:/retry:）忽略
      }
    }
    // 收尾：末尾可能没有空行
    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    const frame = flush();
    if (frame) yield frame;
  } finally {
    reader.releaseLock();
  }
}

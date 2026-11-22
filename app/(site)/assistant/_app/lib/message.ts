/**
 * 消息 → 展示文本 / 引用编号 的纯函数工具。
 */
import type { AssistantBlock, ChatMessage, Citation } from '../api/types';

/** 正文纯文本（拼接所有 text 块，用于朗读、复制、标题兜底）。 */
export function assistantText(message: ChatMessage): string {
  if (message.role === 'user') return message.text ?? '';
  return (message.blocks as AssistantBlock[])
    .filter((b): b is Extract<AssistantBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n')
    .trim();
}

/** 整条回答的引用列表，按首次出现顺序去重（下标 + 1 = 角标编号）。 */
export function citationList(message: ChatMessage): Citation[] {
  if (message.role === 'user') return [];
  const list: Citation[] = [];
  const seen = new Set<string>();
  for (const block of message.blocks as AssistantBlock[]) {
    if (block.type !== 'text' || !block.citations) continue;
    for (const citation of block.citations) {
      if (seen.has(citation.url)) continue;
      seen.add(citation.url);
      list.push(citation);
    }
  }
  return list;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 在文本中插入引用占位符 `⟦cN⟧`。
 * `cited_text` 是「当前块截至该引用处的回答文本」，所以它的长度就是角标位置。
 */
export function textWithCitationMarkers(
  text: string,
  citations: Citation[] | undefined,
  all: Citation[],
  marker: (n: number) => string,
): string {
  if (!text) return text;
  if (!citations || citations.length === 0) return text;

  const marks = citations
    .map((citation) => {
      const number = all.findIndex((c) => c.url === citation.url) + 1;
      if (number <= 0) return null;
      const pos = Math.max(0, Math.min(text.length, (citation.cited_text ?? '').length));
      return { pos, marker: marker(number) };
    })
    .filter((m): m is { pos: number; marker: string } => m !== null)
    .sort((a, b) => b.pos - a.pos);

  let out = text;
  let lastPos = Number.POSITIVE_INFINITY;
  for (const mark of marks) {
    const pos = Math.min(mark.pos, lastPos);
    out = out.slice(0, pos) + mark.marker + out.slice(pos);
    lastPos = pos;
  }
  return out;
}

/** 用户消息的简短预览（会话列表/标题兜底）。 */
export function previewOf(message: ChatMessage, max = 28): string {
  const raw = message.role === 'user' ? message.text ?? '' : assistantText(message);
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) {
    const count = message.attachments?.length ?? 0;
    return count > 0 ? `[${count} 个附件]` : '新对话';
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 合并连续 text 块（「继续生成」后把两段接起来）。 */
export function mergeAdjacentTextBlocks(blocks: AssistantBlock[]): AssistantBlock[] {
  const out: AssistantBlock[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (block.type === 'text' && prev?.type === 'text') {
      // 用空行分隔：否则接续的段落可能被 Markdown 当成上一张表格的行
      prev.text = `${prev.text}\n\n${block.text}`;
      if (block.citations?.length) prev.citations = [...(prev.citations ?? []), ...block.citations];
      continue;
    }
    out.push(block);
  }
  return out;
}

import { memo, useState } from 'react';
import type { AssistantBlock, ChatMessage } from '../../api/types';
import { assistantText, citationList, hostOf } from '../../lib/message';
import { AssistantBlocks } from './blocks';
import {
  continueGeneration,
  editUserMessage,
  regenerate,
  speakMessage,
  stopStreaming,
  toast,
  useApp,
} from '../../state/store';
import {
  BookIcon,
  CheckIcon,
  CopyIcon,
  FileIcon,
  PencilIcon,
  QuoteIcon,
  RefreshIcon,
  ShieldIcon,
  SparkIcon,
  StopCircleIcon,
  StopIcon,
  UserIcon,
  VolumeIcon,
} from '../../ui/Icons';
import { formatBytes, formatRelativeTime } from '../../lib/format';
import { openImageViewer } from '../../ui/imageViewer';

function formatTokens(n?: number): string {
  if (!n) return '0';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function fullTimestamp(ts?: number): string {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

function AttachmentStrip({ message }: { message: ChatMessage }) {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return null;
  return (
    <div className="bubble-atts">
      {attachments.map((att) =>
        att.kind === 'image' && att.dataUrl ? (
          <button
            key={att.id}
            type="button"
            className="att-thumb"
            onClick={() => openImageViewer(att.dataUrl!)}
            aria-label={`查看大图：${att.filename}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 内联 base64 图片预览不适用 next/image */}
            <img src={att.dataUrl} alt={att.filename} />
          </button>
        ) : (
          <span key={att.id} className="att-file">
            <FileIcon size={14} />
            <span className="att-name">{att.filename}</span>
            {att.bytes ? <span className="att-size">{formatBytes(att.bytes)}</span> : null}
          </span>
        ),
      )}
    </div>
  );
}

function UserMessage({
  message,
  isLast,
  onQuote,
}: {
  message: ChatMessage;
  isLast: boolean;
  onQuote?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text ?? '');
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    const text = draft.trim();
    if (!text || text === message.text) {
      setEditing(false);
      return;
    }
    setEditing(false);
    await editUserMessage(message.id, text);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      toast('已复制消息', 'success');
    } catch {
      toast('复制失败', 'error');
    }
  };

  const relTime = formatRelativeTime(message.createdAt, 'zh');

  return (
    <div className="row row-user">
      <div className="user-head">
        {relTime ? (
          <time className="msg-time" dateTime={new Date(message.createdAt).toISOString()} title={fullTimestamp(message.createdAt)}>
            {relTime}
          </time>
        ) : null}
        <span className="avatar avatar-user" aria-hidden="true">
          <UserIcon size={13} />
        </span>
      </div>
      <div className="bubble">
        <AttachmentStrip message={message} />
        {editing ? (
          <div className="bubble-edit">
            <textarea
              className="resize-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              autoFocus
            />
            <div className="bubble-edit-actions">
              <button type="button" onClick={() => setEditing(false)}>
                取消
              </button>
              <button type="button" className="primary" onClick={() => void submit()}>
                保存并重发
              </button>
            </div>
          </div>
        ) : (
          message.text && <div className="bubble-text">{message.text}</div>
        )}
        {!editing ? (
          <div className="bubble-tools">
            {isLast ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(message.text ?? '');
                  setEditing(true);
                }}
                aria-label="编辑并重发"
                title="编辑并重发"
              >
                <PencilIcon size={14} />
              </button>
            ) : null}
            {onQuote && message.text ? (
              <button
                type="button"
                aria-label="引用追问"
                title="引用追问"
                onClick={() => onQuote(message.text ?? '')}
              >
                <QuoteIcon size={14} />
              </button>
            ) : null}
            <button
              type="button"
              className={copied ? 'is-copied' : ''}
              aria-label={copied ? '已复制' : '复制'}
              title={copied ? '已复制' : '复制'}
              onClick={() => void handleCopy()}
            >
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface AssistantMessageProps {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  rev: number;
  showHead?: boolean;
  onQuote?: (text: string) => void;
}

function AssistantMessageInner({
  message,
  isLast,
  streaming,
  showHead = true,
  onQuote,
}: AssistantMessageProps) {
  const { tts, settings, isAdmin, publicConfig } = useApp();
  const [copied, setCopied] = useState(false);
  const citations = citationList(message);
  const text = assistantText(message);
  const speaking = tts.messageId === message.id;
  const canContinue =
    isLast &&
    !streaming &&
    !message.usedTools &&
    (message.stopReason === 'max_tokens' || message.aborted || Boolean(message.error));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      if (settings.haptics) navigator.vibrate?.(8);
    } catch {
      toast('复制失败', 'error');
    }
  };

  // 「已联网」只代表服务端联网工具；客户端工具（记忆/任务）不算联网
  const hasServerTool = (message.blocks as AssistantBlock[]).some(
    (b) =>
      b.type === 'server_tool_use' ||
      b.type === 'web_search_tool_result' ||
      b.type === 'web_fetch_tool_result',
  );

  const relTime = formatRelativeTime(message.createdAt, 'zh');
  const aiDisplayName = publicConfig?.displayName?.trim() || '助理';

  return (
    <div className={`row row-ai ${message.refused ? 'is-refused' : ''} ${streaming ? 'is-streaming' : ''}`}>
      <div className={`ai-head ${showHead ? '' : 'is-continuation'}`}>
        {showHead ? (
          <>
            <span className="avatar avatar-ai" aria-hidden="true">
              <SparkIcon size={13} />
            </span>
            <span className="ai-name">{aiDisplayName}</span>
            {message.model ? <span className="ai-model">{message.model}</span> : null}
            {hasServerTool ? <span className="ai-chip">已联网</span> : null}
            {relTime ? (
              <time
                className="msg-time"
                dateTime={new Date(message.createdAt).toISOString()}
                title={fullTimestamp(message.createdAt)}
              >
                {relTime}
              </time>
            ) : null}
          </>
        ) : streaming ? (
          <span className="ai-steps">继续执行中…</span>
        ) : null}
      </div>

      {message.refused ? (
        <div className="notice notice-refusal">
          <ShieldIcon size={16} />
          <div>
            <strong>该回答未通过内容安全审核</strong>
            <p>
              {isAdmin
                ? '服务端已清空本次输出。可以换个问法，或调整「设置 → 内容安全」后重试。'
                : '服务端已清空本次输出。请尝试调整提问方式后重试。'}
            </p>
          </div>
        </div>
      ) : (
        <AssistantBlocks blocks={message.blocks as AssistantBlock[]} citations={citations} streaming={streaming} />
      )}

      {streaming && message.blocks.length === 0 ? (
        <div className="typing" aria-label="正在生成">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {streaming ? (
        <div className="streaming-pill" role="status" aria-live="polite">
          <span className="streaming-pulse" aria-hidden="true" />
          <span>正在实时生成…</span>
          <button
            type="button"
            className="streaming-stop-btn"
            onClick={() => stopStreaming()}
            aria-label="停止生成"
          >
            <StopIcon size={12} />
            停止
          </button>
        </div>
      ) : null}

      {message.error ? (
        <div className="notice notice-error">
          <div>
            <strong>生成失败</strong>
            <p>{message.error}</p>
          </div>
          {isLast ? (
            <button type="button" className="notice-btn" onClick={() => void regenerate()}>
              重试
            </button>
          ) : null}
        </div>
      ) : null}

      {message.aborted && !message.error ? (
        <div className="notice notice-muted">已手动停止生成</div>
      ) : null}

      {!streaming && message.blocks.length > 0 ? (
        <div className="msg-actions">
          <button
            type="button"
            className={copied ? 'is-copied' : ''}
            onClick={() => void copy()}
            aria-label={copied ? '已复制全文' : '复制全文'}
          >
            {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          {onQuote && text.trim() ? (
            <button
              type="button"
              onClick={() => onQuote(text)}
              aria-label="引用追问"
            >
              <QuoteIcon size={15} />
              <span>引用追问</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void speakMessage(message.id)}
            aria-label={speaking ? '停止朗读' : '朗读'}
          >
            {speaking ? <StopCircleIcon size={15} /> : <VolumeIcon size={15} />}
            <span>
              {speaking ? (tts.phase === 'loading' ? '合成中' : '停止') : '朗读'}
            </span>
          </button>
          {isLast ? (
            <button type="button" onClick={() => void regenerate()} aria-label="重新生成">
              <RefreshIcon size={15} />
              <span>重新生成</span>
            </button>
          ) : null}
          {canContinue ? (
            <button type="button" onClick={() => void continueGeneration()} aria-label="继续生成">
              <SparkIcon size={15} />
              <span>继续</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {citations.length > 0 && !streaming ? (
        <details className="sources">
          <summary>
            <BookIcon size={14} />
            参考来源 {citations.length}
          </summary>
          <ol>
            {citations.map((c, i) => (
              <li key={`${c.url}-${i}`}>
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.title ?? hostOf(c.url)}
                </a>
                <span>{hostOf(c.url)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {message.usage && !streaming ? (
        <div className="usage">
          输入 {formatTokens(message.usage.input_tokens)} · 输出{' '}
          {formatTokens(message.usage.output_tokens)}
          {message.usage.cache_read_input_tokens
            ? ` · 缓存 ${formatTokens(message.usage.cache_read_input_tokens)}`
            : ''}
          {message.usage.server_tool_use?.web_search_requests
            ? ` · 搜索 ${message.usage.server_tool_use.web_search_requests}`
            : ''}
          {message.usage.server_tool_use?.web_fetch_requests
            ? ` · 阅读 ${message.usage.server_tool_use.web_fetch_requests}`
            : ''}
        </div>
      ) : null}
    </div>
  );
}

const AssistantMessage = memo(
  AssistantMessageInner,
  (a, b) =>
    a.rev === b.rev &&
    a.message === b.message &&
    a.isLast === b.isLast &&
    a.streaming === b.streaming &&
    a.showHead === b.showHead &&
    a.onQuote === b.onQuote,
);

export default function MessageItem({
  message,
  isLast,
  streaming,
  rev,
  showHead = true,
  onQuote,
}: {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  rev: number;
  showHead?: boolean;
  onQuote?: (text: string) => void;
}) {
  if (message.role === 'user') {
    return <UserMessage message={message} isLast={isLast} onQuote={onQuote} />;
  }
  return (
    <AssistantMessage
      message={message}
      isLast={isLast}
      streaming={streaming}
      rev={streaming ? rev : 0}
      showHead={showHead}
      onQuote={onQuote}
    />
  );
}

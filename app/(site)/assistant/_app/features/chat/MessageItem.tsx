import { memo, useState } from 'react';
import type { AssistantBlock, ChatMessage } from '../../api/types';
import { assistantText, citationList, hostOf } from '../../lib/message';
import { AssistantBlocks } from './blocks';
import {
  continueGeneration,
  editUserMessage,
  regenerate,
  speakMessage,
  toast,
  useApp,
} from '../../state/store';
import {
  BookIcon,
  CheckIcon,
  CopyIcon,
  FileIcon,
  PencilIcon,
  RefreshIcon,
  ShieldIcon,
  SparkIcon,
  StopCircleIcon,
  VolumeIcon,
} from '../../ui/Icons';
import { formatBytes } from '../../lib/format';

function formatTokens(n?: number): string {
  if (!n) return '0';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function AttachmentStrip({ message }: { message: ChatMessage }) {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return null;
  return (
    <div className="bubble-atts">
      {attachments.map((att) =>
        att.kind === 'image' && att.dataUrl ? (
          <a
            key={att.id}
            className="att-thumb"
            href={att.dataUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={att.dataUrl} alt={att.filename} />
          </a>
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

function UserMessage({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text ?? '');

  const submit = async () => {
    const text = draft.trim();
    if (!text || text === message.text) {
      setEditing(false);
      return;
    }
    setEditing(false);
    await editUserMessage(message.id, text);
  };

  return (
    <div className="row row-user">
      <div className="bubble">
        <AttachmentStrip message={message} />
        {editing ? (
          <div className="bubble-edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
                aria-label="编辑"
              >
                <PencilIcon size={14} />
              </button>
            ) : null}
            <button
              type="button"
              aria-label="复制"
              onClick={() => {
                void navigator.clipboard.writeText(message.text ?? '');
                toast('已复制', 'success');
              }}
            >
              <CopyIcon size={14} />
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
}

function AssistantMessageInner({ message, isLast, streaming, showHead = true }: AssistantMessageProps) {
  const { tts, settings } = useApp();
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
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
    if (settings.haptics) navigator.vibrate?.(8);
  };

  // 「已联网」只代表服务端联网工具；客户端工具（记忆/任务）不算联网
  const hasServerTool = (message.blocks as AssistantBlock[]).some(
    (b) =>
      b.type === 'server_tool_use' ||
      b.type === 'web_search_tool_result' ||
      b.type === 'web_fetch_tool_result',
  );

  return (
    <div className={`row row-ai ${message.refused ? 'is-refused' : ''}`}>
      <div className={`ai-head ${showHead ? '' : 'is-continuation'}`}>
        {showHead ? (
          <>
            <span className="avatar">
              <SparkIcon size={13} />
            </span>
            <span className="ai-name">助理</span>
            {message.model ? <span className="ai-model">{message.model}</span> : null}
            {hasServerTool ? <span className="ai-chip">已联网</span> : null}
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
            <p>服务端已清空本次输出。可以换个问法，或调整「设置 → 内容安全」后重试。</p>
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
        <div className="notice notice-muted">已停止生成</div>
      ) : null}

      {!streaming && message.blocks.length > 0 ? (
        <div className="msg-actions">
          <button type="button" onClick={() => void copy()} aria-label="复制">
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          <button
            type="button"
            onClick={() => void speakMessage(message.id)}
            aria-label={speaking ? '停止朗读' : '朗读'}
          >
            {speaking ? <StopCircleIcon size={16} /> : <VolumeIcon size={16} />}
            <span>
              {speaking ? (tts.phase === 'loading' ? '合成中' : '停止') : '朗读'}
            </span>
          </button>
          {isLast ? (
            <button type="button" onClick={() => void regenerate()} aria-label="重新生成">
              <RefreshIcon size={16} />
              <span>重试</span>
            </button>
          ) : null}
          {canContinue ? (
            <button type="button" onClick={() => void continueGeneration()} aria-label="继续生成">
              <SparkIcon size={16} />
              <span>继续</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {citations.length > 0 && !streaming ? (
        <details className="sources">
          <summary>
            <BookIcon size={14} />
            来源 {citations.length}
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
    a.showHead === b.showHead,
);

export default function MessageItem({
  message,
  isLast,
  streaming,
  rev,
  showHead = true,
}: {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  rev: number;
  showHead?: boolean;
}) {
  if (message.role === 'user') return <UserMessage message={message} isLast={isLast} />;
  return (
    <AssistantMessage
      message={message}
      isLast={isLast}
      streaming={streaming}
      rev={streaming ? rev : 0}
      showHead={showHead}
    />
  );
}

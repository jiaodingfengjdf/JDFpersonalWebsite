import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addMemory,
  addNote,
  deleteMemory,
  deleteNote,
  openSettings,
  renameConversation,
  setAgentOpen,
  setDrawer,
  startNewConversation,
  useApp,
} from '../../state/store';
import MessageItem from './MessageItem';
import Composer, { type ComposerDraftRequest } from './Composer';
import EmptyState from './EmptyState';
import AgentPanel from '../agent/AgentPanel';
import {
  ChevronDownIcon,
  LockIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
} from '../../ui/Icons';

export default function ChatScreen() {
  const {
    conversation,
    streaming,
    streamingMessageId,
    streamRev,
    settings,
    index,
    agentOpen,
    memories,
    notes,
    isAdmin,
    adminUsername,
    publicConfig,
    apiKeyConfigured,
  } = useApp();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);
  const draftSeqRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [draftRequest, setDraftRequest] = useState<ComposerDraftRequest | null>(null);

  const allMessages = conversation?.messages ?? [];
  // tool_result 这类隐藏消息只用于回传，不在界面里出现
  const messages = allMessages.filter((m) => !m.hidden);
  const isEmpty = messages.length === 0;

  const scrollToTop = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 空对话始终回到顶部完整展示欢迎区；有消息时仅在用户在底部附近才自动跟随
  useLayoutEffect(() => {
    if (isEmpty) {
      scrollToTop();
      return;
    }
    if (stickyRef.current) scrollToBottom();
  }, [isEmpty, messages.length, streamRev, conversation?.id, scrollToBottom, scrollToTop]);

  useEffect(() => {
    // 切换会话：空会话回顶展示 EmptyState，有消息的会话跳到底部
    stickyRef.current = true;
    const frame = requestAnimationFrame(() => {
      setAtBottom(true);
      if (isEmpty) scrollToTop();
      else scrollToBottom();
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation?.id, isEmpty, scrollToBottom, scrollToTop]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickyRef.current = distance < 96;
    setAtBottom(distance < 96);
  };

  const commitTitle = () => {
    if (!editingTitle) return;
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next && next !== conversation?.title) renameConversation(next);
  };

  const handleFillPrompt = useCallback((prompt: string) => {
    draftSeqRef.current += 1;
    setDraftRequest({ id: draftSeqRef.current, text: prompt, mode: 'replace' });
  }, []);

  const handleQuote = useCallback((rawText: string) => {
    const cleaned = rawText.replace(/\s+/g, ' ').trim();
    if (!cleaned) return;
    const snippet = cleaned.length > 160 ? `${cleaned.slice(0, 160)}…` : cleaned;
    draftSeqRef.current += 1;
    setDraftRequest({
      id: draftSeqRef.current,
      text: `> ${snippet}\n\n请基于以上内容进一步说明：`,
      mode: 'replace',
    });
  }, []);

  const title = conversation?.title ?? '新对话';
  const isMock = Boolean(settings.mockMode || publicConfig?.mockMode);
  const isConfigured = Boolean(
    settings.apiKey.trim() || apiKeyConfigured || publicConfig?.configured,
  );
  const activeModel = isAdmin ? settings.model : publicConfig?.model || settings.model;
  const thinkingOn = isAdmin ? settings.thinking : Boolean(publicConfig?.thinking ?? settings.thinking);
  const webSearchOn = isAdmin ? settings.webSearch : Boolean(publicConfig?.webSearch ?? settings.webSearch);
  const statusKind = isMock ? 'is-demo' : isConfigured ? 'is-ready' : 'is-unconfigured';
  const subtitle = isMock
    ? '演示模式'
    : `${activeModel}${thinkingOn ? ' · 深度思考' : ''}${webSearchOn ? ' · 联网' : ''}${
        !isConfigured ? ' · 待配置' : ''
      }`;

  return (
    <div className="chat-screen">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setDrawer(true)}
          aria-label="会话列表"
        >
          <MenuIcon size={22} />
          {index.length > 1 ? <span className="dot" /> : null}
        </button>

        <div className="topbar-mid">
          {editingTitle ? (
            <input
              className="title-input"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="title-btn"
              onClick={() => {
                setTitleDraft(title);
                setEditingTitle(true);
              }}
              title="点击重命名当前会话"
            >
              <span className="title-text">{title}</span>
              <span className="title-sub topbar-status">
                <span className={`status-dot ${statusKind}`} aria-hidden="true" />
                <span>{subtitle}</span>
              </span>
            </button>
          )}
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setAgentOpen(true)}
            aria-label="个人 Agent：记忆与笔记"
            title="个人 Agent：记忆与笔记"
          >
            <SparkIcon size={20} />
            {memories.length > 0 ? <span className="dot" /> : null}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void startNewConversation()}
            aria-label="新建对话"
            title="新建对话"
          >
            <PlusIcon size={22} />
          </button>
          {isAdmin ? (
            <>
              <span className="topbar-admin-badge" title={`站长已登录：${adminUsername || 'admin'}`}>
                <ShieldIcon size={13} />
                <span>{adminUsername || '站长'}</span>
              </span>
              <button
                type="button"
                className="icon-btn topbar-settings-btn"
                onClick={() => openSettings()}
                aria-label="打开设置"
                title="站长设置"
              >
                <SettingsIcon size={20} />
              </button>
            </>
          ) : (
            <a
              href="/admin/login?next=/assistant"
              className="topbar-admin-link"
              aria-label="站长登录"
              title="设置仅站长可编辑，点击登录"
            >
              <LockIcon size={14} />
              <span>站长登录</span>
            </a>
          )}
        </div>
      </header>

      <main className="messages" ref={scrollerRef} onScroll={onScroll}>
        <div className="thread">
          {messages.length === 0 ? (
            <EmptyState onFillPrompt={handleFillPrompt} />
          ) : (
            messages.map((message, i) => (
              <MessageItem
                key={message.id}
                message={message}
                isLast={i === messages.length - 1}
                streaming={streaming && message.id === streamingMessageId}
                rev={streamRev}
                showHead={!(i > 0 && messages[i - 1].role === 'assistant')}
                onQuote={handleQuote}
              />
            ))
          )}
        </div>
      </main>

      {!atBottom && messages.length > 0 ? (
        <button
          type="button"
          className={`scroll-bottom${streaming ? ' is-streaming' : ''}`}
          onClick={() => scrollToBottom(true)}
          aria-label="回到底部"
        >
          {streaming ? <span className="streaming-pulse" aria-hidden="true" /> : null}
          <ChevronDownIcon size={16} />
          <span>{streaming ? '查看最新回复' : '回到底部'}</span>
        </button>
      ) : null}

      <Composer draftRequest={draftRequest} />

      <AgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        memories={memories}
        notes={notes}
        onAddMemory={(text, tags) => {
          addMemory(text, tags);
        }}
        onDeleteMemory={deleteMemory}
        onAddNote={(input) => {
          addNote(input);
        }}
        onDeleteNote={deleteNote}
      />
    </div>
  );
}

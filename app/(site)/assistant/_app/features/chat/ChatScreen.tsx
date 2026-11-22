import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addMemory,
  addNote,
  deleteMemory,
  deleteNote,
  renameConversation,
  setAgentOpen,
  setDrawer,
  setView,
  startNewConversation,
  useApp,
} from '../../state/store';
import MessageItem from './MessageItem';
import Composer from './Composer';
import EmptyState from './EmptyState';
import AgentPanel from '../agent/AgentPanel';
import { ChevronDownIcon, MenuIcon, PlusIcon, SettingsIcon, SparkIcon } from '../../ui/Icons';

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
  } = useApp();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const allMessages = conversation?.messages ?? [];
  // tool_result 这类隐藏消息只用于回传，不在界面里出现
  const messages = allMessages.filter((m) => !m.hidden);
  
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 新消息/流式增量：只有用户在底部附近时才自动跟随
  useLayoutEffect(() => {
    if (stickyRef.current) scrollToBottom();
  }, [messages.length, streamRev, conversation?.id, scrollToBottom]);

  useEffect(() => {
    // 切换会话时直接跳到底部
    stickyRef.current = true;
    setAtBottom(true);
    requestAnimationFrame(() => scrollToBottom());
  }, [conversation?.id, scrollToBottom]);

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

  const title = conversation?.title ?? '新对话';
  const subtitle = settings.mockMode
    ? '演示模式'
    : `${settings.model}${settings.thinking ? ' · 思考' : ''}${settings.webSearch ? ' · 联网' : ''}`;

  return (
    <div className="chat-screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => setDrawer(true)} aria-label="会话列表">
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
            >
              <span className="title-text">{title}</span>
              <span className="title-sub">{subtitle}</span>
            </button>
          )}
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setAgentOpen(true)}
            aria-label="个人 Agent：任务与记忆"
          >
            <SparkIcon size={20} />
          </button>
          <button type="button" className="icon-btn" onClick={() => void startNewConversation()} aria-label="新建对话">
            <PlusIcon size={22} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setView('settings')} aria-label="设置">
            <SettingsIcon size={21} />
          </button>
        </div>
      </header>

      <main className="messages" ref={scrollerRef} onScroll={onScroll}>
        <div className="thread">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((message, i) => (
              <MessageItem
                key={message.id}
                message={message}
                isLast={i === messages.length - 1}
                streaming={streaming && message.id === streamingMessageId}
                rev={streamRev}
                showHead={!(i > 0 && messages[i - 1].role === 'assistant')}
              />
            ))
          )}
        </div>
      </main>

      {!atBottom && messages.length > 0 ? (
        <button type="button" className="scroll-bottom" onClick={() => scrollToBottom(true)} aria-label="回到底部">
          <ChevronDownIcon size={18} />
        </button>
      ) : null}

      <Composer />

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

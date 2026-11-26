import { useEffect, useMemo, useState } from 'react';
import {
  openConversation,
  openSettings,
  removeConversation,
  renameConversation,
  setDrawer,
  startNewConversation,
  useApp,
  type ConversationIndexItem,
} from '../../state/store';
import { formatRelativeTime } from '../../lib/format';
import {
  CheckIcon,
  ChevronRightIcon,
  LockIcon,
  LogInIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  TrashIcon,
  XIcon,
} from '../../ui/Icons';

interface ConversationGroup {
  label: string;
  items: ConversationIndexItem[];
}

function groupByTime(items: ConversationIndexItem[]): ConversationGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 86_400_000 * 6;

  const buckets: Array<{ label: string; items: ConversationIndexItem[] }> = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '近 7 天', items: [] },
    { label: '更早', items: [] },
  ];

  for (const item of items) {
    if (item.updatedAt >= startOfToday) buckets[0].items.push(item);
    else if (item.updatedAt >= startOfYesterday) buckets[1].items.push(item);
    else if (item.updatedAt >= startOfWeek) buckets[2].items.push(item);
    else buckets[3].items.push(item);
  }

  return buckets.filter((group) => group.items.length > 0);
}

export default function Drawer() {
  const { drawerOpen, index, conversation, isAdmin, adminUsername, publicConfig } = useApp();
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (renamingId) {
          setRenamingId(null);
          return;
        }
        if (pendingDelete) {
          setPendingDelete(null);
          return;
        }
        setDrawer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, renamingId, pendingDelete]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index;
    return index.filter(
      (item) => item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q),
    );
  }, [index, query]);

  const groups = useMemo(() => groupByTime(items), [items]);
  const brandName = publicConfig?.displayName?.trim() || '私人助理';

  const startRename = async (item: ConversationIndexItem) => {
    setPendingDelete(null);
    if (conversation?.id !== item.id) {
      await openConversation(item.id);
      setDrawer(true);
    }
    setRenameDraft(item.title);
    setRenamingId(item.id);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const next = renameDraft.trim();
    setRenamingId(null);
    if (next) renameConversation(next);
  };

  return (
    <div className={`drawer-root ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
      <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
      <aside className="drawer" role="dialog" aria-label="会话列表">
        <div className="drawer-head">
          <span className="brand">
            <span className="brand-mark">
              <SparkIcon size={15} />
            </span>
            {brandName}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDrawer(false)}
            aria-label="关闭侧边栏"
          >
            <XIcon size={18} />
          </button>
        </div>

        <button
          type="button"
          className="new-chat"
          onClick={() => {
            setPendingDelete(null);
            setRenamingId(null);
            void startNewConversation();
          }}
        >
          <PlusIcon size={17} />
          新建对话
        </button>

        <div className="drawer-search">
          <SearchIcon size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话标题或内容…"
            aria-label="搜索会话"
          />
          {query ? (
            <button
              type="button"
              className="drawer-search-clear"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
            >
              <XIcon size={13} />
            </button>
          ) : null}
        </div>

        {query.trim() ? (
          <div className="drawer-search-meta">
            找到 {items.length} 条匹配会话
          </div>
        ) : null}

        <div className="conv-list">
          {items.length === 0 ? (
            <p className="conv-empty">
              {query.trim() ? '未找到匹配的会话，试试换个关键词。' : '还没有会话，发第一条消息吧。'}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="conv-group">
                <div className="conv-group-label">{group.label}</div>
                {group.items.map((item) => {
                  const active = conversation?.id === item.id;
                  const isRenaming = renamingId === item.id;
                  return (
                    <div key={item.id} className={`conv-item ${active ? 'active' : ''}`}>
                      {isRenaming ? (
                        <div className="conv-rename-row">
                          <input
                            className="conv-rename-input"
                            value={renameDraft}
                            autoFocus
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            aria-label="重命名会话"
                          />
                          <button
                            type="button"
                            className="conv-rename-ok"
                            onClick={commitRename}
                            aria-label="确认重命名"
                          >
                            <CheckIcon size={14} />
                          </button>
                          <button
                            type="button"
                            className="conv-rename-cancel"
                            onClick={() => setRenamingId(null)}
                            aria-label="取消重命名"
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="conv-main"
                            onClick={() => void openConversation(item.id)}
                          >
                            <span className="conv-title">{item.title}</span>
                            <span className="conv-preview">{item.preview || '空对话'}</span>
                            <span className="conv-meta-row">
                              <span className="conv-time">{formatRelativeTime(item.updatedAt, 'zh')}</span>
                              {item.messageCount > 0 ? (
                                <span className="conv-count">{item.messageCount} 条</span>
                              ) : null}
                            </span>
                          </button>
                          <div className="conv-actions">
                            <button
                              type="button"
                              className="conv-menu"
                              aria-label="重命名会话"
                              title="重命名"
                              onClick={() => void startRename(item)}
                            >
                              <PencilIcon size={14} />
                            </button>
                            <button
                              type="button"
                              className="conv-menu"
                              aria-label="删除会话"
                              title="删除会话"
                              onClick={() => setPendingDelete(item.id)}
                            >
                              <TrashIcon size={14} />
                            </button>
                          </div>
                        </>
                      )}
                      {pendingDelete === item.id ? (
                        <div className="conv-confirm">
                          <span>确认删除？</span>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              setPendingDelete(null);
                              void removeConversation(item.id);
                            }}
                          >
                            <TrashIcon size={13} /> 删除
                          </button>
                          <button type="button" onClick={() => setPendingDelete(null)}>
                            取消
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="drawer-foot">
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setDrawer(false);
                  openSettings();
                }}
              >
                <SettingsIcon size={17} />
                <span>系统设置</span>
                <span className="drawer-admin-tag">{adminUsername || '站长'}</span>
                <ChevronRightIcon size={15} className="foot-chev" />
              </button>
              <a
                href="https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot"
                target="_blank"
                rel="noopener noreferrer"
              >
                API 文档
                <ChevronRightIcon size={15} className="foot-chev" />
              </a>
            </>
          ) : (
            <div className="drawer-lock-note">
              <LockIcon size={15} />
              <span>系统设置仅站长可编辑</span>
              <a href="/admin/login?next=/assistant" className="drawer-login-link">
                <LogInIcon size={13} />
                登录
              </a>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

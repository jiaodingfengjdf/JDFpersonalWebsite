import { useMemo, useState } from 'react';
import {
  openConversation,
  removeConversation,
  setDrawer,
  setView,
  startNewConversation,
  useApp,
} from '../../state/store';
import { formatRelativeTime } from '../../lib/format';
import {
  ChevronRightIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  TrashIcon,
  XIcon,
} from '../../ui/Icons';

export default function Drawer() {
  const { drawerOpen, index, conversation } = useApp();
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index;
    return index.filter(
      (item) => item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q),
    );
  }, [index, query]);

  return (
    <div className={`drawer-root ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
      <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
      <aside className="drawer" role="dialog" aria-label="会话列表">
        <div className="drawer-head">
          <span className="brand">
            <span className="brand-mark">
              <SparkIcon size={15} />
            </span>
            私人助理
          </span>
          <button type="button" className="icon-btn" onClick={() => setDrawer(false)} aria-label="关闭">
            <XIcon size={18} />
          </button>
        </div>

        <button type="button" className="new-chat" onClick={() => void startNewConversation()}>
          <PlusIcon size={17} />
          新建对话
        </button>

        <div className="drawer-search">
          <SearchIcon size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话"
            aria-label="搜索会话"
          />
        </div>

        <div className="conv-list">
          {items.length === 0 ? (
            <p className="conv-empty">还没有会话，发第一条消息吧。</p>
          ) : (
            items.map((item) => {
              const active = conversation?.id === item.id;
              return (
                <div key={item.id} className={`conv-item ${active ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="conv-main"
                    onClick={() => void openConversation(item.id)}
                  >
                    <span className="conv-title">{item.title}</span>
                    <span className="conv-preview">{item.preview || '空对话'}</span>
                    <span className="conv-time">{formatRelativeTime(item.updatedAt, 'zh')}</span>
                  </button>
                  <button
                    type="button"
                    className="conv-menu"
                    aria-label="删除会话"
                    onClick={() => setPendingDelete(item.id)}
                  >
                    <MoreIcon size={16} />
                  </button>
                  {pendingDelete === item.id ? (
                    <div className="conv-confirm">
                      <span>删除这个会话？</span>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setPendingDelete(null);
                          void removeConversation(item.id);
                        }}
                      >
                        <TrashIcon size={14} /> 删除
                      </button>
                      <button type="button" onClick={() => setPendingDelete(null)}>
                        取消
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="drawer-foot">
          <button
            type="button"
            onClick={() => {
              setDrawer(false);
              setView('settings');
            }}
          >
            <SettingsIcon size={17} />
            设置
            <ChevronRightIcon size={15} className="foot-chev" />
          </button>
          <a href="https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot" target="_blank" rel="noopener noreferrer">
            API 文档
            <ChevronRightIcon size={15} className="foot-chev" />
          </a>
        </div>
      </aside>
    </div>
  );
}

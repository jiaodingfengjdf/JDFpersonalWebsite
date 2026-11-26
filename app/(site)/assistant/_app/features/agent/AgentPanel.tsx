import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentNote, Memory } from '../../agent/types';
import {
  BookIcon,
  BrainIcon,
  CheckIcon,
  CopyIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from '../../ui/Icons';
import { formatRelativeTime } from '../../lib/format';
import { toast, useApp } from '../../state/store';
import './agent.scoped.css';

export interface AgentPanelProps {
  open: boolean;
  onClose(): void;
  memories: Memory[];
  notes: AgentNote[];
  onAddMemory(text: string, tags?: string[]): void;
  onDeleteMemory(id: string): void;
  onAddNote(input: { title?: string; text: string }): void;
  onDeleteNote(id: string): void;
}

type TabKey = 'memories' | 'notes';

const MEMORY_TAG_PRESETS = ['偏好', '工作', '项目', '习惯'];

export default function AgentPanel(props: AgentPanelProps): React.ReactElement | null {
  const { open, onClose, onAddMemory, onDeleteMemory, onAddNote, onDeleteNote } = props;
  const store = useApp();
  const memories = store.memories.length > 0 ? store.memories : props.memories;
  const notes = store.notes.length > 0 ? store.notes : props.notes;
  const [tab, setTab] = useState<TabKey>('memories');
  const [search, setSearch] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filteredMemories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        (m.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [memories, search]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        (n.title ?? '').toLowerCase().includes(q) || n.text.toLowerCase().includes(q),
    );
  }, [notes, search]);

  const copyItem = (id: string, content: string) => {
    void navigator.clipboard?.writeText(content).then(
      () => {
        setCopiedId(id);
        setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1400);
      },
      () => {
        toast('复制失败', 'error');
      },
    );
  };

  if (!open) return null;

  return (
    <div className="agent-root" role="presentation">
      <div className="agent-backdrop" onClick={onClose} />
      <section className="agent-sheet" ref={panelRef} role="dialog" aria-label="个人 Agent">
        <header className="agent-head">
          <div className="agent-head-main">
            <span className="agent-title-mark">
              <BrainIcon size={16} />
            </span>
            <div className="agent-title">
              <span>个人 Agent</span>
              <span className="agent-sub">
                长期记忆 {memories.length} · 随手笔记 {notes.length}
              </span>
            </div>
          </div>
          <button type="button" className="agent-icon-btn" onClick={onClose} aria-label="关闭">
            <XIcon size={16} />
          </button>
        </header>

        <div className="agent-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'memories'}
            className={`agent-tab${tab === 'memories' ? ' is-on' : ''}`}
            onClick={() => setTab('memories')}
          >
            <BrainIcon size={14} />
            <span>记忆</span>
            <span className="agent-tab-count">{memories.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notes'}
            className={`agent-tab${tab === 'notes' ? ' is-on' : ''}`}
            onClick={() => setTab('notes')}
          >
            <BookIcon size={14} />
            <span>笔记</span>
            <span className="agent-tab-count">{notes.length}</span>
          </button>
        </div>

        <div className="agent-body">
          <div className="agent-search">
            <SearchIcon size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'memories' ? '筛选记忆或标签…' : '搜索笔记标题或正文…'}
              aria-label={tab === 'memories' ? '筛选记忆' : '搜索笔记'}
            />
            {search ? (
              <button
                type="button"
                className="agent-search-clear"
                onClick={() => setSearch('')}
                aria-label="清空搜索"
              >
                <XIcon size={13} />
              </button>
            ) : null}
          </div>

          {tab === 'memories' ? (
            <>
              <form
                noValidate
                className="agent-add-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = memoryDraft.trim();
                  if (!text) return;
                  onAddMemory(text, selectedTag ? [selectedTag] : []);
                  setMemoryDraft('');
                  setSelectedTag('');
                }}
              >
                <div className="agent-add">
                  <input
                    className="agent-input"
                    value={memoryDraft}
                    onChange={(event) => setMemoryDraft(event.target.value)}
                    placeholder="记一条关于我的事实，例如：回复先给结论"
                    aria-label="新增记忆"
                  />
                  <button type="submit" className="agent-btn" disabled={!memoryDraft.trim()}>
                    <PlusIcon size={15} /> 记住
                  </button>
                </div>
                <div className="agent-tag-picks" role="group" aria-label="快捷标签">
                  {MEMORY_TAG_PRESETS.map((tag) => {
                    const active = selectedTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`agent-tag-pick${active ? ' is-on' : ''}`}
                        aria-pressed={active}
                        onClick={() => setSelectedTag(active ? '' : tag)}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </form>

              {filteredMemories.length === 0 ? (
                <div className="agent-empty-box">
                  <BrainIcon size={22} />
                  <p className="agent-empty">
                    {search.trim()
                      ? '没有匹配的记忆条目'
                      : '还没有长期记忆。对话中说「记住：…」或直接上方添加。'}
                  </p>
                </div>
              ) : (
                <ul className="agent-list">
                  {filteredMemories.map((memory) => (
                    <li key={memory.id} className="agent-task">
                      <span className="agent-task-main">
                        <span className="agent-task-title">{memory.text}</span>
                        <span className="agent-task-meta">
                          {memory.tags && memory.tags.length > 0
                            ? memory.tags.map((tag) => (
                                <span key={tag} className="agent-repeat">
                                  #{tag}
                                </span>
                              ))
                            : null}
                          {memory.updatedAt ? (
                            <span className="agent-item-time">
                              {formatRelativeTime(memory.updatedAt, 'zh')}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <div className="agent-item-actions">
                        <button
                          type="button"
                          className="agent-copy"
                          aria-label="复制记忆"
                          onClick={() => copyItem(memory.id, memory.text)}
                        >
                          {copiedId === memory.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        </button>
                        <button
                          type="button"
                          className="agent-del"
                          aria-label="删除记忆"
                          onClick={() => onDeleteMemory(memory.id)}
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <form
                noValidate
                className="agent-add agent-add-note"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = noteText.trim();
                  if (!text) return;
                  onAddNote(noteTitle.trim() ? { title: noteTitle.trim(), text } : { text });
                  setNoteTitle('');
                  setNoteText('');
                }}
              >
                <input
                  className="agent-input"
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="笔记标题（可选）"
                  aria-label="笔记标题"
                />
                <textarea
                  className="agent-input agent-textarea resize-none"
                  rows={3}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="随手记下灵感、参考资料或待整理要点…"
                  aria-label="笔记正文"
                />
                <button type="submit" className="agent-btn" disabled={!noteText.trim()}>
                  <PlusIcon size={15} /> 保存笔记
                </button>
              </form>

              {filteredNotes.length === 0 ? (
                <div className="agent-empty-box">
                  <BookIcon size={22} />
                  <p className="agent-empty">
                    {search.trim() ? '没有匹配的笔记' : '还没有随手笔记，随时记录你的灵感片段。'}
                  </p>
                </div>
              ) : (
                <ul className="agent-list">
                  {filteredNotes.map((note) => (
                    <li key={note.id} className="agent-task">
                      <span className="agent-task-main">
                        <span className="agent-task-title">{note.title || '未命名笔记'}</span>
                        <span className="agent-task-note">{note.text}</span>
                        {note.updatedAt ? (
                          <span className="agent-item-time">
                            {formatRelativeTime(note.updatedAt, 'zh')}
                          </span>
                        ) : null}
                      </span>
                      <div className="agent-item-actions">
                        <button
                          type="button"
                          className="agent-copy"
                          aria-label="复制笔记"
                          onClick={() =>
                            copyItem(
                              note.id,
                              note.title ? `${note.title}\n${note.text}` : note.text,
                            )
                          }
                        >
                          {copiedId === note.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        </button>
                        <button
                          type="button"
                          className="agent-del"
                          aria-label="删除笔记"
                          onClick={() => onDeleteNote(note.id)}
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <p className="agent-hintline">
            <CheckIcon size={12} /> 记忆与笔记保存在当前浏览器，对话时自动作为个人上下文参考。
          </p>
        </div>
      </section>
    </div>
  );
}

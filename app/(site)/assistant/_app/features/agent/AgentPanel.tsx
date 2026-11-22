import { useEffect, useRef, useState } from 'react';
import type { AgentNote, Memory } from '../../agent/types';
import { BookIcon, BrainIcon, CheckIcon, PlusIcon, TrashIcon, XIcon } from '../../ui/Icons';
import { useApp } from '../../state/store';
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

export default function AgentPanel(props: AgentPanelProps): React.ReactElement | null {
  const { open, onClose } = props;
  const store = useApp();
  const memories = store.memories.length > 0 ? store.memories : props.memories;
  const notes = store.notes.length > 0 ? store.notes : props.notes;
  const props2 = props;
  const [tab, setTab] = useState<TabKey>('memories');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="agent-root" role="presentation">
      <div className="agent-backdrop" onClick={onClose} />
      <section
        className="agent-sheet"
        ref={panelRef}
        aria-label="个人 Agent"
      >
        <header className="agent-head">
          <div className="agent-head-main">
            <span className="agent-title-mark">
              <BrainIcon size={16} />
            </span>
            <div className="agent-title">
              <span>个人 Agent</span>
              <span className="agent-sub">
                记忆 {memories.length} · 笔记 {notes.length}
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
            <BrainIcon size={14} /> 记忆
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notes'}
            className={`agent-tab${tab === 'notes' ? ' is-on' : ''}`}
            onClick={() => setTab('notes')}
          >
            <BookIcon size={14} /> 笔记
          </button>
        </div>

        <div className="agent-body">
          {tab === 'memories' ? (
            <>
              <form
                className="agent-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = memoryDraft.trim();
                  if (!text) return;
                  props2.onAddMemory(text);
                  setMemoryDraft('');
                }}
              >
                <input
                  className="agent-input"
                  value={memoryDraft}
                  onChange={(event) => setMemoryDraft(event.target.value)}
                  placeholder="记一条关于我的事实，例如：我对海鲜过敏"
                  aria-label="新增记忆"
                />
                <button type="submit" className="agent-btn" disabled={!memoryDraft.trim()}>
                  <PlusIcon size={15} /> 记住
                </button>
              </form>

              {memories.length === 0 ? (
                <p className="agent-empty">还没有记忆。说「记住：…」就会出现在这里。</p>
              ) : (
                <ul className="agent-list">
                  {memories.map((memory) => (
                    <li key={memory.id} className="agent-task">
                      <span className="agent-task-main">
                        <span className="agent-task-title">{memory.text}</span>
                        {memory.tags && memory.tags.length > 0 ? (
                          <span className="agent-task-meta">
                            {memory.tags.map((tag) => (
                              <span key={tag} className="agent-repeat">
                                {tag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="agent-del"
                        aria-label="删除记忆"
                        onClick={() => props2.onDeleteMemory(memory.id)}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <form
                className="agent-add agent-add-note"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = noteText.trim();
                  if (!text) return;
                  props2.onAddNote(noteTitle.trim() ? { title: noteTitle, text } : { text });
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
                  className="agent-input agent-textarea"
                  rows={3}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="正文，可以多段"
                  aria-label="笔记正文"
                />
                <button type="submit" className="agent-btn" disabled={!noteText.trim()}>
                  <PlusIcon size={15} /> 保存
                </button>
              </form>

              {notes.length === 0 ? (
                <p className="agent-empty">还没有笔记。</p>
              ) : (
                <ul className="agent-list">
                  {notes.map((note) => (
                    <li key={note.id} className="agent-task">
                      <span className="agent-task-main">
                        <span className="agent-task-title">{note.title || '未命名笔记'}</span>
                        <span className="agent-task-note">{note.text}</span>
                      </span>
                      <button
                        type="button"
                        className="agent-del"
                        aria-label="删除笔记"
                        onClick={() => props2.onDeleteNote(note.id)}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <p className="agent-hintline">
            <CheckIcon size={12} /> 记忆与笔记只存本机，会随对话上下文自动带上。
          </p>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Attachment } from '../../api/types';
import { kindOfFile, pickPurpose, uploadFile } from '../../api/files';
import { transcribeSpeech } from '../../api/voice';
import { startRecording, type RecorderHandle } from '../../lib/audio';
import { compressImage } from '../../lib/image';
import { formatBytes } from '../../lib/format';
import { uid } from '../../lib/uid';
import { sendMessage, stopStreaming, toast, updateSettings, useApp } from '../../state/store';
import { openImageViewer } from '../../ui/imageViewer';
import {
  BrainIcon,
  ChevronDownIcon,
  FileIcon,
  GlobeIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  SlashIcon,
  StopIcon,
  XIcon,
} from '../../ui/Icons';

const MODEL_OPTIONS = ['deepseek-flash', 'deepseek-v4-pro'];

const EFFORT_LABEL: Record<string, string> = {
  '': '默认',
  low: '低',
  medium: '中',
  high: '高',
};

const EFFORT_CYCLE: Array<'' | 'low' | 'medium' | 'high'> = ['', 'low', 'medium', 'high'];

interface PromptTemplate {
  id: string;
  label: string;
  hint: string;
  body: string;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'polish',
    label: '写作润色',
    hint: '提升流畅度与表达质感',
    body: '请帮我润色以下内容，使其表达更精炼自然，保留原意并指出 2 处关键优化点：\n\n',
  },
  {
    id: 'debug',
    label: '代码排查',
    hint: '定位根因并给最小修复',
    body: '请分析下面这段代码/报错的原因，先说结论，再给出最小化的修改建议：\n\n```\n\n```',
  },
  {
    id: 'summary',
    label: '提炼要点',
    hint: '结构化总结与行动项',
    body: '请将以下资料提炼成 3–5 条核心要点，并在末尾给出可执行的下一步建议：\n\n',
  },
  {
    id: 'compare',
    label: '方案对比',
    hint: '优劣权衡与推荐结论',
    body: '请用表格对比以下两个方案在成本、性能与可维护性上的差异，并给出推荐选择：\n\n方案 A：\n方案 B：',
  },
  {
    id: 'translate',
    label: '双语精译',
    hint: '信达雅技术/文案翻译',
    body: '请将以下文本准确流畅地翻译（中英互译），专业术语保留原文括号注释：\n\n',
  },
  {
    id: 'brainstorm',
    label: '头脑风暴',
    hint: '发散 5 个差异化思路',
    body: '围绕以下主题，请给我 5 个有辨识度的创意方向，每个方向附一句核心卖点：\n\n主题：',
  },
];

export interface ComposerDraftRequest {
  id: number;
  text: string;
  mode: 'replace' | 'append';
}

interface UploadProgress {
  name: string;
  percent: number;
}

export default function Composer({
  draftRequest,
}: {
  draftRequest?: ComposerDraftRequest | null;
}) {
  const { settings, streaming, isAdmin, publicConfig, apiKeyConfigured } = useApp();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<UploadProgress | null>(null);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [recordingMs, setRecordingMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  const [promptMenu, setPromptMenu] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedRef = useRef(0);
  const lastDraftIdRef = useRef(0);

  // 响应外部快捷填充 / 引用追问请求
  useEffect(() => {
    if (!draftRequest || draftRequest.id === lastDraftIdRef.current) return;
    lastDraftIdRef.current = draftRequest.id;
    const frame = requestAnimationFrame(() => {
      setText((prev) =>
        draftRequest.mode === 'append' && prev.trim()
          ? `${prev}\n${draftRequest.text}`
          : draftRequest.text,
      );
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const len = draftRequest.text.length;
        el.setSelectionRange(len, len);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [draftRequest]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [text]);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    },
    [],
  );

  // Esc：优先关闭弹层；若正在流式生成则立即中断
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modelMenu || promptMenu) {
        setModelMenu(false);
        setPromptMenu(false);
        return;
      }
      if (streaming) {
        event.preventDefault();
        stopStreaming();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modelMenu, promptMenu, streaming]);

  const hasUsableKey =
    Boolean(settings.apiKey.trim()) || apiKeyConfigured || Boolean(publicConfig?.configured);
  const useProxy =
    !settings.apiKey.trim() && (apiKeyConfigured || Boolean(publicConfig?.configured));
  const activeModel = isAdmin ? settings.model : publicConfig?.model || settings.model;
  const thinkingOn = isAdmin ? settings.thinking : Boolean(publicConfig?.thinking ?? settings.thinking);
  const webSearchOn = isAdmin ? settings.webSearch : Boolean(publicConfig?.webSearch ?? settings.webSearch);
  const activeEffort = isAdmin ? settings.effort : (publicConfig?.effort ?? settings.effort);

  /* ---------------- 附件 ---------------- */

  const addFiles = async (files: File[]) => {
    const room = Math.max(0, 6 - attachments.length);
    if (room === 0) {
      toast('最多同时带 6 个附件', 'info');
      return;
    }
    for (const file of files.slice(0, room)) {
      const kind = kindOfFile(file);
      if (kind === 'image') {
        try {
          const { dataUrl, bytes } = await compressImage(file);
          setAttachments((prev) => [
            ...prev,
            {
              id: uid('att'),
              fileId: '',
              filename: file.name || 'image.jpg',
              purpose: 'user_data',
              kind: 'image',
              bytes,
              dataUrl,
            },
          ]);
        } catch (err) {
          toast(err instanceof Error ? err.message : '图片处理失败', 'error');
        }
        continue;
      }

      if (!hasUsableKey) {
        toast(
          isAdmin ? '上传文档需要先在设置里填写并保存 API Key' : '站长暂未配置 AI 助理密钥',
          'error',
        );
        continue;
      }
      const purpose = pickPurpose(file);
      setUploading({ name: file.name, percent: 0 });
      try {
        const uploaded = await uploadFile({
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          useProxy,
          file,
          purpose,
          onProgress: (percent) => setUploading({ name: file.name, percent }),
        });
        setAttachments((prev) => [
          ...prev,
          {
            id: uid('att'),
            fileId: uploaded.id,
            filename: uploaded.filename,
            purpose: uploaded.purpose,
            kind,
            bytes: uploaded.bytes,
          },
        ]);
      } catch (err) {
        toast(err instanceof Error ? err.message : '上传失败', 'error');
      } finally {
        setUploading(null);
      }
    }
  };

  const onPickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addFiles(files);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (imageFiles.length > 0) {
      event.preventDefault();
      void addFiles(imageFiles);
    }
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) void addFiles(files);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  /* ---------------- 语音输入 ---------------- */

  const stopRecording = async () => {
    const handle = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    setLevel(0);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (!handle) return;
    try {
      const { wav } = await handle.stop();
      setTranscribing(true);
      const result = await transcribeSpeech({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        useProxy,
        audio: wav,
        filename: 'speech.wav',
      });
      const transcript = result.text.trim();
      if (!transcript) {
        toast('没有识别到语音内容', 'info');
        return;
      }
      setText((prev) => (prev ? `${prev}${transcript}` : transcript));
      textareaRef.current?.focus();
    } catch (err) {
      const message = err instanceof Error ? err.message : '语音识别失败';
      if (!/abort/i.test(message)) toast(message, 'error');
    } finally {
      setTranscribing(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      await stopRecording();
      return;
    }
    if (transcribing) return;
    if (!hasUsableKey) {
      toast(
        isAdmin ? '语音输入需要先在设置里填写并保存 API Key' : '站长暂未配置 AI 助理密钥',
        'error',
      );
      return;
    }
    try {
      const handle = await startRecording({
        onLevel: setLevel,
        maxDurationMs: 120_000,
      });
      recorderRef.current = handle;
      setRecording(true);
      recordStartedRef.current = Date.now();
      setRecordingMs(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingMs(Date.now() - recordStartedRef.current);
      }, 200);
    } catch (err) {
      toast(err instanceof Error ? err.message : '无法启动录音', 'error');
    }
  };

  /* ---------------- 模板插入 ---------------- */

  const insertTemplate = (template: PromptTemplate) => {
    setPromptMenu(false);
    setText((prev) => (prev.trim() ? `${prev}\n\n${template.body}` : template.body));
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  /* ---------------- 发送 ---------------- */

  const submit = () => {
    if (streaming) {
      stopStreaming();
      return;
    }
    if (uploading) {
      toast('文件还在上传中，稍等一下', 'info');
      return;
    }
    const payload = text.trim();
    if (!payload && attachments.length === 0) return;
    // 先在本地保留输入：如果没填 Key / 还在上传，sendMessage 会返回 false，不能把用户写的内容清掉
    void sendMessage(payload, attachments).then((started) => {
      if (started) {
        setText('');
        setAttachments([]);
      }
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const charCount = text.length;

  return (
    <div
      className={`composer${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {recording ? (
        <div className="recorder">
          <div className="rec-dot" />
          <span className="rec-time">
            {Math.floor(recordingMs / 1000)}.{Math.floor((recordingMs % 1000) / 100)}s
          </span>
          <div className="rec-wave" aria-hidden>
            {[0.5, 0.85, 1.15, 0.7, 1, 0.6].map((factor, i) => (
              <span
                key={i}
                style={{ transform: `scaleY(${Math.max(0.15, Math.min(1, level * factor * 3))})` }}
              />
            ))}
          </div>
          <span className="rec-hint">点击完成结束录音</span>
          <button type="button" className="rec-stop" onClick={() => void stopRecording()}>
            完成
          </button>
        </div>
      ) : null}

      {attachments.length > 0 || uploading ? (
        <div className="composer-atts">
          {attachments.map((att) => (
            <div key={att.id} className="composer-att">
              {att.kind === 'image' && att.dataUrl ? (
                <button
                  type="button"
                  className="composer-att-preview"
                  onClick={() => openImageViewer(att.dataUrl!)}
                  aria-label={`预览图片：${att.filename}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 本地压缩后的 base64 图片预览 */}
                  <img src={att.dataUrl} alt={att.filename} />
                </button>
              ) : (
                <span className="composer-att-file">
                  <FileIcon size={16} />
                  <span className="composer-att-name">{att.filename}</span>
                  <span className="composer-att-size">{formatBytes(att.bytes)}</span>
                </span>
              )}
              <button
                type="button"
                className="composer-att-x"
                onClick={() => removeAttachment(att.id)}
                aria-label="移除附件"
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
          {uploading ? (
            <div className="composer-att uploading">
              <span className="composer-att-name">{uploading.name}</span>
              <span className="progress">
                <span style={{ width: `${uploading.percent}%` }} />
              </span>
              <span className="composer-att-size">{uploading.percent}%</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="composer-row">
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept="image/*,application/pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.json,.xlsx,.xls,.epub"
          onChange={onPickFiles}
        />

        <div className={`input-wrap${focused ? ' is-focused' : ''}`}>
          <textarea
            className="resize-none"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              transcribing
                ? '正在识别语音…'
                : dragging
                  ? '松开即可添加附件…'
                  : '发消息给助理，支持粘贴图片或点击下方快捷模板…'
            }
            rows={1}
            disabled={recording}
            enterKeyHint="send"
          />
          <div className="input-tools">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className={'tool-toggle composer-model-chip' + (modelMenu ? ' on' : '')}
                  onClick={() => {
                    setPromptMenu(false);
                    setModelMenu((open) => !open);
                  }}
                  aria-expanded={modelMenu}
                  aria-label="切换模型"
                >
                  <span className="model-short">{activeModel.replace('deepseek-', '') || 'flash'}</span>
                  <ChevronDownIcon size={12} />
                </button>
                <button
                  type="button"
                  className={`tool-toggle ${webSearchOn ? 'on' : ''}`}
                  onClick={() => updateSettings({ webSearch: !settings.webSearch })}
                  aria-pressed={webSearchOn}
                >
                  <GlobeIcon size={14} />
                  联网
                </button>
                <button
                  type="button"
                  className={`tool-toggle ${thinkingOn ? 'on' : ''}`}
                  onClick={() => updateSettings({ thinking: !settings.thinking })}
                  aria-pressed={thinkingOn}
                >
                  <BrainIcon size={14} />
                  思考
                </button>
                {thinkingOn ? (
                  <button
                    type="button"
                    className={'tool-toggle composer-effort-chip' + (activeEffort ? ' on' : '')}
                    onClick={() => {
                      const idx = EFFORT_CYCLE.indexOf(settings.effort);
                      const next = EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length];
                      updateSettings({ effort: next });
                    }}
                    aria-label={'思考强度：' + (EFFORT_LABEL[activeEffort] ?? '默认')}
                  >
                    强度 {EFFORT_LABEL[activeEffort] ?? '默认'}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <span
                  className="tool-toggle is-readonly composer-model-chip"
                  title="模型参数由站长统一配置"
                >
                  <span className="model-short">{activeModel.replace('deepseek-', '') || 'flash'}</span>
                </span>
                {webSearchOn ? (
                  <span className="tool-toggle is-readonly on" title="站长已开启联网搜索">
                    <GlobeIcon size={14} />
                    联网
                  </span>
                ) : null}
                {thinkingOn ? (
                  <span className="tool-toggle is-readonly on" title="站长已开启深度思考">
                    <BrainIcon size={14} />
                    思考
                  </span>
                ) : null}
              </>
            )}

            <button
              type="button"
              className={`tool-toggle composer-templates-btn${promptMenu ? ' on' : ''}`}
              onClick={() => {
                setModelMenu(false);
                setPromptMenu((open) => !open);
              }}
              aria-expanded={promptMenu}
              aria-label="快捷指令模板"
            >
              <SlashIcon size={14} />
              模板
            </button>

            <button
              type="button"
              className={`tool-toggle ${recording ? 'on' : ''}`}
              onClick={() => void toggleRecord()}
              aria-label="语音输入"
              disabled={transcribing}
            >
              {transcribing ? <span className="spinner" /> : <MicIcon size={14} />}
              {transcribing ? '识别中' : recording ? '录制中' : '语音'}
            </button>

            <button
              type="button"
              className="tool-toggle tool-attach"
              onClick={() => fileRef.current?.click()}
              aria-label="添加附件"
              disabled={transcribing}
            >
              <PaperclipIcon size={14} />
              附件{attachments.length > 0 ? ` ${attachments.length}` : ''}
            </button>
          </div>

          {modelMenu || promptMenu ? (
            <div
              className="model-backdrop"
              onClick={() => {
                setModelMenu(false);
                setPromptMenu(false);
              }}
              aria-hidden
            />
          ) : null}

          {isAdmin && modelMenu ? (
            <div className="model-menu" role="menu" aria-label="模型列表">
              {MODEL_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={settings.model === option}
                  className={settings.model === option ? 'is-on' : ''}
                  onClick={() => {
                    updateSettings({ model: option });
                    setModelMenu(false);
                  }}
                >
                  {option}
                  {settings.model === option ? ' ✓' : ''}
                </button>
              ))}
            </div>
          ) : null}

          {promptMenu ? (
            <div className="prompt-menu" role="menu" aria-label="快捷提示词模板">
              {PROMPT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  role="menuitem"
                  className="prompt-menu-item"
                  onClick={() => insertTemplate(tpl)}
                >
                  <span className="prompt-menu-title">{tpl.label}</span>
                  <span className="prompt-menu-hint">{tpl.hint}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`send-btn ${streaming ? 'is-stop' : ''}`}
          onClick={submit}
          aria-label={streaming ? '停止生成' : '发送'}
          disabled={!streaming && !text.trim() && attachments.length === 0 && !uploading}
        >
          {streaming ? <StopIcon size={18} /> : <SendIcon size={20} />}
        </button>
      </div>

      <div className="composer-meta-bar">
        <span className="composer-hints">
          <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行 · <kbd>Esc</kbd> 停止生成
        </span>
        <span className="composer-meta-right">
          {charCount > 0 ? (
            <button
              type="button"
              className="composer-clear-btn"
              onClick={() => {
                setText('');
                textareaRef.current?.focus();
              }}
            >
              清空
            </button>
          ) : null}
          <span className={`composer-char-count${charCount > 2000 ? ' is-long' : ''}`}>
            {charCount} 字
          </span>
        </span>
      </div>
    </div>
  );
}

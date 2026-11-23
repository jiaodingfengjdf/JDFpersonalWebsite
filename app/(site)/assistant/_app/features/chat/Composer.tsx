import { useEffect, useRef, useState } from 'react';
import type { Attachment } from '../../api/types';
import { kindOfFile, pickPurpose, uploadFile } from '../../api/files';
import { transcribeSpeech } from '../../api/voice';
import { startRecording, type RecorderHandle } from '../../lib/audio';
import { compressImage } from '../../lib/image';
import { formatBytes } from '../../lib/format';
import { uid } from '../../lib/uid';
import { sendMessage, stopStreaming, toast, updateSettings, useApp } from '../../state/store';
import {
  BrainIcon,
  FileIcon,
  GlobeIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  StopIcon,
  XIcon,
  ChevronDownIcon,
} from '../../ui/Icons';

const MODEL_OPTIONS = ['deepseek-flash', 'deepseek-v4-pro'];

const EFFORT_LABEL: Record<string, string> = {
  '': '默认',
  low: '低',
  medium: '中',
  high: '高',
};

const EFFORT_CYCLE: Array<'' | 'low' | 'medium' | 'high'> = ['', 'low', 'medium', 'high'];

interface UploadProgress {
  name: string;
  percent: number;
}

export default function Composer() {
  const { settings, streaming } = useApp();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<UploadProgress | null>(null);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [recordingMs, setRecordingMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedRef = useRef(0);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(148, el.scrollHeight)}px`;
  }, [text]);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!modelMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modelMenu]);

  const hasApiKey = Boolean(settings.apiKey.trim());

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

      if (!hasApiKey) {
        toast('上传文档需要先填写 API Key', 'error');
        continue;
      }
      const purpose = pickPurpose(file);
      setUploading({ name: file.name, percent: 0 });
      try {
        const uploaded = await uploadFile({
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
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
    if (!hasApiKey) {
      toast('语音输入需要先填写 API Key', 'error');
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

  return (
    <div className="composer">
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
          <span className="rec-hint">松手/点击结束</span>
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
                <img src={att.dataUrl} alt={att.filename} />
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

        <div className="input-wrap">
          <textarea className="resize-none"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={transcribing ? '正在识别语音…' : '发消息给助理…'}
            rows={1}
            disabled={recording}
            enterKeyHint="send"
          />
          <div className="input-tools">
            <button
              type="button"
              className={'tool-toggle composer-model-chip' + (modelMenu ? ' on' : '')}
              onClick={() => setModelMenu((open) => !open)}
              aria-expanded={modelMenu}
              aria-label="切换模型"
            >
              <span className="model-short">{settings.model.replace('deepseek-', '') || 'flash'}</span>
              <ChevronDownIcon size={12} />
            </button>
            <button
              type="button"
              className={`tool-toggle ${settings.webSearch ? 'on' : ''}`}
              onClick={() => updateSettings({ webSearch: !settings.webSearch })}
              aria-pressed={settings.webSearch}
            >
              <GlobeIcon size={14} />
              联网
            </button>
            <button
              type="button"
              className={`tool-toggle ${settings.thinking ? 'on' : ''}`}
              onClick={() => updateSettings({ thinking: !settings.thinking })}
              aria-pressed={settings.thinking}
            >
              <BrainIcon size={14} />
              思考
            </button>
            {settings.thinking ? (
              <button
                type="button"
                className={'tool-toggle composer-effort-chip' + (settings.effort ? ' on' : '')}
                onClick={() => {
                  const index = EFFORT_CYCLE.indexOf(settings.effort);
                  const next = EFFORT_CYCLE[(index + 1) % EFFORT_CYCLE.length];
                  updateSettings({ effort: next });
                }}
                aria-label={'思考强度：' + (EFFORT_LABEL[settings.effort] ?? '默认')}
              >
                强度 {EFFORT_LABEL[settings.effort] ?? '默认'}
              </button>
            ) : null}
            <button
              type="button"
              className={`tool-toggle ${recording ? 'on' : ''}`}
              onClick={() => void toggleRecord()}
              aria-label="语音输入"
              disabled={transcribing}
            >
              {transcribing ? (
                <span className="spinner" />
              ) : (
                <MicIcon size={14} />
              )}
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
                附件
              </button>
            </div>

          {modelMenu ? (
            <div className="model-backdrop" onClick={() => setModelMenu(false)} aria-hidden />
          ) : null}

          {modelMenu ? (
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
                  {option}{settings.model === option ? ' ✓' : ''}
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
    </div>
  );
}

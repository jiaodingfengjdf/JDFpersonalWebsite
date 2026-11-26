/**
 * 朗读（TTS）层：系统朗读兜底 + DeepSeek TTS 合成播放，同一条消息互斥。
 *
 * 迁移分片 b-1：从 store.ts 整块搬出来。只吃注入的 `{ getState, setState, toast }`，
 * 不 import store 的值，因此可以在 Node 里用假 window 单测（见 scripts/check-tts.ts）。
 *
 * 规则：
 * - 同一条消息再点一次 = 停止（按钮在「朗读 / 停止 / 合成中」之间切换）；
 * - 演示模式或没填 API Key → 退回系统朗读，保证交互完整；
 * - 合成期间用户可能点了别的：只有 tts.messageId 仍指向本条才播放。
 */
import { synthesizeSpeech, truncateForTts } from '../api/voice';
import { playAudio } from '../lib/audio';
import { assistantText } from '../lib/message';
import type { AppState } from './store';

export interface TtsDeps {
  getState: () => AppState;
  setState: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  toast: (text: string, kind?: 'info' | 'error' | 'success') => void;
}

export interface TtsApi {
  /** 朗读这条消息；正在朗读同一条时则停止。 */
  speakMessage: (messageId: string) => Promise<void>;
  /** 立刻停掉当前朗读（点同一条、切换会话、离开页面时调用）。 */
  stopSpeaking: () => void;
}

/** 空闲态（每次都要新对象，避免引用被复用后又被就地改写）。 */
function idle(): AppState['tts'] {
  return { messageId: null, phase: null };
}

export function createTts(deps: TtsDeps): TtsApi {
  /** 当前声音句柄：系统朗读是 cancel()，合成播放是 playAudio() 的 player。 */
  let handle: { stop: () => void } | null = null;

  const stopSpeaking = (): void => {
    handle?.stop();
    handle = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    deps.setState({ tts: idle() });
  };

  const speakMessage = async (messageId: string): Promise<void> => {
    const { conversation, settings, tts, apiKeyConfigured, publicConfig } = deps.getState();
    const message = conversation?.messages.find((m) => m.id === messageId);
    if (!message) return;
    // 再点一次同一条：停止，不再重新合成
    if (tts.messageId === messageId) {
      stopSpeaking();
      return;
    }
    stopSpeaking();

    const text = assistantText(message);
    if (!text) {
      deps.toast('这条消息没有可朗读的文本', 'info');
      return;
    }

    const hasKey =
      Boolean(settings.apiKey.trim()) || apiKeyConfigured || publicConfig.configured;
    const useProxy = !settings.apiKey.trim() && (apiKeyConfigured || publicConfig.configured);

    // 演示模式 / 没有 Key：退回系统朗读，保证交互完整
    if (settings.mockMode || !hasKey) {
      if (!('speechSynthesis' in window)) {
        deps.toast('当前浏览器不支持系统朗读', 'error');
        return;
      }
      const utter = new SpeechSynthesisUtterance(text.slice(0, 4000));
      utter.lang = 'zh-CN';
      utter.onend = () => deps.setState({ tts: idle() });
      utter.onerror = () => deps.setState({ tts: idle() });
      handle = { stop: () => window.speechSynthesis.cancel() };
      deps.setState({ tts: { messageId, phase: 'playing' } });
      window.speechSynthesis.speak(utter);
      return;
    }

    deps.setState({ tts: { messageId, phase: 'loading' } });
    try {
      const blob = await synthesizeSpeech({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        useProxy,
        text: truncateForTts(text),
        voiceId: settings.voiceId,
        format: 'wav',
      });
      // 合成期间用户可能点了别的：只有还指向本条才播放
      if (deps.getState().tts.messageId !== messageId) return;
      const player = playAudio(blob);
      handle = player;
      deps.setState({ tts: { messageId, phase: 'playing' } });
      void player.ended.then(() => {
        if (deps.getState().tts.messageId === messageId) {
          handle = null;
          deps.setState({ tts: idle() });
        }
      });
    } catch (err) {
      deps.setState({ tts: idle() });
      deps.toast(err instanceof Error ? err.message : '语音合成失败', 'error');
    }
  };

  return { speakMessage, stopSpeaking };
}

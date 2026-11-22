/**
 * Web Audio 录音 + WAV 编码工具。
 *
 * 只用浏览器原生 API（MediaRecorder / Web Audio / Blob），无第三方依赖。
 * 用途：录制语音 → 转成 16kHz 单声道 16-bit PCM WAV 交给 ASR；或本地回放任意音频 Blob。
 *
 * 限制：
 * - 需要安全上下文（https 或 localhost）才能拿到麦克风权限；file:// 下多数浏览器不给。
 * - 浏览器原生录音格式各不相同（Chrome/Firefox 多为 webm/opus，Safari 多为 mp4/aac），
 *   所以 `wav` 字段由 decodeAudioData + 线性重采样统一产出，原始 `blob` 只保证能本地回放。
 * - 线性插值重采样对语音足够，不做抗混叠滤波（48k→16k 理论上会有轻微混叠，ASR 可接受）。
 */

/** 目标采样率：ASR 只接受 WAV，统一转成 16kHz。 */
const TARGET_SAMPLE_RATE = 16000;
/** 默认录音上限：ASR 单次上限 120 秒。 */
const DEFAULT_MAX_DURATION_MS = 120_000;
/** RMS → 0..1 电平的感知增益（人声 RMS 通常 0.02~0.2）。 */
const LEVEL_GAIN = 3;

/** 一次录音的结果。 */
export interface RecordingResult {
  /** 浏览器原生录音（webm/opus、mp4/aac 等），仅用于本地回放，不要直接送 ASR。 */
  blob: Blob;
  /** 实际录音时长（毫秒）。 */
  durationMs: number;
  /** 16kHz / 16-bit / 单声道 WAV，ASR 直接可用。 */
  wav: Blob;
}

/** 录音句柄。`stop()` 幂等：重复调用返回同一个 Promise。 */
export interface RecorderHandle {
  /** 停止录音并返回原始录音 + 转换好的 16k WAV + 时长。 */
  stop(): Promise<RecordingResult>;
  /** 立即丢弃录音（不转码、不返回结果）。之后调用 `stop()` 得到空结果。 */
  cancel(): void;
  /** 最近一次音量（0..1），供波形/电平条使用。 */
  getLevel(): number;
}

/** 录音启动参数。 */
export interface StartRecordingOptions {
  /** 音量回调，0..1，按 requestAnimationFrame 节奏触发。 */
  onLevel?: (level: number) => void;
  /** 录音上限毫秒数，默认 120000（120 秒），到点自动停。 */
  maxDurationMs?: number;
  /** 到达上限自动停止后的回调（已经转好 WAV）。 */
  onAutoStop?: (result: RecordingResult) => void;
}

/* ------------------------------------------------------------------ */
/* 错误                                                                */
/* ------------------------------------------------------------------ */

/** 生成带中文可读信息和可选 code 的 Error。 */
function audioError(message: string, code?: string): Error & { code?: string } {
  const err = new Error(message) as Error & { code?: string };
  if (code) err.code = code;
  return err;
}

/* ------------------------------------------------------------------ */
/* WAV 编码 / 重采样                                                    */
/* ------------------------------------------------------------------ */

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * 单声道 16-bit PCM WAV 编码。
 * @param samples 归一化到 -1..1 的采样点，超出范围会被 clamp。
 * @param sampleRate 采样率（Hz）。
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt 块长度
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] ?? 0;
    const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * 线性插值重采样。采样率相同时返回副本。
 * 不改变声道数，不做抗混叠滤波。
 */
export function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  const source = samples;
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) {
    return new Float32Array(source);
  }
  if (fromRate === toRate) return new Float32Array(source);
  if (source.length === 0) return new Float32Array(0);

  const outputLength = Math.max(1, Math.round((source.length * toRate) / fromRate));
  const output = new Float32Array(outputLength);
  const ratio = fromRate / toRate;

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const frac = position - index;
    const a = source[index] ?? 0;
    const b = source[index + 1] ?? a;
    output[i] = a + (b - a) * frac;
  }

  return output;
}

/* ------------------------------------------------------------------ */
/* AudioContext 辅助                                                    */
/* ------------------------------------------------------------------ */

type AudioContextConstructor = new () => AudioContext;

function audioContextCtor(): AudioContextConstructor {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  const ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!ctor) {
    throw audioError('当前浏览器不支持 Web Audio API，无法处理音频', 'unsupported');
  }
  return ctor;
}

function decodeAudioData(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const fail = () => {
      reject(audioError('音频解码失败，文件可能已损坏或格式不受支持', 'decode_failed'));
    };
    try {
      // 老 Safari 只走回调，新实现返回 Promise；两种都接住，Promise 只会 settle 一次。
      const maybe = ctx.decodeAudioData(data, resolve, fail);
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(resolve, fail);
      }
    } catch {
      fail();
    }
  });
}

async function closeContext(ctx: AudioContext): Promise<void> {
  try {
    if (ctx.state !== 'closed') await ctx.close();
  } catch {
    /* 关闭失败不影响结果 */
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  const first = buffer.getChannelData(0);
  if (numberOfChannels <= 1) return new Float32Array(first);
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      mono[i] = (mono[i] ?? 0) + (data[i] ?? 0);
    }
  }
  for (let i = 0; i < length; i += 1) {
    mono[i] = (mono[i] ?? 0) / numberOfChannels;
  }
  return mono;
}

/**
 * 把任意浏览器录音格式（webm/opus、mp4/aac、ogg 等）转成 16kHz 16-bit 单声道 WAV。
 * 过程：decodeAudioData → 混单声道 → 线性重采样到 16000Hz → 编码 WAV，并关闭 AudioContext。
 */
export async function blobToWav16k(blob: Blob): Promise<{ blob: Blob; durationMs: number }> {
  if (!blob || blob.size === 0) {
    throw audioError('音频为空，无法转换', 'empty_audio');
  }

  const Ctor = audioContextCtor();
  const ctx = new Ctor();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await decodeAudioData(ctx, arrayBuffer);
    const mono = downmixToMono(decoded);
    const resampled = resampleLinear(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
    const durationMs =
      decoded.sampleRate > 0 ? Math.round((mono.length / decoded.sampleRate) * 1000) : 0;
    return { blob: encodeWav(resampled, TARGET_SAMPLE_RATE), durationMs };
  } finally {
    await closeContext(ctx);
  }
}

/* ------------------------------------------------------------------ */
/* 录音                                                                */
/* ------------------------------------------------------------------ */

function mapMediaError(err: unknown): Error {
  const name =
    err instanceof Error ? err.name : (err as { name?: string } | null)?.name;

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return audioError(
        '麦克风权限被拒绝，请在浏览器或系统设置中允许本应用访问麦克风后重试',
        'permission-denied',
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return audioError('未检测到可用的麦克风设备', 'no_device');
    case 'NotReadableError':
    case 'TrackStartError':
      return audioError('麦克风被其他应用占用或无法读取，请关闭占用程序后重试', 'device-busy');
    default:
      return audioError('无法启动录音，请检查麦克风权限后重试', 'unknown');
  }
}

function pickMimeType(Recorder: typeof MediaRecorder): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (typeof Recorder.isTypeSupported !== 'function') return undefined;
  for (const mime of candidates) {
    try {
      if (Recorder.isTypeSupported(mime)) return mime;
    } catch {
      /* 个别实现会抛错，继续试下一个 */
    }
  }
  return undefined;
}

function stopRecorder(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === 'inactive') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      recorder.removeEventListener('stop', done);
      resolve();
    };
    recorder.addEventListener('stop', done);
    try {
      recorder.stop();
    } catch {
      done();
    }
  });
}

/**
 * 开始录音。
 * 默认最多录 120 秒（ASR 上限），到点自动停止并回调 `onAutoStop`。
 * 所有失败都抛出带中文 message 的 Error，`code` 可能是
 * `unsupported` / `permission-denied` / `no_device` / `device-busy` / `empty_audio` / `decode_failed`。
 */
export async function startRecording(opts: StartRecordingOptions = {}): Promise<RecorderHandle> {
  const { onLevel, onAutoStop, maxDurationMs = DEFAULT_MAX_DURATION_MS } = opts;

  const mediaDevices =
    typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw audioError(
      '当前环境不支持录音（需要 HTTPS 或 localhost 并搭配现代浏览器）',
      'unsupported',
    );
  }

  const Recorder = (globalThis as unknown as { MediaRecorder?: typeof MediaRecorder })
    .MediaRecorder;
  if (!Recorder) {
    throw audioError('当前浏览器不支持 MediaRecorder 录音', 'unsupported');
  }

  let stream: MediaStream;
  try {
    stream = await mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
  } catch (err) {
    throw mapMediaError(err);
  }

  const mimeType = pickMimeType(Recorder);
  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream);
  } catch {
    try {
      recorder = new Recorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      throw audioError('无法初始化录音器，请检查浏览器录音支持', 'unsupported');
    }
  }

  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let level = 0;
  let cancelled = false;
  let stopPromise: Promise<RecordingResult> | null = null;
  let rafId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  recorder.addEventListener('dataavailable', (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });

  // 关键：分片录制（每 1 秒一块）。之前漏了 start()，MediaRecorder 从未真正开始，
  // 所以停止时 chunks 是空的，才会报「没有录到音频数据」。
  recorder.start(1000);

  /* 音量检测：source → analyser → 0 增益 → destination（保证图被拉动，且不会回放麦克风）。 */
  let audioCtx: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let muteGain: GainNode | null = null;

  const stopMeter = () => {
    if (rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {
        /* ignore */
      }
      sourceNode = null;
    }
    if (muteGain) {
      try {
        muteGain.disconnect();
      } catch {
        /* ignore */
      }
      muteGain = null;
    }
    if (audioCtx) {
      const ctx = audioCtx;
      audioCtx = null;
      void closeContext(ctx);
    }
  };

  try {
    const Ctor = audioContextCtor();
    const ctx = new Ctor();
    audioCtx = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    sourceNode = ctx.createMediaStreamSource(stream);
    muteGain = ctx.createGain();
    muteGain.gain.value = 0;
    sourceNode.connect(analyser);
    analyser.connect(muteGain);
    muteGain.connect(ctx.destination);

    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      try {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const v = buffer[i] ?? 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        level = Math.min(1, rms * LEVEL_GAIN);
        onLevel?.(level);
      } catch {
        /* 单帧读取失败不打断录音 */
      }
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(tick);
    }
  } catch {
    // 电平表不可用不影响录音本身
    stopMeter();
  }

  const stopTracks = () => {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    });
  };

  const clearTimer = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const cleanup = () => {
    clearTimer();
    stopMeter();
    stopTracks();
  };

  const doStop = (): Promise<RecordingResult> => {
    if (stopPromise) return stopPromise;
    stopPromise = (async (): Promise<RecordingResult> => {
      if (cancelled) {
        return { blob: new Blob(), durationMs: 0, wav: new Blob() };
      }
      const elapsed = Math.max(0, Date.now() - startedAt);
      clearTimer();
      stopMeter();
      await stopRecorder(recorder);
      stopTracks();

      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size === 0) {
        throw audioError('没有录到音频数据，请检查麦克风是否被静音后重试', 'empty_audio');
      }
      const converted = await blobToWav16k(blob);
      return {
        blob,
        durationMs: converted.durationMs > 0 ? converted.durationMs : elapsed,
        wav: converted.blob,
      };
    })();
    return stopPromise;
  };

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    chunks.length = 0;
    cleanup();
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
  };

  if (maxDurationMs > 0 && Number.isFinite(maxDurationMs)) {
    timerId = setTimeout(() => {
      void doStop()
        .then((result) => {
          onAutoStop?.(result);
        })
        .catch(() => {
          /* 自动停止失败由后续 stop() 调用方感知 */
        });
    }, maxDurationMs);
  }

  return {
    stop: doStop,
    cancel,
    getLevel: () => level,
  };
}

/* ------------------------------------------------------------------ */
/* 回放                                                                */
/* ------------------------------------------------------------------ */

/**
 * 用 <audio> + objectURL 回放音频。
 * `stop()` 暂停并释放 objectURL；`ended` 在播放结束或出错时 resolve（不会 reject）。
 */
export function playAudio(blob: Blob): { stop: () => void; ended: Promise<void> } {
  const url = URL.createObjectURL(blob);
  const element = new Audio();
  let settled = false;
  let resolveEnded: () => void = () => {};

  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  const release = () => {
    try {
      element.pause();
      element.removeAttribute('src');
      element.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  };

  const settle = () => {
    if (settled) return;
    settled = true;
    resolveEnded();
  };

  element.addEventListener('ended', () => {
    settle();
    release();
  });
  element.addEventListener('error', () => {
    settle();
    release();
  });

  element.src = url;
  void element.play().catch(() => {
    settle();
    release();
  });

  return {
    stop: () => {
      settle();
      release();
    },
    ended,
  };
}

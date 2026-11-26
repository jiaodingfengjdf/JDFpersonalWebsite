"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import { useDeferredActivation } from "@/lib/useDeferredActivation";

const STORAGE_KEY = "music-player-state-v1";

interface PersistedMusicState {
  songId?: string;
  currentIndex?: number;
  currentTime?: number;
  volume?: number;
  isMuted?: boolean;
  playMode?: PlayMode;
}

function readPersistedState(): PersistedMusicState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as PersistedMusicState;
  } catch {
    return null;
  }
}

function writePersistedState(state: PersistedMusicState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或配额已满时忽略，不影响当次播放
  }
}

function parseLrc(lrcText: string) {
  if (!lrcText || lrcText.length > 30000) return [];
  const lines = lrcText.split(/\r?\n/);
  const result: { time: number; text: string }[] = [];
  for (const line of lines) {
    const matches = [...line.matchAll(/\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g)];
    if (matches.length > 0) {
      const text = line
        .replace(/\[\d{2,}:\d{2}(?:\.\d{2,3})?\]/g, "")
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/g, "")
        .trim();
      if (text) {
        for (const match of matches) {
          const min = parseInt(match[1], 10);
          const sec = parseInt(match[2], 10);
          const ms = match[3] ? parseInt(match[3], 10) : 0;
          const divisor = match[3] && match[3].length === 3 ? 1000 : 100;
          result.push({ time: min * 60 + sec + ms / divisor, text });
        }
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

type PlayMode = "loop" | "single" | "random";

interface Song {
  id: string;
  title: string;
  artist: string;
  cover: string;
  src: string;
  lrcUrl: string;
  lyrics: { time: number; text: string }[];
}

interface MusicContextType {
  playlist: Song[];
  currentIndex: number;
  currentSong: Song | undefined;
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  currentLyric: string;
  allLyrics: { time: number; text: string }[];
  isLoading: boolean;
  /** 拉取歌单失败或歌单不可播时给出的提示；正常情况下为 null。 */
  error: string | null;
  volume: number;
  isMuted: boolean;
  playMode: PlayMode;
  saying: string;
  refreshSaying: () => void;
  retry: () => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  handleSeek: (value: number) => void;
  seekBy: (deltaSeconds: number) => void;
  playSong: (index: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  togglePlayMode: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const { music } = useSiteSettings();
  const active = useDeferredActivation();
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<{ time: number; text: string }[]>([]);
  const [currentLyric, setCurrentLyric] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>("loop");
  const [saying, setSaying] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playModeRef = useRef(playMode);
  const nextSongRef = useRef<() => void>(() => {});
  const prevSongRef = useRef<() => void>(() => {});
  const hasRestoredSettingsRef = useRef(false);
  const hasRestoredTrackRef = useRef(false);
  const pendingRestoreTimeRef = useRef<number | null>(null);
  const lastSavedAtRef = useRef<number>(0);

  // 客户端挂载后立即恢复音量、静音和播放模式
  useEffect(() => {
    if (hasRestoredSettingsRef.current) return;
    hasRestoredSettingsRef.current = true;
    const saved = readPersistedState();
    if (!saved) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 从 localStorage 恢复上次播放偏好 */
    if (typeof saved.volume === "number" && saved.volume >= 0 && saved.volume <= 1) {
      setVolumeState(saved.volume);
    }
    if (typeof saved.isMuted === "boolean") {
      setIsMuted(saved.isMuted);
    }
    if (
      saved.playMode === "loop" ||
      saved.playMode === "single" ||
      saved.playMode === "random"
    ) {
      setPlayMode(saved.playMode);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persistSnapshot = useCallback(
    (overrideTime?: number) => {
      if (playlist.length === 0) return;
      const song = playlist[currentIndex];
      writePersistedState({
        songId: song?.id,
        currentIndex,
        currentTime:
          typeof overrideTime === "number"
            ? overrideTime
            : audioRef.current?.currentTime ?? currentTime,
        volume,
        isMuted,
        playMode,
      });
    },
    [playlist, currentIndex, currentTime, volume, isMuted, playMode],
  );

  // 当播放偏好或当前曲目变更时立即持久化
  useEffect(() => {
    if (!hasRestoredTrackRef.current || playlist.length === 0) return;
    persistSnapshot();
  }, [currentIndex, volume, isMuted, playMode, playlist.length, persistSnapshot]);

  // 页面卸载前保存最新播放时间点
  useEffect(() => {
    const onBeforeUnload = () => {
      if (hasRestoredTrackRef.current && playlist.length > 0) {
        persistSnapshot(audioRef.current?.currentTime);
      }
    };
    window.addEventListener("pagehide", onBeforeUnload);
    return () => window.removeEventListener("pagehide", onBeforeUnload);
  }, [playlist.length, persistSnapshot]);

  const retry = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setReloadToken((n) => n + 1);
  }, []);

  // Fetch saying once on mount
  const refreshSaying = useCallback(() => {
    fetch("https://uapis.cn/api/v1/saying")
      .then((r) => r.json())
      .then((d) => {
        if (d?.text) setSaying(d.text);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return;
    refreshSaying();
  }, [active, refreshSaying]);

  // Fetch playlist from local API (uses @meting/core on server)
  useEffect(() => {
    if (!active) return;

    let mounted = true;
    const fetchMusicData = async () => {
      try {
        const playlistId = music.playlistId;
        const musicIds = music.trackIds;

        let apiUrl = "";
        if (playlistId) {
          apiUrl = `/api/music?id=${playlistId}`;
        } else if (musicIds.length > 0) {
          apiUrl = `/api/music?ids=${musicIds.join(",")}`;
        }

        if (!apiUrl) {
          if (mounted) {
            setError(null);
            setIsLoading(false);
          }
          return;
        }

        const res = await fetch(apiUrl);
        const data = (await res.json()) as unknown;

        if (!res.ok) {
          const failure = data as { error?: { message?: string } } | null;
          if (mounted) {
            setError(failure?.error?.message ?? "音乐接口请求失败，请稍后重试");
            setIsLoading(false);
          }
          return;
        }

        const payload = data as { songs?: unknown; message?: unknown } | null;
        const rawSongs = Array.isArray(data)
          ? data
          : Array.isArray(payload?.songs)
            ? payload.songs
            : [];
        const hostMessage =
          !Array.isArray(data) && typeof payload?.message === "string"
            ? payload.message
            : "";

        const songs = rawSongs
          .map((r: Record<string, string>) => ({
            id: String(r.id || Math.random()),
            title: String(r.title || r.name || "未知歌曲"),
            artist: String(r.artist || r.author || "未知歌手"),
            cover: String(r.cover || r.pic || ""),
            src: String(r.src || r.url || ""),
            lrcUrl: String(r.lrcUrl || r.lrc || ""),
            lyrics: [] as { time: number; text: string }[],
          }))
          .filter((s) => s.src);

        if (mounted) {
          if (songs.length > 0) {
            setPlaylist(songs);
            if (!hasRestoredTrackRef.current) {
              hasRestoredTrackRef.current = true;
              const saved = readPersistedState();
              if (saved) {
                let targetIdx = 0;
                if (saved.songId) {
                  const found = songs.findIndex((s) => s.id === saved.songId);
                  if (found >= 0) targetIdx = found;
                  else if (
                    typeof saved.currentIndex === "number" &&
                    saved.currentIndex >= 0 &&
                    saved.currentIndex < songs.length
                  ) {
                    targetIdx = saved.currentIndex;
                  }
                } else if (
                  typeof saved.currentIndex === "number" &&
                  saved.currentIndex >= 0 &&
                  saved.currentIndex < songs.length
                ) {
                  targetIdx = saved.currentIndex;
                }
                setCurrentIndex(targetIdx);
                if (
                  typeof saved.currentTime === "number" &&
                  Number.isFinite(saved.currentTime) &&
                  saved.currentTime > 0
                ) {
                  pendingRestoreTimeRef.current = saved.currentTime;
                  setCurrentTime(saved.currentTime);
                }
              }
            }
          }
          setError(songs.length === 0 ? hostMessage || "没有可播放的音乐" : null);
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setError("音乐加载失败，请检查网络后重试");
          setIsLoading(false);
        }
      }
    };
    fetchMusicData();
    return () => {
      mounted = false;
    };
  }, [active, music, reloadToken]);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (playlist.length === 0) return;
    const song = playlist[currentIndex];
    if (!song) return;
    let mounted = true;
    /* eslint-disable react-hooks/set-state-in-effect -- 切歌时重置当前歌词显示 */
    setLyrics([]);
    setCurrentLyric("");
    /* eslint-enable react-hooks/set-state-in-effect */

    if (song.lrcUrl) {
      fetch(song.lrcUrl)
        .then((r) => r.text())
        .then((text) => {
          if (!mounted) return;
          const parsed = parseLrc(text);
          setLyrics(parsed);
          setPlaylist((prev) => {
            const next = [...prev];
            if (next[currentIndex]) {
              next[currentIndex] = { ...next[currentIndex], lyrics: parsed };
            }
            return next;
          });
        })
        .catch(() => {});
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    }
    return () => {
      mounted = false;
    };
  }, [currentIndex, playlist.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      persistSnapshot(audioRef.current.currentTime);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isPlaying, persistSnapshot]);

  const nextSong = useCallback(() => {
    if (playlist.length === 0) return;
    pendingRestoreTimeRef.current = null;
    setCurrentTime(0);
    setProgress(0);
    if (playMode === "random") {
      setCurrentIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentIndex((p) => (p + 1) % playlist.length);
    }
  }, [playMode, playlist.length]);

  const prevSong = useCallback(() => {
    if (playlist.length === 0) return;
    pendingRestoreTimeRef.current = null;
    setCurrentTime(0);
    setProgress(0);
    if (playMode === "random") {
      setCurrentIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentIndex((p) => (p - 1 + playlist.length) % playlist.length);
    }
  }, [playMode, playlist.length]);

  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);
  useEffect(() => {
    nextSongRef.current = nextSong;
  }, [nextSong]);
  useEffect(() => {
    prevSongRef.current = prevSong;
  }, [prevSong]);

  const playSong = useCallback((index: number) => {
    pendingRestoreTimeRef.current = null;
    setCurrentTime(0);
    setProgress(0);
    setCurrentIndex(index);
    setIsPlaying(true);
  }, []);

  const updateLyricForTime = useCallback(
    (ct: number) => {
      if (lyrics.length > 0) {
        const activeLine = [...lyrics].reverse().find((l) => ct >= l.time);
        if (activeLine) setCurrentLyric(activeLine.text);
      }
    },
    [lyrics],
  );

  // 初次恢复歌词定位
  useEffect(() => {
    if (currentTime > 0 && lyrics.length > 0) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- 恢复进度后同步当前句歌词 */
      updateLyricForTime(currentTime);
    }
  }, [lyrics, currentTime, updateLyricForTime]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    setDuration(dur);

    if (pendingRestoreTimeRef.current !== null) {
      const target =
        dur > 0
          ? Math.min(pendingRestoreTimeRef.current, Math.max(0, dur - 0.5))
          : pendingRestoreTimeRef.current;
      pendingRestoreTimeRef.current = null;
      try {
        audio.currentTime = target;
      } catch {
        // ignore if stream not seekable yet
      }
      setCurrentTime(target);
      setProgress(dur > 0 ? (target / dur) * 100 : 0);
      updateLyricForTime(target);
      return;
    }

    const ct = audio.currentTime;
    setCurrentTime(ct);
    setProgress(dur > 0 ? (ct / dur) * 100 : 0);
  }, [updateLyricForTime]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const ct = audio.currentTime;
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    setCurrentTime(ct);
    setDuration(dur);
    setProgress(dur > 0 ? (ct / dur) * 100 : 0);
    updateLyricForTime(ct);

    // 节流写入 localStorage（每 2 秒最多一次）
    const now = Date.now();
    if (now - lastSavedAtRef.current >= 2000) {
      lastSavedAtRef.current = now;
      persistSnapshot(ct);
    }
  }, [updateLyricForTime, persistSnapshot]);

  const handleEnded = useCallback(() => {
    if (playModeRef.current === "single" && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else {
      nextSongRef.current();
    }
  }, []);

  const handleSeek = useCallback(
    (value: number) => {
      const clampedPct = Math.max(0, Math.min(100, value));
      pendingRestoreTimeRef.current = null;
      setProgress(clampedPct);
      const audio = audioRef.current;
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        const nextTime = (clampedPct / 100) * audio.duration;
        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
        persistSnapshot(nextTime);
      }
    },
    [persistSnapshot],
  );

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const dur = Number.isFinite(audio.duration) ? audio.duration : duration;
      if (!dur || dur <= 0) return;
      pendingRestoreTimeRef.current = null;
      const nextTime = Math.max(0, Math.min(dur, audio.currentTime + deltaSeconds));
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
      setProgress((nextTime / dur) * 100);
      persistSnapshot(nextTime);
    },
    [duration, persistSnapshot],
  );

  const setVolume = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(1, val));
      setVolumeState(clamped);
      if (isMuted && clamped > 0) setIsMuted(false);
    },
    [isMuted],
  );

  const toggleMute = useCallback(() => setIsMuted((p) => !p), []);

  const togglePlayMode = useCallback(() => {
    setPlayMode((p) =>
      p === "loop" ? "single" : p === "single" ? "random" : "loop",
    );
  }, []);

  const currentSong = playlist[currentIndex];

  // Media Session API 集成（系统媒体控制中心标题、封面与上下曲快捷键）
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    if (currentSong && typeof MediaMetadata !== "undefined") {
      try {
        ms.metadata = new MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artist,
          artwork: currentSong.cover ? [{ src: currentSong.cover }] : [],
        });
      } catch {
        // ignore invalid artwork URL
      }
    }
    ms.playbackState = isPlaying ? "playing" : "paused";
  }, [currentSong, isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      [
        "play",
        () => {
          audioRef.current
            ?.play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        },
      ],
      [
        "pause",
        () => {
          audioRef.current?.pause();
          setIsPlaying(false);
        },
      ],
      ["previoustrack", () => prevSongRef.current()],
      ["nexttrack", () => nextSongRef.current()],
    ];

    for (const [action, handler] of actions) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // 部分浏览器不支持特定动作
      }
    }

    return () => {
      for (const [action] of actions) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return (
    <MusicContext.Provider
      value={{
        playlist,
        currentIndex,
        currentSong,
        isPlaying,
        progress,
        currentTime,
        duration,
        currentLyric,
        allLyrics: lyrics,
        isLoading,
        error,
        volume,
        isMuted,
        playMode,
        saying,
        refreshSaying,
        retry,
        togglePlay,
        nextSong,
        prevSong,
        handleSeek,
        seekBy,
        playSong,
        setVolume,
        toggleMute,
        togglePlayMode,
      }}
    >
      {children}
      {currentSong && (
        <audio
          ref={audioRef}
          src={currentSong.src}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMetadata}
        />
      )}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within MusicProvider");
  return ctx;
}

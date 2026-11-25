"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Headphones, Pause, Play, RefreshCw } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import { formatDate, formatDuration } from "@/lib/format";
import type {
  PodcastEpisodeView,
  PodcastShowView,
} from "@/server/modules/podcast/contracts";

function parseShowId(value: string | number | null | undefined): number | null {
  const id = Number(value ?? "");
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default function PodcastClient({ canManage, initialShow }: { canManage: boolean; initialShow?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // URL 是节目选择的初始来源；组件挂载后由本组件状态接管，切节目时再写回 URL。
  const [requestedShow] = useState(() => parseShowId(searchParams.get("show") ?? initialShow));
  const [shows, setShows] = useState<PodcastShowView[]>([]);
  const [episodes, setEpisodes] = useState<PodcastEpisodeView[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [playing, setPlaying] = useState<PodcastEpisodeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canSeek, setCanSeek] = useState(false);
  const [speed, setSpeed] = useState("1");
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const resumeAt = useRef(0);
  const pendingSave = useRef(Promise.resolve());
  const loadRequest = useRef<AbortController | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (showId?: number) => {
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setLoading(true);
    setLoadError(false);
    try {
      const query = showId ? `?show=${showId}` : "";
      const response = await fetch(`/api/podcast${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Podcast request failed");
      const json = await response.json();
      if (controller.signal.aborted) return;
      setShows(json.shows ?? []);
      setEpisodes(json.episodes ?? []);
      setActiveId(json.activeId ?? null);
    } catch {
      if (!controller.signal.aborted) setLoadError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load(requestedShow ?? undefined));
    return () => {
      cancelAnimationFrame(frame);
      loadRequest.current?.abort();
    };
  }, [load, requestedShow]);

  function selectShow(id: number) {
    if (activeId === id) return;
    // 切节目先停旧音频，onPause 会顺手保存当前收听位置。
    const audio = audioRef.current;
    if (audio && playing && !audio.ended) audio.pause();
    setPlaying(null);
    setIsPlaying(false);
    setCanSeek(false);
    setMessage(null);
    router.replace(`/podcast?show=${id}`, { scroll: false });
    void load(id);
  }

  function play(episode: PodcastEpisodeView) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && !audio.ended) savePosition(playing.id, audio.currentTime, false);
    setPlaying(episode);
    setIsPlaying(false);
    setCanSeek(false);
    setMessage(null);
    lastSaved.current = 0;
    resumeAt.current = episode.played ? 0 : episode.position;
    try {
      const saved = localStorage.getItem(progressKey(episode.id));
      if (saved !== null && Number.isFinite(Number(saved))) resumeAt.current = Math.max(0, Number(saved));
    } catch {
      // 本地存储不可用时使用服务端进度。
    }
    audio.src = episode.audio_url;
    audio.playbackRate = Number(speed);
    void audio.play().catch(() => setMessage("浏览器拦截了自动播放，点一下播放按钮"));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !playing) return;
    if (audio.paused) void audio.play().catch(() => setMessage("音频暂时无法播放，请重试。"));
    else audio.pause();
  }

  function progressKey(id: number) {
    return `podcast-progress-v1-${canManage ? "owner" : "guest"}-${id}`;
  }

  function savePosition(id: number, time: number, played: boolean) {
    if (!Number.isFinite(time)) return;
    const position = Math.min(100_000, Math.max(0, Math.floor(time)));
    try {
      localStorage.setItem(progressKey(id), String(played ? 0 : position));
    } catch {
      // 本地存储不可用时仍可继续播放。
    }
    setEpisodes((previous) => previous.map((item) => item.id === id ? { ...item, position, played } : item));
    if (!canManage) return;
    pendingSave.current = pendingSave.current.then(async () => {
      try {
        const response = await fetch(`/api/admin/podcast/episodes/${id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position, played }),
          keepalive: true,
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Position sync failed");
      } catch {
        setMessage("收听进度暂时无法同步，本浏览器仍可续听。");
      }
    });
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !playing || audio.paused) return;
    const position = audio.currentTime;
    if (Math.abs(position - lastSaved.current) < 10) return;
    lastSaved.current = position;
    savePosition(playing.id, audio.currentTime, false);
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Headphones className="h-6 w-6 text-sky-500" />
            播客
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            RSS 订阅 · 站内播放 · 自动记住收听位置
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <button
            type="button"
            onClick={() => void load(activeId ?? requestedShow ?? undefined)}
            title="仅重新读取站内已抓取的单集，不会重新抓取 RSS"
            className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
          <p className="text-[10px] text-slate-400">只读取已抓取单集，不会抓新单集</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <aside className="space-y-1.5">
          {shows.map((show) => (
            <button
              key={show.id}
              type="button"
              onClick={() => selectShow(show.id)}
              aria-pressed={activeId === show.id}
              className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                activeId === show.id
                  ? "border-sky-500 bg-sky-500/10"
                  : "border-white/40 bg-white/40 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/40"
              }`}
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-200/60 dark:bg-slate-700/60">
                {show.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 封面来自播客 RSS
                  <img src={show.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-sm">🎧</div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{show.title}</p>
                <p className="text-[11px] text-slate-400">{show.episode_count} 集</p>
              </div>
            </button>
          ))}
          {shows.length === 0 && !loading && !loadError && (
            <p className="rounded-xl border border-white/40 bg-white/40 p-4 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
              还没有订阅，去后台「播客」粘贴一个 RSS 地址。
            </p>
          )}
        </aside>

        <section className="divide-y divide-white/30 overflow-hidden rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
          {loading ? (
            <AsyncState tone="loading" title="正在加载节目…" compact />
          ) : loadError ? (
            <AsyncState
              tone="error"
              title="节目加载失败"
              description="数据暂时取不到，点击下方按钮重新加载。"
              actionLabel="重新加载"
              onAction={() => void load(activeId ?? requestedShow ?? undefined)}
              compact
            />
          ) : shows.length > 0 && episodes.length === 0 ? (
            <AsyncState tone="empty" title="这个节目还没有单集" compact />
          ) : (
            episodes.map((episode) => {
              const active = playing?.id === episode.id;
              return (
                <div key={episode.id} className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    aria-label={`${active && isPlaying ? "暂停" : "播放"} ${episode.title}`}
                    onClick={() => (active ? toggle() : play(episode))}
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      active ? "bg-sky-500 text-white" : "bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {active && isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${
                        episode.played ? "text-slate-400" : "text-slate-800 dark:text-slate-100"
                      }`}
                    >
                      {episode.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatDate(episode.published_at)}
                      {episode.duration > 0 ? ` · ${formatDuration(episode.duration)}` : ""}
                      {episode.played ? " · 已听完" : episode.position > 0 ? ` · 已听 ${formatDuration(episode.position)}` : ""}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      {/* 原生 controls 已移除：播放/暂停、快进快退与倍速由上方自定义控件独占。 */}
      <audio
        ref={audioRef}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          if (Number.isFinite(audio.duration) && resumeAt.current < audio.duration) audio.currentTime = resumeAt.current;
          resumeAt.current = 0;
          setCanSeek(Number.isFinite(audio.duration) && audio.duration > 0);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={(event) => {
          setIsPlaying(false);
          const audio = event.currentTarget;
          if (playing && !audio.ended && audio.readyState > 0) savePosition(playing.id, audio.currentTime, false);
        }}
        onEnded={(event) => {
          setIsPlaying(false);
          if (playing) savePosition(playing.id, event.currentTarget.currentTime, true);
        }}
        onError={() => {
          setCanSeek(false);
          setMessage("无法读取音频，请重试或换一集收听。");
        }}
        className="hidden"
      />

      {playing && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-200">
          <p className="min-w-0 break-words">{playing.title}</p>
          <button className="min-h-8 rounded bg-white/65 px-2 disabled:opacity-50 dark:bg-slate-800" type="button" disabled={!canSeek} onClick={() => seek(-15)}>后退 15 秒</button>
          <button className="min-h-8 rounded bg-white/65 px-2 disabled:opacity-50 dark:bg-slate-800" type="button" disabled={!canSeek} onClick={() => seek(15)}>前进 15 秒</button>
          <label className="flex items-center gap-1">
            倍速
            <select className="min-h-8 rounded bg-white/80 px-2 dark:bg-slate-800" value={speed} onChange={(event) => {
              setSpeed(event.target.value);
              if (audioRef.current) audioRef.current.playbackRate = Number(event.target.value);
            }}>
              {["0.75", "1", "1.25", "1.5", "2"].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </label>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-xs text-amber-800 dark:text-amber-200">{message}</p>}
    </div>
  );
}

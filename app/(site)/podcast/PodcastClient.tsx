"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, RefreshCw } from "lucide-react";
import type {
  PodcastEpisodeView,
  PodcastShowView,
} from "@/server/modules/podcast/contracts";

function durationLabel(seconds: number): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

export default function PodcastClient({ canManage }: { canManage: boolean }) {
  const [shows, setShows] = useState<PodcastShowView[]>([]);
  const [episodes, setEpisodes] = useState<PodcastEpisodeView[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [playing, setPlaying] = useState<PodcastEpisodeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSaved = useRef(0);

  const load = useCallback(async (showId?: number) => {
    setLoading(true);
    try {
      const query = showId ? `?show=${showId}` : "";
      const json = await fetch(`/api/podcast${query}`).then((response) => response.json());
      setShows(json.shows ?? []);
      setEpisodes(json.episodes ?? []);
      setActiveId(json.activeId ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function play(episode: PodcastEpisodeView) {
    setPlaying(episode);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = episode.audio_url;
    audio.currentTime = episode.position > 0 ? episode.position : 0;
    void audio.play().catch(() => setMessage("浏览器拦截了自动播放，点一下播放按钮"));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !playing) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }

  async function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !playing || !canManage) return;
    const now = Date.now();
    if (now - lastSaved.current < 10_000) return;
    lastSaved.current = now;
    await fetch(`/api/admin/podcast/episodes/${playing.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: Math.floor(audio.currentTime), played: false }),
    }).catch(() => undefined);
  }

  async function onEnded() {
    const audio = audioRef.current;
    if (!audio || !playing || !canManage) return;
    await fetch(`/api/admin/podcast/episodes/${playing.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: Math.floor(audio.duration || 0), played: true }),
    }).catch(() => undefined);
    setEpisodes((prev) =>
      prev.map((item) => (item.id === playing.id ? { ...item, played: true } : item)),
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
            <Headphones className="h-6 w-6 text-sky-500" />
            播客
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            RSS 订阅 · 站内播放 · 自动记住收听位置
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(activeId ?? undefined)}
          className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <aside className="space-y-1.5">
          {shows.map((show) => (
            <button
              key={show.id}
              type="button"
              onClick={() => void load(show.id)}
              className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                activeId === show.id
                  ? "border-sky-500 bg-sky-500/10"
                  : "border-white/40 bg-white/40 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/40"
              }`}
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-200/60 dark:bg-slate-700/60">
                {show.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 封面来自播客 RSS
                  <img src={show.cover} alt="" className="h-full w-full object-cover" />
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
          {shows.length === 0 && !loading && (
            <p className="rounded-xl border border-white/40 bg-white/40 p-4 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
              还没有订阅，去后台「播客」粘贴一个 RSS 地址。
            </p>
          )}
        </aside>

        <section className="divide-y divide-white/30 overflow-hidden rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
          {loading && <p className="px-4 py-6 text-sm text-slate-500">加载中…</p>}
          {!loading && episodes.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">这个节目还没有单集。</p>
          )}
          {episodes.map((episode) => {
            const active = playing?.id === episode.id;
            return (
              <div key={episode.id} className="flex items-start gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => (active ? toggle() : play(episode))}
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    active ? "bg-sky-500 text-white" : "bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
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
                    {new Date(episode.published_at).toLocaleDateString("zh-CN")}
                    {episode.duration ? ` · ${durationLabel(episode.duration)}` : ""}
                    {episode.played ? " · 已听完" : episode.position > 0 ? ` · 已听 ${Math.floor(episode.position / 60)} 分钟` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={() => void onTimeUpdate()}
        onEnded={() => void onEnded()}
        controls
        className={`mt-5 w-full ${playing ? "" : "hidden"}`}
      />

      {playing && (
        <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
          正在播放：{playing.title}
        </p>
      )}
      {message && <p className="mt-2 text-xs text-amber-600">{message}</p>}
    </div>
  );
}

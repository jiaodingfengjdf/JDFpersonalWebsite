"use client";
/* eslint-disable @next/next/no-img-element -- 封面来自播客 RSS 外链，域名不可预知 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs, { type FilterTabItem } from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import { formatDate, formatDuration, formatRelativeTime } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type {
  PodcastEpisodeView,
  PodcastShowView,
} from "@/server/modules/podcast/contracts";
import PodcastRssModal from "./PodcastRssModal";

type ShowSelection = "all" | number;
type EpisodeStatusFilter = "all" | "unplayed" | "listening" | "played";

const SPEED_RATES = ["0.75", "1", "1.25", "1.5", "2"] as const;

function parseShowSelection(
  raw: string | null,
  initialShow?: number,
): ShowSelection {
  if (raw === "all") return "all";
  if (raw !== null && raw !== "") {
    const id = Number(raw);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  if (initialShow && Number.isSafeInteger(initialShow) && initialShow > 0) {
    return initialShow;
  }
  return "all";
}

function parseEpisodeStatus(raw: string | null): EpisodeStatusFilter {
  if (raw === "unplayed" || raw === "listening" || raw === "played") return raw;
  return "all";
}

interface LocalEpisodeState {
  position: number;
  played: boolean;
}

function readLocalEpisodeState(id: number, canManage: boolean): LocalEpisodeState | null {
  try {
    const posRaw =
      localStorage.getItem(`podcast-pos-${id}`) ??
      localStorage.getItem(`podcast-progress-v1-${canManage ? "owner" : "guest"}-${id}`);
    const playedRaw = localStorage.getItem(`podcast-played-${id}`);

    if (posRaw !== null) {
      if (posRaw.startsWith("{")) {
        const parsed = JSON.parse(posRaw) as Partial<LocalEpisodeState>;
        const position =
          typeof parsed.position === "number" && Number.isFinite(parsed.position)
            ? Math.max(0, Math.floor(parsed.position))
            : 0;
        const played = Boolean(parsed.played) || playedRaw === "1";
        return { position, played };
      }
      const numeric = Number(posRaw);
      if (Number.isFinite(numeric) && numeric >= 0) {
        return {
          position: Math.floor(numeric),
          played: playedRaw === "1",
        };
      }
    } else if (playedRaw === "1") {
      return { position: 0, played: true };
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return null;
}

function hydrateEpisodesWithLocal(
  items: PodcastEpisodeView[],
  canManage: boolean,
): PodcastEpisodeView[] {
  return items.map((episode) => {
    const local = readLocalEpisodeState(episode.id, canManage);
    if (!local) return episode;
    // For guests, server always zeroes position/played; for admins, prefer local if server is untouched or local has progress.
    if (!canManage) {
      return {
        ...episode,
        position: local.played ? 0 : local.position,
        played: local.played,
      };
    }
    if (local.played && !episode.played) {
      return { ...episode, position: 0, played: true };
    }
    if (local.position > 0 && episode.position === 0 && !episode.played) {
      return { ...episode, position: local.position };
    }
    return episode;
  });
}

function filterPodcastEpisodes(
  episodes: PodcastEpisodeView[],
  shows: readonly PodcastShowView[],
  statusFilter: EpisodeStatusFilter,
  query: string,
): PodcastEpisodeView[] {
  const keyword = query.trim().toLowerCase();
  const titleByShowId = keyword
    ? new Map(shows.map((show) => [show.id, show.title]))
    : null;
  return episodes.filter((ep) => {
    if (statusFilter === "played" && !ep.played) return false;
    if (statusFilter === "listening" && (ep.played || ep.position <= 0)) return false;
    if (statusFilter === "unplayed" && (ep.played || ep.position > 0)) return false;

    if (keyword) {
      const showTitle = titleByShowId?.get(ep.show_id) ?? "";
      const haystack = `${ep.title}\n${ep.description}\n${showTitle}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export default function PodcastClient({
  canManage,
  initialShow,
}: {
  canManage: boolean;
  initialShow?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedShow = parseShowSelection(searchParams.get("show"), initialShow);
  const statusFilter = parseEpisodeStatus(searchParams.get("status"));
  const urlQuery = searchParams.get("q") ?? "";
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const query = draftQuery ?? urlQuery;

  const [shows, setShows] = useState<PodcastShowView[]>([]);
  const [episodes, setEpisodes] = useState<PodcastEpisodeView[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [playing, setPlaying] = useState<PodcastEpisodeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adminBanner, setAdminBanner] = useState<{ tone: "info" | "error"; text: string } | null>(
    null,
  );
  const [rssModalOpen, setRssModalOpen] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [refreshingActiveShow, setRefreshingActiveShow] = useState(false);
  const [deletingActiveShow, setDeletingActiveShow] = useState(false);
  const [confirmDeleteActiveShowId, setConfirmDeleteActiveShowId] = useState<number | null>(null);

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [canSeek, setCanSeek] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEED_RATES)[number]>("1");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const resumeAt = useRef(0);
  const pendingSave = useRef(Promise.resolve());
  const loadRequest = useRef<AbortController | null>(null);

  const load = useCallback(
    async (selection: ShowSelection) => {
      loadRequest.current?.abort();
      const controller = new AbortController();
      loadRequest.current = controller;
      setLoading(true);
      setLoadError(false);

      try {
        const querySuffix = selection === "all" ? "" : `?show=${selection}`;
        const response = await fetch(`/api/podcast${querySuffix}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Podcast request failed");
        const json = (await response.json()) as {
          shows?: PodcastShowView[];
          activeId?: number | null;
          episodes?: PodcastEpisodeView[];
        };
        if (controller.signal.aborted) return;

        const fetchedShows = json.shows ?? [];
        const firstActiveId = json.activeId ?? null;
        let mergedEpisodes = json.episodes ?? [];

        if (selection === "all" && fetchedShows.length > 1) {
          const restShows = fetchedShows.filter(
            (show) => show.id !== firstActiveId && show.episode_count > 0,
          );
          if (restShows.length > 0) {
            const extraResponses = await Promise.all(
              restShows.map((show) =>
                fetch(`/api/podcast?show=${show.id}`, { signal: controller.signal })
                  .then(async (res) =>
                    res.ok
                      ? ((await res.json()) as { episodes?: PodcastEpisodeView[] }).episodes ?? []
                      : [],
                  )
                  .catch(() => [] as PodcastEpisodeView[]),
              ),
            );
            if (controller.signal.aborted) return;
            const seen = new Set(mergedEpisodes.map((ep) => ep.id));
            for (const batch of extraResponses) {
              for (const ep of batch) {
                if (!seen.has(ep.id)) {
                  seen.add(ep.id);
                  mergedEpisodes.push(ep);
                }
              }
            }
            mergedEpisodes = [...mergedEpisodes].sort(
              (a, b) => b.published_at - a.published_at || b.id - a.id,
            );
          }
        }

        setShows(fetchedShows);
        setActiveId(selection === "all" ? null : firstActiveId);
        setEpisodes(hydrateEpisodesWithLocal(mergedEpisodes, canManage));
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [canManage],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load(selectedShow));
    return () => {
      cancelAnimationFrame(frame);
      loadRequest.current?.abort();
    };
  }, [load, selectedShow]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  function buildUrl(
    patch: Partial<{
      show: ShowSelection;
      status: EpisodeStatusFilter;
      q: string;
    }>,
  ): string {
    const params = new URLSearchParams(searchParams.toString());
    const nextShow = patch.show ?? selectedShow;
    const nextStatus = patch.status ?? statusFilter;
    const nextQ = patch.q !== undefined ? patch.q : query;

    if (nextShow === "all") params.delete("show");
    else params.set("show", String(nextShow));

    if (nextStatus === "all") params.delete("status");
    else params.set("status", nextStatus);

    const trimmed = nextQ.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");

    const serialized = params.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
  }

  function pushParams(
    patch: Partial<{
      show: ShowSelection;
      status: EpisodeStatusFilter;
      q: string;
    }>,
  ) {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (patch.q !== undefined) setDraftQuery(null);
    router.push(buildUrl(patch), { scroll: false });
  }

  function handleQueryChange(value: string) {
    setDraftQuery(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const serialized = params.toString();
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
      setDraftQuery(null);
    }, 250);
  }

  function selectShow(next: ShowSelection) {
    if (next === selectedShow) return;
    setMessage(null);
    setConfirmDeleteActiveShowId(null);
    pushParams({ show: next });
  }

  async function syncAllShows() {
    if (!canManage || syncingAll) return;
    setSyncingAll(true);
    setAdminBanner(null);
    try {
      const result = await siteAdminRequest<{ shows: number; inserted: number }>(
        "/api/admin/podcast/refresh",
        { method: "POST" },
      );
      setAdminBanner({
        tone: "info",
        text: `已同步 ${result.shows} 档播客节目，新增 ${result.inserted} 集单集。`,
      });
      await load(selectedShow);
    } catch (error) {
      setAdminBanner({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setSyncingAll(false);
    }
  }

  async function refreshShowById(
    showId: number,
    showTitle: string,
  ): Promise<{ inserted: number } | null> {
    if (!canManage) return null;
    const result = await siteAdminRequest<{ inserted: number }>(
      `/api/admin/podcast/shows/${showId}`,
      { method: "POST" },
    );
    setAdminBanner({
      tone: "info",
      text: `《${showTitle}》刷新完成，新增 ${result.inserted} 集单集。`,
    });
    await load(selectedShow);
    return result;
  }

  async function removeShowById(showId: number, showTitle: string): Promise<boolean> {
    if (!canManage) return false;
    await siteAdminRequest<{ ok: boolean }>(`/api/admin/podcast/shows/${showId}`, {
      method: "DELETE",
    });
    setConfirmDeleteActiveShowId(null);
    if (playing?.show_id === showId) {
      closePlayer();
    }
    setAdminBanner({
      tone: "info",
      text: `已取消订阅《${showTitle}》。`,
    });
    if (selectedShow !== "all") {
      pushParams({ show: "all" });
    } else {
      await load("all");
    }
    return true;
  }

  async function handleShowAdded(showId: number, inserted: number) {
    setAdminBanner({
      tone: "info",
      text: `播客订阅成功，已收录 ${inserted} 集单集。`,
    });
    if (selectedShow !== showId) {
      pushParams({ show: showId });
    } else {
      await load(showId);
    }
  }

  async function handleActiveShowRefresh(showId: number, showTitle: string) {
    if (!canManage || refreshingActiveShow || deletingActiveShow) return;
    setRefreshingActiveShow(true);
    setAdminBanner(null);
    try {
      await refreshShowById(showId, showTitle);
    } catch (error) {
      setAdminBanner({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setRefreshingActiveShow(false);
    }
  }

  async function handleActiveShowRemove(showId: number, showTitle: string) {
    if (!canManage || deletingActiveShow || refreshingActiveShow) return;
    setDeletingActiveShow(true);
    setAdminBanner(null);
    try {
      await removeShowById(showId, showTitle);
    } catch (error) {
      setAdminBanner({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setDeletingActiveShow(false);
    }
  }

  function legacyProgressKey(id: number) {
    return `podcast-progress-v1-${canManage ? "owner" : "guest"}-${id}`;
  }

  function savePosition(id: number, time: number, played: boolean) {
    if (!Number.isFinite(time)) return;
    const position = Math.min(100_000, Math.max(0, Math.floor(time)));
    try {
      localStorage.setItem(`podcast-pos-${id}`, String(played ? 0 : position));
      localStorage.setItem(`podcast-played-${id}`, played ? "1" : "0");
      localStorage.setItem(legacyProgressKey(id), String(played ? 0 : position));
    } catch {
      // Playback continues even if local storage is blocked.
    }
    setEpisodes((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, position: played ? 0 : position, played } : item,
      ),
    );
    setPlaying((prev) =>
      prev && prev.id === id ? { ...prev, position: played ? 0 : position, played } : prev,
    );
    if (!canManage) return;
    pendingSave.current = pendingSave.current.then(async () => {
      try {
        const response = await fetch(`/api/admin/podcast/episodes/${id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position: played ? 0 : position, played }),
          keepalive: true,
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Position sync failed");
      } catch {
        setMessage("收听进度暂时无法同步到云端，当前浏览器仍已保留续听位置。");
      }
    });
  }

  function play(episode: PodcastEpisodeView) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && playing.id !== episode.id && !audio.ended) {
      savePosition(playing.id, audio.currentTime, false);
    }
    setPlaying(episode);
    setIsPlaying(false);
    setCanSeek(false);
    setMessage(null);
    lastSaved.current = 0;

    let initialPos = episode.played ? 0 : episode.position;
    const local = readLocalEpisodeState(episode.id, canManage);
    if (local && !local.played && local.position > 0) {
      initialPos = local.position;
    }
    resumeAt.current = initialPos;
    setCurrentTime(initialPos);
    setDuration(episode.duration > 0 ? episode.duration : 0);

    audio.src = episode.audio_url;
    audio.playbackRate = Number(speed);
    audio.muted = muted;
    audio.volume = volume;
    void audio.play().catch(() => setMessage("浏览器拦截了自动播放，请点击下方播放按钮开始收听。"));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !playing) return;
    if (audio.paused) {
      void audio.play().catch(() => setMessage("音频暂时无法播放，请稍后重试。"));
    } else {
      audio.pause();
    }
  }

  function closePlayer() {
    const audio = audioRef.current;
    if (audio && playing && !audio.ended && audio.readyState > 0) {
      savePosition(playing.id, audio.currentTime, false);
    }
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlaying(null);
    setIsPlaying(false);
    setCanSeek(false);
    setCurrentTime(0);
    setDuration(0);
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !playing) return;
    const pos = audio.currentTime;
    if (Number.isFinite(pos)) {
      setCurrentTime(pos);
    }
    if (audio.paused) return;
    if (Math.abs(pos - lastSaved.current) < 8) return;
    lastSaved.current = pos;
    savePosition(playing.id, pos, false);
  }

  function seekRelative(deltaSeconds: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const next = Math.max(0, Math.min(audio.duration, audio.currentTime + deltaSeconds));
    audio.currentTime = next;
    setCurrentTime(next);
  }

  function seekTo(targetSeconds: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const next = Math.max(0, Math.min(audio.duration, targetSeconds));
    audio.currentTime = next;
    setCurrentTime(next);
  }

  function cycleSpeed() {
    const idx = SPEED_RATES.indexOf(speed);
    const next = SPEED_RATES[(idx + 1) % SPEED_RATES.length] ?? "1";
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = Number(next);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }

  function handleVolumeChange(nextVolume: number) {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolume(clamped);
    const nextMuted = clamped === 0;
    setMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = nextMuted;
    }
  }

  function toggleShowNotes(id: number) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const showById = useMemo(
    () => new Map<number, PodcastShowView>(shows.map((show) => [show.id, show])),
    [shows],
  );

  const activeShowObj = useMemo(() => {
    if (selectedShow === "all") return null;
    return (
      shows.find((show) => show.id === selectedShow) ??
      (activeId ? shows.find((show) => show.id === activeId) ?? null : null)
    );
  }, [activeId, selectedShow, shows]);

  const totalCatalogEpisodes = useMemo(
    () => shows.reduce((sum, show) => sum + (show.episode_count || 0), 0),
    [shows],
  );

  const episodeCounts = useMemo(() => {
    let unplayed = 0;
    let listening = 0;
    let played = 0;
    for (const ep of episodes) {
      if (ep.played) played += 1;
      else if (ep.position > 0) listening += 1;
      else unplayed += 1;
    }
    return {
      all: episodes.length,
      unplayed,
      listening,
      played,
    };
  }, [episodes]);

  const filteredEpisodes = filterPodcastEpisodes(episodes, shows, statusFilter, query);

  const statusTabs: Array<FilterTabItem<EpisodeStatusFilter>> = [
    { key: "all", label: `全部 ${episodeCounts.all}` },
    { key: "unplayed", label: `未听 ${episodeCounts.unplayed}` },
    { key: "listening", label: `收听中 ${episodeCounts.listening}` },
    { key: "played", label: `已听完 ${episodeCounts.played}` },
  ];

  const playingShow = playing ? showById.get(playing.show_id) : undefined;
  const effectiveDuration = duration > 0 ? duration : (playing?.duration ?? 0);

  return (
    <div
      className={`relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 ${
        playing ? "pb-36" : ""
      }`}
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Headphones className="h-6 w-6 text-sky-500 md:h-7 md:w-7" />
            播客
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            RSS 订阅 · 站内收听 · 自动记住当前浏览器播放进度
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => setRssModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                订阅播客 RSS
              </button>

              <button
                type="button"
                disabled={syncingAll || shows.length === 0}
                onClick={() => void syncAllShows()}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/60 bg-sky-500/15 px-3.5 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-sky-300"
              >
                {syncingAll ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Radio className="h-3.5 w-3.5" />
                )}
                {syncingAll ? "同步中…" : "同步全部"}
              </button>
            </>
          ) : null}

          <div className="flex flex-col items-end gap-0.5">
            <button
              type="button"
              onClick={() => void load(selectedShow)}
              title="仅重新读取站内已抓取的单集，不会重新抓取 RSS"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/50 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              重新加载
            </button>
            <p className="text-[10px] text-slate-400">读取站内已收录单集</p>
          </div>
        </div>
      </div>

      {adminBanner ? (
        <div
          role={adminBanner.tone === "error" ? "alert" : "status"}
          className={`mb-4 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs ${
            adminBanner.tone === "error"
              ? "border-rose-200 bg-rose-50/90 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-200"
              : "border-sky-300/60 bg-sky-50/90 text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/60 dark:text-sky-200"
          }`}
        >
          <span>{adminBanner.text}</span>
          <button
            type="button"
            aria-label="关闭通知"
            onClick={() => setAdminBanner(null)}
            className="rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-amber-300/60 bg-amber-50/90 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-200"
        >
          <span>{message}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setMessage(null)}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-[230px_1fr]">
        {/* Left Show Selector */}
        <aside className="space-y-1.5" aria-label="播客节目列表">
          {shows.length > 0 ? (
            <button
              type="button"
              onClick={() => selectShow("all")}
              aria-pressed={selectedShow === "all"}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                selectedShow === "all"
                  ? "border-sky-500 bg-sky-500/15 shadow-xs"
                  : "border-white/40 bg-white/45 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/45"
              }`}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300">
                <Radio className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                  全部单集
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {shows.length} 个订阅 · 共 {totalCatalogEpisodes} 集
                </p>
              </div>
            </button>
          ) : null}

          {shows.map((show) => {
            const selected = selectedShow === show.id;
            return (
              <button
                key={show.id}
                type="button"
                onClick={() => selectShow(show.id)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  selected
                    ? "border-sky-500 bg-sky-500/15 shadow-xs"
                    : "border-white/40 bg-white/45 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/45"
                }`}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 dark:bg-slate-700/70">
                  {show.cover ? (
                    <img src={show.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-sm">🎧</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                    {show.title}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {[show.author, `${show.episode_count} 集`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </button>
            );
          })}

          {shows.length === 0 && !loading && !loadError ? (
            <GlassPanel tone="soft" padding="md" className="space-y-2.5 text-xs text-slate-500 dark:text-slate-400">
              <p>
                {canManage
                  ? "还没有订阅节目，点击下方按钮粘贴 RSS 地址或一键订阅精选播客。"
                  : "暂无播客订阅节目。"}
              </p>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setRssModalOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  订阅播客 RSS
                </button>
              ) : null}
            </GlassPanel>
          ) : null}
        </aside>

        {/* Right Content Column */}
        <div className="min-w-0 space-y-4">
          {/* Active Show Header Card / Subscription Overview */}
          {shows.length > 0 ? (
            activeShowObj ? (
              <GlassPanel padding="md" className="bg-white/60 dark:bg-slate-800/60">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-200/70 shadow-sm ring-1 ring-black/5 dark:bg-slate-700/70 dark:ring-white/10">
                    {activeShowObj.cover ? (
                      <img
                        src={activeShowObj.cover}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-2xl">🎧</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                          当前节目
                        </span>
                        <span className="text-xs text-slate-400">
                          共 {activeShowObj.episode_count} 集
                        </span>
                        {activeShowObj.last_checked_at ? (
                          <span className="text-xs text-slate-400">
                            · 上次同步 {formatRelativeTime(activeShowObj.last_checked_at)}
                          </span>
                        ) : null}
                        {canManage && activeShowObj.last_error ? (
                          <span
                            title={activeShowObj.last_error}
                            className="inline-flex max-w-52 items-center gap-1 truncate rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                          >
                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{activeShowObj.last_error}</span>
                          </span>
                        ) : null}
                      </div>

                      {canManage ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={refreshingActiveShow || deletingActiveShow}
                            onClick={() =>
                              void handleActiveShowRefresh(activeShowObj.id, activeShowObj.title)
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/75 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:text-sky-300"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${refreshingActiveShow ? "animate-spin" : ""}`}
                            />
                            {refreshingActiveShow ? "刷新中…" : "刷新本节目"}
                          </button>

                          {confirmDeleteActiveShowId === activeShowObj.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deletingActiveShow || refreshingActiveShow}
                                onClick={() =>
                                  void handleActiveShowRemove(activeShowObj.id, activeShowObj.title)
                                }
                                className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50"
                              >
                                {deletingActiveShow ? "取消中…" : "确认取消"}
                              </button>
                              <button
                                type="button"
                                disabled={deletingActiveShow}
                                onClick={() => setConfirmDeleteActiveShowId(null)}
                                className="rounded-full border border-white/50 bg-white/75 px-2 py-1 text-[11px] text-slate-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-300"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={deletingActiveShow || refreshingActiveShow}
                              onClick={() => setConfirmDeleteActiveShowId(activeShowObj.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/75 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-rose-300 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                              取消订阅
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <h2 className="mt-1 text-lg font-bold text-slate-800 dark:text-white">
                      {activeShowObj.title}
                    </h2>
                    {activeShowObj.author ? (
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-300">
                        主播 / 出品：{activeShowObj.author}
                      </p>
                    ) : null}
                    {activeShowObj.description ? (
                      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {activeShowObj.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </GlassPanel>
            ) : (
              <GlassPanel padding="md" className="bg-white/60 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="flex -space-x-2.5 overflow-hidden py-0.5 pl-0.5">
                      {shows.slice(0, 4).map((show) => (
                        <div
                          key={show.id}
                          className="h-12 w-12 overflow-hidden rounded-xl bg-slate-200 ring-2 ring-white dark:bg-slate-700 dark:ring-slate-800"
                        >
                          {show.cover ? (
                            <img src={show.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-sm">🎧</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                        订阅总览
                      </span>
                      <h2 className="mt-1 text-base font-bold text-slate-800 dark:text-white">
                        全部播客单集
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        已订阅 {shows.length} 档节目 · 近期展示 {episodes.length} 集
                        {episodeCounts.listening > 0 ? ` · ${episodeCounts.listening} 集收听中` : ""}
                        {episodeCounts.played > 0 ? ` · ${episodeCounts.played} 集已听完` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            )
          ) : null}

          {/* Episode Search + Status Filter Toolbar */}
          {shows.length > 0 ? (
            <GlassPanel padding="sm" className="flex flex-col gap-2.5 bg-white/50 p-3 sm:flex-row sm:items-center sm:justify-between dark:bg-slate-800/50">
              <FilterTabs
                items={statusTabs}
                value={statusFilter}
                onChange={(next) => pushParams({ status: next })}
                aria-label="单集状态筛选"
                inactiveClassName="bg-white/50 dark:bg-slate-900/40"
              />

              <div className="relative sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  maxLength={100}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder="搜索单集标题或简介…"
                  aria-label="搜索播客单集"
                  className="h-8 w-full rounded-full border border-white/50 bg-white/75 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="清空单集搜索"
                    onClick={() => {
                      pushParams({ q: "" });
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-200/60 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </GlassPanel>
          ) : null}

          {/* Episode List */}
          <GlassPanel
            as="section"
            className="divide-y divide-white/35 overflow-hidden bg-white/55 dark:divide-white/10 dark:bg-slate-800/55"
          >
            {loading ? (
              <AsyncState tone="loading" title="正在加载节目单集…" compact />
            ) : loadError ? (
              <AsyncState
                tone="error"
                title="节目加载失败"
                description="数据暂时取不到，点击下方按钮重新加载。"
                actionLabel="重新加载"
                onAction={() => void load(selectedShow)}
                compact
              />
            ) : shows.length === 0 ? (
              <AsyncState
                tone="empty"
                title="暂无播客订阅"
                description={
                  canManage
                    ? "粘贴播客 RSS 地址或从精选目录一键添加订阅。"
                    : "管理员添加播客订阅后将在这里展示。"
                }
                actionLabel={canManage ? "＋ 订阅播客 RSS" : undefined}
                onAction={canManage ? () => setRssModalOpen(true) : undefined}
                compact
              />
            ) : episodes.length === 0 ? (
              <AsyncState tone="empty" title="这个节目还没有单集" compact />
            ) : filteredEpisodes.length === 0 ? (
              <AsyncState
                tone="empty"
                title="没有匹配的单集"
                description="试试切换状态标签或清空搜索关键词。"
                actionLabel="重置筛选"
                onAction={() => pushParams({ status: "all", q: "" })}
                compact
              />
            ) : (
              filteredEpisodes.map((episode) => {
                const active = playing?.id === episode.id;
                const epShow = showById.get(episode.show_id);
                const notesOpen = expandedNotes.has(episode.id);
                const progressPercent = episode.played
                  ? 100
                  : episode.position > 0
                    ? episode.duration > 0
                      ? Math.min(99, Math.max(3, (episode.position / episode.duration) * 100))
                      : 20
                    : 0;

                return (
                  <article
                    key={episode.id}
                    className={`flex items-start gap-3.5 px-4 py-3.5 transition-colors ${
                      active ? "bg-sky-500/10 dark:bg-sky-400/10" : "hover:bg-white/30 dark:hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`${active && isPlaying ? "暂停" : "播放"} ${episode.title}`}
                      onClick={() => (active ? toggle() : play(episode))}
                      className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                        active
                          ? "bg-sky-600 text-white hover:bg-sky-700"
                          : "bg-slate-200/80 text-slate-700 hover:bg-sky-500 hover:text-white dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-sky-500"
                      }`}
                    >
                      {active && isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 translate-x-0.5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedShow === "all" && epShow ? (
                          <button
                            type="button"
                            onClick={() => selectShow(epShow.id)}
                            className="max-w-44 truncate rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                          >
                            {epShow.title}
                          </button>
                        ) : null}
                        {episode.played ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            已听完
                          </span>
                        ) : episode.position > 0 ? (
                          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                            收听中
                          </span>
                        ) : null}
                      </div>

                      <h3
                        className={`mt-0.5 line-clamp-2 text-sm font-medium leading-snug ${
                          episode.played
                            ? "text-slate-500 dark:text-slate-400"
                            : "text-slate-800 dark:text-slate-100"
                        }`}
                      >
                        {episode.title}
                      </h3>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                        <span>{formatDate(episode.published_at)}</span>
                        {episode.duration > 0 ? (
                          <span>· 时长 {formatDuration(episode.duration)}</span>
                        ) : null}
                        {!episode.played && episode.position > 0 ? (
                          <span className="font-medium text-sky-600 dark:text-sky-400">
                            · 已听 {formatDuration(episode.position)}
                          </span>
                        ) : null}
                        {episode.description ? (
                          <button
                            type="button"
                            onClick={() => toggleShowNotes(episode.id)}
                            aria-expanded={notesOpen}
                            className="inline-flex items-center gap-0.5 font-medium text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                          >
                            {notesOpen ? (
                              <>
                                收起单集简介 <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                展开单集简介 <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        ) : null}
                      </div>

                      {/* Episode Progress Bar (shown for all visitors whenever started or completed) */}
                      {progressPercent > 0 ? (
                        <div className="mt-2 flex max-w-sm items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                            <div
                              className={`h-full rounded-full transition-all ${
                                episode.played ? "bg-emerald-500" : "bg-sky-500"
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          {episode.duration > 0 ? (
                            <span className="text-[10px] tabular-nums text-slate-400">
                              {Math.round(progressPercent)}%
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Expandable Show Notes */}
                      {notesOpen && episode.description ? (
                        <div className="mt-2.5 rounded-xl border border-white/40 bg-white/50 p-3 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap break-words dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300">
                          {episode.description}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </GlassPanel>
        </div>
      </div>

      {/* Hidden HTML5 Audio Engine */}
      <audio
        ref={audioRef}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          const totalDur = Number.isFinite(audio.duration) ? audio.duration : 0;
          if (totalDur > 0) setDuration(totalDur);
          if (totalDur > 0 && resumeAt.current > 0 && resumeAt.current < totalDur) {
            audio.currentTime = resumeAt.current;
            setCurrentTime(resumeAt.current);
          }
          resumeAt.current = 0;
          setCanSeek(totalDur > 0);
        }}
        onDurationChange={(event) => {
          const d = event.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(d);
            setCanSeek(true);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={(event) => {
          setIsPlaying(false);
          const audio = event.currentTarget;
          if (playing && !audio.ended && audio.readyState > 0) {
            savePosition(playing.id, audio.currentTime, false);
          }
        }}
        onEnded={(event) => {
          setIsPlaying(false);
          if (playing) savePosition(playing.id, event.currentTarget.currentTime, true);
        }}
        onError={() => {
          setCanSeek(false);
          setMessage("无法读取该单集音频源，请重试或换一集收听。");
        }}
        className="hidden"
      />

      {/* Sticky Glass Bottom Player Bar */}
      {playing ? (
        <div
          role="region"
          aria-label="播客播放器"
          className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-5xl rounded-2xl border border-white/55 bg-white/88 p-3 shadow-2xl backdrop-blur-xl sm:inset-x-6 sm:bottom-4 sm:px-4 sm:py-3.5 dark:border-white/15 dark:bg-slate-900/90"
        >
          <div className="flex flex-col gap-2.5">
            {/* Seek Bar Row */}
            <div className="flex items-center gap-2.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span className="w-11 shrink-0 text-right">
                {formatDuration(currentTime, { padMinutes: true })}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(effectiveDuration))}
                value={Math.min(Math.floor(currentTime), Math.max(1, Math.floor(effectiveDuration)))}
                disabled={!canSeek && effectiveDuration <= 0}
                aria-label="播放进度拖拽条"
                onChange={(event) => seekTo(Number(event.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-sky-600 disabled:opacity-40"
              />
              <span className="w-11 shrink-0">
                {formatDuration(effectiveDuration, { padMinutes: true })}
              </span>
            </div>

            {/* Controls & Episode Info Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-200/80 dark:bg-slate-700/80">
                  {playingShow?.cover ? (
                    <img src={playingShow.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-sm">🎧</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800 sm:text-sm dark:text-slate-100">
                    {playing.title}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {playingShow?.title ?? "正在收听"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  disabled={!canSeek}
                  onClick={() => seekRelative(-15)}
                  aria-label="后退 15 秒"
                  title="后退 15 秒"
                  className="inline-flex h-8 items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/70 px-2.5 text-[11px] font-medium text-slate-700 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-40 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RotateCcw className="h-3 w-3" />
                  15s
                </button>

                <button
                  type="button"
                  onClick={toggle}
                  aria-label={isPlaying ? "暂停播放" : "继续播放"}
                  className="grid h-10 w-10 place-items-center rounded-full bg-sky-600 text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={!canSeek}
                  onClick={() => seekRelative(30)}
                  aria-label="前进 30 秒"
                  title="前进 30 秒"
                  className="inline-flex h-8 items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/70 px-2.5 text-[11px] font-medium text-slate-700 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-40 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RotateCw className="h-3 w-3" />
                  30s
                </button>

                <button
                  type="button"
                  onClick={cycleSpeed}
                  aria-label={`播放倍速 ${speed}x，点击切换`}
                  title="切换播放倍速"
                  className="h-8 min-w-12 rounded-full border border-slate-200/80 bg-white/70 px-2.5 text-[11px] font-semibold tabular-nums text-slate-700 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                >
                  {speed}×
                </button>

                <div className="hidden items-center gap-1 sm:flex">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? "取消静音" : "静音"}
                    title={muted ? "取消静音" : "静音"}
                    className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-200/60 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    aria-label="音量调节"
                    onChange={(event) => handleVolumeChange(Number(event.target.value))}
                    className="h-1 w-16 cursor-pointer accent-sky-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={closePlayer}
                  aria-label="关闭播放器"
                  title="关闭播放器"
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {canManage && rssModalOpen ? (
        <PodcastRssModal
          shows={shows}
          onClose={() => setRssModalOpen(false)}
          onShowAdded={handleShowAdded}
          onRefreshShow={refreshShowById}
          onRemoveShow={removeShowById}
        />
      ) : null}
    </div>
  );
}

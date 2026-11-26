"use client";
/* eslint-disable @next/next/no-img-element -- 封面来自播客 RSS 外链，域名不可预知 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type { PodcastShowView } from "@/server/modules/podcast/contracts";

interface PresetPodcast {
  title: string;
  feedUrl: string;
  altUrls?: string[];
  description: string;
}

const PRESET_PODCASTS: PresetPodcast[] = [
  {
    title: "Syntax",
    feedUrl: "https://feed.syntax.fm/",
    altUrls: ["https://feed.syntax.fm/rss"],
    description: "Wes Bos & Scott Tolinski 的 Web 全栈技术播客",
  },
  {
    title: "内核恐慌",
    feedUrl: "https://pan.icu/feed",
    description: "号称硬核却不失幽默的程序员聊天节目",
  },
  {
    title: "The Changelog",
    feedUrl: "https://changelog.com/podcast/feed",
    description: "开源社区与软件工程一线访谈",
  },
  {
    title: "Soft Skills Engineering",
    feedUrl: "https://softskills.audio/feed.xml",
    description: "工程师职场沟通、成长与软技能问答",
  },
  {
    title: "Anyway.FM 设计杂谈",
    feedUrl: "https://anyway.fm/rss.xml",
    description: "JJ Ying 与 Leon 聊视觉设计、产品与生活",
  },
  {
    title: "捕蛇者说",
    feedUrl: "https://pythonhunter.org/episodes/feed.xml",
    description: "Python 开发者与泛技术话题中文播客",
  },
];

function normalizePodcastUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${host}${path}${parsed.search}`;
  } catch {
    return raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/\/+$/, "");
  }
}

export default function PodcastRssModal({
  shows,
  onClose,
  onShowAdded,
  onRefreshShow,
  onRemoveShow,
}: {
  shows: PodcastShowView[];
  onClose: () => void;
  onShowAdded: (showId: number, inserted: number) => Promise<void>;
  onRefreshShow: (showId: number, showTitle: string) => Promise<{ inserted: number } | null>;
  onRemoveShow: (showId: number, showTitle: string) => Promise<boolean>;
}) {
  const [feedUrl, setFeedUrl] = useState("");
  const [subscribingUrl, setSubscribingUrl] = useState<string | null>(null);
  const [refreshingShowId, setRefreshingShowId] = useState<number | null>(null);
  const [deletingShowId, setDeletingShowId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const normalizedSubscribedUrls = useMemo(() => {
    const set = new Set<string>();
    for (const show of shows) {
      set.add(normalizePodcastUrl(show.feed_url));
    }
    return set;
  }, [shows]);

  function isPresetSubscribed(preset: PresetPodcast): boolean {
    if (normalizedSubscribedUrls.has(normalizePodcastUrl(preset.feedUrl))) return true;
    return Boolean(
      preset.altUrls?.some((alt) => normalizedSubscribedUrls.has(normalizePodcastUrl(alt))),
    );
  }

  async function subscribeFeed(targetUrl: string, label: string, clearInput = false) {
    if (subscribingUrl) return;
    setSubscribingUrl(targetUrl);
    setNotice(null);
    try {
      const result = await siteAdminRequest<{ id: number; inserted: number }>(
        "/api/admin/podcast/shows",
        {
          method: "POST",
          body: JSON.stringify({ feedUrl: targetUrl }),
        },
      );
      if (clearInput) setFeedUrl("");
      setNotice({
        tone: "info",
        text: `已订阅「${label}」，成功拉取 ${result.inserted} 集单集。`,
      });
      await onShowAdded(result.id, result.inserted);
    } catch (error) {
      setNotice({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setSubscribingUrl(null);
    }
  }

  async function handleCustomSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = feedUrl.trim();
    if (!trimmed) return;
    await subscribeFeed(trimmed, trimmed, true);
  }

  async function handleRefresh(showId: number, showTitle: string) {
    if (refreshingShowId !== null || deletingShowId !== null) return;
    setRefreshingShowId(showId);
    setNotice(null);
    try {
      const result = await onRefreshShow(showId, showTitle);
      if (result) {
        setNotice({
          tone: "info",
          text: `《${showTitle}》刷新完成，新增 ${result.inserted} 集。`,
        });
      }
    } catch (error) {
      setNotice({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setRefreshingShowId(null);
    }
  }

  async function handleRemove(showId: number, showTitle: string) {
    if (deletingShowId !== null || refreshingShowId !== null) return;
    setDeletingShowId(showId);
    setNotice(null);
    try {
      const removed = await onRemoveShow(showId, showTitle);
      if (removed) {
        setConfirmDeleteId(null);
        setNotice({ tone: "info", text: `已取消订阅《${showTitle}》。` });
      }
    } catch (error) {
      setNotice({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setDeletingShowId(null);
    }
  }

  const isSubscribing = subscribingUrl !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="podcast-rss-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <div className="relative max-h-[88dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/50 bg-white/90 p-5 shadow-2xl backdrop-blur-xl sm:p-6 dark:border-white/15 dark:bg-slate-900/90">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-3.5 dark:border-white/10">
          <div>
            <h2
              id="podcast-rss-modal-title"
              className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white"
            >
              <Radio className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              播客 RSS 订阅与管理
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              粘贴任意播客 RSS 订阅链接自动解析封面与单集，或从精选目录一键订阅。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭播客 RSS 管理弹窗"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 transition hover:border-sky-400 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status / Error Banner */}
        {isSubscribing ? (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border border-sky-300/70 bg-sky-50/95 px-3.5 py-2 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/60 dark:text-sky-200"
          >
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>正在解析播客 RSS 并拉取单集…</span>
          </div>
        ) : notice ? (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mt-4 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs ${
              notice.tone === "error"
                ? "border-rose-200 bg-rose-50/95 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-200"
                : "border-sky-300/70 bg-sky-50/95 text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/60 dark:text-sky-200"
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => setNotice(null)}
              className="rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {/* 1. Subscribe by RSS URL */}
        <section className="mt-4 rounded-xl border border-slate-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-800/50">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            通过 RSS 地址订阅
          </h3>
          <form
            onSubmit={(event) => void handleCustomSubmit(event)}
            className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center"
          >
            <input
              type="url"
              required
              maxLength={500}
              value={feedUrl}
              onChange={(event) => setFeedUrl(event.target.value)}
              placeholder="https://feed.syntax.fm/"
              aria-label="播客 RSS 地址"
              className="h-9 flex-1 rounded-xl border border-slate-200/90 bg-white/90 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={isSubscribing || !feedUrl.trim()}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-sky-600 px-4 text-xs font-medium text-white shadow-xs transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50"
            >
              {isSubscribing && subscribingUrl === feedUrl.trim() ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              订阅播客
            </button>
          </form>
        </section>

        {/* 2. Curated Podcast RSS Directory */}
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            精选播客源一键订阅
          </h3>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {PRESET_PODCASTS.map((preset) => {
              const subscribed = isPresetSubscribed(preset);
              const busy = subscribingUrl === preset.feedUrl;

              return (
                <div
                  key={preset.feedUrl}
                  className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-200/70 bg-white/65 px-3 py-2.5 dark:border-white/10 dark:bg-slate-800/45"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {preset.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {preset.description}
                    </p>
                  </div>

                  {subscribed ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3 w-3" />
                      已订阅
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubscribing}
                      onClick={() => void subscribeFeed(preset.feedUrl, preset.title)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-400/60 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-600 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-600 dark:hover:text-white"
                    >
                      {busy ? (
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      {busy ? "订阅中…" : "订阅"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. Subscribed Shows Management */}
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            已订阅节目 ({shows.length})
          </h3>

          {shows.length === 0 ? (
            <div className="mt-2.5 rounded-xl border border-slate-200/70 bg-white/60 py-6 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
              暂未订阅任何播客节目，上方粘贴链接或点击精选节目即可开始。
            </div>
          ) : (
            <div className="mt-2.5 divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/70 bg-white/65 dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
              {shows.map((show) => {
                const refreshing = refreshingShowId === show.id;
                const deleting = deletingShowId === show.id;
                const confirming = confirmDeleteId === show.id;
                const rowBusy = refreshing || deleting;

                return (
                  <div
                    key={show.id}
                    className="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 dark:bg-slate-700/70">
                        {show.cover ? (
                          <img
                            src={show.cover}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-base">🎧</div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {show.title}
                          </span>
                          {show.last_error ? (
                            <span
                              title={show.last_error}
                              className="inline-flex max-w-52 items-center gap-1 truncate rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                            >
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{show.last_error}</span>
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {[
                            show.author || "未知主播",
                            `${show.episode_count} 集`,
                            show.last_checked_at
                              ? `上次同步 ${formatRelativeTime(show.last_checked_at)}`
                              : "未同步",
                          ].join(" · ")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                      <button
                        type="button"
                        disabled={rowBusy || isSubscribing}
                        onClick={() => void handleRefresh(show.id, show.title)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 text-[11px] font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:text-sky-300"
                      >
                        <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "刷新中…" : "刷新本节目"}
                      </button>

                      {confirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void handleRemove(show.id, show.title)}
                            className="h-7 rounded-lg bg-rose-600 px-2.5 text-[11px] font-medium text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50"
                          >
                            {deleting ? "取消中…" : "确认取消"}
                          </button>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-7 rounded-lg border border-slate-200/80 bg-white/80 px-2 text-[11px] text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-300"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={rowBusy || isSubscribing}
                          onClick={() => setConfirmDeleteId(show.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 text-[11px] font-medium text-slate-600 transition hover:border-rose-300 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3 w-3" />
                          取消订阅
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

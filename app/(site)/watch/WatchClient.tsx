"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, Film, Loader2, Pencil, Plus, Search, Sparkles, Star, Trash2, Tv, X } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import RatingStars from "@/components/site/RatingStars";
import { formatDate } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type { WatchItemView, WatchStatus } from "@/server/modules/watch/contracts";

export type WatchKindFilter = WatchItemView["kind"] | "all";
export type WatchSortMode = "updated" | "rating" | "year";

const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: "在看",
  want: "想看",
  done: "看完",
  dropped: "弃了",
};

const STATUS_ORDER: Array<{ key: WatchStatus | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "watching", label: "在看" },
  { key: "want", label: "想看" },
  { key: "done", label: "看完" },
  { key: "dropped", label: "弃了" },
];

const KIND_LABEL: Record<WatchItemView["kind"], string> = {
  movie: "电影",
  tv: "剧集",
  anime: "动画",
};

const KIND_TABS: Array<{ key: WatchKindFilter; label: string }> = [
  { key: "all", label: "全部类型" },
  { key: "movie", label: "电影" },
  { key: "tv", label: "剧集" },
  { key: "anime", label: "动画" },
];

function KindIcon({ kind, className }: { kind: WatchItemView["kind"]; className?: string }) {
  if (kind === "movie") return <Film className={className} />;
  if (kind === "tv") return <Tv className={className} />;
  return <Sparkles className={className} />;
}

function WatchPoster({
  src,
  title,
  kind,
}: {
  src: string;
  title: string;
  kind: WatchItemView["kind"];
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const monogram = title.trim().slice(0, 1) || "影";

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 海报来自上传或外链
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailedSrc(src)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-sky-500/15 via-slate-500/10 to-slate-500/20 p-4 text-center dark:from-sky-500/20 dark:via-slate-800/60 dark:to-slate-900/80">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/40 bg-white/60 text-xl font-bold text-sky-700 shadow-sm dark:border-white/10 dark:bg-slate-800/80 dark:text-sky-300">
        {monogram}
      </span>
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
        <KindIcon kind={kind} className="h-3 w-3" />
        {KIND_LABEL[kind]}
      </span>
    </div>
  );
}

export default function WatchClient({
  items,
  initialStatus,
  initialKind,
  initialQuery,
  initialSort,
  isAdmin,
}: {
  items: WatchItemView[];
  initialStatus: WatchStatus | "all";
  initialKind: WatchKindFilter;
  initialQuery: string;
  initialSort: WatchSortMode;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<WatchStatus | "all">(initialStatus);
  const [kind, setKind] = useState<WatchKindFilter>(initialKind);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<WatchSortMode>(initialSort);
  const [activeItem, setActiveItem] = useState<WatchItemView | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 管理员弹窗：新增/编辑、两步删除
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchItemView | null>(null);
  const [formKind, setFormKind] = useState<WatchItemView["kind"]>("movie");
  const [formTitle, setFormTitle] = useState("");
  const [formYear, setFormYear] = useState("");
  const [formStatus, setFormStatus] = useState<WatchStatus>("want");
  const [formRating, setFormRating] = useState(0);
  const [formProgress, setFormProgress] = useState("");
  const [formPoster, setFormPoster] = useState("");
  const [formOverview, setFormOverview] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  function openCreateModal() {
    setEditingItem(null);
    setFormKind("movie");
    setFormTitle("");
    setFormYear("");
    setFormStatus("want");
    setFormRating(0);
    setFormProgress("");
    setFormPoster("");
    setFormOverview("");
    setFormNote("");
    setFormError(null);
    setEditorOpen(true);
  }

  function openEditModal(item: WatchItemView) {
    setEditingItem(item);
    setFormKind(item.kind);
    setFormTitle(item.title);
    setFormYear(item.year !== null ? String(item.year) : "");
    setFormStatus(item.status);
    setFormRating(item.rating);
    setFormProgress(item.progress);
    setFormPoster(item.poster);
    setFormOverview(item.overview);
    setFormNote(item.note);
    setFormError(null);
    setEditorOpen(true);
  }

  async function handleSaveWatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setFormError("片名不能为空");
      return;
    }

    const trimmedYear = formYear.trim();
    let parsedYear: number | null = null;
    if (trimmedYear) {
      const n = Number(trimmedYear);
      if (!Number.isInteger(n) || n < 1888 || n > 2100) {
        setFormError("年份需为 1888 到 2100 之间的整数");
        return;
      }
      parsedYear = n;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        kind: formKind,
        title: trimmedTitle,
        year: parsedYear,
        status: formStatus,
        rating: formRating,
        progress: formProgress.trim(),
        poster: formPoster.trim(),
        overview: formOverview.trim(),
        note: formNote.trim(),
      };
      const saved = editingItem
        ? await siteAdminRequest<WatchItemView>(`/api/admin/watch/${editingItem.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await siteAdminRequest<WatchItemView>("/api/admin/watch", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      if (activeItem && editingItem && activeItem.id === editingItem.id) {
        setActiveItem(saved);
      }
      setEditorOpen(false);
      router.refresh();
    } catch (error) {
      setFormError(describeSiteAdminError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteWatch(id: number) {
    if (deleting) return;
    setDeleting(true);
    setDetailError(null);
    try {
      await siteAdminRequest(`/api/admin/watch/${id}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      setActiveItem(null);
      router.refresh();
    } catch (error) {
      setDetailError(describeSiteAdminError(error));
    } finally {
      setDeleting(false);
    }
  }

  // 同步筛选条件到地址栏（保留 #watch-{id} 锚点，支持分享与返回）。
  useEffect(() => {
    const url = new URL(window.location.href);
    if (status === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", status);

    if (kind === "all") url.searchParams.delete("kind");
    else url.searchParams.set("kind", kind);

    const trimmed = query.trim();
    if (!trimmed) url.searchParams.delete("q");
    else url.searchParams.set("q", trimmed);

    if (sort === "updated") url.searchParams.delete("sort");
    else url.searchParams.set("sort", sort);

    window.history.replaceState(null, "", url);
  }, [status, kind, query, sort]);

  // 详情/编辑弹窗支持 Escape 关闭。
  useEffect(() => {
    if (!activeItem && !editorOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editorOpen) {
          if (!saving) setEditorOpen(false);
          return;
        }
        setConfirmDeleteId(null);
        setDetailError(null);
        setActiveItem(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, editorOpen, saving]);

  const statusCounts = useMemo(() => {
    const counts: Record<WatchStatus | "all", number> = {
      all: items.length,
      watching: 0,
      want: 0,
      done: 0,
      dropped: 0,
    };
    for (const item of items) {
      counts[item.status] += 1;
    }
    return counts;
  }, [items]);

  const kindCounts = useMemo(() => {
    const counts: Record<WatchKindFilter, number> = {
      all: items.length,
      movie: 0,
      tv: 0,
      anime: 0,
    };
    for (const item of items) {
      counts[item.kind] += 1;
    }
    return counts;
  }, [items]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (kind !== "all" && item.kind !== kind) return false;
      if (!keyword) return true;
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.note.toLowerCase().includes(keyword) ||
        item.overview.toLowerCase().includes(keyword) ||
        String(item.year ?? "").includes(keyword)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "rating") {
        if (b.rating !== a.rating) return b.rating - a.rating;
      } else if (sort === "year") {
        const yearA = a.year ?? 0;
        const yearB = b.year ?? 0;
        if (yearB !== yearA) return yearB - yearA;
      }
      return b.updated_at.localeCompare(a.updated_at) || b.id - a.id;
    });
  }, [items, status, kind, query, sort]);

  const editorModal = editorOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="watch-editor-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) setEditorOpen(false);
      }}
    >
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/40 bg-white/95 p-5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="watch-editor-title" className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">
            {editingItem ? "编辑影视记录" : "记录影视"}
          </h2>
          <button
            type="button"
            onClick={() => !saving && setEditorOpen(false)}
            aria-label="关闭影视编辑弹窗"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSaveWatch} className="space-y-3.5 text-sm">
          {formError ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
            >
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">类型</span>
              <select
                value={formKind}
                onChange={(event) => setFormKind(event.target.value as WatchItemView["kind"])}
                className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
              >
                <option value="movie">电影</option>
                <option value="tv">剧集</option>
                <option value="anime">动画</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">状态</span>
              <select
                value={formStatus}
                onChange={(event) => setFormStatus(event.target.value as WatchStatus)}
                className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
              >
                <option value="want">想看</option>
                <option value="watching">在看</option>
                <option value="done">看完</option>
                <option value="dropped">弃了</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              片名 <span className="text-rose-500">*</span>
            </span>
            <input
              required
              maxLength={200}
              value={formTitle}
              onChange={(event) => setFormTitle(event.target.value)}
              placeholder="例如：葬送的芙莉莲"
              className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">年份</span>
              <input
                type="number"
                min={1888}
                max={2100}
                value={formYear}
                onChange={(event) => setFormYear(event.target.value)}
                placeholder="例如：2024"
                className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">观看进度</span>
              <input
                maxLength={20}
                value={formProgress}
                onChange={(event) => setFormProgress(event.target.value)}
                placeholder="例如：EP06/12"
                className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300">个人评分</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= formRating;
                return (
                  <button
                    key={star}
                    type="button"
                    aria-label={`${star} 星`}
                    aria-pressed={formRating === star}
                    onClick={() => setFormRating(formRating === star ? 0 : star)}
                    className="rounded-lg p-1 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-sky-500"
                  >
                    <Star
                      className={`h-5 w-5 ${
                        active
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-300 dark:text-slate-600"
                      }`}
                    />
                  </button>
                );
              })}
              <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                {formRating > 0 ? `${formRating} / 5 星` : "未评分"}
              </span>
              {formRating > 0 ? (
                <button
                  type="button"
                  onClick={() => setFormRating(0)}
                  className="ml-auto rounded-full px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-500/10 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  清除评分
                </button>
              ) : null}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">海报 URL</span>
            <input
              maxLength={1000}
              value={formPoster}
              onChange={(event) => setFormPoster(event.target.value)}
              placeholder="https://..."
              className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">剧情简介</span>
            <textarea
              rows={2}
              maxLength={1000}
              value={formOverview}
              onChange={(event) => setFormOverview(event.target.value)}
              placeholder="简要记录剧情梗概…"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">短评</span>
            <textarea
              rows={2}
              maxLength={1000}
              value={formNote}
              onChange={(event) => setFormNote(event.target.value)}
              placeholder="写下你的观影感想…"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => !saving && setEditorOpen(false)}
              className="rounded-full border border-slate-200/80 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:text-slate-300"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "保存中…" : editingItem ? "保存修改" : "保存记录"}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  if (items.length === 0) {
    return (
      <>
        <GlassPanel as="div" tone="soft" padding="lg" className="text-center text-sm text-slate-500 dark:text-slate-400">
          <p>还没有影视记录。</p>
          {isAdmin ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                记录影视
              </button>
              <Link href="/admin/watch" className="text-xs text-sky-600 underline dark:text-sky-300">
                去后台「影视」管理
              </Link>
            </div>
          ) : (
            <p className="mt-1">管理员添加后即可查看。</p>
          )}
        </GlassPanel>
        {editorModal}
      </>
    );
  }

  const hasFilters = status !== "all" || kind !== "all" || query.trim() !== "";

  return (
    <div className="space-y-4">
      {/* 状态筛选（带精确计数） */}
      <FilterTabs
        items={STATUS_ORDER.map((tab) => ({
          key: tab.key,
          label: `${tab.label} (${statusCounts[tab.key]})`,
        }))}
        value={status}
        onChange={(next) => setStatus(next)}
        aria-label="影视状态筛选"
      />

      {/* 二级工具栏：类型胶囊 + 搜索 + 排序 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="影视类型筛选">
          {KIND_TABS.map((tab) => {
            const active = kind === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(tab.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  active
                    ? "border-sky-500 bg-sky-500 text-white"
                    : "border-white/40 bg-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
                }`}
              >
                {tab.label}
                <span className={`ml-1 tabular-nums ${active ? "text-white/85" : "text-slate-400"}`}>
                  {kindCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜片名、年份、简介或短评"
              aria-label="搜索影视"
              className="h-8 w-48 rounded-full border border-white/40 bg-white/60 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 sm:w-56"
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-1.5 grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as WatchSortMode)}
            aria-label="影视排序"
            className="h-8 rounded-full border border-white/40 bg-white/60 px-3 text-xs text-slate-700 focus:border-sky-300 focus:outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200"
          >
            <option value="updated">最近更新</option>
            <option value="rating">评分最高</option>
            <option value="year">年份最新</option>
          </select>

          {isAdmin ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-sky-600 px-3 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              记录影视
            </button>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <AsyncState
          compact
          tone="empty"
          title="没有符合筛选条件的影视"
          description="试试调整状态、类型或清空搜索词。"
          actionLabel={hasFilters ? "重置筛选" : undefined}
          onAction={
            hasFilters
              ? () => {
                  setStatus("all");
                  setKind("all");
                  setQuery("");
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <GlassPanel
              as="article"
              key={item.id}
              id={`watch-${item.id}`}
              className="group scroll-mt-20 overflow-hidden transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:shadow-lg"
            >
              <button
                type="button"
                onClick={() => setActiveItem(item)}
                aria-label={`查看《${item.title}》详情`}
                className="flex h-full w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-200/60 dark:bg-slate-700/60">
                  <WatchPoster
                    key={item.poster}
                    src={item.poster}
                    title={item.title}
                    kind={item.kind}
                  />
                  <span className="absolute right-2 top-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    {STATUS_LABEL[item.status]}
                  </span>
                  {item.progress && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-sky-200 backdrop-blur-sm">
                      {item.progress}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-1 text-sm font-medium text-slate-800 group-hover:text-sky-600 dark:text-slate-100 dark:group-hover:text-sky-300">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {[item.year, KIND_LABEL[item.kind]].filter(Boolean).join(" · ")}
                  </p>
                  {item.rating > 0 && (
                    <span className="mt-1 inline-flex items-center gap-0.5">
                      <RatingStars value={item.rating} size="sm" />
                      <span className="ml-1 text-[11px] tabular-nums text-slate-400">{item.rating}/5</span>
                    </span>
                  )}
                  {(item.note || item.overview) && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.note || item.overview}
                    </p>
                  )}
                </div>
              </button>
            </GlassPanel>
          ))}
        </div>
      )}

      {/* 影视详情弹窗（展示完整海报、进度、剧情简介 overview 与完整短评 note） */}
      {activeItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="watch-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmDeleteId(null);
              setDetailError(null);
              setActiveItem(null);
            }
          }}
        >
          <div className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/40 bg-white/95 p-5 shadow-2xl backdrop-blur-md dark:border-white/15 dark:bg-slate-900/95 sm:p-6">
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteId(null);
                setDetailError(null);
                setActiveItem(null);
              }}
              aria-label="关闭详情弹窗"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 transition hover:border-sky-300 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
              <div className="mx-auto aspect-[2/3] w-40 overflow-hidden rounded-xl border border-white/40 bg-slate-200/60 shadow-md dark:border-white/10 dark:bg-slate-800 sm:w-full">
                <WatchPoster
                  key={`modal-${activeItem.poster}`}
                  src={activeItem.poster}
                  title={activeItem.title}
                  kind={activeItem.kind}
                />
              </div>

              <div className="min-w-0 space-y-3 pr-6 sm:pr-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                      <Clapperboard className="h-3 w-3" />
                      {STATUS_LABEL[activeItem.status]}
                    </span>
                    <span className="rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {KIND_LABEL[activeItem.kind]}
                    </span>
                    {activeItem.year && (
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {activeItem.year} 年
                      </span>
                    )}
                  </div>

                  <h2
                    id="watch-modal-title"
                    className="mt-2 break-words text-lg font-bold text-slate-900 dark:text-white sm:text-xl"
                  >
                    {activeItem.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {activeItem.rating > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <RatingStars value={activeItem.rating} size="md" />
                      <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                        {activeItem.rating} / 5
                      </span>
                    </span>
                  ) : (
                    <span>暂未评分</span>
                  )}
                  {activeItem.progress && (
                    <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">
                      观看进度：{activeItem.progress}
                    </span>
                  )}
                  <span>记录更新：{formatDate(activeItem.updated_at)}</span>
                </div>

                {activeItem.overview && (
                  <div className="rounded-xl bg-slate-500/5 p-3 dark:bg-white/5">
                    <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300">剧情简介</h3>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {activeItem.overview}
                    </p>
                  </div>
                )}

                {activeItem.note ? (
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                    <h3 className="text-xs font-semibold text-sky-700 dark:text-sky-300">我的短评</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {activeItem.note}
                    </p>
                  </div>
                ) : !activeItem.overview ? (
                  <p className="text-xs text-slate-400">暂无剧情简介与短评记录。</p>
                ) : null}

                {isAdmin ? (
                  <div className="space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
                    {detailError ? (
                      <p
                        role="alert"
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-600 dark:text-rose-300"
                      >
                        {detailError}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(activeItem)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-sky-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </button>

                      {confirmDeleteId === activeItem.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => void handleDeleteWatch(activeItem.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-rose-500 disabled:opacity-60"
                          >
                            {deleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            {deleting ? "删除中…" : "确认删除"}
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-full px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-sky-500"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDetailError(null);
                            setConfirmDeleteId(activeItem.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-rose-500 dark:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
      {editorModal}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Cpu, Gamepad2, Loader2, Pencil, Plus, Search, Star, Trash2, Trophy, X } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import RatingStars from "@/components/site/RatingStars";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type { GameItemView, GameStatus } from "@/server/modules/games/contracts";

export type GameSortMode = "group" | "hours" | "rating" | "updated";

const GROUPS: Array<{ key: GameStatus; label: string }> = [
  { key: "playing", label: "在玩" },
  { key: "done", label: "通关" },
  { key: "backlog", label: "愿望单" },
  { key: "dropped", label: "弃坑" },
];

const STATUS_LABEL: Record<GameStatus, string> = {
  playing: "在玩",
  done: "通关",
  backlog: "愿望单",
  dropped: "弃坑",
};

function GameCover({ src, title }: { src: string; title: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const monogram = title.trim().slice(0, 1) || "游";

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailedSrc(src)}
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-sky-500/20 to-slate-500/20 text-sky-700 dark:text-sky-300">
      <span className="text-base font-bold">{monogram}</span>
      <Gamepad2 className="mt-0.5 h-3.5 w-3.5 opacity-70" />
    </div>
  );
}

const PLATFORM_PRESETS = ["PC / Steam", "Switch", "PS5", "Xbox", "移动端"] as const;

export default function GamesClient({
  items,
  initialStatus,
  initialPlatform,
  initialQuery,
  initialSort,
  isAdmin,
}: {
  items: GameItemView[];
  initialStatus: GameStatus | "all";
  initialPlatform: string;
  initialQuery: string;
  initialSort: GameSortMode;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<GameStatus | "all">(initialStatus);
  const [platform, setPlatform] = useState<string>(initialPlatform);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<GameSortMode>(initialSort);
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 管理员新增/编辑弹窗状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GameItemView | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formPlatform, setFormPlatform] = useState("");
  const [formStatus, setFormStatus] = useState<GameStatus>("playing");
  const [formHours, setFormHours] = useState("0");
  const [formRating, setFormRating] = useState(0);
  const [formCover, setFormCover] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreateModal() {
    setEditingItem(null);
    setFormTitle("");
    setFormPlatform("");
    setFormStatus("playing");
    setFormHours("0");
    setFormRating(0);
    setFormCover("");
    setFormNote("");
    setConfirmDelete(false);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEditModal(item: GameItemView) {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormPlatform(item.platform);
    setFormStatus(item.status);
    setFormHours(String(item.hours));
    setFormRating(item.rating);
    setFormCover(item.cover);
    setFormNote(item.note);
    setConfirmDelete(false);
    setFormError(null);
    setEditorOpen(true);
  }

  function bumpHours(delta: number) {
    const current = Number(formHours);
    const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;
    const next = Math.min(100000, Math.round((safeCurrent + delta) * 10) / 10);
    setFormHours(String(next));
  }

  async function handleSaveGame(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || deleting) return;
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setFormError("游戏名称不能为空");
      return;
    }
    const parsedHours = formHours.trim() === "" ? 0 : Number(formHours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 100000) {
      setFormError("游玩时长需为 0 到 100000 之间的数字");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: trimmedTitle,
        platform: formPlatform.trim(),
        status: formStatus,
        hours: parsedHours,
        rating: formRating,
        cover: formCover.trim(),
        note: formNote.trim(),
      };
      if (editingItem) {
        await siteAdminRequest<GameItemView>(`/api/admin/games/${editingItem.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await siteAdminRequest<GameItemView>("/api/admin/games", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setEditorOpen(false);
      router.refresh();
    } catch (error) {
      setFormError(describeSiteAdminError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGame() {
    if (!editingItem || deleting || saving) return;
    setDeleting(true);
    setFormError(null);
    try {
      await siteAdminRequest(`/api/admin/games/${editingItem.id}`, {
        method: "DELETE",
      });
      setEditorOpen(false);
      router.refresh();
    } catch (error) {
      setFormError(describeSiteAdminError(error));
    } finally {
      setDeleting(false);
    }
  }

  // 编辑弹窗支持 Escape 关闭
  useEffect(() => {
    if (!editorOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving && !deleting) {
        event.preventDefault();
        setEditorOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen, saving, deleting]);

  // 同步筛选与排序到地址栏，保留 #game-{id} 锚点。
  useEffect(() => {
    const url = new URL(window.location.href);
    if (status === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", status);

    if (!platform || platform === "all") url.searchParams.delete("platform");
    else url.searchParams.set("platform", platform);

    const trimmed = query.trim();
    if (!trimmed) url.searchParams.delete("q");
    else url.searchParams.set("q", trimmed);

    if (sort === "group") url.searchParams.delete("sort");
    else url.searchParams.set("sort", sort);

    window.history.replaceState(null, "", url);
  }, [status, platform, query, sort]);

  const careerStats = useMemo(() => {
    const statusCounts: Record<GameStatus | "all", number> = {
      all: items.length,
      playing: 0,
      done: 0,
      backlog: 0,
      dropped: 0,
    };
    let totalHours = 0;
    let maxHours = 1;
    const platformMap = new Map<string, { count: number; hours: number }>();

    for (const item of items) {
      statusCounts[item.status] += 1;
      totalHours += item.hours;
      if (item.hours > maxHours) maxHours = item.hours;
      const plat = item.platform.trim();
      if (plat) {
        const entry = platformMap.get(plat) ?? { count: 0, hours: 0 };
        entry.count += 1;
        entry.hours += item.hours;
        platformMap.set(plat, entry);
      }
    }

    const platforms = [...platformMap.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].hours - a[1].hours)
      .map(([name, meta]) => ({ name, count: meta.count, hours: meta.hours }));

    const completionRate =
      items.length > 0 ? Math.round((statusCounts.done / items.length) * 100) : 0;

    return {
      statusCounts,
      totalHours,
      maxHours,
      platforms,
      topPlatform: platforms[0] ?? null,
      completionRate,
    };
  }, [items]);

  const activePlatform =
    platform !== "all" && careerStats.platforms.some((p) => p.name === platform)
      ? platform
      : "all";

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const base = items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (activePlatform !== "all" && item.platform.trim() !== activePlatform) return false;
      if (!keyword) return true;
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.platform.toLowerCase().includes(keyword) ||
        item.note.toLowerCase().includes(keyword)
      );
    });

    if (sort === "group") return base;
    return [...base].sort((a, b) => {
      if (sort === "hours") {
        if (b.hours !== a.hours) return b.hours - a.hours;
      } else if (sort === "rating") {
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.hours !== a.hours) return b.hours - a.hours;
      }
      return b.updated_at.localeCompare(a.updated_at) || b.id - a.id;
    });
  }, [items, status, activePlatform, query, sort]);

  function toggleExpand(id: number) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function renderCard(item: GameItemView) {
    const expanded = Boolean(expandedIds[item.id]);
    const hourPct =
      item.hours > 0
        ? Math.max(4, Math.min(100, Math.round((item.hours / careerStats.maxHours) * 100)))
        : 0;
    const hasNote = item.note.trim().length > 0;

    return (
      <GlassPanel
        as="article"
        key={item.id}
        id={`game-${item.id}`}
        padding="sm"
        className="flex gap-3 scroll-mt-20 transition hover:border-sky-300/60"
      >
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-200/60 dark:bg-slate-700/60">
          <GameCover key={item.cover} src={item.cover} title={item.title} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {item.title}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  aria-label={`编辑《${item.title}》`}
                  className="inline-flex items-center gap-0.5 rounded-full border border-white/40 bg-white/60 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-sky-300"
                >
                  <Pencil className="h-2.5 w-2.5" />
                  编辑
                </button>
              ) : null}
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                {STATUS_LABEL[item.status]}
              </span>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            {item.platform && (
              <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[11px]">
                {item.platform}
              </span>
            )}
            {item.rating > 0 && (
              <span className="inline-flex items-center gap-1">
                <RatingStars value={item.rating} size="sm" />
                <span className="tabular-nums text-[11px] text-slate-400">{item.rating}/5</span>
              </span>
            )}
          </div>

          {/* 游玩时长比例条 */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span>游玩时长</span>
              <span>{item.hours > 0 ? `${item.hours} h` : "暂未计时"}</span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-500/15"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.ceil(careerStats.maxHours)}
              aria-valuenow={Math.round(item.hours)}
              aria-label={`${item.title} 游玩时长 ${item.hours} 小时`}
            >
              {hourPct > 0 && (
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${hourPct}%` }}
                />
              )}
            </div>
          </div>

          {hasNote && (
            <button
              type="button"
              onClick={() => toggleExpand(item.id)}
              aria-expanded={expanded}
              className="mt-2 flex w-full items-start justify-between gap-1 rounded-lg text-left text-xs text-slate-600 transition hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:text-sky-300"
            >
              <span className={expanded ? "whitespace-pre-wrap leading-relaxed" : "line-clamp-2 leading-relaxed"}>
                {item.note}
              </span>
              <ChevronDown
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                  expanded ? "rotate-180 text-sky-500" : ""
                }`}
              />
            </button>
          )}
        </div>
      </GlassPanel>
    );
  }

  const editorModal = editorOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-editor-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving && !deleting) setEditorOpen(false);
      }}
    >
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/40 bg-white/95 p-5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="game-editor-title" className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">
            {editingItem ? "编辑游戏记录" : "记录游戏"}
          </h2>
          <button
            type="button"
            onClick={() => !saving && !deleting && setEditorOpen(false)}
            aria-label="关闭游戏编辑弹窗"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSaveGame} className="space-y-3.5 text-sm">
          {formError ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
            >
              {formError}
            </p>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              游戏名称 <span className="text-rose-500">*</span>
            </span>
            <input
              required
              maxLength={150}
              value={formTitle}
              onChange={(event) => setFormTitle(event.target.value)}
              placeholder="例如：塞尔达传说：王国之泪"
              className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>

          <div className="space-y-1.5">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">游玩平台</span>
              <input
                maxLength={60}
                value={formPlatform}
                onChange={(event) => setFormPlatform(event.target.value)}
                placeholder="例如：PC / Steam"
                className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="快捷选择平台">
              {PLATFORM_PRESETS.map((preset) => {
                const active = formPlatform.trim() === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFormPlatform(preset)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                      active
                        ? "border-sky-500 bg-sky-500 text-white"
                        : "border-slate-200/80 bg-white/60 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">游玩状态</span>
              <select
                value={formStatus}
                onChange={(event) => setFormStatus(event.target.value as GameStatus)}
                className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
              >
                <option value="playing">在玩</option>
                <option value="done">通关</option>
                <option value="backlog">愿望单</option>
                <option value="dropped">弃坑</option>
              </select>
            </label>

            <div className="space-y-1">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">游玩时长 (h)</span>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step="0.5"
                  value={formHours}
                  onChange={(event) => setFormHours(event.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs tabular-nums text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>
              <div className="flex flex-wrap gap-1">
                {[1, 5, 10].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => bumpHours(delta)}
                    className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-sky-700 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                  >
                    +{delta}h
                  </button>
                ))}
              </div>
            </div>
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
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">封面 URL</span>
            <input
              maxLength={1000}
              value={formCover}
              onChange={(event) => setFormCover(event.target.value)}
              placeholder="https://..."
              className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">简评 / 备注</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={formNote}
              onChange={(event) => setFormNote(event.target.value)}
              placeholder="记录游玩体验、通关感受…"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {editingItem ? (
              confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDeleteGame}
                    className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-rose-500 disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    {deleting ? "删除中…" : "确认删除"}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-full px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-sky-500"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-rose-500 dark:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                  删除
                </button>
              )
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => !saving && !deleting && setEditorOpen(false)}
                className="rounded-full border border-slate-200/80 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:text-slate-300"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? "保存中…" : editingItem ? "保存修改" : "保存记录"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  if (items.length === 0) {
    return (
      <>
        <GlassPanel as="div" tone="soft" padding="lg" className="text-center text-sm text-slate-500 dark:text-slate-400">
          <p>还没有记录。</p>
          {isAdmin ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                记录游戏
              </button>
              <Link href="/admin/games" className="text-xs text-sky-600 underline dark:text-sky-300">
                去后台「游戏」管理
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

  const hasFilters = status !== "all" || activePlatform !== "all" || query.trim() !== "";

  return (
    <div className="space-y-5">
      {/* 游戏生涯统计面板 */}
      <section aria-label="游戏生涯统计" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Gamepad2 className="h-3.5 w-3.5 text-sky-500" />
            作品总数
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-800 dark:text-white">
            {items.length} <span className="text-xs font-normal text-slate-400">款</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            在玩 {careerStats.statusCounts.playing} · 愿望单 {careerStats.statusCounts.backlog}
          </p>
        </GlassPanel>

        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Trophy className="h-3.5 w-3.5 text-sky-500" />
            通关进度
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-800 dark:text-white">
            {careerStats.statusCounts.done}{" "}
            <span className="text-xs font-normal text-sky-600 dark:text-sky-300">
              ({careerStats.completionRate}%)
            </span>
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-500/15" aria-hidden="true">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${careerStats.completionRate}%` }}
            />
          </div>
        </GlassPanel>

        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="h-3.5 w-3.5 text-sky-500" />
            累计游玩时长
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-800 dark:text-white">
            {careerStats.totalHours.toFixed(1)}{" "}
            <span className="text-xs font-normal text-slate-400">小时</span>
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
            单作最高 {careerStats.maxHours > 1 ? `${careerStats.maxHours} h` : `${careerStats.totalHours.toFixed(1)} h`}
          </p>
        </GlassPanel>

        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Cpu className="h-3.5 w-3.5 text-sky-500" />
            常玩平台
          </p>
          <p className="mt-1.5 truncate text-xl font-semibold text-slate-800 dark:text-white">
            {careerStats.topPlatform ? careerStats.topPlatform.name : "—"}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
            {careerStats.topPlatform
              ? `${careerStats.topPlatform.count} 款 · ${careerStats.topPlatform.hours.toFixed(1)} h`
              : "暂未填写平台"}
          </p>
        </GlassPanel>
      </section>

      {/* 状态 FilterTabs */}
      <FilterTabs
        items={[
          { key: "all" as const, label: `全部 (${careerStats.statusCounts.all})` },
          { key: "playing" as const, label: `在玩 (${careerStats.statusCounts.playing})` },
          { key: "done" as const, label: `通关 (${careerStats.statusCounts.done})` },
          { key: "backlog" as const, label: `愿望单 (${careerStats.statusCounts.backlog})` },
          { key: "dropped" as const, label: `弃坑 (${careerStats.statusCounts.dropped})` },
        ]}
        value={status}
        onChange={(next) => setStatus(next)}
        aria-label="游戏状态筛选"
      />

      {/* 平台筛选胶囊 + 搜索 + 排序 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {careerStats.platforms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="游戏平台筛选">
            <button
              type="button"
              aria-pressed={activePlatform === "all"}
              onClick={() => setPlatform("all")}
              className={`rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                activePlatform === "all"
                  ? "border-sky-500 bg-sky-500 text-white"
                  : "border-white/40 bg-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
              }`}
            >
              全部平台
            </button>
            {careerStats.platforms.map((entry) => {
              const active = activePlatform === entry.name;
              return (
                <button
                  key={entry.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPlatform(entry.name)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    active
                      ? "border-sky-500 bg-sky-500 text-white"
                      : "border-white/40 bg-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
                  }`}
                >
                  {entry.name}
                  <span className={`ml-1 tabular-nums ${active ? "text-white/85" : "text-slate-400"}`}>
                    {entry.count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索游戏、平台或短评"
              aria-label="搜索游戏"
              className="h-8 w-44 rounded-full border border-white/40 bg-white/60 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 sm:w-52"
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
            onChange={(event) => setSort(event.target.value as GameSortMode)}
            aria-label="游戏排序"
            className="h-8 rounded-full border border-white/40 bg-white/60 px-3 text-xs text-slate-700 focus:border-sky-300 focus:outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200"
          >
            <option value="group">按状态分组</option>
            <option value="hours">游玩时长↓</option>
            <option value="rating">评分最高↓</option>
            <option value="updated">最近更新↓</option>
          </select>

          {isAdmin ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-sky-600 px-3 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              记录游戏
            </button>
          ) : null}
        </div>
      </div>

      {/* 游戏卡片列表 */}
      {filtered.length === 0 ? (
        <AsyncState
          compact
          tone="empty"
          title="没有匹配的游戏"
          description="试试切换状态、平台或清空搜索关键词。"
          actionLabel={hasFilters ? "重置筛选" : undefined}
          onAction={
            hasFilters
              ? () => {
                  setStatus("all");
                  setPlatform("all");
                  setQuery("");
                }
              : undefined
          }
        />
      ) : sort === "group" ? (
        <div className="space-y-6">
          {GROUPS.map((group) => {
            const list = filtered.filter((item) => item.status === group.key);
            if (list.length === 0) return null;
            return (
              <section key={group.key}>
                <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                  {group.label}（{list.length}）
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((item) => renderCard(item))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => renderCard(item))}
        </div>
      )}
      {editorModal}
    </div>
  );
}

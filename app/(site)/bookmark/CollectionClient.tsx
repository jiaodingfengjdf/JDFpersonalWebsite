"use client";
/* eslint-disable @next/next/no-img-element -- 封面来自后台上传或外链，域名不可预知 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import GlassPanel from "@/components/site/GlassPanel";
import RatingStars from "@/components/site/RatingStars";
import { formatDate } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type {
  CollectionItem,
  CollectionKind,
  CollectionQuery,
  CollectionStatus,
} from "@/server/modules/collection/contracts";

type ViewMode = "grid" | "list";

const KIND_TABS: Array<{ key: CollectionKind | "all"; label: string; emoji: string }> = [
  { key: "all", label: "全部", emoji: "✦" },
  { key: "link", label: "站点", emoji: "🔗" },
  { key: "movie", label: "影视", emoji: "🎬" },
  { key: "music", label: "音乐", emoji: "🎵" },
  { key: "book", label: "书籍", emoji: "📚" },
  { key: "product", label: "好物", emoji: "🛒" },
  { key: "idea", label: "灵感", emoji: "💡" },
];

const STATUS_TABS: Array<{ key: CollectionStatus | "all"; label: string }> = [
  { key: "all", label: "全部状态" },
  { key: "saved", label: "已收藏" },
  { key: "doing", label: "进行中" },
  { key: "done", label: "已完成" },
  { key: "dropped", label: "已弃" },
];

const STATUS_LABEL: Record<CollectionStatus, string> = {
  saved: "已收藏",
  doing: "进行中",
  done: "已完成",
  dropped: "已弃",
};

const STATUS_BADGE_CLASS: Record<CollectionStatus, string> = {
  saved: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  doing: "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  dropped: "bg-slate-500/15 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
};

function coverOf(item: CollectionItem): string {
  if (item.cover) return item.cover;
  if (item.kind === "link" && item.url) {
    try {
      return `${new URL(item.url).origin}/favicon.ico`;
    } catch {
      return "";
    }
  }
  return "";
}

export default function CollectionClient({
  items,
  counts,
  categories,
  total,
  filters,
  failed,
  initialView = "grid",
  isAdmin = false,
  includePrivate = false,
}: {
  items: CollectionItem[];
  counts: Record<string, number>;
  categories: Array<{ id: number; name: string }>;
  total: number;
  filters: CollectionQuery;
  failed: boolean;
  initialView?: ViewMode;
  isAdmin?: boolean;
  includePrivate?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(filters.q ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [previewItem, setPreviewItem] = useState<CollectionItem | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 管理员新增/编辑/删除状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [formKind, setFormKind] = useState<CollectionKind>("link");
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formAuthor, setFormAuthor] = useState("");
  const [formCover, setFormCover] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formTagsText, setFormTagsText] = useState("");
  const [formStatus, setFormStatus] = useState<CollectionStatus>("saved");
  const [formRating, setFormRating] = useState(0);
  const [formIsPublic, setFormIsPublic] = useState(true);
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const pages = Math.max(1, Math.ceil(total / filters.size));
  const publicTotal = Object.values(counts).reduce((sum, value) => sum + value, 0);

  function href(
    overrides: Partial<CollectionQuery> & { view?: ViewMode; private?: boolean } = {},
  ): string {
    const params = new URLSearchParams();
    const next = { ...filters, page: 1, ...overrides };
    const nextView = overrides.view ?? viewMode;
    const nextPrivate = overrides.private !== undefined ? overrides.private : includePrivate;

    if (next.kind) params.set("kind", next.kind);
    if (next.status) params.set("status", next.status);
    if (next.category) params.set("category", String(next.category));
    if (next.q) params.set("q", next.q);
    if (next.tag) params.set("tag", next.tag);
    if (next.page > 1) params.set("page", String(next.page));
    if (nextView === "list") params.set("view", "list");
    if (isAdmin && nextPrivate) params.set("private", "1");

    return params.size ? `/bookmark?${params.toString()}` : "/bookmark";
  }

  function openCreateModal() {
    setEditingItem(null);
    setFormKind("link");
    setFormTitle("");
    setFormUrl("");
    setFormAuthor("");
    setFormCover("");
    setFormCategoryId("");
    setFormTagsText("");
    setFormStatus("saved");
    setFormRating(0);
    setFormIsPublic(true);
    setFormNote("");
    setFormError(null);
    setEditorOpen(true);
  }

  function openEditModal(item: CollectionItem) {
    setEditingItem(item);
    setFormKind(item.kind);
    setFormTitle(item.title);
    setFormUrl(item.url);
    setFormAuthor(item.author);
    setFormCover(item.cover);
    setFormCategoryId(item.category_id !== null ? String(item.category_id) : "");
    setFormTagsText(item.tags.join(", "));
    setFormStatus(item.status);
    setFormRating(item.rating);
    setFormIsPublic(item.is_public);
    setFormNote(item.note);
    setFormError(null);
    setEditorOpen(true);
  }

  async function handleSaveCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setFormError("标题不能为空");
      return;
    }

    const tags = formTagsText
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        kind: formKind,
        title: trimmedTitle,
        url: formUrl.trim(),
        author: formAuthor.trim(),
        cover: formCover.trim(),
        category_id: formCategoryId ? Number(formCategoryId) : null,
        tags,
        status: formStatus,
        rating: formRating,
        is_public: formIsPublic,
        note: formNote.trim(),
      };
      const saved = editingItem
        ? await siteAdminRequest<CollectionItem>(`/api/admin/collection/${editingItem.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await siteAdminRequest<CollectionItem>("/api/admin/collection", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      if (previewItem && editingItem && previewItem.id === editingItem.id) {
        setPreviewItem(saved);
      }
      setEditorOpen(false);
      router.refresh();
    } catch (error) {
      setFormError(describeSiteAdminError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCollection(id: number) {
    if (deleting) return;
    setDeleting(true);
    setPreviewError(null);
    try {
      await siteAdminRequest(`/api/admin/collection/${id}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      setPreviewItem(null);
      router.refresh();
    } catch (error) {
      setPreviewError(describeSiteAdminError(error));
    } finally {
      setDeleting(false);
    }
  }

  function changeView(next: ViewMode) {
    setViewMode(next);
    router.replace(href({ page: filters.page, view: next }), { scroll: false });
  }

  async function copyItemLink(item: CollectionItem) {
    const targetUrl =
      /^https?:\/\//i.test(item.url)
        ? item.url
        : `${window.location.origin}/bookmark?q=${encodeURIComponent(item.title)}#collection-${item.id}`;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopiedId(item.id);
      setTimeout(() => {
        setCopiedId((current) => (current === item.id ? null : current));
      }, 2000);
    } catch {
      // Clipboard API may fail in insecure contexts; ignore silently.
    }
  }

  // Close Modals on Escape
  useEffect(() => {
    if (!previewItem && !editorOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editorOpen) {
          if (!saving) setEditorOpen(false);
          return;
        }
        setConfirmDeleteId(null);
        setPreviewError(null);
        setPreviewItem(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewItem, editorOpen, saving]);

  const hasActiveFilters = Boolean(
    filters.kind || filters.status || filters.category || filters.q || filters.tag,
  );

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <Bookmark className="h-6 w-6 text-sky-500 md:h-7 md:w-7" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white md:text-3xl">
              收藏中心
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {hasActiveFilters
              ? `筛选匹配 ${total} 条 · ${includePrivate ? "含私密总计" : "公开总计"} ${publicTotal} 条`
              : `共 ${total} 条${includePrivate ? "收藏（含私密）" : "公开收藏"} · 涵盖站点、影视、音乐、书籍、好物与灵感`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              添加收藏
            </button>
          ) : null}

          {/* View Toggle */}
          <div
            role="group"
            aria-label="收藏视图切换"
            className="inline-flex rounded-full border border-white/50 bg-white/60 p-0.5 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/60"
          >
            <button
              type="button"
              aria-pressed={viewMode === "grid"}
              onClick={() => changeView("grid")}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                viewMode === "grid"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              卡片视图
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "list"}
              onClick={() => changeView("list")}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                viewMode === "list"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              紧凑列表
            </button>
          </div>
        </div>
      </motion.div>

      {/* Filter Panel */}
      <GlassPanel padding="sm" className="mb-6 space-y-3 bg-white/50 p-3.5 dark:bg-slate-800/50">
        {/* Row 1: Kind Tabs */}
        <div className="flex flex-wrap gap-1.5" aria-label="收藏类型筛选">
          {KIND_TABS.map((tab) => {
            const count = tab.key === "all" ? publicTotal : (counts[tab.key] ?? 0);
            const active = (filters.kind ?? "all") === tab.key;
            return (
              <Link
                key={tab.key}
                href={href({ kind: tab.key === "all" ? undefined : tab.key })}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 sm:text-sm ${
                  active
                    ? "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : "border-white/40 bg-white/50 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300"
                }`}
              >
                <span aria-hidden="true">{tab.emoji}</span>
                {tab.label}
                <span className="text-xs tabular-nums opacity-65">{count}</span>
              </Link>
            );
          })}
        </div>

        {/* Row 2: Status Pills + Category Select + Search Form */}
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" aria-label="收藏状态筛选">
            {STATUS_TABS.map((statusTab) => {
              const active = (filters.status ?? "all") === statusTab.key;
              return (
                <Link
                  key={statusTab.key}
                  href={href({
                    status: statusTab.key === "all" ? undefined : statusTab.key,
                  })}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 ${
                    active
                      ? "border-sky-500 bg-sky-600 text-white"
                      : "border-white/40 bg-white/45 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300"
                  }`}
                >
                  {statusTab.label}
                </Link>
              );
            })}
            {isAdmin ? (
              <Link
                href={href({ private: !includePrivate, page: 1 })}
                aria-current={includePrivate ? "page" : undefined}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 ${
                  includePrivate
                    ? "border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "border-white/40 bg-white/45 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300"
                }`}
              >
                <Lock className="h-3 w-3" />
                含私密收藏
              </Link>
            ) : null}
          </div>

          <form
            noValidate
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(href({ q: query.trim() || undefined }));
            }}
          >
            {categories.length > 0 ? (
              <select
                aria-label="收藏分类"
                value={filters.category ?? "all"}
                onChange={(event) =>
                  router.push(
                    href({
                      category: Number(event.target.value) || undefined,
                      q: query.trim() || undefined,
                    }),
                  )
                }
                className="h-9 rounded-full border border-white/50 bg-white/75 px-3 text-xs font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
              >
                <option value="all">全部分类</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : null}

            <div className="relative min-w-44 flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                aria-label="搜索收藏"
                maxLength={100}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜标题、作者、标签、备注…"
                className="h-9 w-full rounded-full border border-white/50 bg-white/80 pl-9 pr-9 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 sm:text-sm dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-100"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="清除收藏搜索"
                  className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-200/60 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                    if (filters.q) router.push(href({ q: undefined }));
                  }}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <button
              type="submit"
              className="h-9 rounded-full bg-sky-600 px-4 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 sm:text-sm"
            >
              搜索
            </button>
          </form>
        </div>

        {/* Active Tag / Reset Strip */}
        {filters.tag || hasActiveFilters ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/35 pt-2.5 text-xs dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              {filters.tag ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 font-medium text-sky-700 dark:text-sky-300">
                  <Tag className="h-3 w-3" />
                  标签：{filters.tag}
                  <Link
                    href={href({ tag: undefined })}
                    aria-label={`移除标签 ${filters.tag}`}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-sky-500/20"
                  >
                    <X className="h-3 w-3" />
                  </Link>
                </span>
              ) : null}
            </div>
            {hasActiveFilters ? (
              <Link
                href={href({
                  kind: undefined,
                  status: undefined,
                  category: undefined,
                  q: undefined,
                  tag: undefined,
                  page: 1,
                })}
                className="font-medium text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
              >
                清除全部筛选
              </Link>
            ) : null}
          </div>
        ) : null}
      </GlassPanel>

      {/* Main Content */}
      {failed ? (
        <AsyncState
          tone="error"
          title="收藏暂时无法加载"
          description="数据请求未成功，请点击下方按钮重新加载。"
          actionLabel="重试"
          onAction={() => router.refresh()}
        />
      ) : items.length === 0 ? (
        <AsyncState
          tone="empty"
          title={publicTotal ? "没有符合当前条件的收藏" : "还没有公开收藏"}
          description={
            publicTotal ? "试试切换分类、状态或清空关键词查看其它收藏条目。" : undefined
          }
          actionLabel={publicTotal > 0 ? "查看全部收藏" : undefined}
          actionHref={
            publicTotal > 0
              ? href({
                  kind: undefined,
                  status: undefined,
                  category: undefined,
                  q: undefined,
                  tag: undefined,
                  page: 1,
                })
              : undefined
          }
        />
      ) : viewMode === "grid" ? (
        /* Card Grid View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const cover = coverOf(item);
            const badge = KIND_TABS.find((tab) => tab.key === item.kind);
            const hasExternalUrl = /^https?:\/\//i.test(item.url);

            return (
              <motion.div
                key={item.id}
                id={`collection-${item.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.025, 0.25) }}
                className="scroll-mt-24"
              >
                <GlassPanel
                  as="article"
                  padding="md"
                  className="group flex h-full flex-col justify-between bg-white/55 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-800/55"
                >
                  <div className="flex gap-3.5">
                    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 shadow-xs dark:bg-slate-700/70">
                      <div className="grid h-full w-full place-items-center text-lg">
                        {badge?.emoji ?? "✦"}
                      </div>
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
                            {badge?.label ?? item.kind}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              STATUS_BADGE_CLASS[item.status] ?? STATUS_BADGE_CLASS.saved
                            }`}
                          >
                            {STATUS_LABEL[item.status] ?? item.status}
                          </span>
                          {!item.is_public ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              <Lock className="h-2.5 w-2.5" />
                              私密
                            </span>
                          ) : null}
                        </div>
                        {item.rating > 0 ? <RatingStars value={item.rating} size="sm" /> : null}
                      </div>

                      <h2 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">
                        {hasExternalUrl ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-baseline gap-1 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-sky-400"
                          >
                            <span>{item.title}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 translate-y-0.5 opacity-60" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="text-left hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-sky-400"
                          >
                            {item.title}
                          </button>
                        )}
                      </h2>

                      {(item.author || item.category_name) ? (
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {[item.author, item.category_name].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}

                      {item.note ? (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          {item.note}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/40 pt-2.5 dark:border-white/10">
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {item.tags.slice(0, 3).map((tag) => (
                        <Link
                          key={tag}
                          href={href({ tag })}
                          className="max-w-24 truncate rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                        >
                          #{tag}
                        </Link>
                      ))}
                      {item.tags.length > 3 ? (
                        <span className="text-[10px] text-slate-400">+{item.tags.length - 3}</span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      aria-label={`查看《${item.title}》完整详情`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-sky-300"
                    >
                      <Eye className="h-3 w-3" />
                      速览
                    </button>
                  </div>
                </GlassPanel>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* Compact List View */
        <GlassPanel className="divide-y divide-white/40 overflow-hidden bg-white/55 dark:divide-white/10 dark:bg-slate-800/55">
          {items.map((item) => {
            const cover = coverOf(item);
            const badge = KIND_TABS.find((tab) => tab.key === item.kind);
            const hasExternalUrl = /^https?:\/\//i.test(item.url);

            return (
              <article
                key={item.id}
                id={`collection-${item.id}`}
                className="flex scroll-mt-24 flex-col gap-2.5 px-4 py-3.5 transition-colors hover:bg-white/30 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-white/5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 dark:bg-slate-700/70">
                    <div className="grid h-full w-full place-items-center text-base">
                      {badge?.emoji ?? "✦"}
                    </div>
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
                        {badge?.label ?? item.kind}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          STATUS_BADGE_CLASS[item.status] ?? STATUS_BADGE_CLASS.saved
                        }`}
                      >
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                      {item.rating > 0 ? <RatingStars value={item.rating} size="sm" /> : null}
                      {(item.author || item.category_name) ? (
                        <span className="truncate text-xs text-slate-400">
                          · {[item.author, item.category_name].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {hasExternalUrl ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-baseline gap-1 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-sky-400"
                        >
                          <span>{item.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 translate-y-0.5 opacity-60" />
                        </a>
                      ) : (
                        item.title
                      )}
                    </h2>

                    {item.note ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:justify-end">
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag) => (
                      <Link
                        key={tag}
                        href={href({ tag })}
                        className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewItem(item)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300"
                  >
                    <Eye className="h-3 w-3" />
                    详情速览
                  </button>
                </div>
              </article>
            );
          })}
        </GlassPanel>
      )}

      {/* Pagination */}
      {pages > 1 ? (
        <nav
          aria-label="收藏分页"
          className="mt-6 flex items-center justify-center gap-4 text-sm text-slate-700 dark:text-slate-200"
        >
          {filters.page > 1 ? (
            <Link
              className="rounded-full border border-white/50 bg-white/55 px-3.5 py-1.5 text-xs font-medium hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/60"
              href={href({ page: filters.page - 1 })}
            >
              上一页
            </Link>
          ) : null}
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            第 {filters.page} / {pages} 页
          </span>
          {filters.page < pages ? (
            <Link
              className="rounded-full border border-white/50 bg-white/55 px-3.5 py-1.5 text-xs font-medium hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/60"
              href={href({ page: filters.page + 1 })}
            >
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}

      {/* Quick Preview Modal */}
      {previewItem ? (
        <div
          role="presentation"
          onClick={() => {
            setConfirmDeleteId(null);
            setPreviewError(null);
            setPreviewItem(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookmark-preview-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/50 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6 dark:border-white/15 dark:bg-slate-900/95"
          >
            {(() => {
              const badge = KIND_TABS.find((tab) => tab.key === previewItem.kind);
              const cover = coverOf(previewItem);
              const hasExternalUrl = /^https?:\/\//i.test(previewItem.url);
              const metaEntries = Object.entries(previewItem.meta ?? {});
              const isCopied = copiedId === previewItem.id;

              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-200/80 dark:bg-slate-800">
                        <div className="grid h-full w-full place-items-center text-xl">
                          {badge?.emoji ?? "✦"}
                        </div>
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
                            {badge?.label ?? previewItem.kind}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              STATUS_BADGE_CLASS[previewItem.status] ?? STATUS_BADGE_CLASS.saved
                            }`}
                          >
                            {STATUS_LABEL[previewItem.status] ?? previewItem.status}
                          </span>
                          {!previewItem.is_public ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              <Lock className="h-3 w-3" />
                              私密
                            </span>
                          ) : null}
                          {previewItem.category_name ? (
                            <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                              {previewItem.category_name}
                            </span>
                          ) : null}
                        </div>

                        <h2
                          id="bookmark-preview-title"
                          className="mt-1.5 break-words text-base font-bold leading-snug text-slate-900 sm:text-lg dark:text-white"
                        >
                          {previewItem.title}
                        </h2>

                        {previewItem.author ? (
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            作者 / 来源：{previewItem.author}
                          </p>
                        ) : null}

                        {previewItem.rating > 0 ? (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <RatingStars value={previewItem.rating} size="sm" />
                            <span className="text-xs font-medium tabular-nums text-slate-500">
                              {previewItem.rating} / 5
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        setPreviewError(null);
                        setPreviewItem(null);
                      }}
                      aria-label="关闭详情弹窗"
                      className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {previewItem.note ? (
                    <div className="mt-4 rounded-xl bg-slate-100/80 p-3.5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words [user-select:text] dark:bg-slate-800/80 dark:text-slate-200">
                      {previewItem.note}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-slate-400">暂无备注说明。</p>
                  )}

                  {metaEntries.length > 0 ? (
                    <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200/70 p-3 text-xs dark:border-white/10">
                      {metaEntries.map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="truncate text-slate-400">{k}</dt>
                          <dd className="truncate font-medium text-slate-700 dark:text-slate-200">
                            {String(v)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {previewItem.tags.length > 0 ? (
                    <div className="mt-4">
                      <p className="mb-1.5 text-[11px] font-medium text-slate-400">
                        全部标签（点击可筛选）
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {previewItem.tags.map((tag) => (
                          <Link
                            key={tag}
                            href={href({ tag })}
                            onClick={() => setPreviewItem(null)}
                            className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-700 transition hover:bg-sky-500/25 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                          >
                            #{tag}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {previewError ? (
                    <p
                      role="alert"
                      className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-600 dark:text-rose-300"
                    >
                      {previewError}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3.5 text-[11px] text-slate-400 dark:border-white/10">
                    <div>
                      <span>收录于 {formatDate(previewItem.created_at)}</span>
                      {previewItem.updated_at !== previewItem.created_at ? (
                        <span> · 更新于 {formatDate(previewItem.updated_at)}</span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(previewItem)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            编辑
                          </button>

                          {confirmDeleteId === previewItem.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deleting}
                                onClick={() => void handleDeleteCollection(previewItem.id)}
                                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-rose-500 disabled:opacity-60"
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
                                className="rounded-full px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-sky-500"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewError(null);
                                setConfirmDeleteId(previewItem.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-rose-500 dark:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          )}
                        </>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void copyItemLink(previewItem)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            已复制链接
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            复制链接
                          </>
                        )}
                      </button>

                      {hasExternalUrl ? (
                        <a
                          href={previewItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                        >
                          访问链接
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Add / Edit Collection Modal */}
      {editorOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-editor-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setEditorOpen(false);
          }}
        >
          <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/40 bg-white/95 p-5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2
                id="collection-editor-title"
                className="text-base font-bold text-slate-900 dark:text-white sm:text-lg"
              >
                {editingItem ? "编辑收藏" : "添加收藏"}
              </h2>
              <button
                type="button"
                onClick={() => !saving && setEditorOpen(false)}
                aria-label="关闭收藏编辑弹窗"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="space-y-3.5 text-sm">
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
                    onChange={(event) => setFormKind(event.target.value as CollectionKind)}
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  >
                    <option value="link">站点</option>
                    <option value="movie">影视</option>
                    <option value="music">音乐</option>
                    <option value="book">书籍</option>
                    <option value="product">好物</option>
                    <option value="idea">灵感</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">状态</span>
                  <select
                    value={formStatus}
                    onChange={(event) => setFormStatus(event.target.value as CollectionStatus)}
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  >
                    <option value="saved">已收藏</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                    <option value="dropped">已弃</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  标题 <span className="text-rose-500">*</span>
                </span>
                <input
                  required
                  maxLength={200}
                  value={formTitle}
                  onChange={(event) => setFormTitle(event.target.value)}
                  placeholder="输入收藏标题…"
                  className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">链接 URL</span>
                <input
                  maxLength={1000}
                  value={formUrl}
                  onChange={(event) => setFormUrl(event.target.value)}
                  placeholder="https://..."
                  className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">作者 / 来源</span>
                  <input
                    maxLength={100}
                    value={formAuthor}
                    onChange={(event) => setFormAuthor(event.target.value)}
                    placeholder="作者或出处"
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">分类</span>
                  <select
                    value={formCategoryId}
                    onChange={(event) => setFormCategoryId(event.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  >
                    <option value="">不选分类</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
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
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  标签（逗号分隔）
                </span>
                <input
                  value={formTagsText}
                  onChange={(event) => setFormTagsText(event.target.value)}
                  placeholder="例如：设计, 效率工具"
                  className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-300">评分</span>
                  <div className="flex items-center gap-1">
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
                            className={`h-4 w-4 ${
                              active
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300 dark:text-slate-600"
                            }`}
                          />
                        </button>
                      );
                    })}
                    <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                      {formRating > 0 ? `${formRating}/5` : "未评分"}
                    </span>
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={formIsPublic}
                    onChange={(event) => setFormIsPublic(event.target.checked)}
                    className="h-4 w-4 rounded accent-sky-600"
                  />
                  公开展示
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">备注说明</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={formNote}
                  onChange={(event) => setFormNote(event.target.value)}
                  placeholder="记录收藏原因、亮点或个人评价…"
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
                  {saving ? "保存中…" : editingItem ? "保存修改" : "保存收藏"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

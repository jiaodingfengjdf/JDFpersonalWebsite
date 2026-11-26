"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Heart,
  ImageIcon,
  Layers,
  List,
  Loader2,
  LogOut,
  MessageCircle,
  MessageSquare,
  Plus,
  Reply,
  RotateCcw,
  Search,
  Send,
  Upload,
  X,
} from "lucide-react";
import Lightbox from "@/components/photos/Lightbox";
import {
  getChatters,
  getChatterComments,
  createChatterComment,
  likeChatter,
  likeChatterComment,
  type ChatterCommentItem,
} from "@/lib/api";
import type { ChatterItem } from "@/lib/api/chatters";
import { getGithubUser, logoutGithubUser } from "@/lib/api/github-auth";
import type { GitHubUser } from "@/lib/api/types";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { bypassImageOptimization } from "@/lib/image";
import { formatRelativeTime } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";

type MomentsLayoutMode = "timeline" | "stack";

const PAGE_SIZE = 50;

interface Moment {
  id: string;
  content: string;
  images: string[];
  mood: string;
  likes: number;
  comments_count: number;
  created_at: string;
}

interface Photo {
  id: string;
  url: string;
  caption: string;
  orientation: "landscape" | "portrait";
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const rotations = [-2, 1.5, -1, 2, -1.5, 1, -0.5, 1.5];

const shanghaiDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
});

const shanghaiKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(dateStr: string): string {
  const parts = shanghaiDateFormatter.formatToParts(new Date(dateStr));
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${Number(month)}月${Number(day)}日`;
}

function dateKey(dateStr: string): string {
  return shanghaiKeyFormatter.format(new Date(dateStr));
}

function toMoment(item: ChatterItem): Moment {
  return {
    id: String(item.id),
    content: item.content,
    images: item.images ?? [],
    mood: item.mood ?? "",
    likes: item.likes,
    comments_count: item.comments_count,
    created_at: item.created_at,
  };
}

function flattenReplies(
  replies: ChatterCommentItem[],
  parentMap?: Map<number, string>,
): (ChatterCommentItem & { replyToUser?: string })[] {
  const map = parentMap ?? new Map<number, string>();
  const result: (ChatterCommentItem & { replyToUser?: string })[] = [];
  for (const r of replies) {
    const replyToUser = map.get(r.parent_id!);
    result.push(replyToUser ? { ...r, replyToUser } : r);
    if (r.replies?.length) {
      map.set(r.id, r.github_user?.login ?? "匿名用户");
      result.push(...flattenReplies(r.replies, map));
    }
  }
  return result;
}

const MOOD_CHIPS = [
  "😊 开心",
  "🤔 思考",
  "☕ 日常",
  "💻 编码",
  "🎮 游戏",
  "🌙 夜深",
] as const;

export default function MomentsClient({
  initialChatters,
  initialTotal = initialChatters.length,
  initialOnlyView,
  isAdmin = false,
}: {
  initialChatters: ChatterItem[];
  initialTotal?: number;
  initialOnlyView: string | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const { profile, content } = useSiteSettings();
  const { addToast } = useToast();
  const avatarSrc = profile.avatarUrl || "/images/avatar-jdf.png";

  // 管理员快捷发布面板
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContent, setComposerContent] = useState("");
  const [composerMood, setComposerMood] = useState("");
  const [composerImages, setComposerImages] = useState<string[]>([]);
  const [composerImageUrl, setComposerImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const [moments, setMoments] = useState<Moment[]>(() =>
    initialChatters.map(toMoment),
  );
  const [total, setTotal] = useState<number>(
    Math.max(initialTotal, initialChatters.length),
  );
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [onlyWithImages, setOnlyWithImages] = useState(false);
  const [layoutMode, setLayoutMode] = useState<MomentsLayoutMode>("timeline");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [onlyViewId, setOnlyViewId] = useState<string | null>(initialOnlyView);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{
    photos: Photo[];
    index: number;
  } | null>(null);

  // 评论相关
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatterCommentItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commentsMap, setCommentsMap] = useState<
    Record<string, ChatterCommentItem[]>
  >({});
  const [commentsLoading, setCommentsLoading] = useState<
    Record<string, boolean>
  >({});
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(
    new Set(),
  );
  const [likedCommentIds, setLikedCommentIds] = useState<Set<number>>(
    new Set(),
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 恢复本地偏好状态
  useEffect(() => {
    const savedLayout = localStorage.getItem("moments-layout-mode");
    if (savedLayout === "timeline" || savedLayout === "stack") {
      queueMicrotask(() => setLayoutMode(savedLayout));
    }

    const savedLikes = localStorage.getItem("liked_chatters");
    if (savedLikes) {
      try {
        const parsed: unknown = JSON.parse(savedLikes);
        if (Array.isArray(parsed)) {
          queueMicrotask(() => setLikedIds(new Set(parsed.map(String))));
        }
      } catch {}
    }

    const savedCommentLikes = localStorage.getItem("liked_chatter_comments");
    if (savedCommentLikes) {
      try {
        const parsed: unknown = JSON.parse(savedCommentLikes);
        if (Array.isArray(parsed)) {
          queueMicrotask(() =>
            setLikedCommentIds(new Set(parsed.map(Number))),
          );
        }
      } catch {}
    }
  }, []);

  function handleLayoutChange(next: MomentsLayoutMode) {
    setLayoutMode(next);
    if (next === "timeline") {
      setExpandedId(null);
    }
    try {
      localStorage.setItem("moments-layout-mode", next);
    } catch {}
  }

  // 恢复 GitHub 登录状态
  useEffect(() => {
    const savedUser = localStorage.getItem("github_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as GitHubUser;
        queueMicrotask(() => setUser(parsed));
      } catch {
        localStorage.removeItem("github_user");
      }
    }

    localStorage.removeItem("github_token");
    getGithubUser()
      .then((u) => {
        setUser(u);
        localStorage.setItem("github_user", JSON.stringify(u));
      })
      .catch(() => {
        localStorage.removeItem("github_user");
        setUser(null);
      });
  }, []);

  // 同步 onlyViewId 到 URL 并支持浏览器前进/后退
  const updateOnlyView = useCallback((nextId: string | null) => {
    setOnlyViewId(nextId);
    setReplyTo(null);
    setCommentInput("");
    if (nextId) {
      setExpandedId(null);
    }
    const params = new URLSearchParams(window.location.search);
    if (nextId) {
      params.set("onlyView", nextId);
    } else {
      params.delete("onlyView");
    }
    const qs = params.toString();
    const nextUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("onlyView");
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      setOnlyViewId(
        Number.isInteger(parsed) && parsed > 0 ? String(parsed) : null,
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Escape 键支持：取消回复 -> 收起展开叠卡 -> 退出只看单条
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || lightbox) return;
      if (replyTo) {
        setReplyTo(null);
        setCommentInput("");
        return;
      }
      if (expandedId) {
        setExpandedId(null);
        return;
      }
      if (onlyViewId) {
        updateOnlyView(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox, replyTo, expandedId, onlyViewId, updateOnlyView]);

  // "只看这条" 时加载评论
  useEffect(() => {
    if (!onlyViewId) return;
    const cid = parseInt(onlyViewId, 10);
    if (isNaN(cid) || commentsMap[onlyViewId]) return;

    let active = true;
    queueMicrotask(() => {
      if (active) setCommentsLoading((p) => ({ ...p, [onlyViewId]: true }));
    });
    getChatterComments(cid)
      .then((data) => {
        if (active) setCommentsMap((p) => ({ ...p, [onlyViewId]: data }));
      })
      .catch(() => {
        if (active) addToast("error", "评论加载失败，请稍后重试");
      })
      .finally(() => {
        if (active) setCommentsLoading((p) => ({ ...p, [onlyViewId]: false }));
      });
    return () => {
      active = false;
    };
  }, [onlyViewId, commentsMap, addToast]);

  async function handleLoadMore() {
    if (loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextItems = await getChatters({
        status: "published",
        page: nextPage,
        size: PAGE_SIZE,
      });
      const mapped = nextItems.map(toMoment);
      setMoments((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...mapped.filter((m) => !seen.has(m.id))];
      });
      setPage(nextPage);
      if (nextItems.length < PAGE_SIZE) {
        setTotal((prevTotal) =>
          Math.min(prevTotal, moments.length + nextItems.length),
        );
      }
    } catch {
      setLoadMoreError("加载更多说说失败，请重试。");
    } finally {
      setLoadingMore(false);
    }
  }

  const filteredMoments = useMemo(() => {
    if (onlyViewId) {
      return moments.filter((m) => m.id === onlyViewId);
    }
    const q = searchQuery.trim().toLowerCase();
    return moments.filter((m) => {
      if (onlyWithImages && (!m.images || m.images.length === 0)) {
        return false;
      }
      if (q) {
        const haystack = `${m.content} ${m.mood}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [moments, onlyViewId, onlyWithImages, searchQuery]);

  const visibleGroups = useMemo(() => {
    const map = new Map<string, Moment[]>();
    for (const m of filteredMoments) {
      const key = dateKey(m.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      date: key,
      label: formatDate(items[0].created_at),
      moments: items,
    }));
  }, [filteredMoments]);

  async function toggleLike(id: string) {
    const chatterId = parseInt(id, 10);
    if (isNaN(chatterId)) return;
    const alreadyLiked = likedIds.has(id);
    try {
      const result = await likeChatter(chatterId, alreadyLiked);
      setLikedIds((p) => {
        const n = new Set(p);
        if (alreadyLiked) n.delete(id);
        else n.add(id);
        localStorage.setItem("liked_chatters", JSON.stringify([...n]));
        return n;
      });
      setMoments((p) =>
        p.map((m) => (m.id === id ? { ...m, likes: result.likes } : m)),
      );
    } catch {
      addToast("error", "点赞失败，请稍后重试");
    }
  }

  function handleLogin() {
    sessionStorage.setItem(
      "github_redirect",
      window.location.pathname + window.location.search,
    );
    window.location.href = "/api/auth/github/login";
  }

  async function handleLogout() {
    await logoutGithubUser().catch(() => {});
    localStorage.removeItem("github_user");
    setUser(null);
  }

  function cancelReply() {
    setReplyTo(null);
    setCommentInput("");
  }

  async function handleCommentLike(commentId: number) {
    const alreadyLiked = likedCommentIds.has(commentId);
    try {
      const updated = await likeChatterComment(commentId, alreadyLiked);
      setLikedCommentIds((p) => {
        const n = new Set(p);
        if (alreadyLiked) n.delete(commentId);
        else n.add(commentId);
        localStorage.setItem("liked_chatter_comments", JSON.stringify([...n]));
        return n;
      });
      setCommentsMap((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = next[key].map((c) =>
            updateCommentLikes(c, commentId, updated.likes),
          );
        }
        return next;
      });
    } catch {
      addToast("error", "点赞失败，请稍后重试");
    }
  }

  function updateCommentLikes(
    c: ChatterCommentItem,
    targetId: number,
    likes: number,
  ): ChatterCommentItem {
    if (c.id === targetId) return { ...c, likes };
    if (c.replies?.length) {
      return {
        ...c,
        replies: c.replies.map((r) => updateCommentLikes(r, targetId, likes)),
      };
    }
    return c;
  }

  function startReply(c: ChatterCommentItem) {
    setReplyTo(c);
    setCommentInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function findTopLevelId(
    comments: ChatterCommentItem[],
    targetId: number,
  ): number | null {
    for (const c of comments) {
      if (c.id === targetId) return c.id;
      for (const r of c.replies ?? []) {
        if (r.id === targetId) return c.id;
        for (const rr of r.replies ?? []) {
          if (rr.id === targetId) return c.id;
        }
      }
    }
    return null;
  }

  async function handleSubmitComment(chatterId: number) {
    if (!commentInput.trim() || submitting || !user) return;
    setSubmitting(true);
    try {
      const nc = await createChatterComment({
        chatter_id: chatterId,
        content: commentInput.trim(),
        parent_id: replyTo?.id,
      });
      const sid = String(chatterId);
      if (replyTo) {
        const pid =
          findTopLevelId(commentsMap[sid] ?? [], replyTo.id) ?? replyTo.id;
        setCommentsMap((p) => ({
          ...p,
          [sid]: (p[sid] ?? []).map((c) =>
            c.id === pid ? { ...c, replies: [...c.replies, nc] } : c,
          ),
        }));
        setExpandedReplies((p) => new Set([...p, pid]));
        addToast("success", "回复已发送");
      } else {
        setCommentsMap((p) => ({ ...p, [sid]: [...(p[sid] ?? []), nc] }));
        addToast("success", "评论已发送");
      }
      setMoments((p) =>
        p.map((m) =>
          m.id === sid ? { ...m, comments_count: m.comments_count + 1 } : m,
        ),
      );
      setCommentInput("");
      setReplyTo(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "评论发送失败，请稍后重试";
      addToast("error", msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingImage) return;
    setUploadingImage(true);
    setComposerError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await siteAdminRequest<{ url: string }>("/api/admin/upload/image", {
        method: "POST",
        body: formData,
      });
      if (result.url) {
        setComposerImages((prev) => [...prev, result.url]);
      }
    } catch (error) {
      setComposerError(describeSiteAdminError(error));
    } finally {
      setUploadingImage(false);
    }
  }

  function handleAddImageUrl() {
    const trimmed = composerImageUrl.trim();
    if (!trimmed) return;
    setComposerImages((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setComposerImageUrl("");
  }

  async function handlePublishChatter() {
    if (publishing || !composerContent.trim()) return;
    setPublishing(true);
    setComposerError(null);
    try {
      const created = await siteAdminRequest<ChatterItem>("/api/admin/chatters", {
        method: "POST",
        body: JSON.stringify({
          content: composerContent.trim(),
          mood: composerMood.trim(),
          images: composerImages,
          status: "published",
        }),
      });
      const createdMoment = toMoment(created);
      setMoments((prev) => [
        createdMoment,
        ...prev.filter((item) => item.id !== createdMoment.id),
      ]);
      setTotal((prev) => prev + 1);
      setComposerContent("");
      setComposerMood("");
      setComposerImages([]);
      setComposerImageUrl("");
      setComposerOpen(false);
      addToast("success", "说说已发布");
      router.refresh();
    } catch (error) {
      setComposerError(describeSiteAdminError(error));
    } finally {
      setPublishing(false);
    }
  }

  const hasFilter = searchQuery.trim() !== "" || onlyWithImages;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 md:py-12">
      {/* 页头 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-5 md:mb-8 flex items-start justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
            <MessageSquare className="w-5 h-5 md:w-7 md:h-7 text-sky-500" />
            <h1 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">
              {content.chatterTitle || "说说"}
            </h1>
          </div>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 ml-7 md:ml-10">
            {content.chatterDescription || "记录生活中的小确幸"}
          </p>
        </div>

        {isAdmin && !onlyViewId ? (
          <button
            type="button"
            aria-expanded={composerOpen}
            onClick={() => setComposerOpen((prev) => !prev)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <Plus className={`w-3.5 h-3.5 transition-transform ${composerOpen ? "rotate-45" : ""}`} />
            {composerOpen ? "收起编辑" : "发条说说"}
          </button>
        ) : null}
      </motion.div>

      {/* 管理员快捷发说说面板 */}
      <AnimatePresence initial={false}>
        {isAdmin && !onlyViewId && composerOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="rounded-2xl border border-white/40 bg-white/75 p-4 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/75 space-y-3">
              {composerError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
                >
                  {composerError}
                </p>
              ) : null}

              <textarea
                rows={3}
                maxLength={10000}
                value={composerContent}
                onChange={(event) => setComposerContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void handlePublishChatter();
                  }
                }}
                placeholder="此刻在想什么？（Ctrl + Enter 快速发布）"
                aria-label="说说内容"
                className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100"
              />

              {/* 心情快捷芯片 */}
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="选择心情">
                {MOOD_CHIPS.map((chip) => {
                  const active = composerMood === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setComposerMood(active ? "" : chip)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                        active
                          ? "border-sky-500 bg-sky-500 text-white"
                          : "border-slate-200/80 bg-white/60 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300"
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* 图片外链 + 本地上传 */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={composerImageUrl}
                  onChange={(event) => setComposerImageUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddImageUrl();
                    }
                  }}
                  placeholder="输入图片 URL 并添加…"
                  aria-label="配图 URL"
                  className="h-8 min-w-44 flex-1 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleAddImageUrl}
                  disabled={!composerImageUrl.trim()}
                  className="h-8 rounded-xl border border-slate-200/80 bg-white/70 px-3 text-xs font-medium text-slate-700 hover:border-sky-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  添加链接
                </button>
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadImage}
                />
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => imageFileInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1 rounded-xl border border-sky-400/50 bg-sky-500/10 px-3 text-xs font-medium text-sky-700 hover:bg-sky-500/20 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                >
                  {uploadingImage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {uploadingImage ? "上传中…" : "上传图片"}
                </button>
              </div>

              {composerImages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {composerImages.map((img, idx) => (
                    <div
                      key={`${img}-${idx}`}
                      className="relative h-16 w-16 overflow-hidden rounded-xl border border-white/40 bg-slate-200/60 dark:border-white/10 dark:bg-slate-900"
                    >
                      <Image
                        src={img}
                        alt=""
                        fill
                        sizes="64px"
                        unoptimized={bypassImageOptimization(img)}
                        className="object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`移除第 ${idx + 1} 张图片`}
                        onClick={() =>
                          setComposerImages((prev) => prev.filter((_, index) => index !== idx))
                        }
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-slate-950/75 text-white hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-sky-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {composerImages.length > 0 ? `已附 ${composerImages.length} 张图片` : "可直接发布文字或配图"}
                </span>
                <button
                  type="button"
                  disabled={publishing || uploadingImage || !composerContent.trim()}
                  onClick={() => void handlePublishChatter()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  {publishing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {publishing ? "发布中…" : "发布说说"}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 顶部工具栏：关键词检索 + 仅看带图 + 时间流/叠卡视图切换 */}
      {!onlyViewId && (
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索说说内容或心情..."
              aria-label="搜索说说"
              maxLength={80}
              className="w-full rounded-2xl border border-white/40 dark:border-white/10 bg-white/65 dark:bg-slate-900/65 backdrop-blur-xl py-2 pl-9 pr-9 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/60"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-500/10 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <button
              type="button"
              aria-pressed={onlyWithImages}
              onClick={() => setOnlyWithImages((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium border backdrop-blur-xl transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                onlyWithImages
                  ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                  : "bg-white/65 dark:bg-slate-900/65 text-slate-600 dark:text-slate-300 border-white/40 dark:border-white/10 hover:border-sky-400/50"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              仅看带图
            </button>

            <div
              role="group"
              aria-label="布局视图切换"
              className="inline-flex items-center gap-1 rounded-2xl border border-white/40 dark:border-white/10 bg-white/65 dark:bg-slate-900/65 backdrop-blur-xl p-1 shadow-sm"
            >
              <button
                type="button"
                aria-pressed={layoutMode === "timeline"}
                onClick={() => handleLayoutChange("timeline")}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  layoutMode === "timeline"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>时间流视图</span>
              </button>
              <button
                type="button"
                aria-pressed={layoutMode === "stack"}
                onClick={() => handleLayoutChange("stack")}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  layoutMode === "stack"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>叠卡视图</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {onlyViewId && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          type="button"
          onClick={() => updateOnlyView(null)}
          className="inline-flex items-center gap-1.5 text-xs md:text-sm text-slate-600 dark:text-slate-300 hover:text-sky-500 dark:hover:text-sky-400 transition-colors mb-4 md:mb-6 rounded-lg focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <ChevronLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
          返回全部说说
        </motion.button>
      )}

      {visibleGroups.length === 0 && (
        <div className="text-center py-12 md:py-20 rounded-3xl bg-white/55 dark:bg-slate-900/55 backdrop-blur-xl border border-white/30 dark:border-white/10 text-slate-500 dark:text-slate-400">
          <MessageSquare className="w-8 h-8 md:w-12 md:h-12 mx-auto mb-3 md:mb-4 opacity-40" />
          <p className="text-sm md:text-base mb-3">
            {hasFilter ? "没有找到符合筛选条件的说说" : "暂无说说"}
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setOnlyWithImages(false);
              }}
              className="px-4 py-1.5 rounded-full text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              重置筛选
            </button>
          )}
        </div>
      )}

      {visibleGroups.map((group, groupIdx) => {
        const isStackGroup =
          layoutMode === "stack" &&
          !onlyViewId &&
          group.moments.length > 1;

        return (
          <motion.div
            key={group.date}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: Math.min(groupIdx, 5) * 0.07 }}
            className="mb-8 md:mb-12 last:mb-0"
          >
            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
              <span className="text-xs md:text-sm font-bold text-slate-700 dark:text-slate-200">
                {group.label}
              </span>
              <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400">
                {group.moments.length} 条
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-slate-300/70 dark:from-slate-700 to-transparent" />
            </div>

            <div
              className={isStackGroup ? "relative" : "space-y-3.5 md:space-y-4"}
              style={
                isStackGroup
                  ? { minHeight: 112 + (group.moments.length - 1) * 22 }
                  : undefined
              }
            >
              {group.moments.map((moment, i) => {
                const rot = rotations[i % rotations.length];
                const offsetX = i % 2 === 0 ? -4 : 4;
                const isExpanded = expandedId === moment.id;
                const showFullCard =
                  layoutMode === "timeline" || isExpanded || Boolean(onlyViewId);
                const hasImages = moment.images && moment.images.length > 0;

                return (
                  <motion.div
                    key={moment.id}
                    id={`moment-${moment.id}`}
                    layout
                    ref={(el) => {
                      if (isExpanded && el) {
                        setTimeout(
                          () =>
                            el.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                            }),
                          100,
                        );
                      }
                    }}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      rotate: isStackGroup && !isExpanded ? rot : 0,
                      x: isStackGroup && !isExpanded ? offsetX : 0,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 26,
                      delay: Math.min(i, 5) * 0.04,
                    }}
                    whileHover={
                      isStackGroup && !isExpanded
                        ? { rotate: 0, x: 0, y: -4, scale: 1.01 }
                        : undefined
                    }
                    onClick={() => {
                      if (layoutMode === "stack" && !onlyViewId) {
                        setExpandedId(isExpanded ? null : moment.id);
                      }
                    }}
                    className={`${
                      isStackGroup ? "absolute left-0 right-0" : "relative"
                    } ${layoutMode === "stack" && !onlyViewId ? "cursor-pointer" : ""}`}
                    style={
                      isStackGroup
                        ? {
                            zIndex: isExpanded ? 50 : group.moments.length - i,
                            top: i * 22,
                          }
                        : undefined
                    }
                  >
                    <div className="rounded-2xl bg-white/70 dark:bg-slate-800/75 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-lg overflow-hidden transition-shadow duration-300 hover:shadow-xl">
                      {/* 叠卡收起态摘要 */}
                      {!showFullCard && (
                        <div className="px-3.5 py-3 md:px-5 md:py-4">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <span
                                suppressHydrationWarning
                                className="text-[10px] md:text-xs text-slate-400"
                              >
                                {formatRelativeTime(moment.created_at)}
                              </span>
                              {moment.mood && (
                                <span className="text-[10px] md:text-xs">
                                  {moment.mood}
                                </span>
                              )}
                              {hasImages && (
                                <span className="text-[10px] md:text-xs text-slate-400">
                                  📷 {moment.images.length}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <Heart
                                  className={`w-3 h-3 ${
                                    likedIds.has(moment.id)
                                      ? "fill-pink-500 text-pink-500"
                                      : ""
                                  }`}
                                />
                                {moment.likes}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MessageCircle className="w-3 h-3" />
                                {moment.comments_count}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs md:text-sm text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                            {moment.content}
                          </p>
                        </div>
                      )}

                      {/* 完整卡片（时间流默认展示 / 叠卡展开 / 只看单条） */}
                      {showFullCard && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.25 }}
                        >
                          <div className="p-3.5 md:p-5">
                            <div className="flex items-center justify-between mb-2.5 md:mb-3">
                              <div className="flex items-center gap-2">
                                <Image
                                  src={avatarSrc}
                                  alt={profile.authorName}
                                  width={28}
                                  height={28}
                                  unoptimized={bypassImageOptimization(avatarSrc)}
                                  className="rounded-full object-cover w-6 h-6 md:w-7 md:h-7"
                                />
                                <span className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-200">
                                  {profile.authorName}
                                </span>
                                <span
                                  suppressHydrationWarning
                                  className="text-[10px] md:text-xs text-slate-400"
                                >
                                  {formatRelativeTime(moment.created_at)}
                                </span>
                              </div>
                              {moment.mood && (
                                <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-slate-100/90 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
                                  {moment.mood}
                                </span>
                              )}
                            </div>

                            <p className="text-xs md:text-sm text-slate-700 dark:text-slate-200 leading-relaxed mb-3 md:mb-4 whitespace-pre-wrap">
                              {moment.content}
                            </p>

                            {hasImages && (
                              <div
                                className={`grid gap-1.5 md:gap-2 mb-3 md:mb-4 ${
                                  moment.images.length <= 2
                                    ? "grid-cols-2"
                                    : "grid-cols-3"
                                }`}
                              >
                                {moment.images.map((img, idx) => {
                                  const photos: Photo[] = moment.images.map(
                                    (url, pi) => ({
                                      id: `${moment.id}-${pi}`,
                                      url,
                                      caption: "",
                                      orientation: "landscape" as const,
                                    }),
                                  );
                                  return (
                                    <button
                                      type="button"
                                      key={idx}
                                      aria-label={`查看第 ${idx + 1} 张配图`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLightbox({ photos, index: idx });
                                      }}
                                      className="relative rounded-lg md:rounded-xl overflow-hidden cursor-pointer group/img aspect-square focus-visible:outline-2 focus-visible:outline-sky-500"
                                    >
                                      <Image
                                        src={img}
                                        alt=""
                                        fill
                                        sizes="(max-width: 640px) 50vw, 33vw"
                                        unoptimized={bypassImageOptimization(img)}
                                        className="object-cover transition-transform duration-300 group-hover/img:scale-105"
                                      />
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-2.5 md:pt-3 border-t border-slate-200/60 dark:border-white/10">
                              <div className="flex items-center gap-4">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void toggleLike(moment.id);
                                  }}
                                  className="inline-flex items-center gap-1 md:gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-pink-500 transition-colors rounded focus-visible:outline-2 focus-visible:outline-sky-500"
                                >
                                  <Heart
                                    className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-all duration-300 ${
                                      likedIds.has(moment.id)
                                        ? "fill-pink-500 text-pink-500 scale-110"
                                        : ""
                                    }`}
                                  />
                                  <span>{moment.likes}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateOnlyView(
                                      onlyViewId === moment.id
                                        ? null
                                        : moment.id,
                                    );
                                  }}
                                  className={`inline-flex items-center gap-1 md:gap-1.5 text-xs transition-colors rounded focus-visible:outline-2 focus-visible:outline-sky-500 ${
                                    moment.comments_count > 0
                                      ? "text-sky-600 dark:text-sky-400 font-medium"
                                      : "text-slate-500 dark:text-slate-400 hover:text-sky-500"
                                  }`}
                                  title="查看或发表评论"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  <span>{moment.comments_count}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateOnlyView(
                                    onlyViewId === moment.id ? null : moment.id,
                                  );
                                }}
                                className="text-[11px] md:text-xs px-2.5 md:px-3 py-1 rounded-full bg-sky-500/12 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
                              >
                                {onlyViewId === moment.id
                                  ? "返回全部"
                                  : moment.comments_count > 0
                                    ? `参与讨论 (${moment.comments_count})`
                                    : "只看这条"}
                              </button>
                            </div>
                          </div>

                          {onlyViewId === moment.id && (
                            <div
                              className="border-t border-slate-200/60 dark:border-white/10 px-3.5 md:px-5 py-3.5 md:py-4"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {user ? (
                                <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-xl bg-white/50 dark:bg-slate-700/40">
                                  <Image
                                    src={user.avatar}
                                    alt={user.login}
                                    width={24}
                                    height={24}
                                    unoptimized={bypassImageOptimization(
                                      user.avatar,
                                    )}
                                    className="rounded-full md:w-7 md:h-7"
                                  />
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1">
                                    {user.login}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 transition-colors rounded focus-visible:outline-2 focus-visible:outline-sky-500"
                                  >
                                    <LogOut className="w-3 h-3" />
                                    退出
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleLogin}
                                  className="flex items-center gap-2 mb-3 w-full px-3 py-2 rounded-xl bg-white/50 dark:bg-slate-700/40 hover:bg-white/70 dark:hover:bg-slate-700/60 transition-all focus-visible:outline-2 focus-visible:outline-sky-500"
                                >
                                  <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-slate-900 dark:bg-white flex items-center justify-center">
                                    <GithubIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-white dark:text-slate-900" />
                                  </div>
                                  <span className="text-xs text-slate-600 dark:text-slate-300">
                                    登录 GitHub 参与讨论
                                  </span>
                                </button>
                              )}

                              {/* 评论输入框 */}
                              <div className="rounded-xl bg-white/50 dark:bg-slate-700/40 border border-slate-200/50 dark:border-white/10 overflow-hidden mb-3">
                                <AnimatePresence>
                                  {replyTo && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-0 text-[10px] text-slate-500 dark:text-slate-400">
                                        <Reply className="w-3 h-3 text-sky-500" />
                                        <span>
                                          回复{" "}
                                          <span className="font-medium text-sky-600 dark:text-sky-400">
                                            {replyTo.github_user?.login ?? "匿名"}
                                          </span>
                                        </span>
                                        <span className="truncate flex-1 opacity-60 ml-1">
                                          {replyTo.content.slice(0, 40)}
                                        </span>
                                        <button
                                          type="button"
                                          aria-label="取消回复"
                                          onClick={cancelReply}
                                          className="text-slate-400 hover:text-red-500 transition-colors shrink-0 px-1 rounded focus-visible:outline-2 focus-visible:outline-sky-500"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                                <div className="p-2.5">
                                  <textarea
                                    ref={inputRef}
                                    value={commentInput}
                                    onChange={(e) =>
                                      setCommentInput(e.target.value)
                                    }
                                    placeholder={
                                      user
                                        ? replyTo
                                          ? "写下你的回复...（Esc 取消）"
                                          : "说点什么..."
                                        : "登录后即可评论..."
                                    }
                                    disabled={!user}
                                    rows={2}
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === "Enter" &&
                                        (e.metaKey || e.ctrlKey)
                                      ) {
                                        void handleSubmitComment(
                                          parseInt(moment.id, 10),
                                        );
                                      } else if (
                                        e.key === "Escape" &&
                                        replyTo
                                      ) {
                                        e.preventDefault();
                                        cancelReply();
                                      }
                                    }}
                                    className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-200/40 dark:border-white/5">
                                    <span className="text-[10px] text-slate-400">
                                      {replyTo
                                        ? "Ctrl + Enter 发送 · Esc 取消"
                                        : "Ctrl + Enter 发送"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleSubmitComment(
                                          parseInt(moment.id, 10),
                                        )
                                      }
                                      disabled={
                                        !user ||
                                        !commentInput.trim() ||
                                        submitting
                                      }
                                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus-visible:outline-2 focus-visible:outline-sky-500"
                                    >
                                      <Send className="w-3 h-3" />
                                      {submitting
                                        ? "发送中..."
                                        : replyTo
                                          ? "回复"
                                          : "发送"}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {commentsLoading[moment.id] && (
                                <div className="space-y-2">
                                  {[1, 2].map((n) => (
                                    <div
                                      key={n}
                                      className="h-12 rounded-xl bg-white/40 dark:bg-slate-700/30 animate-pulse"
                                    />
                                  ))}
                                </div>
                              )}

                              {!commentsLoading[moment.id] &&
                                (commentsMap[moment.id]?.length ?? 0) > 0 && (
                                  <div className="space-y-2">
                                    {commentsMap[moment.id].map((comment) => (
                                      <CommentCard
                                        key={comment.id}
                                        comment={comment}
                                        expandedReplies={expandedReplies}
                                        onReply={startReply}
                                        onToggleReplies={(id) =>
                                          setExpandedReplies((p) => {
                                            const n = new Set(p);
                                            if (n.has(id)) n.delete(id);
                                            else n.add(id);
                                            return n;
                                          })
                                        }
                                        likedCommentIds={likedCommentIds}
                                        onCommentLike={handleCommentLike}
                                      />
                                    ))}
                                  </div>
                                )}

                              {!commentsLoading[moment.id] &&
                                !commentsMap[moment.id]?.length && (
                                  <p className="text-center text-xs text-slate-400 py-3">
                                    暂无评论，来留下第一条回应吧~
                                  </p>
                                )}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })}

      {/* 分页错误提示 */}
      {loadMoreError && !onlyViewId && (
        <div
          role="alert"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-50/85 dark:bg-rose-950/60 px-4 py-3 text-xs text-rose-800 dark:text-rose-200"
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            {loadMoreError}
          </span>
          <button
            type="button"
            onClick={handleLoadMore}
            className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 transition-colors focus-visible:outline-2 focus-visible:outline-rose-500"
          >
            <RotateCcw className="w-3 h-3" />
            重试
          </button>
        </div>
      )}

      {/* 加载更多说说 */}
      {!onlyViewId && total > moments.length && (
        <div className="flex justify-center mt-8 md:mt-10">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-white/10 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-sky-400/50 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin text-sky-500" />}
            {loadingMore
              ? "加载中..."
              : `加载更多（${moments.length} / ${total}）`}
          </button>
        </div>
      )}

      <AnimatePresence>
        {layoutMode === "stack" && expandedId && !onlyViewId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpandedId(null)}
            className="fixed inset-0 bg-black/25 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      <Lightbox
        photos={lightbox?.photos ?? []}
        index={lightbox?.index ?? 0}
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        onPrev={() =>
          setLightbox((lb) =>
            lb
              ? {
                  ...lb,
                  index: (lb.index - 1 + lb.photos.length) % lb.photos.length,
                }
              : null,
          )
        }
        onNext={() =>
          setLightbox((lb) =>
            lb ? { ...lb, index: (lb.index + 1) % lb.photos.length } : null,
          )
        }
      />
    </div>
  );
}

function CommentCard({
  comment,
  expandedReplies,
  onReply,
  onToggleReplies,
  likedCommentIds,
  onCommentLike,
}: {
  comment: ChatterCommentItem;
  expandedReplies: Set<number>;
  onReply: (c: ChatterCommentItem) => void;
  onToggleReplies: (id: number) => void;
  likedCommentIds: Set<number>;
  onCommentLike: (id: number) => void;
}) {
  const isExpanded = expandedReplies.has(comment.id);
  const flat = flattenReplies(comment.replies ?? []);
  const replyCount = flat.length;

  return (
    <div className="rounded-xl bg-white/50 dark:bg-slate-700/35 border border-white/30 dark:border-white/5 overflow-hidden">
      <div className="p-2.5 md:p-3">
        <div className="flex items-center gap-2 mb-1.5">
          {comment.github_user ? (
            <Image
              src={comment.github_user.avatar}
              alt={comment.github_user.login}
              width={22}
              height={22}
              unoptimized={bypassImageOptimization(comment.github_user.avatar)}
              className="rounded-full md:w-6 md:h-6"
            />
          ) : (
            <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center text-white text-[10px] font-bold">
              ?
            </div>
          )}
          <span className="text-[11px] md:text-xs font-semibold text-slate-700 dark:text-slate-200">
            {comment.github_user?.login ?? "匿名用户"}
          </span>
          <span
            suppressHydrationWarning
            className="text-[10px] text-slate-400 ml-auto"
          >
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap mb-1.5 md:mb-2 ml-7 md:ml-8">
          {comment.content}
        </p>
        <div className="flex items-center gap-3 ml-7 md:ml-8">
          <button
            type="button"
            onClick={() => onCommentLike(comment.id)}
            className={`flex items-center gap-0.5 text-[10px] transition-colors rounded focus-visible:outline-2 focus-visible:outline-sky-500 ${
              likedCommentIds.has(comment.id)
                ? "text-pink-500"
                : "text-slate-400 hover:text-pink-500"
            }`}
          >
            <Heart
              className={`w-3 h-3 ${
                likedCommentIds.has(comment.id) ? "fill-pink-500" : ""
              }`}
            />
            <span>{comment.likes}</span>
          </button>
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-sky-500 transition-colors rounded focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <Reply className="w-3 h-3" />
            回复
          </button>
          {replyCount > 0 && (
            <button
              type="button"
              onClick={() => onToggleReplies(comment.id)}
              className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-sky-500 transition-colors ml-auto rounded focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              {replyCount} 条回复
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {isExpanded && replyCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-200/30 dark:border-white/5 bg-slate-50/40 dark:bg-slate-900/25">
              {flat.map((reply) => (
                <ReplyCard
                  key={reply.id}
                  reply={reply}
                  onReply={onReply}
                  likedCommentIds={likedCommentIds}
                  onCommentLike={onCommentLike}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReplyCard({
  reply,
  onReply,
  likedCommentIds,
  onCommentLike,
}: {
  reply: ChatterCommentItem & { replyToUser?: string };
  onReply: (c: ChatterCommentItem) => void;
  likedCommentIds: Set<number>;
  onCommentLike: (id: number) => void;
}) {
  return (
    <div className="px-2.5 py-2 md:px-3 md:py-2 border-b border-slate-200/20 dark:border-white/5 last:border-0">
      <div className="flex items-start gap-1.5 md:gap-2">
        {reply.github_user ? (
          <Image
            src={reply.github_user.avatar}
            alt={reply.github_user.login}
            width={18}
            height={18}
            unoptimized={bypassImageOptimization(reply.github_user.avatar)}
            className="rounded-full mt-0.5 md:w-5 md:h-5"
          />
        ) : (
          <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center text-white text-[8px] font-bold mt-0.5">
            ?
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
              {reply.github_user?.login ?? "匿名用户"}
            </span>
            <span
              suppressHydrationWarning
              className="text-[9px] text-slate-400"
            >
              {formatRelativeTime(reply.created_at)}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {reply.replyToUser && (
              <span className="text-sky-500 dark:text-sky-400 mr-1">
                回复 @{reply.replyToUser}：
              </span>
            )}
            {reply.content}
          </p>
          <div className="flex items-center gap-2.5 mt-1">
            <button
              type="button"
              onClick={() => onCommentLike(reply.id)}
              className={`flex items-center gap-0.5 text-[10px] transition-colors rounded focus-visible:outline-2 focus-visible:outline-sky-500 ${
                likedCommentIds.has(reply.id)
                  ? "text-pink-500"
                  : "text-slate-400 hover:text-pink-500"
              }`}
            >
              <Heart
                className={`w-2.5 h-2.5 ${
                  likedCommentIds.has(reply.id) ? "fill-pink-500" : ""
                }`}
              />
              <span>{reply.likes}</span>
            </button>
            <button
              type="button"
              onClick={() => onReply(reply)}
              className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-sky-500 transition-colors rounded focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Reply className="w-2.5 h-2.5" />
              回复
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

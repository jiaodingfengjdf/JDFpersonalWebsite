"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Plus,
  Rss,
  Trash2,
  X,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type { FeedCategory, FeedSourceItem } from "@/server/modules/feed/contracts";

const CATEGORY_OPTIONS: Array<{ value: FeedCategory; label: string }> = [
  { value: "tech", label: "科技" },
  { value: "china", label: "国内" },
  { value: "world", label: "国际" },
  { value: "finance", label: "财经" },
  { value: "design", label: "设计" },
];

type PresetTab = "all" | "tech" | "china" | "finance" | "design";

const PRESET_TABS: Array<{ key: PresetTab; label: string }> = [
  { key: "all", label: "全部" },
  { key: "tech", label: "科技" },
  { key: "china", label: "国内" },
  { key: "finance", label: "财经" },
  { key: "design", label: "设计" },
];

interface PresetFeed {
  name: string;
  url: string;
  altUrls?: string[];
  category: FeedCategory;
  description: string;
}

const PRESET_FEEDS: PresetFeed[] = [
  {
    name: "少数派",
    url: "https://sspai.com/feed",
    category: "tech",
    description: "数字生活、效率工具与深度评测",
  },
  {
    name: "阮一峰的网络日志",
    url: "https://www.ruanyifeng.com/blog/atom.xml",
    category: "design",
    description: "科技爱好者周刊与技术人文随笔",
  },
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    category: "tech",
    description: "全球极客与创业社区热门讨论",
  },
  {
    name: "V2EX 技术",
    url: "https://www.v2ex.com/feed/tab/tech.xml",
    category: "tech",
    description: "中文开发者技术交流节点",
  },
  {
    name: "Solidot",
    url: "https://www.solidot.org/index.rss",
    category: "tech",
    description: "奇客资讯、开源软件与科技动态",
  },
  {
    name: "机核 GCORES",
    url: "https://www.gcores.com/rss",
    category: "design",
    description: "游戏文化、ACG 与创意设计",
  },
  {
    name: "36氪",
    url: "https://36kr.com/feed",
    category: "finance",
    description: "新经济、创投与商业前沿资讯",
  },
  {
    name: "澎湃新闻",
    url: "https://feedx.net/rss/thepaper.xml",
    altUrls: ["https://rsshub.app/thepaper/featured"],
    category: "china",
    description: "国内时政、社会与深度报道",
  },
  {
    name: "InfoQ 中文",
    url: "https://www.infoq.cn/feed",
    category: "tech",
    description: "软件架构、云原生与工程实践",
  },
  {
    name: "GitHub Blog",
    url: "https://github.blog/feed/",
    category: "tech",
    description: "GitHub 官方工程与开源生态动态",
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    category: "tech",
    description: "消费电子与数字文化英文媒体",
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "tech",
    description: "深度科技、硬件与科学分析",
  },
  {
    name: "美团技术团队",
    url: "https://tech.meituan.com/feed/",
    category: "tech",
    description: "一线互联网高可用架构实战分享",
  },
];

function normalizeFeedUrl(raw: string): string {
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

export default function NewsRssModal({
  onClose,
  onFeedChanged,
}: {
  onClose: () => void;
  onFeedChanged: () => void;
}) {
  const [sources, setSources] = useState<FeedSourceItem[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<FeedCategory>("tech");
  const [fetchAfterAdd, setFetchAfterAdd] = useState(true);
  const [submittingCustom, setSubmittingCustom] = useState(false);

  const [presetTab, setPresetTab] = useState<PresetTab>("all");
  const [subscribingPresetUrl, setSubscribingPresetUrl] = useState<string | null>(null);
  const [busySourceId, setBusySourceId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    setSourcesError(null);
    try {
      const list = await siteAdminRequest<FeedSourceItem[]>("/api/admin/news/sources");
      setSources(list);
    } catch (error) {
      setSourcesError(describeSiteAdminError(error));
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    siteAdminRequest<FeedSourceItem[]>("/api/admin/news/sources")
      .then((list) => {
        if (!active) return;
        setSources(list);
        setSourcesError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSourcesError(describeSiteAdminError(error));
      })
      .finally(() => {
        if (active) setLoadingSources(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
    for (const src of sources) {
      set.add(normalizeFeedUrl(src.url));
    }
    return set;
  }, [sources]);

  const visiblePresets = useMemo(() => {
    if (presetTab === "all") return PRESET_FEEDS;
    return PRESET_FEEDS.filter((item) => item.category === presetTab);
  }, [presetTab]);

  function isPresetSubscribed(preset: PresetFeed): boolean {
    if (normalizedSubscribedUrls.has(normalizeFeedUrl(preset.url))) return true;
    return Boolean(
      preset.altUrls?.some((alt) => normalizedSubscribedUrls.has(normalizeFeedUrl(alt))),
    );
  }

  async function addSourceAndOptionallyRefresh(params: {
    sourceName: string;
    sourceUrl: string;
    sourceCategory: FeedCategory;
    resetCustomForm?: boolean;
  }) {
    setNotice(null);
    await siteAdminRequest<{ id: number }>("/api/admin/news/sources", {
      method: "POST",
      body: JSON.stringify({
        name: params.sourceName,
        url: params.sourceUrl,
        category: params.sourceCategory,
        enabled: true,
        sort: 100,
      }),
    });

    if (params.resetCustomForm) {
      setName("");
      setUrl("");
    }

    if (fetchAfterAdd) {
      try {
        const refreshRes = await siteAdminRequest<{
          fetched?: number;
          inserted?: number;
          failed?: number;
        }>("/api/admin/news/refresh", { method: "POST" });
        const failNote = refreshRes.failed ? `（${refreshRes.failed} 个源超时）` : "";
        setNotice({
          tone: "info",
          text: `已订阅「${params.sourceName}」并完成抓取：读取 ${refreshRes.fetched ?? 0} 条，新增 ${refreshRes.inserted ?? 0} 条${failNote}。`,
        });
      } catch (refreshError) {
        setNotice({
          tone: "error",
          text: `已添加「${params.sourceName}」，但立即抓取失败：${describeSiteAdminError(refreshError)}`,
        });
      }
    } else {
      setNotice({
        tone: "info",
        text: `已订阅「${params.sourceName}」，点击主页面「抓取最新源」即可拉取文章。`,
      });
    }

    await loadSources();
    onFeedChanged();
  }

  async function handleCustomSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl || submittingCustom) return;

    setSubmittingCustom(true);
    try {
      await addSourceAndOptionallyRefresh({
        sourceName: trimmedName,
        sourceUrl: trimmedUrl,
        sourceCategory: category,
        resetCustomForm: true,
      });
    } catch (error) {
      setNotice({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setSubmittingCustom(false);
    }
  }

  async function handlePresetSubscribe(preset: PresetFeed) {
    if (subscribingPresetUrl || submittingCustom || isPresetSubscribed(preset)) return;
    setSubscribingPresetUrl(preset.url);
    try {
      await addSourceAndOptionallyRefresh({
        sourceName: preset.name,
        sourceUrl: preset.url,
        sourceCategory: preset.category,
      });
    } catch (error) {
      setNotice({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setSubscribingPresetUrl(null);
    }
  }

  async function handleUpdateSource(
    src: FeedSourceItem,
    patch: Partial<Pick<FeedSourceItem, "category" | "enabled">>,
  ) {
    if (busySourceId !== null) return;
    setBusySourceId(src.id);
    setNotice(null);
    try {
      await siteAdminRequest<{ ok: boolean }>(`/api/admin/news/sources/${src.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: src.name,
          url: src.url,
          category: patch.category ?? src.category,
          enabled: patch.enabled ?? src.enabled,
          sort: src.sort,
        }),
      });
      await loadSources();
      onFeedChanged();
    } catch (error) {
      setNotice({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setBusySourceId(null);
    }
  }

  async function handleDeleteSource(src: FeedSourceItem) {
    if (busySourceId !== null) return;
    setBusySourceId(src.id);
    setNotice(null);
    try {
      await siteAdminRequest<{ ok: boolean }>(`/api/admin/news/sources/${src.id}`, {
        method: "DELETE",
      });
      setConfirmDeleteId(null);
      setNotice({ tone: "info", text: `已删除订阅源「${src.name}」。` });
      await loadSources();
      onFeedChanged();
    } catch (error) {
      setNotice({ tone: "error", text: describeSiteAdminError(error) });
    } finally {
      setBusySourceId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="news-rss-modal-title"
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
              id="news-rss-modal-title"
              className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white"
            >
              <Rss className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              RSS 订阅源管理
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              自定义添加 RSS / Atom 地址，或一键订阅精选中文与英文技术资讯源。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭 RSS 管理弹窗"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 transition hover:border-sky-400 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Feedback Banner */}
        {notice ? (
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

        {/* 1. Custom RSS Form */}
        <section className="mt-4 rounded-xl border border-slate-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-800/50">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            添加自定义 RSS 源
          </h3>
          <form onSubmit={(event) => void handleCustomSubmit(event)} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <label
                  htmlFor="rss-source-name"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  源名称
                </label>
                <input
                  id="rss-source-name"
                  type="text"
                  required
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：少数派"
                  className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/90 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-5">
                <label
                  htmlFor="rss-source-url"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  RSS 地址
                </label>
                <input
                  id="rss-source-url"
                  type="url"
                  required
                  maxLength={500}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/90 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="rss-source-category"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  所属分类
                </label>
                <select
                  id="rss-source-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as FeedCategory)}
                  className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/90 px-2.5 text-xs font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-100"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={fetchAfterAdd}
                  onChange={(event) => setFetchAfterAdd(event.target.checked)}
                  className="accent-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500"
                />
                添加后立即抓取
              </label>

              <button
                type="submit"
                disabled={submittingCustom || !name.trim() || !url.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-xs transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50"
              >
                {submittingCustom ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    {fetchAfterAdd ? "添加并抓取中…" : "添加中…"}
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    添加订阅源
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* 2. Curated Preset RSS Directory */}
        <section className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              精选 RSS 源一键订阅
            </h3>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="精选源分类">
              {PRESET_TABS.map((tabItem) => {
                const active = presetTab === tabItem.key;
                return (
                  <button
                    key={tabItem.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setPresetTab(tabItem.key)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                      active
                        ? "bg-sky-600 text-white shadow-xs"
                        : "border border-slate-200/80 bg-white/70 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300"
                    }`}
                  >
                    {tabItem.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {visiblePresets.map((preset) => {
              const subscribed = !loadingSources && isPresetSubscribed(preset);
              const busy = subscribingPresetUrl === preset.url;
              const categoryLabel =
                CATEGORY_OPTIONS.find((opt) => opt.value === preset.category)?.label ??
                preset.category;

              return (
                <div
                  key={preset.url}
                  className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-200/70 bg-white/65 px-3 py-2.5 dark:border-white/10 dark:bg-slate-800/45"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {preset.name}
                      </span>
                      <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                        {categoryLabel}
                      </span>
                    </div>
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
                      disabled={loadingSources || busy || Boolean(subscribingPresetUrl) || submittingCustom}
                      onClick={() => void handlePresetSubscribe(preset)}
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

        {/* 3. Subscribed Sources List */}
        <section className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              已订阅源 ({sources.length})
            </h3>
            <button
              type="button"
              disabled={loadingSources}
              onClick={() => void loadSources()}
              className="text-xs font-medium text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-sky-400"
            >
              刷新列表
            </button>
          </div>

          {loadingSources && sources.length === 0 ? (
            <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-slate-200/70 bg-white/60 py-6 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
              <LoaderCircle className="h-4 w-4 animate-spin text-sky-500" />
              正在加载已订阅源…
            </div>
          ) : sourcesError ? (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/50 dark:text-rose-200">
              <span>加载订阅源失败：{sourcesError}</span>
              <button
                type="button"
                onClick={() => void loadSources()}
                className="shrink-0 rounded-full bg-rose-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                重试
              </button>
            </div>
          ) : sources.length === 0 ? (
            <div className="mt-2.5 rounded-xl border border-slate-200/70 bg-white/60 py-6 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
              还没有订阅源，在上方添加自定义 RSS 或选择精选源即可开始。
            </div>
          ) : (
            <div className="mt-2.5 divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/70 bg-white/65 dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
              {sources.map((src) => {
                const isBusy = busySourceId === src.id;
                const confirmingDelete = confirmDeleteId === src.id;

                return (
                  <div
                    key={src.id}
                    className="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-xs font-semibold ${
                            src.enabled
                              ? "text-slate-800 dark:text-slate-100"
                              : "text-slate-400 line-through dark:text-slate-500"
                          }`}
                        >
                          {src.name}
                        </span>
                        {!src.enabled ? (
                          <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            已停用
                          </span>
                        ) : null}
                        {src.last_error ? (
                          <span
                            title={src.last_error}
                            className="inline-flex max-w-56 items-center gap-1 truncate rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                          >
                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{src.last_error}</span>
                          </span>
                        ) : null}
                      </div>

                      <p
                        title={src.url}
                        className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400"
                      >
                        {src.url}
                      </p>

                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {src.item_count} 条 ·{" "}
                        {src.last_fetched_at
                          ? `上次抓取 ${formatRelativeTime(src.last_fetched_at)}`
                          : "尚未抓取"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                      <select
                        aria-label={`${src.name} 分类`}
                        value={src.category}
                        disabled={isBusy}
                        onChange={(event) =>
                          void handleUpdateSource(src, {
                            category: event.target.value as FeedCategory,
                          })
                        }
                        className="h-7 rounded-lg border border-slate-200/80 bg-white/90 px-2 text-[11px] font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-200"
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleUpdateSource(src, { enabled: !src.enabled })
                        }
                        className={`h-7 rounded-lg border px-2.5 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 ${
                          src.enabled
                            ? "border-slate-200/80 bg-white/80 text-slate-700 hover:border-amber-400 hover:text-amber-700 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-200"
                            : "border-emerald-400/60 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                        }`}
                      >
                        {src.enabled ? "停用" : "启用"}
                      </button>

                      {confirmingDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteSource(src)}
                            className="h-7 rounded-lg bg-rose-600 px-2.5 text-[11px] font-medium text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50"
                          >
                            {isBusy ? "删除中…" : "确认删除"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-7 rounded-lg border border-slate-200/80 bg-white/80 px-2 text-[11px] text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-300"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          aria-label={`删除 ${src.name}`}
                          title="删除订阅源"
                          onClick={() => setConfirmDeleteId(src.id)}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200/80 bg-white/80 text-slate-500 transition hover:border-rose-300 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

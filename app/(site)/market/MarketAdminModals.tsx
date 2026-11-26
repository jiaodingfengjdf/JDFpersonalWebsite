"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Bell, Check, Plus, Search, Trash2, X } from "lucide-react";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type {
  AlertRule,
  MarketAlertItem,
  MarketKind,
  MarketQuoteItem,
  MarketScope,
  MarketSearchResult,
} from "@/server/modules/market/contracts";
import { PRESET_GROUPS, type MarketPresetGroup } from "./market-format";

const ALERT_RULES: Array<{ value: AlertRule; label: string; shortLabel: string }> = [
  { value: "up_pct", label: "涨幅达到（%）", shortLabel: "涨幅 ≥" },
  { value: "down_pct", label: "跌幅达到（%）", shortLabel: "跌幅 ≥" },
  { value: "price_above", label: "价格上穿", shortLabel: "价格 ≥" },
  { value: "price_below", label: "价格下穿", shortLabel: "价格 ≤" },
];

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/50 bg-white/90 p-5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/90">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-3 dark:border-white/10">
          <div>
            <h3 id={titleId} className="text-base font-semibold text-slate-800 dark:text-white">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-500/10 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-400 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function MarketAddModal({
  watchItems,
  onClose,
  onAdded,
  onSelectExisting,
}: {
  watchItems: MarketQuoteItem[];
  onClose: () => void;
  onAdded: (newId: number) => Promise<void>;
  onSelectExisting: (watchId: number) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<MarketSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showHoldingFields, setShowHoldingFields] = useState(false);
  const [quickCost, setQuickCost] = useState("");
  const [quickShares, setQuickShares] = useState("");

  const [presetTab, setPresetTab] = useState<MarketPresetGroup["key"]>("etf");

  const [manualMarket, setManualMarket] = useState<MarketScope>("cn");
  const [manualKind, setManualKind] = useState<MarketKind>("stock");
  const [manualCode, setManualCode] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualCost, setManualCost] = useState("");
  const [manualShares, setManualShares] = useState("");

  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reqSeqRef = useRef(0);

  useEffect(() => {
    const q = searchText.trim();
    if (!q) return;

    const seq = ++reqSeqRef.current;
    const timer = setTimeout(() => {
      void siteAdminRequest<{ items: MarketSearchResult[] }>(
        `/api/admin/market/search?q=${encodeURIComponent(q)}`,
      )
        .then((res) => {
          if (reqSeqRef.current !== seq) return;
          setSearchResults(res.items);
          setSearchError(null);
        })
        .catch((reason: unknown) => {
          if (reqSeqRef.current !== seq) return;
          setSearchError(describeSiteAdminError(reason));
        })
        .finally(() => {
          if (reqSeqRef.current === seq) setSearchLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchText]);

  function handleSearchChange(nextValue: string) {
    setSearchText(nextValue);
    const trimmed = nextValue.trim();
    if (!trimmed) {
      reqSeqRef.current += 1;
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
  }

  function findWatchId(kind: MarketKind, code: string, fallbackWatchId?: number | null): number | null {
    const normalized = code.trim().toUpperCase();
    const matched = watchItems.find(
      (item) => item.kind === kind && item.code.toUpperCase() === normalized,
    );
    return matched?.id ?? fallbackWatchId ?? null;
  }

  async function submitWatch(
    key: string,
    payload: {
      market: MarketScope;
      kind: MarketKind;
      code: string;
      name: string;
      cost: number | null;
      shares: number | null;
    },
  ) {
    setError(null);
    setSubmittingKey(key);
    try {
      const created = await siteAdminRequest<{ id: number }>("/api/admin/market", {
        method: "POST",
        body: JSON.stringify({
          market: payload.market,
          kind: payload.kind,
          code: payload.code.trim().toUpperCase(),
          name: payload.name.trim(),
          cost: payload.cost,
          shares: payload.shares,
          sort: 100,
        }),
      });
      await onAdded(created.id);
      onClose();
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setSubmittingKey(null);
    }
  }

  function parseOptionalNumber(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }

  async function handleManualSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (manualMarket === "cn" && !/^\d{6}$/.test(code)) {
      setError("A 股 / 基金 / 指数代码应为 6 位数字，例如 600519 或 510300");
      return;
    }
    if (manualMarket === "us" && !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(code)) {
      setError("美股代码只允许字母、数字、点与连字符，例如 AAPL / SPX");
      return;
    }
    await submitWatch("manual", {
      market: manualMarket,
      kind: manualKind,
      code,
      name: manualName,
      cost: parseOptionalNumber(manualCost),
      shares: parseOptionalNumber(manualShares),
    });
  }

  const activePresetGroup = PRESET_GROUPS.find((g) => g.key === presetTab) ?? PRESET_GROUPS[0];

  return (
    <ModalShell
      title="搜索添加股票 / 基金 / 指数"
      subtitle="支持代码/中文/拼音联想，或从精选标的库一键加入自选（按 Esc 关闭）"
      onClose={onClose}
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/30 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* 1. 实时代码/名称联想搜索 */}
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              实时代码 / 名称联想搜索
            </h4>
            <button
              type="button"
              onClick={() => setShowHoldingFields((prev) => !prev)}
              className="text-xs text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
            >
              {showHoldingFields ? "收起持仓参数" : "＋ 附带持仓成本与份额"}
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={searchText}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="输入代码、名称或首字母，例如 600519、茅台、510300、AAPL、NVDA"
              className="w-full rounded-xl border border-slate-300/80 bg-white/80 py-2 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
            />
            {searchText && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {showHoldingFields && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200/70 bg-slate-500/5 p-2.5 dark:border-white/10">
              <label className="space-y-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400">持仓成本（可选）</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={quickCost}
                  onChange={(event) => setQuickCost(event.target.value)}
                  placeholder="例如 1450"
                  className="w-full rounded-lg border border-slate-300/80 bg-white/80 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400">持有份额（可选）</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={quickShares}
                  onChange={(event) => setQuickShares(event.target.value)}
                  placeholder="例如 100"
                  className="w-full rounded-lg border border-slate-300/80 bg-white/80 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>
            </div>
          )}

          {searchText.trim().length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200/70 bg-white/60 dark:border-white/10 dark:bg-slate-800/60">
              {searchLoading ? (
                <p className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  正在搜索全市场标的…
                </p>
              ) : searchError ? (
                <p className="p-3 text-center text-xs text-rose-500">{searchError}</p>
              ) : searchResults.length === 0 ? (
                <p className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  未找到匹配标的，可在下方手动表单添加。
                </p>
              ) : (
                <ul className="divide-y divide-slate-200/60 dark:divide-white/10">
                  {searchResults.map((item) => {
                    const existingId = findWatchId(item.kind, item.code, item.watch_id);
                    const key = `search:${item.secid}:${item.code}`;
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                              {item.name}
                            </span>
                            <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
                              {item.badge}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                            {item.code}
                          </p>
                        </div>
                        {existingId !== null ? (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectExisting(existingId);
                              onClose();
                            }}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-emerald-300"
                          >
                            <Check className="h-3 w-3" />
                            已在自选
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={submittingKey !== null}
                            onClick={() =>
                              void submitWatch(key, {
                                market: item.market,
                                kind: item.kind,
                                code: item.code,
                                name: item.name,
                                cost: parseOptionalNumber(quickCost),
                                shares: parseOptionalNumber(quickShares),
                              })
                            }
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-600 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-sky-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500"
                          >
                            <Plus className="h-3 w-3" />
                            {submittingKey === key ? "添加中…" : "加入自选"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* 2. 精选标的快捷库 */}
        <section className="space-y-2.5 border-t border-slate-200/70 pt-4 dark:border-white/10">
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            精选标的快捷库
          </h4>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="精选标的分类">
            {PRESET_GROUPS.map((group) => {
              const active = presetTab === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPresetTab(group.key)}
                  className={`rounded-full border px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    active
                      ? "border-sky-500 bg-sky-500/15 font-medium text-sky-700 dark:text-sky-300"
                      : "border-slate-200/80 bg-white/60 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300"
                  }`}
                >
                  {group.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {activePresetGroup.items.map((preset) => {
              const existingId = findWatchId(preset.kind, preset.code);
              const key = `preset:${preset.kind}:${preset.code}`;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/65 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-800/65"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                      {preset.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                      <span>{preset.code}</span>
                      <span className="rounded bg-slate-500/10 px-1 text-[10px]">{preset.tag}</span>
                    </p>
                  </div>
                  {existingId !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectExisting(existingId);
                        onClose();
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-emerald-300"
                    >
                      <Check className="h-3 w-3" />
                      已在自选
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submittingKey !== null}
                      onClick={() =>
                        void submitWatch(key, {
                          market: preset.market,
                          kind: preset.kind,
                          code: preset.code,
                          name: preset.name,
                          cost: parseOptionalNumber(quickCost),
                          shares: parseOptionalNumber(quickShares),
                        })
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-500 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                    >
                      <Plus className="h-3 w-3" />
                      {submittingKey === key ? "添加中…" : "加入自选"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. 手动代码兜底表单 */}
        <details className="rounded-xl border border-slate-200/70 bg-slate-500/5 px-3 py-2.5 dark:border-white/10">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300">
            手动代码兜底表单
          </summary>
          <form onSubmit={(event) => void handleManualSubmit(event)} className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <label className="space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">市场</span>
              <select
                value={manualMarket}
                onChange={(event) => {
                  const nextMarket = event.target.value as MarketScope;
                  setManualMarket(nextMarket);
                  if (nextMarket === "us" && manualKind === "fund") {
                    setManualKind("stock");
                  }
                }}
                className="w-full rounded-lg border border-slate-300/80 bg-white/85 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
              >
                <option value="cn">A 股 / 基金 / 指数</option>
                <option value="us">美股 / 美股指数</option>
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">类型</span>
              <select
                value={manualKind}
                onChange={(event) => setManualKind(event.target.value as MarketKind)}
                className="w-full rounded-lg border border-slate-300/80 bg-white/85 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
              >
                <option value="stock">股票 / ETF</option>
                <option value="index">指数</option>
                {manualMarket === "cn" && <option value="fund">基金</option>}
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">代码</span>
              <input
                type="text"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={manualMarket === "us" ? "AAPL / SPX" : "600519"}
                className="w-full rounded-lg border border-slate-300/80 bg-white/85 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">备注名（可选）</span>
              <input
                type="text"
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
                placeholder="贵州茅台"
                className="w-full rounded-lg border border-slate-300/80 bg-white/85 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">成本价（可选）</span>
              <input
                type="number"
                step="any"
                min="0"
                value={manualCost}
                onChange={(event) => setManualCost(event.target.value)}
                className="w-full rounded-lg border border-slate-300/80 bg-white/85 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">份额（可选）</span>
              <input
                type="number"
                step="any"
                min="0"
                value={manualShares}
                onChange={(event) => setManualShares(event.target.value)}
                className="w-full rounded-lg border border-slate-300/80 bg-white/85 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
              />
            </label>

            <div className="sm:col-span-3 flex justify-end pt-1">
              <button
                type="submit"
                disabled={submittingKey !== null}
                className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                {submittingKey === "manual" ? "提交中…" : "手动添加"}
              </button>
            </div>
          </form>
        </details>
      </div>
    </ModalShell>
  );
}

export function MarketHoldingModal({
  item,
  onClose,
  onSaved,
}: {
  item: MarketQuoteItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [cost, setCost] = useState(item.cost !== null ? String(item.cost) : "");
  const [shares, setShares] = useState(item.shares !== null ? String(item.shares) : "");
  const [sort, setSort] = useState(String(item.sort));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsedCost = cost.trim() ? Number(cost.trim()) : null;
    const parsedShares = shares.trim() ? Number(shares.trim()) : null;
    const parsedSort = sort.trim() ? Math.round(Number(sort.trim())) : 0;

    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setError("持仓成本应为不小于 0 的数字");
      return;
    }
    if (parsedShares !== null && (!Number.isFinite(parsedShares) || parsedShares < 0)) {
      setError("持有份额应为不小于 0 的数字");
      return;
    }
    if (!Number.isFinite(parsedSort) || parsedSort < 0 || parsedSort > 9999) {
      setError("排序值应在 0 ~ 9999 之间");
      return;
    }

    setSaving(true);
    try {
      await siteAdminRequest(`/api/admin/market/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          market: item.market,
          kind: item.kind,
          code: item.code,
          name: name.trim(),
          cost: parsedCost,
          shares: parsedShares,
          sort: parsedSort,
        }),
      });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={`设置持仓 · ${item.name}`}
      subtitle={`${item.code} · 留空成本或份额可清除持仓记录`}
      onClose={onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">显示名称</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">排序权重（越小越靠前）</span>
            <input
              type="number"
              min="0"
              max="9999"
              step="1"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              持仓成本（{item.currency}）
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              placeholder="留空表示无持仓"
              className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">持有份额 / 股数</span>
            <input
              type="number"
              min="0"
              step="any"
              value={shares}
              onChange={(event) => setShares(event.target.value)}
              placeholder="留空表示无持仓"
              className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300/80 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:text-slate-300"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            {saving ? "保存中…" : "保存持仓"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function MarketAlertModal({
  item,
  onClose,
}: {
  item: MarketQuoteItem;
  onClose: () => void;
}) {
  const [alerts, setAlerts] = useState<MarketAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rule, setRule] = useState<AlertRule>("up_pct");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshAlerts() {
    setLoading(true);
    try {
      const res = await siteAdminRequest<{ items: MarketAlertItem[] }>("/api/admin/market/alerts");
      setAlerts(res.items.filter((entry) => entry.watch_id === item.id));
      setError(null);
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void siteAdminRequest<{ items: MarketAlertItem[] }>("/api/admin/market/alerts")
      .then((res) => {
        if (!active) return;
        setAlerts(res.items.filter((entry) => entry.watch_id === item.id));
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(describeSiteAdminError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const num = Number(threshold);
    if (!Number.isFinite(num) || num <= 0) {
      setError("阈值应为大于 0 的数字");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await siteAdminRequest("/api/admin/market/alerts", {
        method: "POST",
        body: JSON.stringify({
          watch_id: item.id,
          rule,
          threshold: num,
          enabled: true,
        }),
      });
      setThreshold("");
      await refreshAlerts();
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(alert: MarketAlertItem) {
    setError(null);
    try {
      await siteAdminRequest(`/api/admin/market/alerts/${alert.id}`, {
        method: "PUT",
        body: JSON.stringify({
          rule: alert.rule,
          threshold: alert.threshold,
          enabled: !alert.enabled,
        }),
      });
      await refreshAlerts();
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    }
  }

  async function handleDelete(alertId: number) {
    setError(null);
    try {
      await siteAdminRequest(`/api/admin/market/alerts/${alertId}`, { method: "DELETE" });
      await refreshAlerts();
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    }
  }

  return (
    <ModalShell
      title={`涨跌提醒 · ${item.name}`}
      subtitle={`${item.code} · 单条规则触发后 30 分钟内不重复提醒`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={(event) => void handleCreate(event)} className="grid gap-2.5 sm:grid-cols-[1.3fr_1fr_auto]">
          <label className="space-y-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">提醒规则</span>
            <select
              value={rule}
              onChange={(event) => setRule(event.target.value as AlertRule)}
              className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-2.5 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
            >
              {ALERT_RULES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400">阈值</span>
            <input
              type="number"
              step="0.01"
              min="0.0001"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              placeholder={rule.endsWith("_pct") ? "例如 3" : "例如 100.5"}
              className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-white/15 dark:bg-slate-800/85 dark:text-slate-100"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-[34px] w-full items-center justify-center gap-1 rounded-xl bg-sky-600 px-3.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Bell className="h-3.5 w-3.5" />
              {saving ? "添加中…" : "添加提醒"}
            </button>
          </div>
        </form>

        <div className="space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            当前标的提醒规则
          </h4>
          {loading ? (
            <p className="text-xs text-slate-400">加载提醒规则…</p>
          ) : alerts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300/70 px-3 py-4 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              暂无针对「{item.name}」的提醒规则。
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert) => {
                const ruleMeta = ALERT_RULES.find((entry) => entry.value === alert.rule);
                return (
                  <li
                    key={alert.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {ruleMeta?.shortLabel ?? alert.rule} {alert.threshold}
                        {alert.rule.endsWith("_pct") ? "%" : ""}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          alert.enabled
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {alert.enabled ? "已启用" : "已停用"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleToggle(alert)}
                        className="rounded-full border border-slate-300/70 px-2.5 py-1 text-[11px] text-slate-600 hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:text-slate-300"
                      >
                        {alert.enabled ? "停用" : "启用"}
                      </button>
                      <button
                        type="button"
                        aria-label="删除提醒"
                        onClick={() => void handleDelete(alert.id)}
                        className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:outline-2 focus-visible:outline-sky-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

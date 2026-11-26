"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { ledgerDate, parseLedgerDate } from "@/lib/ledger-date";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type {
  LedgerAccount,
  LedgerCategory,
  LedgerKind,
  LedgerTransaction,
} from "@/server/modules/ledger/contracts";

export default function LedgerQuickEntryClient({
  accounts,
  categories,
}: {
  accounts: LedgerAccount[];
  categories: LedgerCategory[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LedgerKind>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string>(() =>
    accounts[0] ? String(accounts[0].id) : "",
  );
  const [categoryId, setCategoryId] = useState<string>("");
  const [dateStr, setDateStr] = useState<string>(() => ledgerDate());
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.kind === kind),
    [categories, kind],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving]);

  function openModal() {
    setKind("expense");
    setAmount("");
    setAccountId(accounts[0] ? String(accounts[0].id) : "");
    setCategoryId("");
    setDateStr(ledgerDate());
    setMerchant("");
    setNote("");
    setTagsText("");
    setError(null);
    setOpen(true);
  }

  function handleKindChange(nextKind: LedgerKind) {
    setKind(nextKind);
    if (categoryId) {
      const stillValid = categories.some(
        (category) => String(category.id) === categoryId && category.kind === nextKind,
      );
      if (!stillValid) setCategoryId("");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const numericAccount = Number(accountId);
    if (!Number.isInteger(numericAccount) || numericAccount <= 0) {
      setError("请先在账本后台创建一个账户后再记账");
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0.01) {
      setError("金额至少为 0.01");
      return;
    }

    const occurredAt = parseLedgerDate(dateStr);
    if (!Number.isFinite(occurredAt) || occurredAt <= 0) {
      setError("请选择有效日期");
      return;
    }

    const tags = tagsText
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10);

    setSaving(true);
    setError(null);
    try {
      await siteAdminRequest<LedgerTransaction>("/api/admin/ledger/transactions", {
        method: "POST",
        body: JSON.stringify({
          account_id: numericAccount,
          category_id: categoryId ? Number(categoryId) : null,
          kind,
          amount: numericAmount,
          occurred_at: occurredAt,
          merchant: merchant.trim(),
          note: note.trim(),
          tags,
        }),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(describeSiteAdminError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500"
      >
        <Plus className="h-3.5 w-3.5" />
        记一笔
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ledger-quick-entry-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setOpen(false);
          }}
        >
          <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/40 bg-white/95 p-5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2
                id="ledger-quick-entry-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                快速记一笔
              </h2>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                aria-label="关闭记账弹窗"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
                >
                  {error}
                </p>
              ) : null}

              {accounts.length === 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  还没有可用账户，请先
                  <Link href="/admin/ledger" className="ml-1 underline">
                    前往账本后台创建账户
                  </Link>
                  。
                </div>
              ) : null}

              {/* 支出 / 收入切换 */}
              <div
                role="group"
                aria-label="收支类型"
                className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-slate-800/70"
              >
                <button
                  type="button"
                  aria-pressed={kind === "expense"}
                  onClick={() => handleKindChange("expense")}
                  className={`rounded-lg py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    kind === "expense"
                      ? "bg-rose-500 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  支出
                </button>
                <button
                  type="button"
                  aria-pressed={kind === "income"}
                  onClick={() => handleKindChange("income")}
                  className={`rounded-lg py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    kind === "income"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  收入
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    金额 <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="100000000"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs tabular-nums text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    日期 <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    type="date"
                    value={dateStr}
                    onChange={(event) => setDateStr(event.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    账户 <span className="text-rose-500">*</span>
                  </span>
                  <select
                    required
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  >
                    {accounts.length === 0 ? (
                      <option value="">暂无账户</option>
                    ) : (
                      accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">分类</span>
                  <select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                  >
                    <option value="">不选分类</option>
                    {filteredCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.icon ? `${category.icon} ` : ""}
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">商户 / 对方</span>
                <input
                  maxLength={120}
                  value={merchant}
                  onChange={(event) => setMerchant(event.target.value)}
                  placeholder="例如：星巴克、工资发放"
                  className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">备注</span>
                <input
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="简要记录消费或收入说明"
                  className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  标签（逗号分隔）
                </span>
                <input
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="例如：餐饮, 报销"
                  className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !saving && setOpen(false)}
                  className="rounded-full border border-slate-200/80 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving || accounts.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {saving ? "保存中…" : "确认记账"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

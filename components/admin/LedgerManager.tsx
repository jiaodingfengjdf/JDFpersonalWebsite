"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import { useConfirm } from "./ConfirmProvider";
import { adminRequest, describeAdminError } from "./admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ledgerDate, parseLedgerDate } from "@/lib/ledger-date";
import type {
  LedgerAccount,
  LedgerCategory,
  LedgerSummary,
  LedgerTransaction,
} from "@/server/modules/ledger/contracts";

const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function today() {
  return ledgerDate();
}

function currentMonth() {
  return today().slice(0, 7);
}

export default function LedgerManager() {
  const confirm = useConfirm();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [txns, setTxns] = useState<LedgerTransaction[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    kind: "expense" as "expense" | "income",
    amount: "",
    categoryId: "",
    accountId: "",
    date: today(),
    merchant: "",
    note: "",
  });

  const [newAccount, setNewAccount] = useState({ name: "", kind: "cash" });
  const [newCategory, setNewCategory] = useState({ name: "", kind: "expense" as "expense" | "income" });
  const [budget, setBudget] = useState({ categoryId: "", amount: "" });
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, list, acc, cat] = await Promise.all([
        adminRequest<LedgerSummary>(`/api/admin/ledger/summary?month=${month}`),
        adminRequest<{ items: LedgerTransaction[]; total: number }>(
          `/api/admin/ledger/transactions?month=${month}&limit=200`,
        ),
        adminRequest<LedgerAccount[]>("/api/admin/ledger/accounts"),
        adminRequest<LedgerCategory[]>("/api/admin/ledger/categories"),
      ]);
      setSummary(sum);
      setTxns(list.items);
      setAccounts(acc);
      setCategories(cat);
      if (!form.accountId && acc.length > 0) {
        setForm((prev) => ({ ...prev, accountId: String(acc[0].id) }));
      }
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setLoading(false);
    }
    // form.accountId 只在首次填充，避免每次刷新把用户的选择覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const categoryOptions = useMemo(
    () => categories.filter((item) => item.kind === form.kind),
    [categories, form.kind],
  );

  async function submit() {
    if (!form.accountId || !form.amount) return;
    setBusy(true);
    setError(null);
    try {
      await adminRequest("/api/admin/ledger/transactions", {
        method: "POST",
        body: JSON.stringify({
          account_id: Number(form.accountId),
          category_id: form.categoryId ? Number(form.categoryId) : null,
          kind: form.kind,
          amount: Number(form.amount),
          occurred_at: parseLedgerDate(form.date),
          merchant: form.merchant,
          note: form.note,
          tags: [],
        }),
      });
      setForm((prev) => ({ ...prev, amount: "", merchant: "", note: "" }));
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: LedgerTransaction) {
    const confirmed = await confirm(`删除这笔「${item.category_name || "未分类"} ${money(item.amount)}」？`);
    if (!confirmed) return;
    try {
      await adminRequest(`/api/admin/ledger/transactions/${item.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function addAccount() {
    if (!newAccount.name.trim()) return;
    try {
      await adminRequest("/api/admin/ledger/accounts", {
        method: "POST",
        body: JSON.stringify({ ...newAccount, initial_balance: 0, sort: 100 }),
      });
      setNewAccount({ name: "", kind: "cash" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function addCategory() {
    if (!newCategory.name.trim()) return;
    try {
      await adminRequest("/api/admin/ledger/categories", {
        method: "POST",
        body: JSON.stringify({ ...newCategory, icon: "", sort: 100 }),
      });
      setNewCategory({ name: "", kind: newCategory.kind });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function saveBudget() {
    if (!budget.categoryId || !budget.amount) return;
    try {
      await adminRequest("/api/admin/ledger/budgets", {
        method: "POST",
        body: JSON.stringify({
          category_id: Number(budget.categoryId),
          month,
          amount: Number(budget.amount),
        }),
      });
      setBudget({ categoryId: "", amount: "" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function importCsv(file: File) {
    setImportMessage(null);
    if (!form.accountId || file.size > 512 * 1024) {
      setImportMessage("请选择目标账户，CSV 文件大小上限为 512 KB。");
      return;
    }
    setImporting(true);
    try {
      const bytes = await file.arrayBuffer();
      let csv: string;
      try {
        csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        csv = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
      }
      const result = await adminRequest<{ inserted: number; skipped: number }>(
        "/api/admin/ledger/import",
        { method: "POST", body: JSON.stringify({ csv, account_id: Number(form.accountId) }) },
      );
      setImportMessage(`导入完成：新增 ${result.inserted} 条，跳过 ${result.skipped} 条`);
      await load();
    } catch (reason) {
      setImportMessage(describeAdminError(reason));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="生活"
        title="记账"
        description="账户、分类、流水、预算与账单导入；前台 /ledger 只对登录后的你可见。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              aria-label="账单月份"
              value={month}
              onChange={(event) => setMonth(event.target.value || currentMonth())}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-sky-500"
              href={`/api/admin/ledger/export?month=${encodeURIComponent(month)}`}
              download
            >
              <Download className="size-4" />
              导出本月 CSV
            </a>
          </div>
        }
      />

      {error && <AdminError message={error} />}

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "收入", value: summary?.income ?? 0, tone: "text-emerald-600" },
          { label: "支出", value: summary?.expense ?? 0, tone: "text-rose-600" },
          { label: "结余", value: summary?.balance ?? 0, tone: "text-slate-900" },
          {
            label: "本月笔数",
            value: txns.length,
            tone: "text-sky-600",
            raw: true,
          },
        ].map((card) => (
          <Card key={card.label} className="p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-xl font-semibold ${card.tone}`}>
              {card.raw ? card.value : `¥ ${money(card.value as number)}`}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>快速记一笔</CardTitle>
          </CardHeader>
          <div className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
            <div className="flex gap-1 sm:col-span-2">
              {(["expense", "income"] as const).map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant={form.kind === kind ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, kind, categoryId: "" }))
                  }
                >
                  {kind === "expense" ? "支出" : "收入"}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>金额</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>日期</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>分类</Label>
              <select
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">未分类</option>
                {categoryOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>账户</Label>
              <select
                value={form.accountId}
                onChange={(event) => setForm((prev) => ({ ...prev, accountId: event.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（¥{money(item.balance)}）
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>商家</Label>
              <Input
                value={form.merchant}
                onChange={(event) => setForm((prev) => ({ ...prev, merchant: event.target.value }))}
                placeholder="楼下面馆"
              />
            </div>
            <div className="space-y-1">
              <Label>备注</Label>
              <Input
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="午饭"
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={submit} disabled={busy || !form.amount || !form.accountId}>
                <Plus className="mr-1 h-4 w-4" />
                {busy ? "保存中…" : "记一笔"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>预算与分类占比</CardTitle>
          </CardHeader>
          <div className="space-y-3 p-4 pt-0">
            {(summary?.budgets ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">还没有预算，下面可添加。</p>
            )}
            {(summary?.budgets ?? []).map((item) => {
              const percent = item.amount > 0 ? Math.min(100, (item.spent / item.amount) * 100) : 0;
              return (
                <div key={item.category_id}>
                  <div className="flex justify-between text-xs">
                    <span>{item.category_name}</span>
                    <span className="text-muted-foreground">
                      ¥{money(item.spent)} / ¥{money(item.amount)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${percent > 90 ? "bg-rose-500" : "bg-sky-500"}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 pt-2">
              <select
                value={budget.categoryId}
                onChange={(event) => setBudget((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">选分类</option>
                {categories
                  .filter((item) => item.kind === "expense")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
              <Input
                type="number"
                className="h-9 w-28"
                value={budget.amount}
                onChange={(event) => setBudget((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="预算"
              />
              <Button size="sm" variant="outline" onClick={saveBudget}>
                保存
              </Button>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs text-muted-foreground">本月支出构成</p>
              {(summary?.by_category ?? [])
                .filter((item) => item.kind === "expense")
                .slice(0, 6)
                .map((item) => {
                  const max = summary?.expense || 1;
                  const width = Math.max(2, (item.total / max) * 100);
                  return (
                    <div key={`${item.category_id}-${item.category_name}`} className="mb-1.5">
                      <div className="flex justify-between text-xs">
                        <span>{item.category_name}</span>
                        <span className="text-muted-foreground">¥{money(item.total)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>本月流水（{txns.length}）</CardTitle>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground focus-within:outline-2 focus-within:outline-sky-500">
            <Upload className="h-3.5 w-3.5" />
            {importing ? "正在导入…" : "导入 CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCsv(file);
                event.target.value = "";
              }}
            />
          </label>
        </CardHeader>
        <div className="p-4 pt-0">
          <p className="mb-2 text-xs text-muted-foreground">
            导入到录入表单选中的账户。CSV 首行包含日期、金额，可附商家、备注。日期用 YYYY-MM-DD，支出用负数。
          </p>
          {importMessage && (
            <p role="status" className="mb-2 text-xs text-muted-foreground">{importMessage}</p>
          )}
          {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {!loading && txns.length === 0 && (
            <p className="text-sm text-muted-foreground">本月还没有记录。</p>
          )}
          <div className="divide-y">
            {txns.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">
                  {new Date(item.occurred_at).toLocaleDateString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.category_name || "未分类"}
                  {item.merchant ? ` · ${item.merchant}` : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{item.account_name}</span>
                <span
                  className={`w-24 shrink-0 text-right text-sm font-medium ${
                    item.kind === "income" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {item.kind === "income" ? "+" : "-"}
                  {money(item.amount)}
                </span>
                <Button variant="ghost" size="sm" aria-label="删除流水" onClick={() => void remove(item)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>账户</CardTitle>
          </CardHeader>
          <div className="space-y-2 p-4 pt-0">
            {accounts.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span>{item.name}</span>
                <span className="text-muted-foreground">¥{money(item.balance)}</span>
              </div>
            ))}
            <div className="flex gap-2 border-t pt-2">
              <Input
                value={newAccount.name}
                onChange={(event) => setNewAccount((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="新账户名"
                className="h-9"
              />
              <select
                value={newAccount.kind}
                onChange={(event) => setNewAccount((prev) => ({ ...prev, kind: event.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="cash">现金</option>
                <option value="wechat">微信</option>
                <option value="alipay">支付宝</option>
                <option value="bank">银行卡</option>
                <option value="fund">基金</option>
              </select>
              <Button size="sm" variant="outline" onClick={addAccount}>
                添加
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分类</CardTitle>
          </CardHeader>
          <div className="space-y-2 p-4 pt-0">
            <div className="flex flex-wrap gap-1">
              {categories.map((item) => (
                <span
                  key={item.id}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    item.kind === "income"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-slate-500/10 text-slate-600"
                  }`}
                >
                  {item.name}
                </span>
              ))}
            </div>
            <div className="flex gap-2 border-t pt-2">
              <Input
                value={newCategory.name}
                onChange={(event) => setNewCategory((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="新分类名"
                className="h-9"
              />
              <select
                value={newCategory.kind}
                onChange={(event) =>
                  setNewCategory((prev) => ({ ...prev, kind: event.target.value as "income" | "expense" }))
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
              <Button size="sm" variant="outline" onClick={addCategory}>
                添加
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

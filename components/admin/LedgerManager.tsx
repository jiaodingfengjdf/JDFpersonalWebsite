"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import { useConfirm } from "./ConfirmProvider";
import { adminRequest, describeAdminError } from "./admin-api";
import { formatMoney, formatMonthDay } from "@/lib/format";
import { ledgerDate, parseLedgerDate } from "@/lib/ledger-date";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  LedgerAccount,
  LedgerCategory,
  LedgerSummary,
  LedgerTransaction,
} from "@/server/modules/ledger/contracts";

function today() {
  return ledgerDate();
}

function currentMonth() {
  return today().slice(0, 7);
}

const ACCOUNT_KINDS = [
  { value: "cash", label: "现金" },
  { value: "wechat", label: "微信" },
  { value: "alipay", label: "支付宝" },
  { value: "bank", label: "银行卡" },
  { value: "fund", label: "基金" },
  { value: "other", label: "其他" },
] as const;

type TransactionForm = {
  kind: "expense" | "income";
  amount: string;
  categoryId: string;
  accountId: string;
  date: string;
  merchant: string;
  note: string;
};

function transactionForm(item: LedgerTransaction): TransactionForm {
  return {
    kind: item.kind,
    amount: String(item.amount),
    categoryId: item.category_id ? String(item.category_id) : "",
    accountId: String(item.account_id),
    date: ledgerDate(item.occurred_at),
    merchant: item.merchant,
    note: item.note,
  };
}

type AccountForm = {
  name: string;
  kind: string;
  initial_balance: string;
  currency: "CNY" | "USD";
  sort: string;
};

function accountForm(item: LedgerAccount): AccountForm {
  return {
    name: item.name,
    kind: item.kind,
    initial_balance: String(item.initial_balance),
    currency: item.currency,
    sort: String(item.sort),
  };
}

export default function LedgerManager() {
  const confirm = useConfirm();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [txns, setTxns] = useState<LedgerTransaction[]>([]);
  /** 接口返回的当月总笔数；txns 只是当前已加载的分页，不能当总数用。 */
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(200);
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

  const [newAccount, setNewAccount] = useState({
    name: "", kind: "cash", initial_balance: "0", currency: "CNY" as "CNY" | "USD",
  });
  const [newCategory, setNewCategory] = useState({ name: "", kind: "expense" as "expense" | "income" });
  const [budget, setBudget] = useState({ categoryId: "", amount: "" });
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingTxn, setEditingTxn] = useState<{ id: number; form: TransactionForm } | null>(null);
  const [editingAccount, setEditingAccount] = useState<{ id: number; form: AccountForm } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, list, acc, cat] = await Promise.all([
        adminRequest<LedgerSummary>(`/api/admin/ledger/summary?month=${month}`),
        adminRequest<{ items: LedgerTransaction[]; total: number }>(
          `/api/admin/ledger/transactions?month=${month}&limit=${limit}`,
        ),
        adminRequest<LedgerAccount[]>("/api/admin/ledger/accounts"),
        adminRequest<LedgerCategory[]>("/api/admin/ledger/categories"),
      ]);
      setSummary(sum);
      setTxns(list.items);
      setTotal(list.total);
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
  }, [month, limit]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const categoryOptions = useMemo(
    () => categories.filter((item) => item.kind === form.kind),
    [categories, form.kind],
  );

  const editCategoryOptions = useMemo(
    () => categories.filter((item) => item.kind === (editingTxn?.form.kind ?? "expense")),
    [categories, editingTxn?.form.kind],
  );

  // 与前台 LedgerCharts 同口径：最多 6 类，其余合并成「其他」。
  const expenseShares = useMemo(() => {
    const expenses = (summary?.by_category ?? [])
      .filter((item) => item.kind === "expense" && item.total > 0)
      .sort((a, b) => b.total - a.total);
    const top = expenses.slice(0, 6).map((item) => ({
      key: `${item.category_id}-${item.category_name}`,
      name: item.category_name,
      total: item.total,
    }));
    const rest = expenses.slice(6).reduce((sum, item) => sum + item.total, 0);
    if (rest > 0) top.push({ key: "other", name: "其他", total: Number(rest.toFixed(2)) });
    return top;
  }, [summary]);

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
    const confirmed = await confirm(
      `删除这笔「${item.category_name || "未分类"} ${formatMoney(item.amount)}」？`,
    );
    if (!confirmed) return;
    try {
      await adminRequest(`/api/admin/ledger/transactions/${item.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function saveEdit(id: number) {
    const edit = editingTxn;
    if (!edit || edit.id !== id || !edit.form.accountId || !edit.form.amount) return;
    const values = edit.form;
    setBusy(true);
    setError(null);
    try {
      await adminRequest(`/api/admin/ledger/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          account_id: Number(values.accountId),
          category_id: values.categoryId ? Number(values.categoryId) : null,
          kind: values.kind,
          amount: Number(values.amount),
          occurred_at: parseLedgerDate(values.date),
          merchant: values.merchant,
          note: values.note,
          tags: [],
        }),
      });
      setEditingTxn(null);
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function addAccount() {
    if (!newAccount.name.trim()) return;
    try {
      await adminRequest("/api/admin/ledger/accounts", {
        method: "POST",
        body: JSON.stringify({
          ...newAccount,
          initial_balance: Number(newAccount.initial_balance || 0),
          sort: 100,
        }),
      });
      setNewAccount({ name: "", kind: "cash", initial_balance: "0", currency: "CNY" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function saveAccount(id: number) {
    const edit = editingAccount;
    if (!edit || edit.id !== id || !edit.form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminRequest(`/api/admin/ledger/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.form.name,
          kind: edit.form.kind,
          initial_balance: Number(edit.form.initial_balance || 0),
          currency: edit.form.currency,
          sort: Number(edit.form.sort || 0),
        }),
      });
      setEditingAccount(null);
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setBusy(false);
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
        eyebrow="兴趣"
        title="记账"
        description="账户、分类、流水、预算与账单导入；前台 /ledger 只对登录后的你可见。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              aria-label="账单月份"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value || currentMonth());
                setLimit(200);
              }}
              className="h-9 rounded-md border border-slate-300/80 bg-white/70 px-3 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100"
            />
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300/80 bg-white/70 px-3 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100 dark:hover:bg-white/10"
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
          { label: "收入", value: summary?.income ?? 0, tone: "text-emerald-600", raw: false },
          { label: "支出", value: summary?.expense ?? 0, tone: "text-rose-600", raw: false },
          { label: "结余", value: summary?.balance ?? 0, tone: "text-slate-900", raw: false },
          { label: "本月笔数", value: total, tone: "text-sky-600", raw: true },
        ].map((card) => (
          <Card key={card.label} className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className={`mt-1 text-xl font-semibold ${card.tone}`}>
              {card.raw ? card.value : formatMoney(card.value)}
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
              <Select
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
              >
                <option value="">未分类</option>
                {categoryOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>账户</Label>
              <Select
                value={form.accountId}
                onChange={(event) => setForm((prev) => ({ ...prev, accountId: event.target.value }))}
              >
                {accounts.filter((item) => !item.archived).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（{formatMoney(item.balance)}）
                  </option>
                ))}
              </Select>
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
              <p className="text-sm text-slate-500 dark:text-slate-400">还没有预算，下面可添加。</p>
            )}
            {(summary?.budgets ?? []).map((item) => {
              const percent = item.amount > 0 ? Math.min(100, (item.spent / item.amount) * 100) : 0;
              return (
                <div key={item.category_id}>
                  <div className="flex justify-between text-xs">
                    <span>{item.category_name}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatMoney(item.spent)} / {formatMoney(item.amount)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-500/15">
                    <div
                      className={`h-full rounded-full ${percent > 90 ? "bg-rose-500" : "bg-sky-500"}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 pt-2">
              <Select
                value={budget.categoryId}
                onChange={(event) => setBudget((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="h-9 flex-1"
              >
                <option value="">选分类</option>
                {categories
                  .filter((item) => item.kind === "expense")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
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
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">本月支出构成</p>
              {expenseShares.map((item) => {
                const max = summary?.expense || 1;
                const width = Math.max(2, (item.total / max) * 100);
                return (
                  <div key={item.key} className="mb-1.5">
                    <div className="flex justify-between text-xs">
                      <span>{item.name}</span>
                      <span className="text-slate-500 dark:text-slate-400">{formatMoney(item.total)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-500/15">
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
          <CardTitle>本月流水（{total}）</CardTitle>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md text-xs text-slate-500 hover:text-slate-800 focus-within:outline-2 focus-within:outline-sky-500 dark:text-slate-400 dark:hover:text-slate-100">
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
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            导入到录入表单选中的账户。CSV 首行包含日期、金额，可附商家、备注。日期用 YYYY-MM-DD，支出用负数。
          </p>
          {importMessage && (
            <p role="status" className="mb-2 text-xs text-slate-500 dark:text-slate-400">{importMessage}</p>
          )}
          {loading && <p className="text-sm text-slate-500 dark:text-slate-400">加载中…</p>}
          {!loading && txns.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">本月还没有流水。</p>
          )}
          <div className="divide-y">
            {txns.map((item) =>
              editingTxn?.id === item.id ? (
                <div key={item.id} className="space-y-3 py-3">
                  <div className="flex gap-1">
                    {(["expense", "income"] as const).map((kind) => (
                      <Button
                        key={kind}
                        size="sm"
                        variant={editingTxn.form.kind === kind ? "default" : "outline"}
                        onClick={() =>
                          setEditingTxn((prev) =>
                            prev
                              ? { ...prev, form: { ...prev.form, kind, categoryId: "" } }
                              : prev,
                          )
                        }
                      >
                        {kind === "expense" ? "支出" : "收入"}
                      </Button>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label>金额</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={editingTxn.form.amount}
                        onChange={(event) =>
                          setEditingTxn((prev) =>
                            prev
                              ? { ...prev, form: { ...prev.form, amount: event.target.value } }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>日期</Label>
                      <Input
                        type="date"
                        value={editingTxn.form.date}
                        onChange={(event) =>
                          setEditingTxn((prev) =>
                            prev ? { ...prev, form: { ...prev.form, date: event.target.value } } : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>账户</Label>
                      <Select
                        value={editingTxn.form.accountId}
                        onChange={(event) =>
                          setEditingTxn((prev) =>
                            prev
                              ? { ...prev, form: { ...prev.form, accountId: event.target.value } }
                              : prev,
                          )
                        }
                      >
                        {[
                          ...accounts.filter((account) => !account.archived),
                          // 历史流水可能挂在已归档账户上，编辑时保留该选项避免被静默改写。
                          ...accounts.filter(
                            (account) =>
                              account.archived &&
                              account.id === Number(editingTxn.form.accountId),
                          ),
                        ].map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                            {account.archived ? "（已归档）" : ""}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>分类</Label>
                      <Select
                        value={editingTxn.form.categoryId}
                        onChange={(event) =>
                          setEditingTxn((prev) =>
                            prev
                              ? { ...prev, form: { ...prev.form, categoryId: event.target.value } }
                              : prev,
                          )
                        }
                      >
                        <option value="">未分类</option>
                        {editCategoryOptions.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>商家</Label>
                      <Input
                        value={editingTxn.form.merchant}
                        onChange={(event) =>
                          setEditingTxn((prev) =>
                            prev
                              ? { ...prev, form: { ...prev.form, merchant: event.target.value } }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>备注</Label>
                      <Input
                        value={editingTxn.form.note}
                        onChange={(event) =>
                          setEditingTxn((prev) =>
                            prev ? { ...prev, form: { ...prev.form, note: event.target.value } } : prev,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !editingTxn.form.amount || !editingTxn.form.accountId}
                      onClick={() => void saveEdit(item.id)}
                    >
                      保存
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTxn(null)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="flex items-center gap-3 py-2">
                  <span className="w-20 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {formatMonthDay(item.occurred_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.category_name || "未分类"}
                    {item.merchant ? ` · ${item.merchant}` : ""}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{item.account_name}</span>
                  <span
                    className={`w-24 shrink-0 text-right text-sm font-medium tabular-nums ${
                      item.kind === "income" ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatMoney(item.kind === "income" ? item.amount : -item.amount, { sign: true })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="编辑流水"
                    onClick={() => setEditingTxn({ id: item.id, form: transactionForm(item) })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="删除流水" onClick={() => void remove(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            )}
          </div>
          {txns.length < total && (
            <div className="pt-3 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((value) => value + 200)}
                disabled={loading}
              >
                加载更多（已显示 {txns.length} / {total}）
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>账户</CardTitle>
          </CardHeader>
          <div className="space-y-2 p-4 pt-0">
            {accounts.map((item) =>
              editingAccount?.id === item.id ? (
                <div key={item.id} className="space-y-2 rounded-lg border p-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={editingAccount.form.name}
                      onChange={(event) =>
                        setEditingAccount((prev) =>
                          prev
                            ? { ...prev, form: { ...prev.form, name: event.target.value } }
                            : prev,
                        )
                      }
                      placeholder="账户名"
                      className="h-9"
                    />
                    <Select
                      value={editingAccount.form.kind}
                      onChange={(event) =>
                        setEditingAccount((prev) =>
                          prev ? { ...prev, form: { ...prev.form, kind: event.target.value } } : prev,
                        )
                      }
                      className="h-9"
                    >
                      {ACCOUNT_KINDS.map((kind) => (
                        <option key={kind.value} value={kind.value}>
                          {kind.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={editingAccount.form.initial_balance}
                      onChange={(event) =>
                        setEditingAccount((prev) =>
                          prev
                            ? {
                                ...prev,
                                form: { ...prev.form, initial_balance: event.target.value },
                              }
                            : prev,
                        )
                      }
                      placeholder="初始余额"
                      className="h-9"
                    />
                    <Select
                      value={editingAccount.form.currency}
                      onChange={(event) =>
                        setEditingAccount((prev) =>
                          prev
                            ? {
                                ...prev,
                                form: {
                                  ...prev.form,
                                  currency: event.target.value as "CNY" | "USD",
                                },
                              }
                            : prev,
                        )
                      }
                      className="h-9"
                    >
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !editingAccount.form.name.trim()}
                      onClick={() => void saveAccount(item.id)}
                    >
                      保存
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingAccount(null)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {item.name}
                    <span className="ml-1 text-xs text-slate-400">{item.currency}</span>
                    {item.archived === 1 && (
                      <span className="ml-1 text-xs text-slate-400">（已归档）</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatMoney(item.balance)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`编辑账户 ${item.name}`}
                      onClick={() => setEditingAccount({ id: item.id, form: accountForm(item) })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              ),
            )}
            <div className="grid gap-2 border-t pt-2 sm:grid-cols-2">
              <Input
                value={newAccount.name}
                onChange={(event) => setNewAccount((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="新账户名"
                className="h-9"
              />
              <Select
                value={newAccount.kind}
                onChange={(event) => setNewAccount((prev) => ({ ...prev, kind: event.target.value }))}
                className="h-9"
              >
                {ACCOUNT_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                inputMode="decimal"
                value={newAccount.initial_balance}
                onChange={(event) =>
                  setNewAccount((prev) => ({ ...prev, initial_balance: event.target.value }))
                }
                placeholder="初始余额"
                className="h-9"
              />
              <div className="flex gap-2">
                <Select
                  value={newAccount.currency}
                  onChange={(event) =>
                    setNewAccount((prev) => ({
                      ...prev,
                      currency: event.target.value as "CNY" | "USD",
                    }))
                  }
                  className="h-9"
                >
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                </Select>
                <Button size="sm" variant="outline" onClick={addAccount} className="flex-1">
                  添加
                </Button>
              </div>
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
              <Select
                value={newCategory.kind}
                onChange={(event) =>
                  setNewCategory((prev) => ({ ...prev, kind: event.target.value as "income" | "expense" }))
                }
                className="h-9 w-auto"
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </Select>
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

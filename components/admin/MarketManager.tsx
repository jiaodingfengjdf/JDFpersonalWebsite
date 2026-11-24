"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import { useConfirm } from "./ConfirmProvider";
import { adminRequest, describeAdminError } from "./admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketAlertItem, MarketOverview } from "@/server/modules/market/contracts";

const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RULE_OPTIONS: Array<{ value: MarketAlertItem["rule"]; label: string; hint: string }> = [
  { value: "up_pct", label: "涨幅达到（%）", hint: "当日涨幅大于等于该值时提醒，例如 3" },
  { value: "down_pct", label: "跌幅达到（%）", hint: "当日跌幅大于等于该值时提醒，例如 2" },
  { value: "price_above", label: "价格上穿", hint: "现价大于等于该价格时提醒" },
  { value: "price_below", label: "价格下穿", hint: "现价小于等于该价格时提醒" },
];

const RULE_LABEL: Record<MarketAlertItem["rule"], string> = {
  up_pct: "涨幅 ≥",
  down_pct: "跌幅 ≥",
  price_above: "价格 ≥",
  price_below: "价格 ≤",
};

export default function MarketManager() {
  const confirm = useConfirm();
  const [data, setData] = useState<MarketOverview | null>(null);
  const [alerts, setAlerts] = useState<MarketAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ market: "cn", kind: "stock", code: "", name: "", cost: "", shares: "" });
  const [alertForm, setAlertForm] = useState({ watchId: "", rule: "up_pct", threshold: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, alertData] = await Promise.all([
        adminRequest<MarketOverview>("/api/admin/market"),
        adminRequest<{ items: MarketAlertItem[] }>("/api/admin/market/alerts"),
      ]);
      setData(overview);
      setAlerts(alertData.items);
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  async function add() {
    const code = form.code.trim().toUpperCase();
    if (form.market === "cn" && !/^\d{6}$/.test(code)) {
      setError("A 股代码应为 6 位数字，例如 600519 / 000001 / 110022");
      return;
    }
    if (form.market === "us" && !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(code)) {
      setError("美股代码只允许字母、数字、点与连字符，例如 AAPL / SPX");
      return;
    }
    setSaving(true);
    try {
      await adminRequest("/api/admin/market", {
        method: "POST",
        body: JSON.stringify({
          market: form.market,
          kind: form.kind,
          code,
          name: form.name.trim(),
          cost: form.cost ? Number(form.cost) : null,
          shares: form.shares ? Number(form.shares) : null,
          sort: 100,
        }),
      });
      setForm({ ...form, code: "", name: "", cost: "", shares: "" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function saveHolding(
    id: number,
    item: MarketOverview["items"][number],
    cost: string,
    shares: string,
  ) {
    try {
      await adminRequest(`/api/admin/market/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          market: item.market,
          kind: item.kind,
          code: item.code,
          name: item.name,
          cost: cost ? Number(cost) : null,
          shares: shares ? Number(shares) : null,
          sort: item.id,
        }),
      });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function remove(id: number, name: string) {
    const confirmed = await confirm(`从自选里移除「${name}」？`);
    if (!confirmed) return;
    try {
      await adminRequest(`/api/admin/market/${id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function addAlert() {
    const watchId = Number(alertForm.watchId);
    const threshold = Number(alertForm.threshold);
    if (!watchId) {
      setError("先选择一个自选标的");
      return;
    }
    if (!Number.isFinite(threshold) || threshold <= 0) {
      setError("阈值应为大于 0 的数字");
      return;
    }
    setSaving(true);
    try {
      await adminRequest("/api/admin/market/alerts", {
        method: "POST",
        body: JSON.stringify({
          watch_id: watchId,
          rule: alertForm.rule,
          threshold,
          enabled: true,
        }),
      });
      setAlertForm((prev) => ({ ...prev, threshold: "" }));
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAlert(item: MarketAlertItem) {
    try {
      await adminRequest(`/api/admin/market/alerts/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          rule: item.rule,
          threshold: item.threshold,
          enabled: !item.enabled,
        }),
      });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function removeAlert(item: MarketAlertItem) {
    const confirmed = await confirm(`删除「${item.name}」的提醒规则？`);
    if (!confirmed) return;
    try {
      await adminRequest(`/api/admin/market/alerts/${item.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="投资"
        title="行情"
        description="自选基金、股票与指数；填了成本价和份额后，首页/行情页会算浮动盈亏。数据来自腾讯公开行情接口。"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
        }
      />

      {error && <AdminError message={error} />}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.totals.map((total) => (
            <Card key={total.currency} className="p-4">
              <p className="text-xs text-muted-foreground">
                {total.currency === "USD" ? "美元持仓" : "人民币持仓"}
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">市值</dt>
                  <dd className="font-semibold">
                    {total.value === null ? "行情不足" : `${total.currency === "USD" ? "$" : "¥"} ${money(total.value)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">成本</dt>
                  <dd className="font-semibold">
                    {`${total.currency === "USD" ? "$" : "¥"} ${money(total.cost)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">浮动盈亏</dt>
                  <dd
                    className={`font-semibold ${
                      (total.profit ?? 0) >= 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {total.profit === null
                      ? "行情不足"
                      : `${total.currency === "USD" ? "$" : "¥"} ${money(total.profit)}`}
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>添加自选</CardTitle>
        </CardHeader>
        <div className="grid gap-3 p-4 pt-0 md:grid-cols-4 xl:grid-cols-7">
          <div className="space-y-1">
            <Label>市场</Label>
            <select
              value={form.market}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  market: event.target.value,
                  kind: event.target.value === "us" && prev.kind === "fund" ? "stock" : prev.kind,
                }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="cn">A 股 / 基金</option>
              <option value="us">美股 / 美股指数</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>类型</Label>
            <select
              value={form.kind}
              onChange={(event) => setForm((prev) => ({ ...prev, kind: event.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="stock">股票</option>
              <option value="index">指数</option>
              {form.market === "cn" && <option value="fund">基金</option>}
            </select>
          </div>
          <div className="space-y-1">
            <Label>代码</Label>
            <Input
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              placeholder={form.market === "us" ? "AAPL / SPX / NDX" : "600519"}
            />
          </div>
          <div className="space-y-1">
            <Label>备注名（可选）</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="贵州茅台"
            />
          </div>
          <div className="space-y-1">
            <Label>成本价（可选）</Label>
            <Input
              type="number"
              value={form.cost}
              onChange={(event) => setForm((prev) => ({ ...prev, cost: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>份额（可选）</Label>
            <Input
              type="number"
              value={form.shares}
              onChange={(event) => setForm((prev) => ({ ...prev, shares: event.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={add} disabled={saving}>
              <Plus className="mr-1 h-4 w-4" />
              添加
            </Button>
          </div>
        </div>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <div className="space-y-2">
        {(data?.items ?? []).map((item) => (
          <Card key={item.id} className="grid items-center gap-3 p-3 md:grid-cols-[1.4fr_repeat(4,1fr)_auto]">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.code} · {item.market === "us" ? "美股" : "A股"} ·{" "}
                {item.kind === "fund" ? "基金" : item.kind === "index" ? "指数" : "股票"}
                {item.stale ? " · 缓存" : ""}
              </p>
            </div>
            <div className="text-sm">
              <p className={item.change_pct >= 0 ? "text-rose-600" : "text-emerald-600"}>
                {item.price > 0 ? `${item.currency === "USD" ? "$" : "¥"}${money(item.price)}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.change_pct >= 0 ? "+" : ""}
                {item.change_pct.toFixed(2)}%
              </p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">成本 / 份额</p>
              <p>
                {item.cost ?? "—"} / {item.shares ?? "—"}
              </p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">市值</p>
              <p>
                {item.market_value === null
                  ? "—"
                  : `${item.currency === "USD" ? "$" : "¥"}${money(item.market_value)}`}
              </p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">盈亏</p>
              <p className={(item.profit ?? 0) >= 0 ? "text-rose-600" : "text-emerald-600"}>
                {item.profit === null
                  ? "—"
                  : `${item.currency === "USD" ? "$" : "¥"}${money(item.profit)}`}
                {item.profit_pct !== null ? ` (${item.profit_pct.toFixed(2)}%)` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const cost = window.prompt("成本价（留空表示无持仓）", item.cost?.toString() ?? "");
                  if (cost === null) return;
                  const shares = window.prompt("份额/股数", item.shares?.toString() ?? "");
                  if (shares === null) return;
                  void saveHolding(item.id, item, cost, shares);
                }}
              >
                持仓
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void remove(item.id, item.name)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>涨跌提醒</CardTitle>
        </CardHeader>
        <div className="space-y-4 p-4 pt-0">
          <div className="grid gap-3 md:grid-cols-[1.2fr_1.3fr_1fr_auto]">
            <div className="space-y-1">
              <Label>自选标的</Label>
              <select
                value={alertForm.watchId}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, watchId: event.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">选择标的</option>
                {(data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（{item.code}）
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>规则</Label>
              <select
                value={alertForm.rule}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, rule: event.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {RULE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>阈值</Label>
              <Input
                type="number"
                step="0.01"
                value={alertForm.threshold}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, threshold: event.target.value }))}
                placeholder={alertForm.rule.endsWith("_pct") ? "3" : "10.5"}
              />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => void addAlert()} disabled={saving}>
                <Plus className="mr-1 h-4 w-4" />
                添加提醒
              </Button>
            </div>
          </div>

          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有提醒规则。</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">
                    {RULE_LABEL[item.rule]} {item.threshold}
                    {item.rule.endsWith("_pct") ? "%" : ""}
                  </span>
                  <span className={item.enabled ? "text-emerald-600" : "text-muted-foreground"}>
                    {item.enabled ? "已启用" : "已停用"}
                  </span>
                  {item.last_fired_at && (
                    <span className="text-xs text-muted-foreground">
                      上次提醒 {new Date(item.last_fired_at).toLocaleString("zh-CN")}
                    </span>
                  )}
                  <span className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void toggleAlert(item)}>
                      {item.enabled ? "停用" : "启用"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void removeAlert(item)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            规则由站内通知调度器定期评估，需在「预警通知」里启用「行情涨跌提醒」并选择推送渠道；单条规则 30 分钟内不重复提醒。
          </p>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        数据来源：腾讯行情（qt.gtimg.cn），60 秒缓存；行情仅供参考，不构成投资建议。
      </p>
    </div>
  );
}

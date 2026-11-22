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
import type { MarketOverview } from "@/server/modules/market/contracts";

const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MarketManager() {
  const confirm = useConfirm();
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: "stock", code: "", name: "", cost: "", shares: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminRequest<MarketOverview>("/api/admin/market"));
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!/^\d{6}$/.test(form.code.trim())) {
      setError("代码应为 6 位数字，例如 600519 / 000001 / 110022");
      return;
    }
    setSaving(true);
    try {
      await adminRequest("/api/admin/market", {
        method: "POST",
        body: JSON.stringify({
          kind: form.kind,
          code: form.code.trim(),
          name: form.name.trim(),
          cost: form.cost ? Number(form.cost) : null,
          shares: form.shares ? Number(form.shares) : null,
          sort: 100,
        }),
      });
      setForm({ kind: form.kind, code: "", name: "", cost: "", shares: "" });
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
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "持仓市值", value: data.total_value },
            { label: "持仓成本", value: data.total_cost },
            { label: "浮动盈亏", value: data.total_profit },
          ].map((card) => (
            <Card key={card.label} className="p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  card.label === "浮动盈亏"
                    ? card.value >= 0
                      ? "text-rose-600"
                      : "text-emerald-600"
                    : ""
                }`}
              >
                ¥ {money(card.value)}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>添加自选</CardTitle>
        </CardHeader>
        <div className="grid gap-3 p-4 pt-0 md:grid-cols-6">
          <div className="space-y-1">
            <Label>类型</Label>
            <select
              value={form.kind}
              onChange={(event) => setForm((prev) => ({ ...prev, kind: event.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="stock">股票</option>
              <option value="index">指数</option>
              <option value="fund">基金</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>代码</Label>
            <Input
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="600519"
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
                {item.code} · {item.kind === "fund" ? "基金" : item.kind === "index" ? "指数" : "股票"}
                {item.stale ? " · 缓存" : ""}
              </p>
            </div>
            <div className="text-sm">
              <p className={item.change_pct >= 0 ? "text-rose-600" : "text-emerald-600"}>
                {item.price > 0 ? money(item.price) : "—"}
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
              <p>{item.market_value === null ? "—" : money(item.market_value)}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">盈亏</p>
              <p className={(item.profit ?? 0) >= 0 ? "text-rose-600" : "text-emerald-600"}>
                {item.profit === null ? "—" : money(item.profit)}
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

      <p className="text-xs text-muted-foreground">
        数据来源：腾讯行情（qt.gtimg.cn），60 秒缓存；行情仅供参考，不构成投资建议。
      </p>
    </div>
  );
}

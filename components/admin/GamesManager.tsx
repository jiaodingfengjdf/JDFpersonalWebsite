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
import type { GameItemView } from "@/server/modules/games/contracts";

const STATUS = [
  { value: "playing", label: "在玩" },
  { value: "done", label: "通关" },
  { value: "backlog", label: "愿望单" },
  { value: "dropped", label: "弃坑" },
];

export default function GamesManager() {
  const confirm = useConfirm();
  const [items, setItems] = useState<GameItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", platform: "", hours: "", status: "playing", rating: "0", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminRequest<{ items: GameItemView[] }>("/api/admin/games");
      setItems(json.items);
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
    if (!form.title.trim()) return;
    try {
      await adminRequest("/api/admin/games", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          hours: Number(form.hours) || 0,
          rating: Number(form.rating),
          cover: "",
        }),
      });
      setForm({ ...form, title: "", hours: "", note: "" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function patch(item: GameItemView, body: Record<string, unknown>) {
    try {
      await adminRequest(`/api/admin/games/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: item.title,
          platform: item.platform,
          cover: item.cover,
          status: item.status,
          hours: item.hours,
          rating: item.rating,
          note: item.note,
          ...body,
        }),
      });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function remove(item: GameItemView) {
    if (!(await confirm(`删除《${item.title}》？`))) return;
    try {
      await adminRequest(`/api/admin/games/${item.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="生活"
        title="游戏"
        description="在玩 / 通关 / 愿望单，记时长与短评；前台 /games 自动分组。"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
        }
      />

      {error && <AdminError message={error} />}

      <Card>
        <CardHeader>
          <CardTitle>添加游戏</CardTitle>
        </CardHeader>
        <div className="grid gap-3 p-4 pt-0 md:grid-cols-5">
          <div className="space-y-1 md:col-span-2">
            <Label>标题</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="艾尔登法环"
            />
          </div>
          <div className="space-y-1">
            <Label>平台</Label>
            <Input
              value={form.platform}
              onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value }))}
              placeholder="Steam / PS5"
            />
          </div>
          <div className="space-y-1">
            <Label>时长（小时）</Label>
            <Input
              type="number"
              value={form.hours}
              onChange={(event) => setForm((prev) => ({ ...prev, hours: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>状态</Label>
            <select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {STATUS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <Label>备注</Label>
            <Input
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <Button className="w-full" onClick={add} disabled={!form.title.trim()}>
              <Plus className="mr-1 h-4 w-4" />
              添加
            </Button>
          </div>
        </div>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {[item.platform, `${item.hours}h`, item.rating > 0 ? `${item.rating}★` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <select
              value={item.status}
              onChange={(event) => void patch(item, { status: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {STATUS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => void remove(item)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

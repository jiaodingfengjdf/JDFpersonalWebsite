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
import type { FeedCategory, FeedSourceItem } from "@/server/modules/feed/contracts";

const CATEGORIES: Array<{ value: FeedCategory; label: string }> = [
  { value: "tech", label: "科技" },
  { value: "china", label: "国内" },
  { value: "world", label: "国际" },
  { value: "finance", label: "财经" },
  { value: "design", label: "设计" },
];

export default function NewsManager() {
  const confirm = useConfirm();
  const [sources, setSources] = useState<FeedSourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", category: "tech" as FeedCategory });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSources(await adminRequest<FeedSourceItem[]>("/api/admin/news/sources"));
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminRequest<{ fetched: number; inserted: number; failed: number }>(
        "/api/admin/news/refresh",
        { method: "POST" },
      );
      setMessage(`抓取完成：解析 ${result.fetched} 条，新增 ${result.inserted} 条，失败 ${result.failed} 个源`);
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!form.name.trim() || !form.url.trim()) return;
    try {
      await adminRequest("/api/admin/news/sources", {
        method: "POST",
        body: JSON.stringify({ ...form, enabled: true, sort: 100 }),
      });
      setForm({ name: "", url: "", category: form.category });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function remove(source: FeedSourceItem) {
    const confirmed = await confirm(`删除订阅「${source.name}」？它的所有条目也会被删掉。`);
    if (!confirmed) return;
    try {
      await adminRequest(`/api/admin/news/sources/${source.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function toggle(source: FeedSourceItem) {
    try {
      await adminRequest(`/api/admin/news/sources/${source.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: source.name,
          url: source.url,
          category: source.category,
          enabled: !source.enabled,
          sort: source.sort,
        }),
      });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="内容"
        title="新闻"
        description="RSS 订阅源与抓取；前台 /news 按分类展示，已读与星标状态仅你可见。"
        actions={
          <Button size="sm" onClick={refresh} disabled={busy}>
            <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "抓取中…" : "立即抓取"}
          </Button>
        }
      />

      {error && <AdminError message={error} />}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>添加订阅</CardTitle>
        </CardHeader>
        <div className="grid gap-3 p-4 pt-0 md:grid-cols-4">
          <div className="space-y-1">
            <Label>名称</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="少数派"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>RSS 地址</Label>
            <Input
              value={form.url}
              onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
              placeholder="https://example.com/feed"
            />
          </div>
          <div className="space-y-1">
            <Label>分类</Label>
            <select
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, category: event.target.value as FeedCategory }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <Button onClick={add}>
              <Plus className="mr-1 h-4 w-4" />
              添加
            </Button>
          </div>
        </div>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <div className="space-y-2">
        {sources.map((source) => (
          <Card key={source.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {source.name}
                {!source.enabled && (
                  <span className="ml-2 rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-500">
                    已停用
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {CATEGORIES.find((item) => item.value === source.category)?.label} · {source.url}
              </p>
              {source.last_error && (
                <p className="text-xs text-rose-500">上次失败：{source.last_error}</p>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {source.item_count} 条
              {source.last_fetched_at
                ? ` · ${new Date(source.last_fetched_at).toLocaleString("zh-CN")}`
                : " · 未抓取"}
            </div>
            <Button variant="outline" size="sm" onClick={() => void toggle(source)}>
              {source.enabled ? "停用" : "启用"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove(source)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

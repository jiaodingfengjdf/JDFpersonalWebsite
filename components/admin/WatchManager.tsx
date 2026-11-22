"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import ImageUploader from "./ImageUploader";
import { useConfirm } from "./ConfirmProvider";
import { adminRequest, describeAdminError } from "./admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WatchItemView } from "@/server/modules/watch/contracts";

const STATUS: Array<{ value: string; label: string }> = [
  { value: "want", label: "想看" },
  { value: "watching", label: "在看" },
  { value: "done", label: "看完" },
  { value: "dropped", label: "弃了" },
];

export default function WatchManager() {
  const confirm = useConfirm();
  const [items, setItems] = useState<WatchItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    kind: "movie",
    title: "",
    year: "",
    poster: "",
    status: "want",
    rating: "0",
    progress: "",
    note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminRequest<{ items: WatchItemView[] }>("/api/admin/watch");
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
      await adminRequest("/api/admin/watch", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          year: form.year ? Number(form.year) : null,
          rating: Number(form.rating),
          overview: "",
        }),
      });
      setForm({ ...form, title: "", poster: "", year: "", progress: "", note: "" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function patch(item: WatchItemView, body: Record<string, unknown>) {
    try {
      await adminRequest(`/api/admin/watch/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          kind: item.kind,
          title: item.title,
          year: item.year,
          poster: item.poster,
          overview: item.overview,
          status: item.status,
          rating: item.rating,
          note: item.note,
          progress: item.progress,
          ...body,
        }),
      });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function remove(item: WatchItemView) {
    if (!(await confirm(`删除《${item.title}》？`))) return;
    try {
      await adminRequest(`/api/admin/watch/${item.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="生活"
        title="影视"
        description="记录想看 / 在看 / 看完的影视与动画；前台 /watch 按状态筛选。"
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
          <CardTitle>添加一部</CardTitle>
        </CardHeader>
        <div className="grid gap-3 p-4 pt-0 md:grid-cols-4">
          <div className="space-y-1">
            <Label>标题</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="星际穿越"
            />
          </div>
          <div className="space-y-1">
            <Label>类型</Label>
            <select
              value={form.kind}
              onChange={(event) => setForm((prev) => ({ ...prev, kind: event.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="movie">电影</option>
              <option value="tv">剧集</option>
              <option value="anime">动画</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>年份</Label>
            <Input
              type="number"
              value={form.year}
              onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
              placeholder="2014"
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
          <div className="space-y-1">
            <Label>进度（可选）</Label>
            <Input
              value={form.progress}
              onChange={(event) => setForm((prev) => ({ ...prev, progress: event.target.value }))}
              placeholder="S02E03"
            />
          </div>
          <div className="space-y-1">
            <Label>评分</Label>
            <select
              value={form.rating}
              onChange={(event) => setForm((prev) => ({ ...prev, rating: event.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? "未评分" : `${value} 星`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>短评（可选）</Label>
            <Input
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <ImageUploader
              id="watch-poster"
              label="海报（可选）"
              value={form.poster}
              onChange={(url) => setForm((prev) => ({ ...prev, poster: url }))}
              hint="可上传，也可以填外链。"
            />
          </div>
          <div className="md:col-span-4">
            <Button onClick={add} disabled={!form.title.trim()}>
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
            <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
              {item.poster ? (
                // eslint-disable-next-line @next/next/no-img-element -- 海报来自上传或外链
                <img src={item.poster} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {[item.year, item.kind, item.progress, item.rating > 0 ? `${item.rating}★` : ""]
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

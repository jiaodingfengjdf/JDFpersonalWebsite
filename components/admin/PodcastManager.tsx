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
import type { PodcastShowView } from "@/server/modules/podcast/contracts";

export default function PodcastManager() {
  const confirm = useConfirm();
  const [shows, setShows] = useState<PodcastShowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetch("/api/podcast").then((response) => response.json());
      setShows(json.shows ?? []);
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
    if (!feedUrl.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminRequest<{ id: number; inserted: number }>(
        "/api/admin/podcast/shows",
        { method: "POST", body: JSON.stringify({ feedUrl: feedUrl.trim() }) },
      );
      setMessage(`订阅成功，抓取到 ${result.inserted} 集新节目`);
      setFeedUrl("");
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminRequest<{ shows: number; inserted: number }>(
        "/api/admin/podcast/refresh",
        { method: "POST" },
      );
      setMessage(`已检查 ${result.shows} 个节目，新增 ${result.inserted} 集`);
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function refresh(id: number) {
    try {
      const result = await adminRequest<{ inserted: number }>(
        `/api/admin/podcast/shows/${id}`,
        { method: "POST" },
      );
      setMessage(`新增 ${result.inserted} 集`);
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function remove(show: PodcastShowView) {
    const confirmed = await confirm(`取消订阅《${show.title}》？已抓取的单集也会删除。`);
    if (!confirmed) return;
    try {
      await adminRequest(`/api/admin/podcast/shows/${show.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="生活"
        title="播客"
        description="粘贴播客 RSS 订阅；前台 /podcast 站内播放并记住收听位置。"
        actions={
          <Button size="sm" onClick={refreshAll} disabled={busy}>
            <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "抓取中…" : "刷新全部"}
          </Button>
        }
      />

      {error && <AdminError message={error} />}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>订阅新节目</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-end gap-3 p-4 pt-0">
          <div className="min-w-72 flex-1 space-y-1">
            <Label htmlFor="feed">RSS 地址</Label>
            <Input
              id="feed"
              value={feedUrl}
              onChange={(event) => setFeedUrl(event.target.value)}
              placeholder="https://feed.syntax.fm/rss"
            />
          </div>
          <Button onClick={add} disabled={busy || !feedUrl.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            订阅
          </Button>
        </div>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <div className="space-y-2">
        {shows.map((show) => (
          <Card key={show.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
              {show.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- 封面来自播客 RSS
                <img src={show.cover} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{show.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {show.author || "未知主播"} · {show.episode_count} 集
                {show.last_checked_at
                  ? ` · ${new Date(show.last_checked_at).toLocaleString("zh-CN")}`
                  : " · 未抓取"}
              </p>
              {show.last_error && <p className="text-xs text-rose-500">{show.last_error}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh(show.id)}>
              刷新
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove(show)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

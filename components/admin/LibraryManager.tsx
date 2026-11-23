"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, RefreshCw, Trash2, Upload } from "lucide-react";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import { useConfirm } from "./ConfirmProvider";
import { adminRequest, describeAdminError } from "./admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LibraryBookView } from "@/server/modules/library/contracts";

const STATUS: Array<{ value: string; label: string }> = [
  { value: "unread", label: "未读" },
  { value: "reading", label: "在读" },
  { value: "done", label: "读完" },
  { value: "dropped", label: "搁置" },
];

export default function LibraryManager() {
  const confirm = useConfirm();
  const [books, setBooks] = useState<LibraryBookView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [author, setAuthor] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminRequest<{ items: LibraryBookView[] }>("/api/admin/library");
      setBooks(json.items);
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

  async function upload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (author.trim()) body.append("author", author.trim());
      const created = await adminRequest<{ id: number; totalUnits: number }>(
        "/api/admin/library/upload",
        { method: "POST", body },
      );
      setMessage(`上传成功：《${file.name}》，${created.totalUnits} 个章节`);
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setUploading(false);
    }
  }

  async function patch(book: LibraryBookView, patchBody: Record<string, unknown>) {
    try {
      await adminRequest(`/api/admin/library/${book.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: book.title,
          author: book.author,
          status: book.status,
          rating: book.rating,
          note: book.note,
          cover: book.cover,
          ...patchBody,
        }),
      });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  async function remove(book: LibraryBookView) {
    const confirmed = await confirm(`删除《${book.title}》？文件也会一并从列表移除。`);
    if (!confirmed) return;
    try {
      await adminRequest(`/api/admin/library/${book.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="生活"
        title="书架"
        description="上传 EPUB / TXT（≤50MB），前台 /library 在线阅读并自动记录进度。"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
        }
      />

      {error && <AdminError message={error} />}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>上传书籍</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-end gap-3 p-4 pt-0">
          <div className="space-y-1">
            <Label>作者（可选）</Label>
            <Input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="刘慈欣"
              className="w-40"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            {uploading ? "上传中…" : "选择 EPUB / TXT"}
            <input
              type="file"
              accept=".epub,.txt"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">书名取文件名，TXT 会按「第X章」自动分章。</p>
        </div>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <div className="space-y-2">
        {books.map((book) => (
          <Card key={book.id} className="flex flex-wrap items-center gap-3 p-3">
            <BookOpen className="h-5 w-5 shrink-0 text-sky-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{book.title}</p>
              <p className="text-xs text-muted-foreground">
                {[book.author, book.format.toUpperCase(), `${(book.bytes / 1024 / 1024).toFixed(1)}MB`, `${book.total_units} 章`]
                  .filter(Boolean)
                  .join(" · ")}
                {book.progress ? ` · 读到 ${book.progress.percent.toFixed(0)}%` : ""}
              </p>
            </div>
            <select
              value={book.status}
              onChange={(event) => void patch(book, { status: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {STATUS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={book.rating}
              onChange={(event) => void patch(book, { rating: Number(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? "未评分" : `${value} 星`}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => void remove(book)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ImageIcon, RefreshCw, Trash2, Upload } from "lucide-react";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import { useConfirm } from "./ConfirmProvider";
import { adminRequest, describeAdminError } from "./admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  BOOK_CATEGORIES,
  isSafeCoverUrl,
  type LibraryBookView,
} from "@/server/modules/library/contracts";

const STATUS: Array<{ value: string; label: string }> = [
  { value: "unread", label: "未读" },
  { value: "reading", label: "在读" },
  { value: "done", label: "读完" },
  { value: "dropped", label: "搁置" },
];

const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** Client-side guard; the server re-checks the bytes with magic-byte inspection. */
function coverFileProblem(file: File): string | null {
  if (file.type && !COVER_TYPES.has(file.type)) return "封面仅支持 JPG/PNG/WebP";
  if (!file.size) return "封面图片为空";
  if (file.size > MAX_COVER_BYTES) return "封面图片不能超过 5MB";
  return null;
}

function CategoryRowInput({
  book,
  onSave,
}: {
  book: LibraryBookView;
  onSave: (category: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(book.category);

  function commit() {
    const next = draft.trim();
    if (next !== book.category) {
      void onSave(next);
    } else if (draft !== book.category) {
      setDraft(book.category);
    }
  }

  return (
    <Input
      list="book-categories"
      value={draft}
      maxLength={40}
      aria-label={`《${book.title}》分类`}
      placeholder="分类"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(book.category);
          event.currentTarget.blur();
        }
      }}
      className="h-9 w-28 text-xs"
    />
  );
}

export default function LibraryManager() {
  const confirm = useConfirm();
  const [books, setBooks] = useState<LibraryBookView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrlInput, setCoverUrlInput] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const [editingCoverId, setEditingCoverId] = useState<number | null>(null);
  const [coverDraft, setCoverDraft] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);

  // Release the temporary object URL whenever the picked cover changes.
  useEffect(() => {
    return () => {
      if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

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

  function pickCover(file: File) {
    const problem = coverFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setCoverFile(file);
    setCoverUrlInput("");
    setCoverPreview(URL.createObjectURL(file));
  }

  function clearPickedCover() {
    setCoverFile(null);
    setCoverUrlInput("");
    setCoverPreview("");
  }

  async function upload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (author.trim()) body.append("author", author.trim());
      if (category.trim()) body.append("category", category.trim());
      if (coverFile) body.append("cover", coverFile);
      else if (coverUrlInput.trim()) body.append("cover", coverUrlInput.trim());
      const created = await adminRequest<{ id: number; totalUnits: number }>(
        "/api/admin/library/upload",
        { method: "POST", body },
      );
      setMessage(`上传成功：《${file.name}》，${created.totalUnits} 个章节`);
      clearPickedCover();
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setUploading(false);
    }
  }

  async function patch(book: LibraryBookView, patchBody: Record<string, unknown>): Promise<boolean> {
    try {
      await adminRequest(`/api/admin/library/${book.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: book.title,
          author: book.author,
          category: book.category,
          status: book.status,
          rating: book.rating,
          note: book.note,
          cover: book.cover,
          ...patchBody,
        }),
      });
      await load();
      return true;
    } catch (reason) {
      setError(describeAdminError(reason));
      return false;
    }
  }

  async function uploadCoverForBook(book: LibraryBookView, file: File) {
    const problem = coverFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setCoverBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("bookId", String(book.id));
      const result = await adminRequest<{ url: string }>("/api/admin/library/cover", {
        method: "POST",
        body,
      });
      setBooks((prev) => prev.map((item) => (item.id === book.id ? { ...item, cover: result.url } : item)));
      setMessage(`《${book.title}》封面已更新`);
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setCoverBusy(false);
    }
  }

  function beginCoverEdit(book: LibraryBookView) {
    setEditingCoverId(book.id);
    setCoverDraft(book.cover);
  }

  async function saveCoverUrl(book: LibraryBookView) {
    const value = coverDraft.trim();
    if (value && !isSafeCoverUrl(value)) {
      setError("封面地址无效");
      return;
    }
    if (await patch(book, { cover: value })) setEditingCoverId(null);
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
        eyebrow="兴趣"
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

      <datalist id="book-categories">
        {BOOK_CATEGORIES.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

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
          <div className="space-y-1">
            <Label>分类（可选）</Label>
            <Input
              list="book-categories"
              value={category}
              maxLength={40}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="如：技术、科幻"
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label>封面（可选）</Label>
            <div className="flex items-center gap-2">
              <Input
                value={coverUrlInput}
                onChange={(event) => {
                  setCoverUrlInput(event.target.value);
                  setCoverFile(null);
                  setCoverPreview("");
                }}
                placeholder="/uploads/... 或图片地址"
                className="w-56"
                disabled={uploading}
              />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300/80 px-3 py-2 text-sm hover:bg-slate-100 dark:border-white/10 dark:hover:bg-slate-800">
                <ImageIcon className="h-4 w-4" />
                上传封面
                <input
                  type="file"
                  accept={COVER_ACCEPT}
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) pickCover(file);
                  }}
                />
              </label>
            </div>
            {coverPreview && (
              // eslint-disable-next-line @next/next/no-img-element -- 本地预览使用 blob URL
              <img src={coverPreview} alt="封面预览" className="mt-2 h-24 w-16 rounded object-cover" />
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300/80 px-4 py-2 text-sm hover:bg-slate-100 dark:border-white/10 dark:hover:bg-slate-800">
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
          <p className="text-xs text-slate-500 dark:text-slate-400">书名取文件名，TXT 会按「第X章」自动分章；封面 JPG/PNG/WebP ≤5MB。</p>
        </div>
      </Card>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">加载中…</p>}

      <div className="space-y-2">
        {books.map((book) => (
          <Card key={book.id} className="flex flex-wrap items-center gap-3 p-3">
            <label
              className={`relative h-14 w-10 shrink-0 cursor-pointer overflow-hidden rounded border border-slate-200/70 bg-slate-200/60 dark:border-white/10 dark:bg-slate-700/60 ${coverBusy ? "opacity-50" : ""}`}
              title="点击上传封面"
            >
              {book.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链
                <img src={book.cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <BookOpen className="m-auto h-5 w-5 text-sky-500" />
              )}
              <input
                type="file"
                accept={COVER_ACCEPT}
                className="hidden"
                disabled={coverBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadCoverForBook(book, file);
                }}
              />
            </label>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{book.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {[
                  book.author,
                  book.category,
                  book.format.toUpperCase(),
                  `${(book.bytes / 1024 / 1024).toFixed(1)}MB`,
                  `${book.total_units} 章`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {book.progress ? ` · 读到 ${book.progress.percent.toFixed(0)}%` : ""}
              </p>
              {editingCoverId === book.id && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Input
                    value={coverDraft}
                    onChange={(event) => setCoverDraft(event.target.value)}
                    placeholder="/uploads/... 或图片地址"
                    className="h-7 w-56 text-xs"
                  />
                  <Button variant="outline" size="sm" className="h-7" onClick={() => void saveCoverUrl(book)}>
                    保存
                  </Button>
                  {book.cover && (
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => void patch(book, { cover: "" })}>
                      清除
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setEditingCoverId(null)}>
                    取消
                  </Button>
                </div>
              )}
            </div>
            <CategoryRowInput
              key={`${book.id}-${book.category}`}
              book={book}
              onSave={(nextCategory) => patch(book, { category: nextCategory })}
            />
            <Select
              value={book.status}
              onChange={(event) => void patch(book, { status: event.target.value })}
              className="h-9 w-auto"
            >
              {STATUS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Select
              value={book.rating}
              onChange={(event) => void patch(book, { rating: Number(event.target.value) })}
              className="h-9 w-auto"
            >
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? "未评分" : `${value} 星`}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="sm" title="修改封面地址" onClick={() => beginCoverEdit(book)}>
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove(book)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

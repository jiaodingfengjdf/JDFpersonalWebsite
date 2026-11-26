"use client";
/* eslint-disable @next/next/no-img-element -- 封面来自后台上传、外链或本地 blob 预览 */

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  AlertCircle,
  BookUp,
  ImageIcon,
  LoaderCircle,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import {
  BOOK_CATEGORIES,
  isSafeCoverUrl,
  type BookStatus,
  type LibraryBookView,
} from "@/server/modules/library/contracts";

const MAX_BOOK_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const LIBRARY_STATUS_OPTIONS: Array<{ value: BookStatus; label: string }> = [
  { value: "reading", label: "在读" },
  { value: "unread", label: "未读" },
  { value: "done", label: "读完" },
  { value: "dropped", label: "搁置" },
];

const UPLOAD_STATUS_OPTIONS: Array<{ value: BookStatus; label: string }> = [
  { value: "reading", label: "在读" },
  { value: "unread", label: "未读" },
  { value: "done", label: "读完" },
];

function validateBookFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".epub") && !lower.endsWith(".txt")) {
    return "仅支持上传 .epub 或 .txt 格式的电子书";
  }
  if (file.size <= 0) return "书籍文件为空";
  if (file.size > MAX_BOOK_BYTES) return "书籍文件大小不能超过 50MB";
  return null;
}

function validateCoverFile(file: File): string | null {
  if (file.type && !COVER_TYPES.has(file.type)) {
    return "封面图片仅支持 JPG、PNG 或 WebP 格式";
  }
  if (file.size <= 0) return "封面图片为空";
  if (file.size > MAX_COVER_BYTES) return "封面图片大小不能超过 5MB";
  return null;
}

export function CategoryPicker({
  value,
  onChange,
  disabled = false,
  inputId,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  inputId?: string;
}) {
  const trimmed = value.trim();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="快捷选择图书分类">
        {BOOK_CATEGORIES.map((cat) => {
          const active = trimmed === cat;
          return (
            <button
              key={cat}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(active ? "" : cat)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:opacity-50 ${
                active
                  ? "border-sky-500 bg-sky-500/15 text-sky-700 dark:border-sky-400 dark:bg-sky-400/20 dark:text-sky-300"
                  : "border-slate-200/90 bg-white/75 text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-white/10 dark:bg-slate-800/75 dark:text-slate-300 dark:hover:text-sky-300"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={value}
          maxLength={40}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="点击上方标签快选，或输入自定义分类…"
          className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 pr-8 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
        />
        {value ? (
          <button
            type="button"
            disabled={disabled}
            aria-label="清空分类"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StarRatingPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex items-center gap-0.5" role="group" aria-label="评分星级">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= value;
          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              aria-label={`评 ${star} 星`}
              aria-pressed={value === star}
              onClick={() => onChange(value === star ? 0 : star)}
              className="rounded-md p-1 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50"
            >
              <Star
                className={`h-5 w-5 transition-colors ${
                  active
                    ? "fill-amber-400 text-amber-400"
                    : "text-slate-300 hover:text-amber-300 dark:text-slate-600"
                }`}
              />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(0)}
        className={`rounded-full border px-2 py-0.5 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
          value === 0
            ? "border-sky-500 bg-sky-500/15 font-medium text-sky-700 dark:text-sky-300"
            : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10 dark:text-slate-400"
        }`}
      >
        未评分
      </button>
      {value > 0 ? (
        <span className="text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400">
          {value} / 5 星
        </span>
      ) : null}
    </div>
  );
}

export function UploadBookModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [autoTitle, setAutoTitle] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<BookStatus>("reading");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  function handlePickBook(file: File) {
    const problem = validateBookFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBookFile(file);
    const derived = file.name.replace(/\.[^.]+$/, "").trim();
    if (!title.trim() || title.trim() === autoTitle) {
      setTitle(derived);
    }
    setAutoTitle(derived);
  }

  function handlePickCover(file: File) {
    const problem = validateCoverFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setCoverFile(file);
    setCoverUrl("");
    setCoverPreview(URL.createObjectURL(file));
  }

  function clearCover() {
    setCoverFile(null);
    setCoverUrl("");
    setCoverPreview("");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (submitting) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) handlePickBook(dropped);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookFile) {
      setError("请先选择要上传的 EPUB 或 TXT 文件");
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("请填写书名");
      return;
    }
    const trimmedCoverUrl = coverUrl.trim();
    if (!coverFile && trimmedCoverUrl && !isSafeCoverUrl(trimmedCoverUrl)) {
      setError("封面地址无效，请使用 /uploads/... 路径或 http(s):// 图片链接");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", bookFile);
      body.append("title", trimmedTitle);
      if (author.trim()) body.append("author", author.trim());
      if (category.trim()) body.append("category", category.trim());
      body.append("status", status);
      if (coverFile) body.append("cover", coverFile);
      else if (trimmedCoverUrl) body.append("cover", trimmedCoverUrl);
      if (note.trim()) body.append("note", note.trim());

      const created = await siteAdminRequest<{ id: number; totalUnits: number }>(
        "/api/admin/library/upload",
        { method: "POST", body },
      );
      onSuccess(`已上传《${trimmedTitle}》（共 ${created.totalUnits} 节/章）`);
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  const effectivePreview =
    coverPreview || (coverUrl.trim() && isSafeCoverUrl(coverUrl.trim()) ? coverUrl.trim() : "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
      role="presentation"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-book-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/90"
      >
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3.5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <BookUp className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h2
              id="upload-book-modal-title"
              className="text-base font-semibold text-slate-800 dark:text-white"
            >
              上传新书到书架
            </h2>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="关闭上传弹窗"
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-300/70 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Drop zone / File Picker */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${
              dragging
                ? "border-sky-500 bg-sky-50/80 dark:bg-sky-950/40"
                : "border-slate-300/80 bg-slate-50/60 hover:border-sky-400 dark:border-white/15 dark:bg-slate-800/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.txt"
              className="hidden"
              disabled={submitting}
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                if (picked) handlePickBook(picked);
              }}
            />
            {bookFile ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {bookFile.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {bookFile.name.toLowerCase().endsWith(".epub") ? "EPUB" : "TXT"} ·{" "}
                    {formatBytes(bookFile.size)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full border border-sky-400/50 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
                >
                  更换文件
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Upload className="mx-auto h-6 w-6 text-sky-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  拖拽 .epub / .txt 文件到此处，或
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => fileInputRef.current?.click()}
                    className="ml-1 text-sky-600 underline hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                  >
                    点击选择文件
                  </button>
                </p>
                <p className="text-xs text-slate-400">支持 EPUB 与 UTF-8/GB18030 TXT，单文件 ≤ 50MB</p>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="upload-book-title"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                书名 <span className="text-rose-500">*</span>
              </label>
              <input
                id="upload-book-title"
                type="text"
                required
                maxLength={200}
                disabled={submitting}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="选择文件后自动填充，也可手动修改"
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="upload-book-author"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                作者
              </label>
              <input
                id="upload-book-author"
                type="text"
                maxLength={100}
                disabled={submitting}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="如：刘慈欣"
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="upload-book-category"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              图书分类
            </label>
            <CategoryPicker
              inputId="upload-book-category"
              value={category}
              onChange={setCategory}
              disabled={submitting}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="upload-book-status"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                阅读状态
              </label>
              <select
                id="upload-book-status"
                disabled={submitting}
                value={status}
                onChange={(event) => setStatus(event.target.value as BookStatus)}
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              >
                {UPLOAD_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="upload-book-cover-url"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                封面图片（可选，≤ 5MB）
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="upload-book-cover-url"
                  type="text"
                  maxLength={1000}
                  disabled={submitting}
                  value={coverUrl}
                  onChange={(event) => {
                    setCoverUrl(event.target.value);
                    setCoverFile(null);
                    setCoverPreview("");
                  }}
                  placeholder="/uploads/... 或图片 URL"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200/90 bg-white/85 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
                />
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-slate-200/90 bg-white/85 px-2.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-within:outline-2 focus-within:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-200">
                  <ImageIcon className="h-3.5 w-3.5" />
                  选图
                  <input
                    type="file"
                    accept={COVER_ACCEPT}
                    className="sr-only"
                    disabled={submitting}
                    onChange={(event) => {
                      const picked = event.target.files?.[0];
                      event.target.value = "";
                      if (picked) handlePickCover(picked);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {effectivePreview ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-slate-800/50">
              <img
                src={effectivePreview}
                alt="封面预览"
                className="h-16 w-12 rounded-md object-cover shadow-xs"
              />
              <div className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                  {coverFile ? coverFile.name : "封面外链/站内预览"}
                </p>
                {coverFile ? <p>{formatBytes(coverFile.size)}</p> : null}
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={clearCover}
                className="rounded-full px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                移除
              </button>
            </div>
          ) : null}

          <div className="space-y-1">
            <label
              htmlFor="upload-book-note"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              阅读笔记 / 简介
            </label>
            <textarea
              id="upload-book-note"
              rows={3}
              maxLength={2000}
              disabled={submitting}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="记录推荐理由、内容简介或阅读摘录…"
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200/70 pt-3.5 dark:border-white/10">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60"
            >
              {submitting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {submitting ? "正在上传…" : "上传并入库"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditBookModal({
  book,
  onClose,
  onSuccess,
}: {
  book: LibraryBookView;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [category, setCategory] = useState(book.category);
  const [status, setStatus] = useState<BookStatus>(book.status);
  const [rating, setRating] = useState(book.rating);
  const [coverUrl, setCoverUrl] = useState(book.cover);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [note, setNote] = useState(book.note);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = saving || deleting;

  useEffect(() => {
    return () => {
      if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  function handlePickCover(file: File) {
    const problem = validateCoverFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  function clearCover() {
    setCoverFile(null);
    setCoverUrl("");
    setCoverPreview("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("书名不能为空");
      return;
    }
    const trimmedCoverUrl = coverUrl.trim();
    if (!coverFile && trimmedCoverUrl && !isSafeCoverUrl(trimmedCoverUrl)) {
      setError("封面地址无效，请使用 /uploads/... 路径或 http(s):// 图片链接");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let finalCover = trimmedCoverUrl;
      if (coverFile) {
        const body = new FormData();
        body.append("file", coverFile);
        body.append("bookId", String(book.id));
        const uploaded = await siteAdminRequest<{ url: string }>("/api/admin/library/cover", {
          method: "POST",
          body,
        });
        finalCover = uploaded.url;
      }

      await siteAdminRequest(`/api/admin/library/${book.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: trimmedTitle,
          author: author.trim(),
          category: category.trim(),
          status,
          rating,
          note: note.trim(),
          cover: finalCover,
        }),
      });
      onSuccess(`已更新《${trimmedTitle}》`);
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await siteAdminRequest(`/api/admin/library/${book.id}`, { method: "DELETE" });
      onSuccess(`已删除《${book.title}》`);
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setDeleting(false);
    }
  }

  const effectivePreview =
    coverPreview || (coverUrl.trim() && isSafeCoverUrl(coverUrl.trim()) ? coverUrl.trim() : "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-book-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/90"
      >
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3.5 dark:border-white/10">
          <h2
            id="edit-book-modal-title"
            className="line-clamp-1 text-base font-semibold text-slate-800 dark:text-white"
          >
            编辑书籍 · 《{book.title}》
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="关闭编辑弹窗"
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSave(event)} className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-300/70 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="edit-book-title"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                书名 <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-book-title"
                type="text"
                required
                maxLength={200}
                disabled={busy}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="edit-book-author"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                作者
              </label>
              <input
                id="edit-book-author"
                type="text"
                maxLength={100}
                disabled={busy}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="佚名"
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-book-category"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              图书分类
            </label>
            <CategoryPicker
              inputId="edit-book-category"
              value={category}
              onChange={setCategory}
              disabled={busy}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="edit-book-status"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                阅读状态
              </label>
              <select
                id="edit-book-status"
                disabled={busy}
                value={status}
                onChange={(event) => setStatus(event.target.value as BookStatus)}
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              >
                {LIBRARY_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                个人评分
              </span>
              <StarRatingPicker value={rating} onChange={setRating} disabled={busy} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-book-cover-url"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              封面图片（上传文件或编辑地址）
            </label>
            <div className="flex items-center gap-2">
              <input
                id="edit-book-cover-url"
                type="text"
                maxLength={1000}
                disabled={busy}
                value={coverUrl}
                onChange={(event) => {
                  setCoverUrl(event.target.value);
                  setCoverFile(null);
                  setCoverPreview("");
                }}
                placeholder="/uploads/... 或 https://..."
                className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200/90 bg-white/85 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              />
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-slate-200/90 bg-white/85 px-3 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-within:outline-2 focus-within:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-200">
                <ImageIcon className="h-3.5 w-3.5" />
                上传新封面
                <input
                  type="file"
                  accept={COVER_ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    event.target.value = "";
                    if (picked) handlePickCover(picked);
                  }}
                />
              </label>
            </div>
            {effectivePreview ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-slate-800/50">
                <img
                  src={effectivePreview}
                  alt="封面预览"
                  className="h-14 w-10 rounded object-cover shadow-xs"
                />
                <div className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                    {coverFile ? `待上传：${coverFile.name}` : "当前封面预览"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={clearCover}
                  className="rounded-full px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  清除封面
                </button>
              </div>
            ) : null}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="edit-book-note"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              书评笔记 / 简介
            </label>
            <textarea
              id="edit-book-note"
              rows={4}
              maxLength={2000}
              disabled={busy}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="写点读后感、书籍简介或摘录…"
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3.5 dark:border-white/10">
            <div>
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    确定移除文件与记录？
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete()}
                    className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-rose-500 disabled:opacity-60"
                  >
                    {deleting ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
                    确认删除
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-full border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:text-slate-300"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-500 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/70"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除书籍
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? "保存中…" : "保存修改"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

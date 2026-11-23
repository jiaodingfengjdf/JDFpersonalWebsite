"use client";

import { useRef, useState } from "react";
import { ExternalLink, Pencil, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import AdminEmptyState from "./AdminEmptyState";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import ImageUploader from "./ImageUploader";
import { useConfirm } from "./ConfirmProvider";
import { adminRequest, describeAdminError } from "./admin-api";
import { useAdminData } from "./use-admin-data";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CollectionItem,
  CollectionKind,
  CollectionStatus,
} from "@/server/modules/collection/contracts";

interface CollectionPayload {
  items: CollectionItem[];
  total: number;
  counts: Record<string, number>;
  categories: Array<{ id: number; name: string }>;
}

const KIND_OPTIONS: Array<{ value: CollectionKind; label: string }> = [
  { value: "link", label: "站点" },
  { value: "movie", label: "影视" },
  { value: "music", label: "音乐" },
  { value: "book", label: "书籍" },
  { value: "product", label: "好物" },
  { value: "idea", label: "灵感" },
];

const STATUS_OPTIONS: Array<{ value: CollectionStatus; label: string }> = [
  { value: "saved", label: "收藏" },
  { value: "doing", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "dropped", label: "搁置" },
];

const PAGE_SIZE = 30;

interface FormState {
  kind: CollectionKind;
  title: string;
  url: string;
  cover: string;
  author: string;
  categoryId: string;
  tags: string;
  rating: string;
  status: CollectionStatus;
  note: string;
  isPublic: boolean;
  sort: string;
}

const emptyForm: FormState = {
  kind: "link",
  title: "",
  url: "",
  cover: "",
  author: "",
  categoryId: "",
  tags: "",
  rating: "0",
  status: "saved",
  note: "",
  isPublic: true,
  sort: "0",
};

function toForm(item: CollectionItem): FormState {
  return {
    kind: item.kind,
    title: item.title,
    url: item.url,
    cover: item.cover,
    author: item.author,
    categoryId: item.category_id ? String(item.category_id) : "",
    tags: item.tags.join(", "),
    rating: String(item.rating),
    status: item.status,
    note: item.note,
    isPublic: item.is_public,
    sort: String(item.sort),
  };
}

export default function CollectionManager() {
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const keywordInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, loading, error: loadError, reload } = useAdminData<CollectionPayload>(
    `/api/admin/collection?size=${PAGE_SIZE}&page=${page}&q=${encodeURIComponent(query)}`,
  );

  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  async function importBookmarks(file: File) {
    setImportResult(null);
    setActionError(null);
    setImporting(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("书签文件不能超过 2 MB。");
      const template = document.createElement("template");
      template.innerHTML = await file.text();
      const items = [];
      let ignored = 0;
      for (const link of template.content.querySelectorAll("a[href]")) {
        const href = link.getAttribute("href") ?? "";
        const url = URL.canParse(href) ? new URL(href) : null;
        if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 1000) {
          ignored += 1;
          continue;
        }
        items.push({ title: (link.textContent?.trim() || url.hostname).slice(0, 200), url: url.href });
        if (items.length > 1000) throw new Error("每次最多导入 1000 条书签。");
      }
      if (!items.length) throw new Error("文件里没有可导入的网页书签。");
      const result = await adminRequest<{ inserted: number; skipped: number }>("/api/admin/collection/import", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setKeyword("");
      setQuery("");
      setPage(1);
      setImportResult(`新增 ${result.inserted} 条私密书签，跳过 ${result.skipped} 条重复书签与 ${ignored} 条无效链接。`);
      reload();
    } catch (reason) {
      setActionError(describeAdminError(reason));
    } finally {
      setImporting(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: CollectionItem) {
    setEditingId(item.id);
    setForm(toForm(item));
    setFormError(null);
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        kind: form.kind,
        title: form.title.trim(),
        url: form.url.trim(),
        cover: form.cover.trim(),
        author: form.author.trim(),
        category_id: form.categoryId ? Number(form.categoryId) : null,
        tags: form.tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        rating: Number(form.rating) || 0,
        status: form.status,
        note: form.note.trim(),
        is_public: form.isPublic,
        sort: Number(form.sort) || 0,
      };
      if (editingId) {
        await adminRequest(`/api/admin/collection/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await adminRequest("/api/admin/collection", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      await reload();
    } catch (error) {
      setFormError(describeAdminError(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: CollectionItem) {
    const confirmed = await confirm(`确定删除「${item.title}」吗？`);
    if (!confirmed) return;
    setActionError(null);
    try {
      await adminRequest(`/api/admin/collection/${item.id}`, { method: "DELETE" });
      if (items.length === 1 && page > 1) setPage(page - 1);
      await reload();
    } catch (error) {
      setActionError(describeAdminError(error));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="内容"
        title="收藏"
        description="站点、影视、音乐、书、好物与灵感的统一收藏；前台「收藏中心」按类型展示。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => reload()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
            <Button variant="outline" size="sm" disabled={importing} onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1 h-4 w-4" />
              {importing ? "正在导入…" : "导入书签 HTML"}
            </Button>
            <input ref={fileInput} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBookmarks(file);
              event.target.value = "";
            }} />
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              新建收藏
            </Button>
          </div>
        }
      />

      {actionError && <AdminError message={actionError} />}
      {importResult && <p role="status" className="text-sm text-muted-foreground">{importResult}</p>}

      {formOpen && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? "编辑收藏" : "新建收藏"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <div className="grid gap-4 p-6 pt-0 md:grid-cols-2">
            {formError && (
              <div className="md:col-span-2">
                <AdminError message={formError} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="c-kind">类型</Label>
              <select
                id="c-kind"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.kind}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, kind: event.target.value as CollectionKind }))
                }
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-title">标题</Label>
              <Input
                id="c-title"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="例如：三体 / 星际穿越 / 少数派"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-url">链接（可选）</Label>
              <Input
                id="c-url"
                value={form.url}
                onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-author">作者 / 导演 / 商家</Label>
              <Input
                id="c-author"
                value={form.author}
                onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <ImageUploader
                id="c-cover"
                label="封面（可选）"
                value={form.cover}
                onChange={(url) => setForm((prev) => ({ ...prev, cover: url }))}
                hint="站点可留空，前台会自动取 favicon；影音书建议上传封面。"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-category">分类</Label>
              <select
                id="c-category"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.categoryId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, categoryId: event.target.value }))
                }
              >
                <option value="">不分类</option>
                {(data?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-status">状态</Label>
              <select
                id="c-status"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as CollectionStatus }))
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-tags">标签（逗号分隔）</Label>
              <Input
                id="c-tags"
                value={form.tags}
                onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="科幻, 待看"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-rating">评分</Label>
              <select
                id="c-rating"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.rating}
                onChange={(event) => setForm((prev) => ({ ...prev, rating: event.target.value }))}
              >
                {[0, 1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? "未评分" : `${value} 星`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="c-note">备注 / 短评</Label>
              <Textarea
                id="c-note"
                rows={2}
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, isPublic: event.target.checked }))
                  }
                />
                前台可见
              </label>
              <div className="flex items-center gap-2">
                <Label htmlFor="c-sort" className="text-xs text-muted-foreground">
                  排序
                </Label>
                <Input
                  id="c-sort"
                  type="number"
                  className="w-20"
                  value={form.sort}
                  onChange={(event) => setForm((prev) => ({ ...prev, sort: event.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 md:col-span-2">
              <Button onClick={save} disabled={saving || !form.title.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
            </div>
          </div>
        </Card>
      )}

      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        setQuery(keyword.trim());
        setPage(1);
      }}>
        <Input
          ref={keywordInput}
          aria-label="搜索收藏"
          value={keyword}
          maxLength={100}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索标题 / 标签 / 备注"
          className="max-w-xs"
        />
        {keyword && <Button type="button" size="sm" variant="ghost" aria-label="清除搜索" onClick={() => {
          setKeyword("");
          setQuery("");
          setPage(1);
          keywordInput.current?.focus();
        }}><X className="size-4" /></Button>}
        <Button type="submit" variant="outline" size="sm">搜索</Button>
        {data && <span role="status" className="text-sm text-muted-foreground">共 {data.total} 条</span>}
      </form>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {loadError && <AdminError message={loadError} />}
      {!loading && !loadError && items.length === 0 && (
        <AdminEmptyState title={query ? "没有匹配的收藏" : "还没有收藏"} description={query ? "试试其它关键词，或清除搜索。" : "新建一条收藏，或导入浏览器导出的书签 HTML。"} />
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="flex flex-row items-center gap-4 p-3">
            <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
              {item.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- 封面地址来自上传或后台配置
                <img src={item.cover} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{item.title}</span>
                {/^https?:\/\//i.test(item.url) && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`打开${item.title}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {!item.is_public && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">
                    私密
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  KIND_OPTIONS.find((option) => option.value === item.kind)?.label,
                  item.author,
                  item.category_name,
                  STATUS_OPTIONS.find((option) => option.value === item.status)?.label,
                  item.rating > 0 ? `${item.rating}★` : null,
                  item.tags.join(" / "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" aria-label={`编辑${item.title}`} onClick={() => openEdit(item)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`删除${item.title}`} onClick={() => remove(item)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {data && (pages > 1 || page > 1) && (
        <nav aria-label="收藏分页" className="flex items-center justify-center gap-4">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">第 {page} / {pages} 页</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</Button>
        </nav>
      )}
    </div>
  );
}

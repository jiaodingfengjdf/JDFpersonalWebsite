"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Pencil, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
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
import type { ThemePresetItem } from "@/server/modules/themes/contracts";

type Mode = "light" | "dark" | "auto";
type Kind = "gradient" | "image";

interface ThemeFormState {
  name: string;
  description: string;
  mode: Mode;
  kind: Kind;
  colors: string;
  images: string;
  blur: string;
  cover: string;
  sort: string;
}

const emptyForm: ThemeFormState = {
  name: "",
  description: "",
  mode: "auto",
  kind: "gradient",
  colors: "#f8fafc, #e0f2fe, #dbeafe",
  images: "",
  blur: "0",
  cover: "",
  sort: "100",
};

function toForm(theme: ThemePresetItem): ThemeFormState {
  return {
    name: theme.name,
    description: theme.description,
    mode: theme.mode,
    kind: theme.kind,
    colors: theme.colors.join(", "),
    images: theme.images.join("\n"),
    blur: String(theme.blur),
    cover: theme.cover,
    sort: String(theme.sort),
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ThemeManager() {
  const confirm = useConfirm();
  const [form, setForm] = useState<ThemeFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAdminData<ThemePresetItem[]>("/api/admin/themes");

  const themes = useMemo(
    () => (data ?? []).slice().sort((a, b) => a.sort - b.sort || a.id - b.id),
    [data],
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(theme: ThemePresetItem) {
    setEditingId(theme.id);
    setForm(toForm(theme));
    setFormError(null);
    setFormOpen(true);
  }

  const imageList = splitList(form.images);

  function setImages(list: string[]) {
    setForm((prev) => ({ ...prev, images: list.slice(0, 20).join("\n") }));
  }

  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageUploading(true);
    setImageError(null);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const image = await adminRequest<{ url: string }>("/api/admin/upload/image", {
          method: "POST",
          body,
        });
        added.push(image.url);
      }
      const next = [...splitList(form.images), ...added].slice(0, 20);
      setForm((prev) => ({
        ...prev,
        images: next.join("\n"),
        cover: prev.cover || added[0] || "",
      }));
    } catch (error) {
      setImageError(describeAdminError(error));
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function addUrl() {
    const value = urlDraft.trim();
    if (!value) return;
    if (imageList.includes(value)) {
      setUrlDraft("");
      return;
    }
    setImages([...imageList, value]);
    setForm((prev) => ({ ...prev, cover: prev.cover || value }));
    setUrlDraft("");
  }

  function removeImage(url: string) {
    setForm((prev) => {
      const next = splitList(prev.images).filter((item) => item !== url);
      return {
        ...prev,
        images: next.join("\n"),
        cover: prev.cover === url ? (next[0] ?? "") : prev.cover,
      };
    });
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        mode: form.mode,
        kind: form.kind,
        colors: splitList(form.colors),
        images: splitList(form.images),
        blur: Number(form.blur) || 0,
        cover: form.cover.trim(),
        sort: Number(form.sort) || 0,
      };
      if (editingId) {
        await adminRequest(`/api/admin/themes/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await adminRequest("/api/admin/themes", {
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

  async function activate(theme: ThemePresetItem) {
    setActionError(null);
    try {
      await adminRequest(`/api/admin/themes/${theme.id}/activate`, { method: "POST" });
      await reload();
    } catch (error) {
      setActionError(describeAdminError(error));
    }
  }

  async function remove(theme: ThemePresetItem) {
    const confirmed = await confirm(`确定删除「${theme.name}」吗？此操作不可撤销。`);
    if (!confirmed) return;

    setActionError(null);
    try {
      await adminRequest(`/api/admin/themes/${theme.id}`, { method: "DELETE" });
      await reload();
    } catch (error) {
      setActionError(describeAdminError(error));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="站点外观"
        title="主题管理"
        description="一套主题由「背景 + 明暗倾向 + 模糊度」组成。启用中的主题是站点默认，访客仍可在设置里自行切换。"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => reload()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              新建主题
            </Button>
          </div>
        }
      />

      {actionError && <AdminError message={actionError} />}

      {formOpen && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? "编辑主题" : "新建主题"}</CardTitle>
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
              <Label htmlFor="theme-name">主题名称</Label>
              <Input
                id="theme-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：晴空极简"
              />
            </div>

            <div className="space-y-2">
              <ImageUploader
                id="theme-cover"
                label="封面图（可选，留空则用第一张背景图）"
                value={form.cover}
                onChange={(url) => setForm((prev) => ({ ...prev, cover: url }))}
                hint="在卡片上展示的缩略图；支持上传，也可以填站内路径或外链。"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="theme-desc">描述</Label>
              <Input
                id="theme-desc"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="一句话说明这套主题的氛围"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme-mode">明暗倾向</Label>
              <select
                id="theme-mode"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.mode}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, mode: event.target.value as Mode }))
                }
              >
                <option value="auto">跟随系统</option>
                <option value="light">亮色</option>
                <option value="dark">暗色</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme-kind">背景类型</Label>
              <select
                id="theme-kind"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.kind}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, kind: event.target.value as Kind }))
                }
              >
                <option value="gradient">渐变</option>
                <option value="image">图片</option>
              </select>
            </div>

            {form.kind === "gradient" ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="theme-colors">渐变色（逗号分隔，≥2 个）</Label>
                <Input
                  id="theme-colors"
                  value={form.colors}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, colors: event.target.value }))
                  }
                  placeholder="#f8fafc, #e0f2fe"
                />
              </div>
            ) : (
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>背景图（可上传，也可填外链）</Label>
                  <span className="text-xs text-muted-foreground">
                    {imageList.length}/20 张 · 第一张作缩略图
                  </span>
                </div>

                {imageError && <AdminError message={imageError} />}

                <div className="flex flex-wrap gap-3">
                  {imageList.map((url) => (
                    <div
                      key={url}
                      className="group relative h-24 w-32 overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 地址来自上传结果或后台配置，域名不可预知 */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] text-white hover:bg-white/30"
                          onClick={() => setForm((prev) => ({ ...prev, cover: url }))}
                          title="设为封面"
                        >
                          设为封面
                        </button>
                        <button
                          type="button"
                          className="rounded bg-red-500/80 p-0.5 text-white hover:bg-red-500"
                          onClick={() => removeImage(url)}
                          title="移除这张背景图"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary disabled:opacity-60"
                  >
                    {imageUploading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        上传中…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-4 w-4" />
                        上传图片
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(event) => void uploadImages(event.target.files)}
                  />
                </div>

                <div className="flex gap-2">
                  <Input
                    value={urlDraft}
                    onChange={(event) => setUrlDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addUrl();
                      }
                    }}
                    placeholder="https://... 或 /images/xxx.webp"
                  />
                  <Button type="button" variant="outline" className="shrink-0" onClick={addUrl}>
                    <Upload className="mr-1 h-4 w-4" />
                    添加地址
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG/PNG/WebP/GIF，单张 ≤10MB；上传后自动加入列表，第一张默认为封面。模糊度仍由下方滑块控制。
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="theme-blur">背景模糊：{form.blur}px</Label>
              <input
                id="theme-blur"
                type="range"
                min={0}
                max={30}
                value={form.blur}
                onChange={(event) => setForm((prev) => ({ ...prev, blur: event.target.value }))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme-sort">排序</Label>
              <Input
                id="theme-sort"
                type="number"
                value={form.sort}
                onChange={(event) => setForm((prev) => ({ ...prev, sort: event.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2 md:col-span-2">
              <Button onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {loadError && <AdminError message={loadError} />}
      {!loading && !loadError && themes.length === 0 && (
        <AdminEmptyState title="还没有主题" description="点击右上角「新建主题」添加第一套。" />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {themes.map((theme) => (
          <Card key={theme.id} className="overflow-hidden">
            <div
              className="relative h-28 w-full"
              style={{
                background:
                  theme.kind === "gradient"
                    ? `linear-gradient(135deg, ${theme.colors.join(", ") || "#94a3b8"})`
                    : undefined,
                backgroundImage:
                  theme.kind === "image"
                    ? `url(${theme.cover || theme.images[0] || ""})`
                    : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {theme.is_active && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-xs font-medium text-white">
                  <Check className="h-3 w-3" />
                  站点默认
                </span>
              )}
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{theme.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {theme.kind === "gradient" ? "渐变" : "图片"} ·{" "}
                    {theme.mode === "auto" ? "跟随系统" : theme.mode === "dark" ? "暗色" : "亮色"}
                  </span>
                </div>
                {theme.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{theme.description}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={theme.is_active ? "outline" : "default"}
                  disabled={theme.is_active}
                  onClick={() => activate(theme)}
                >
                  {theme.is_active ? "已启用" : "设为默认"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(theme)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={theme.is_active}
                  onClick={() => remove(theme)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

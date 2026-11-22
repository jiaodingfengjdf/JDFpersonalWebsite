import { z } from "zod";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const themeMode = z.enum(["light", "dark", "auto"]);
export const themeKind = z.enum(["gradient", "image"]);

export const themePresetInput = z
  .object({
    name: z.string().trim().min(1, "主题名不能为空").max(60),
    description: z.string().trim().max(200).default(""),
    mode: themeMode.default("auto"),
    kind: themeKind.default("gradient"),
    colors: z
      .array(z.string().trim().regex(HEX_COLOR, "颜色需为 #RGB 或 #RRGGBB"))
      .max(6, "最多 6 个渐变色")
      .default([]),
    images: z.array(z.string().trim().min(1).max(500)).max(20, "最多 20 张背景图").default([]),
    blur: z.coerce.number().int().min(0).max(30).default(0),
    cover: z.string().trim().max(500).default(""),
    sort: z.coerce.number().int().min(0).max(999).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "gradient" && value.colors.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["colors"],
        message: "渐变主题至少需要 2 个颜色",
      });
    }
    if (value.kind === "image" && value.images.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "图片主题至少需要 1 张背景图",
      });
    }
  });

export type ThemePresetInput = z.infer<typeof themePresetInput>;

/** 前台能看到的字段（不含启用状态与排序等后台信息）。 */
export interface ThemePresetPublic {
  id: number;
  name: string;
  description: string;
  mode: "light" | "dark" | "auto";
  kind: "gradient" | "image";
  colors: string[];
  images: string[];
  blur: number;
  cover: string;
}

export interface ThemePresetItem extends ThemePresetPublic {
  is_active: boolean;
  sort: number;
}

export const themeIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

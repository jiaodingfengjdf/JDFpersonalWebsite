import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/**
 * 主题预设：一组「背景 + 明暗倾向 + 模糊度」的命名组合。
 * 前台可以在设置面板里切换，后台可以增删改并指定站点默认（is_active）。
 */
export const themePreset = sqliteTable(
  "theme_preset",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** 该主题倾向的明暗：auto 跟随系统 */
    mode: text("mode").notNull().default("auto"),
    /** 背景类型：gradient 渐变 / image 图片 */
    kind: text("kind").notNull().default("gradient"),
    /** 渐变颜色数组，JSON 字符串 */
    colors: text("colors").notNull().default("[]"),
    /** 背景图片地址数组，JSON 字符串 */
    images: text("images").notNull().default("[]"),
    /** 背景模糊度（px） */
    blur: integer("blur").notNull().default(0),
    /** 主题卡片封面 */
    cover: text("cover").notNull().default(""),
    isActive: integer("is_active").notNull().default(0),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt().notNull(),
    updatedAt: updatedAt().notNull(),
  },
  (t) => [index("idx_theme_preset_sort").on(t.sort, t.id)],
);

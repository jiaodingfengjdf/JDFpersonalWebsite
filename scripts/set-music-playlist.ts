/**
 * 把 /music 的歌单切到指定网易云歌单：
 *   1) 写 site_config.site_settings（真正生效的配置）
 *   2) 同步 siteConfig.ts 的出厂默认值
 *
 * 用法：npx tsx scripts/set-music-playlist.ts 831609018
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SITE_SETTINGS_CONFIG_KEY, parseSiteSettings } from "../lib/site-settings";

const playlistId = (process.argv[2] ?? "").trim();
if (!/^\d{1,20}$/.test(playlistId)) {
  console.error("用法：npx tsx scripts/set-music-playlist.ts <歌单ID>");
  process.exit(1);
}

const dbPath = path.resolve(process.env.DATABASE_PATH || "./data/kirameku.db");
const db = new Database(dbPath);

const row = db
  .prepare("SELECT value FROM site_config WHERE key = ?")
  .get(SITE_SETTINGS_CONFIG_KEY) as { value?: string } | undefined;

const current = parseSiteSettings(row?.value ? JSON.parse(row.value) : undefined);
const next = {
  ...current,
  music: { ...current.music, playlistId, trackIds: [] },
};

const payload = JSON.stringify(next);
const now = Date.now();

if (row) {
  db.prepare("UPDATE site_config SET value = ?, updated_at = ? WHERE key = ?").run(
    payload,
    now,
    SITE_SETTINGS_CONFIG_KEY,
  );
  console.log("已更新 site_config.site_settings");
} else {
  db.prepare(
    "INSERT INTO site_config (key, value, description, updated_at) VALUES (?, ?, ?, ?)",
  ).run(
    SITE_SETTINGS_CONFIG_KEY,
    payload,
    "站点信息 / 外观 / 分享 / 内容 / 云音乐（JSON）",
    now,
  );
  console.log("已写入 site_config.site_settings");
}

console.log(`歌单 ID：${next.music.playlistId}，歌曲列表：${next.music.trackIds.length} 首`);
db.close();

/* 同步出厂默认值，保证全新部署也指向这个歌单 */
const siteConfigFile = path.resolve("siteConfig.ts");
const source = fs.readFileSync(siteConfigFile, "utf8");
const updated = source.replace(
  /cloudMusicPlaylistId:\s*"[^"]*"/,
  `cloudMusicPlaylistId: "${playlistId}"`,
);
if (updated !== source) {
  fs.writeFileSync(siteConfigFile, updated, "utf8");
  console.log("siteConfig.ts 默认值已同步");
} else {
  console.log("siteConfig.ts 未变化（可能已是目标值）");
}

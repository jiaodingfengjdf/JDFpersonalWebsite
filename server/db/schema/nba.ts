import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** 球队（含中文名与关注标记） */
export const nbaTeam = sqliteTable(
  "nba_team",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    nameEn: text("name_en").notNull().default(""),
    nameZh: text("name_zh").notNull().default(""),
    follow: integer("follow").notNull().default(0),
  },
  (t) => [uniqueIndex("uniq_nba_team_code").on(t.code)],
);

/** 比赛 */
export const nbaGame = sqliteTable(
  "nba_game",
  {
    gameId: text("game_id").primaryKey(),
    season: text("season").notNull().default(""),
    homeCode: text("home_code").notNull(),
    awayCode: text("away_code").notNull(),
    homeName: text("home_name").notNull().default(""),
    awayName: text("away_name").notNull().default(""),
    homeScore: integer("home_score").notNull().default(0),
    awayScore: integer("away_score").notNull().default(0),
    status: text("status").notNull().default("scheduled"),
    detail: text("detail").notNull().default(""),
    startAt: integer("start_at").notNull(),
    venue: text("venue").notNull().default(""),
    updatedAt: integer("updated_at").notNull().default(0),
  },
  (t) => [index("idx_nba_game_start").on(t.startAt)],
);

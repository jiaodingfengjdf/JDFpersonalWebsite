-- NBA 赛程：球队 + 比赛
CREATE TABLE "nba_team" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "code" TEXT NOT NULL,
  "name_en" TEXT NOT NULL DEFAULT '',
  "name_zh" TEXT NOT NULL DEFAULT '',
  "follow" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "uniq_nba_team_code" ON "nba_team" ("code");

CREATE TABLE "nba_game" (
  "game_id" TEXT PRIMARY KEY NOT NULL,
  "season" TEXT NOT NULL DEFAULT '',
  "home_code" TEXT NOT NULL,
  "away_code" TEXT NOT NULL,
  "home_name" TEXT NOT NULL DEFAULT '',
  "away_name" TEXT NOT NULL DEFAULT '',
  "home_score" INTEGER NOT NULL DEFAULT 0,
  "away_score" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "detail" TEXT NOT NULL DEFAULT '',
  "start_at" INTEGER NOT NULL,
  "venue" TEXT NOT NULL DEFAULT '',
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "idx_nba_game_start" ON "nba_game" ("start_at");

INSERT INTO "nba_team" ("code", "name_en", "name_zh", "follow") VALUES
  ('ATL', 'Atlanta Hawks', '老鹰', 0),
  ('BOS', 'Boston Celtics', '凯尔特人', 0),
  ('BKN', 'Brooklyn Nets', '篮网', 0),
  ('CHA', 'Charlotte Hornets', '黄蜂', 0),
  ('CHI', 'Chicago Bulls', '公牛', 0),
  ('CLE', 'Cleveland Cavaliers', '骑士', 0),
  ('DAL', 'Dallas Mavericks', '独行侠', 0),
  ('DEN', 'Denver Nuggets', '掘金', 0),
  ('DET', 'Detroit Pistons', '活塞', 0),
  ('GSW', 'Golden State Warriors', '勇士', 1),
  ('HOU', 'Houston Rockets', '火箭', 0),
  ('IND', 'Indiana Pacers', '步行者', 0),
  ('LAC', 'LA Clippers', '快船', 0),
  ('LAL', 'Los Angeles Lakers', '湖人', 1),
  ('MEM', 'Memphis Grizzlies', '灰熊', 0),
  ('MIA', 'Miami Heat', '热火', 0),
  ('MIL', 'Milwaukee Bucks', '雄鹿', 0),
  ('MIN', 'Minnesota Timberwolves', '森林狼', 0),
  ('NOP', 'New Orleans Pelicans', '鹈鹕', 0),
  ('NYK', 'New York Knicks', '尼克斯', 0),
  ('OKC', 'Oklahoma City Thunder', '雷霆', 0),
  ('ORL', 'Orlando Magic', '魔术', 0),
  ('PHI', 'Philadelphia 76ers', '76人', 0),
  ('PHX', 'Phoenix Suns', '太阳', 0),
  ('POR', 'Portland Trail Blazers', '开拓者', 0),
  ('SAC', 'Sacramento Kings', '国王', 0),
  ('SAS', 'San Antonio Spurs', '马刺', 0),
  ('TOR', 'Toronto Raptors', '猛龙', 0),
  ('UTA', 'Utah Jazz', '爵士', 0),
  ('WAS', 'Washington Wizards', '奇才', 0);

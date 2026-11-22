import "server-only";
import { getAdminSession } from "@/server/auth/guard";
import { getCollectionService } from "@/server/modules/collection";
import { collectionQuery } from "@/server/modules/collection/contracts";
import { getFeedService } from "@/server/modules/feed";
import { currentMonth, getLedgerService } from "@/server/modules/ledger";
import { getMarketService } from "@/server/modules/market";
import { getNbaService } from "@/server/modules/nba";

export interface DigestPayload {
  generated_at: string;
  news: Array<{ title: string; source: string; link: string; published_at: number }>;
  market: Array<{
    name: string;
    code: string;
    kind: string;
    price: number;
    change_pct: number;
    stale: boolean;
  }>;
  nba: Array<{
    away: string;
    home: string;
    away_score: number;
    home_score: number;
    status: string;
    start_at: number;
    follow: boolean;
  }>;
  collection: Array<{ title: string; kind: string; status: string }>;
  ledger: { month: string; income: number; expense: number; balance: number } | null;
}

/** 每日简报聚合：账本部分只在管理员登录时返回。 */
export async function buildDigest(): Promise<DigestPayload> {
  const admin = await getAdminSession();
  const [news, market, nba, collection] = await Promise.all([
    getFeedService().list({ limit: 6 }).catch(() => []),
    getMarketService().quotes().catch(() => []),
    getNbaService().list({ days: 1 }).catch(() => []),
    getCollectionService()
      .list(collectionQuery.parse({ size: 5 }), { includePrivate: false })
      .catch(() => ({ items: [], total: 0, counts: {} })),
  ]);

  const ledger = admin
    ? await getLedgerService()
        .summary(currentMonth())
        .then((summary) => ({
          month: summary.month,
          income: summary.income,
          expense: summary.expense,
          balance: summary.balance,
        }))
        .catch(() => null)
    : null;

  return {
    generated_at: new Date().toISOString(),
    news: news.map((item) => ({
      title: item.title,
      source: item.source_name,
      link: item.link,
      published_at: item.published_at,
    })),
    market: market.map((item) => ({
      name: item.name,
      code: item.code,
      kind: item.kind,
      price: item.price,
      change_pct: item.change_pct,
      stale: item.stale,
    })),
    nba: nba.map((game) => ({
      away: game.away_name,
      home: game.home_name,
      away_score: game.away_score,
      home_score: game.home_score,
      status: game.status,
      start_at: game.start_at,
      follow: game.follow,
    })),
    collection: collection.items.map((item) => ({
      title: item.title,
      kind: item.kind,
      status: item.status,
    })),
    ledger,
  };
}

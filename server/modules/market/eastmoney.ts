import "server-only";

/**
 * 东方财富公开行情接口封装。
 *
 * 覆盖范围（实测 2026-11）：
 * - 批量报价 `push2/ulist.np`：A 股、指数、美股个股与美股指数，一次请求最多 40 个 secid。
 * - 日 K `push2his/kline`：A 股、美股、指数；只取日线，周/月由本模块在上层聚合。
 * - 分时 `push2/trends2`：A 股、美股、指数，ndays 最大 5。
 * - 基金净值 `api.fund.f10/lsjz`：公募基金按日披露，没有分时。
 *
 * 所有请求 8 秒超时、失败返回 null，由调用方决定降级；不做无限重试。
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const QUOTE_TTL = 45_000;
const KLINE_TTL = 300_000;
const TREND_TTL = 60_000;
const NAV_TTL = 600_000;

export interface EmQuote {
  secid: string;
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  /** 上游更新时间（毫秒），未知为 null */
  updatedAt: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  amount?: number | null;
  amplitude?: number | null;
  turnoverRate?: number | null;
  pe?: number | null;
  pb?: number | null;
  marketCap?: number | null;
}

export interface KlineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
}

export interface TrendPoint {
  /** 上游原始时间串，例如 2026-11-23 22:30 */
  time: string;
  price: number;
  volume: number;
  avg: number;
}

export interface TrendSeries {
  prevClose: number;
  points: TrendPoint[];
}

export interface NavPoint {
  date: string;
  value: number;
  changePct: number;
}

interface CacheEntry {
  at: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();

/** 命中新鲜缓存直接用；上游失败时退回旧值并标记 stale。 */
async function cached<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T | null>,
): Promise<{ value: T | null; stale: boolean }> {
  const hit = cache.get(key) as { at: number; value: T } | undefined;
  if (hit && Date.now() - hit.at <= ttl) return { value: hit.value, stale: false };

  const value = await loader();
  if (value === null) return { value: hit?.value ?? null, stale: hit !== undefined };
  cache.set(key, { at: Date.now(), value });
  return { value, stale: false };
}

async function fetchJson<T>(url: string, referer: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": UA, referer, accept: "application/json,text/plain,*/*" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error("eastmoney request failed:", url, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, referer: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": UA, referer, accept: "*/*" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error("eastmoney request failed:", url, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

/* ------------------------------- 报价 ------------------------------- */

interface UlistResponse {
  data?: {
    diff?: Array<{
      f2?: number;
      f3?: number;
      f4?: number;
      f5?: number;
      f6?: number;
      f7?: number;
      f8?: number;
      f9?: number;
      f12?: string;
      f13?: number;
      f14?: string;
      f15?: number;
      f16?: number;
      f17?: number;
      f18?: number;
      f20?: number;
      f23?: number;
      f124?: number;
    }>;
  };
}

const QUOTE_FIELDS = "f2,f3,f4,f5,f6,f7,f8,f9,f12,f13,f14,f15,f16,f17,f18,f20,f23,f124";

const optPositive = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const optFinite = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "-") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/** 批量报价。返回以 `market.code` 为键的映射，失败时整体降级为空。 */
export async function quotesBySecids(
  secids: string[],
): Promise<{ quotes: Map<string, EmQuote>; stale: boolean }> {
  const unique = [...new Set(secids.filter((item) => item.length > 0))].sort();
  if (unique.length === 0) return { quotes: new Map(), stale: false };

  const key = `quotes:${unique.join(",")}`;
  const { value, stale } = await cached(key, QUOTE_TTL, async () => {
    const result = new Map<string, EmQuote>();
    for (const group of chunk(unique, 40)) {
      const url =
        "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=" +
        group.map(encodeURIComponent).join(",") +
        `&fields=${QUOTE_FIELDS}`;
      const json = await fetchJson<UlistResponse>(url, "https://quote.eastmoney.com/");
      for (const row of json?.data?.diff ?? []) {
        if (!row.f12 || row.f13 === undefined) continue;
        const price = Number(row.f2);
        if (!Number.isFinite(price) || price <= 0) continue;
        const secid = `${row.f13}.${row.f12}`;
        result.set(secid, {
          secid,
          code: row.f12,
          name: row.f14?.trim() || row.f12,
          price,
          change: Number(row.f4) || 0,
          changePct: Number(row.f3) || 0,
          prevClose: Number(row.f18) || 0,
          updatedAt: row.f124 && row.f124 > 0 ? row.f124 * 1000 : null,
          open: optPositive(row.f17),
          high: optPositive(row.f15),
          low: optPositive(row.f16),
          volume: optFinite(row.f5),
          amount: optPositive(row.f6),
          amplitude: optPositive(row.f7),
          turnoverRate: optPositive(row.f8),
          pe: optPositive(row.f9),
          pb: optPositive(row.f23),
          marketCap: optPositive(row.f20),
        });
      }
    }
    return result.size > 0 ? result : null;
  });

  return { quotes: value ?? new Map(), stale };
}

/* ------------------------------ 代码解析 ------------------------------ */

const US_INDEX_ALIASES: Record<string, { secid: string; name: string }> = {
  SPX: { secid: "100.SPX", name: "标普500" },
  SPX500: { secid: "100.SPX", name: "标普500" },
  NDX: { secid: "100.NDX", name: "纳斯达克" },
  NDX100: { secid: "100.NDX100", name: "纳斯达克100" },
  DJIA: { secid: "100.DJIA", name: "道琼斯" },
  DJI: { secid: "100.DJIA", name: "道琼斯" },
  HSI: { secid: "100.HSI", name: "恒生指数" },
  HSTECH: { secid: "100.HSTECH", name: "恒生科技" },
  N225: { secid: "100.N225", name: "日经225" },
};

/** A 股/指数代码 → 东财 secid；基金没有 K 线，返回空串。 */
export function cnSecid(kind: string, code: string): string {
  if (kind === "fund") return "";
  if (kind === "index") return code.startsWith("39") ? `0.${code}` : `1.${code}`;
  return code.startsWith("5") || code.startsWith("6") || code.startsWith("9")
    ? `1.${code}`
    : `0.${code}`;
}

interface SuggestResponse {
  QuotationCodeTable?: {
    Data?: Array<{
      Code?: string;
      Name?: string;
      QuoteID?: string;
      MktNum?: string;
      Classify?: string;
      SecurityTypeName?: string;
    }>;
  };
}

const resolved = new Map<string, { secid: string; name: string; kind: "stock" | "index" } | null>();

/**
 * 美股代码 → secid。先查内置指数别名，再走东财搜索接口；
 * 只接受 NASDAQ(105)/NYSE(106)/AMEX(107) 的普通股票与指数。
 */
export async function resolveUsSecid(
  input: string,
): Promise<{ secid: string; name: string; kind: "stock" | "index" } | null> {
  const code = input.trim().toUpperCase();
  if (!code) return null;

  const alias = US_INDEX_ALIASES[code];
  if (alias) return { ...alias, kind: "index" };

  if (resolved.has(code)) return resolved.get(code) ?? null;

  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(code)}&type=14&count=10`;
  const json = await fetchJson<SuggestResponse>(url, "https://quote.eastmoney.com/");
  const rows = json?.QuotationCodeTable?.Data ?? [];
  const hit = rows.find((row) => {
    const market = row.MktNum ?? "";
    return (
      (market === "105" || market === "106" || market === "107" || market === "100") &&
      (row.Code ?? "").toUpperCase() === code &&
      Boolean(row.QuoteID)
    );
  });

  const value = hit
    ? {
        secid: hit.QuoteID as string,
        name: hit.Name?.trim() || code,
        kind: (hit.MktNum === "100" ? "index" : "stock") as "stock" | "index",
      }
    : null;
  resolved.set(code, value);
  return value;
}

export interface MarketSearchCandidate {
  market: "cn" | "us";
  kind: "stock" | "index" | "fund";
  code: string;
  name: string;
  secid: string;
  badge: string;
}

const SEARCH_TTL = 60_000;

/** 按代码、名称或拼音搜索 A 股、场内 ETF、公募基金、美股及全球指数。 */
export async function searchMarketSymbols(query: string): Promise<MarketSearchCandidate[]> {
  const clean = query.trim();
  if (!clean) return [];

  const { value } = await cached(`suggest:${clean.toUpperCase()}`, SEARCH_TTL, async () => {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(clean)}&type=14&count=18`;
    const json = await fetchJson<SuggestResponse>(url, "https://quote.eastmoney.com/");
    const rows = json?.QuotationCodeTable?.Data ?? [];
    const output: MarketSearchCandidate[] = [];
    const seen = new Set<string>();

    const push = (candidate: MarketSearchCandidate) => {
      const dedupKey = `${candidate.kind}:${candidate.code}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      output.push(candidate);
    };

    const alias = US_INDEX_ALIASES[clean.toUpperCase()];
    if (alias) {
      push({
        market: "us",
        kind: "index",
        code: clean.toUpperCase(),
        name: alias.name,
        secid: alias.secid,
        badge: "全球指数",
      });
    }

    for (const row of rows) {
      const rawCode = (row.Code ?? "").trim();
      const codeUpper = rawCode.toUpperCase();
      const name = row.Name?.trim() || codeUpper;
      const mkt = row.MktNum ?? "";
      const classify = row.Classify ?? "";
      const typeName = row.SecurityTypeName?.trim() ?? "";
      const quoteId = row.QuoteID?.trim() ?? "";

      if ((mkt === "150" || classify === "OTCFUND") && /^\d{6}$/.test(rawCode)) {
        push({
          market: "cn",
          kind: "fund",
          code: rawCode,
          name,
          secid: "",
          badge: "公募基金",
        });
        continue;
      }

      if ((mkt === "0" || mkt === "1") && /^\d{6}$/.test(rawCode) && quoteId) {
        if (classify === "Index" || typeName === "指数") {
          push({
            market: "cn",
            kind: "index",
            code: rawCode,
            name,
            secid: quoteId,
            badge: "A股指数",
          });
        } else if (classify === "AStock" || classify === "Fund") {
          push({
            market: "cn",
            kind: "stock",
            code: rawCode,
            name,
            secid: quoteId,
            badge: classify === "Fund" ? "场内ETF" : typeName || "A股",
          });
        }
        continue;
      }

      if (
        (mkt === "105" || mkt === "106" || mkt === "107") &&
        /^[A-Z][A-Z0-9.\-]{0,9}$/.test(codeUpper) &&
        quoteId
      ) {
        push({
          market: "us",
          kind: "stock",
          code: codeUpper,
          name,
          secid: quoteId,
          badge: "美股/ETF",
        });
        continue;
      }

      if (
        mkt === "100" &&
        /^[A-Z][A-Z0-9.\-]{0,9}$/.test(codeUpper) &&
        quoteId
      ) {
        push({
          market: "us",
          kind: "index",
          code: codeUpper,
          name,
          secid: quoteId,
          badge: "全球指数",
        });
      }
    }

    return output;
  });

  return value ?? [];
}

/* -------------------------------- K 线 -------------------------------- */

interface KlineResponse {
  data?: { klines?: string[]; name?: string; decimal?: number };
}

/** 日 K（前复权）。周/月线由 aggregate 在上层按自然周/自然月合成。 */
export async function dailyKline(
  secid: string,
  limit = 480,
): Promise<{ bars: KlineBar[]; stale: boolean }> {
  const key = `kline:${secid}:${limit}`;
  const { value, stale } = await cached(key, KLINE_TTL, async () => {
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" +
      encodeURIComponent(secid) +
      `&klt=101&fqt=1&end=20500101&lmt=${limit}` +
      "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57";
    const json = await fetchJson<KlineResponse>(url, "https://quote.eastmoney.com/");
    const rows = json?.data?.klines ?? [];
    const bars: KlineBar[] = [];
    for (const row of rows) {
      const [date, open, close, high, low, volume, amount] = row.split(",");
      const bar = {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
        amount: Number(amount),
      };
      if (bar.date && Number.isFinite(bar.close) && bar.close > 0) bars.push(bar);
    }
    return bars.length > 0 ? bars : null;
  });

  return { bars: value ?? [], stale };
}

/* -------------------------------- 分时 -------------------------------- */

interface TrendsResponse {
  data?: { preClose?: number; trends?: string[]; name?: string };
}

export async function intradayTrends(
  secid: string,
  days: 1 | 5 = 1,
): Promise<{ series: TrendSeries | null; stale: boolean }> {
  const key = `trends:${secid}:${days}`;
  const { value, stale } = await cached(key, TREND_TTL, async () => {
    const url =
      "https://push2.eastmoney.com/api/qt/stock/trends2/get?secid=" +
      encodeURIComponent(secid) +
      `&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f53,f56,f58&iscr=0&ndays=${days}`;
    const json = await fetchJson<TrendsResponse>(url, "https://quote.eastmoney.com/");
    const rows = json?.data?.trends ?? [];
    const points: TrendPoint[] = [];
    for (const row of rows) {
      const [time, price, volume, avg] = row.split(",");
      const value = Number(price);
      if (!time || !Number.isFinite(value) || value <= 0) continue;
      points.push({ time, price: value, volume: Number(volume) || 0, avg: Number(avg) || value });
    }
    if (points.length === 0) return null;
    return { prevClose: Number(json?.data?.preClose) || 0, points };
  });

  return { series: value ?? null, stale };
}

/* ------------------------------ 基金净值 ------------------------------ */

interface NavResponse {
  Data?: {
    LSJZList?: Array<{ FSRQ?: string; DWJZ?: string; JZZZL?: string }>;
  };
}

interface NetWorthTrendPoint {
  x?: number;
  y?: number;
  equityReturn?: number;
}

/** 净值时间戳是北京时间零点，直接 toISOString 会差一天。 */
const navDateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 从 pingzhongdata 脚本里取出净值数组（var Data_netWorthTrend = [...]）。 */
function parseNetWorthTrend(text: string): NavPoint[] {
  const match = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!match) return [];
  try {
    const rows = JSON.parse(match[1]) as NetWorthTrendPoint[];
    const points: NavPoint[] = [];
    for (const row of rows) {
      const time = row.x;
      const nav = row.y;
      if (typeof time !== "number" || typeof nav !== "number") continue;
      if (!Number.isFinite(time) || !Number.isFinite(nav) || nav <= 0) continue;
      points.push({
        date: navDateFormat.format(time),
        value: nav,
        changePct: Number(row.equityReturn) || 0,
      });
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * 基金历史净值（单位净值）。
 *
 * 主源 `pingzhongdata/*.js` 一次返回全部历史（数千条），比 f10 分页接口可靠；
 * f10 每页固定 20 条，多页抓取成本高，只作为主源失败时的近 40 日兜底。
 */
export async function fundNav(code: string): Promise<{ points: NavPoint[]; stale: boolean }> {
  const key = `nav:${code}`;
  const { value, stale } = await cached(key, NAV_TTL, async () => {
    const script = await fetchText(
      `https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js`,
      "https://fund.eastmoney.com/",
    );
    const points = script ? parseNetWorthTrend(script) : [];
    if (points.length > 0) return points;

    const fallback = await Promise.all(
      [1, 2].map((page) =>
        fetchJson<NavResponse>(
          `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${encodeURIComponent(code)}&pageIndex=${page}&pageSize=20`,
          "https://fundf10.eastmoney.com/",
        ),
      ),
    );
    const byDate = new Map<string, NavPoint>();
    for (const json of fallback) {
      for (const row of json?.Data?.LSJZList ?? []) {
        const navValue = Number(row.DWJZ);
        if (!row.FSRQ || !Number.isFinite(navValue) || navValue <= 0) continue;
        byDate.set(row.FSRQ, {
          date: row.FSRQ,
          value: navValue,
          changePct: Number(row.JZZZL) || 0,
        });
      }
    }
    if (byDate.size === 0) return null;
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  });

  return { points: value ?? [], stale };
}

/* ------------------------------ 指数概览 ------------------------------ */

export const GLOBAL_INDICES = [
  { code: "000001", name: "上证指数", market: "cn" as const, secid: "1.000001" },
  { code: "399001", name: "深证成指", market: "cn" as const, secid: "0.399001" },
  { code: "399006", name: "创业板指", market: "cn" as const, secid: "0.399006" },
  { code: "000300", name: "沪深300", market: "cn" as const, secid: "1.000300" },
  { code: "000688", name: "科创50", market: "cn" as const, secid: "1.000688" },
  { code: "HSI", name: "恒生指数", market: "cn" as const, secid: "100.HSI" },
  { code: "HSTECH", name: "恒生科技", market: "cn" as const, secid: "100.HSTECH" },
  { code: "SPX", name: "标普500", market: "us" as const, secid: "100.SPX" },
  { code: "NDX", name: "纳斯达克", market: "us" as const, secid: "100.NDX" },
  { code: "DJIA", name: "道琼斯", market: "us" as const, secid: "100.DJIA" },
];

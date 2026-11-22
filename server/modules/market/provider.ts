import "server-only";

export type MarketKind = "stock" | "index" | "fund";

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  /** 行情时间（ISO 或原始日期串） */
  time: string;
}

/** 纯代码 → 腾讯行情符号 */
export function symbolOf(kind: MarketKind, code: string): string {
  const clean = code.trim().replace(/^(sh|sz|jj)/i, "");
  if (kind === "fund") return `jj${clean}`;
  if (kind === "index") return `${clean.startsWith("39") ? "sz" : "sh"}${clean}`;
  return `${clean.startsWith("6") || clean.startsWith("9") ? "sh" : "sz"}${clean}`;
}

function formatStockTime(raw: string): string {
  if (/^\d{14}$/.test(raw)) {
    return `${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`;
  }
  return raw;
}

const ENDPOINT = "https://qt.gtimg.cn/q=";
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; quote: Quote }>();

function parseStock(symbol: string, body: string): Quote | null {
  const fields = body.split("~");
  const price = Number(fields[3]);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    symbol,
    name: fields[1]?.trim() || symbol,
    price,
    change: Number(fields[31]) || 0,
    changePct: Number(fields[32]) || 0,
    time: formatStockTime(fields[30] || ""),
  };
}

function parseFund(symbol: string, body: string): Quote | null {
  const fields = body.split("~");
  const nav = Number(fields[5]);
  if (!Number.isFinite(nav) || nav <= 0) return null;
  const changePct = Number(fields[7]) || 0;
  const prev = changePct === -100 ? nav : nav / (1 + changePct / 100);
  return {
    symbol,
    name: fields[1]?.trim() || symbol,
    price: nav,
    change: Math.round((nav - prev) * 10000) / 10000,
    changePct,
    time: fields[8] || "",
  };
}

async function fetchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();
  if (symbols.length === 0) return result;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${ENDPOINT}${symbols.join(",")}`, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        referer: "https://gu.qq.com/",
      },
      cache: "no-store",
    });
    if (!response.ok) return result;

    const buffer = Buffer.from(await response.arrayBuffer());
    let text: string;
    try {
      text = new TextDecoder("gbk").decode(buffer);
    } catch {
      text = new TextDecoder("utf-8").decode(buffer);
    }

    for (const line of text.split(";")) {
      const match = line.match(/v_([a-z]{2}\d+)="([^"]*)"/i);
      if (!match) continue;
      const symbol = match[1];
      const body = match[2];
      const quote = symbol.startsWith("jj")
        ? parseFund(symbol, body)
        : parseStock(symbol, body);
      if (!quote) continue;
      result.set(symbol, quote);
      cache.set(symbol, { at: Date.now(), quote });
    }
  } catch (error) {
    console.error("market quote fetch failed:", error);
  } finally {
    clearTimeout(timer);
  }
  return result;
}

/**
 * 批量取行情：命中 60s 缓存直接用；未命中或过期的一起请求；
 * 请求失败时退回缓存里的旧值（前台显示「缓存」而非空白）。
 */
export async function getQuotes(
  items: Array<{ kind: MarketKind; code: string }>,
): Promise<Map<string, { quote: Quote; stale: boolean }>> {
  const now = Date.now();
  const symbols = items.map((item) => symbolOf(item.kind, item.code));
  const missing = symbols.filter((symbol) => {
    const hit = cache.get(symbol);
    return !hit || now - hit.at > TTL_MS;
  });

  const fresh = missing.length > 0 ? await fetchQuotes(missing) : new Map<string, Quote>();
  const output = new Map<string, { quote: Quote; stale: boolean }>();

  for (const symbol of symbols) {
    const hit = cache.get(symbol);
    if (hit) {
      output.set(symbol, { quote: hit.quote, stale: !fresh.has(symbol) });
    }
  }
  return output;
}

import { getMarketService } from "./index";
import type { MarketAlertItem, MarketQuoteItem } from "./contracts";
import { getNotificationsService } from "@/server/modules/notifications";

/** 同一条规则两次推送的最小间隔，避免盘中反复刷屏。 */
const RULE_COOLDOWN_MS = 30 * 60 * 1000;

const RULE_LABEL: Record<MarketAlertItem["rule"], string> = {
  up_pct: "涨幅达到",
  down_pct: "跌幅达到",
  price_above: "价格上穿",
  price_below: "价格下穿",
};

function describeRule(alert: MarketAlertItem): string {
  return alert.rule.endsWith("_pct")
    ? `${RULE_LABEL[alert.rule]} ${alert.threshold}%`
    : `${RULE_LABEL[alert.rule]} ${alert.threshold}`;
}

function isHit(alert: MarketAlertItem, quote: MarketQuoteItem): boolean {
  if (quote.price <= 0) return false;
  switch (alert.rule) {
    case "up_pct":
      return quote.change_pct >= alert.threshold;
    case "down_pct":
      return quote.change_pct <= -alert.threshold;
    case "price_above":
      return quote.price >= alert.threshold;
    case "price_below":
      return quote.price <= alert.threshold;
    default:
      return false;
  }
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export interface MarketAlertReport {
  fired: string[];
  errors: string[];
}

/**
 * 评估全部启用的行情提醒。只使用本次抓到的有效报价（stale 的缓存不触发，
 * 避免在接口故障时按旧价格连发）。命中后强制推送，事件级冷却由单条规则的
 * `last_fired_at` 承担。
 */
export async function evaluateMarketAlerts(): Promise<MarketAlertReport> {
  const market = getMarketService();
  const alerts = (await market.alerts()).filter((alert) => alert.enabled);
  if (alerts.length === 0) return { fired: [], errors: [] };

  const quotes = await market.quotes();
  const byId = new Map(quotes.map((quote) => [quote.id, quote]));
  const notifications = getNotificationsService();
  const now = Date.now();
  const fired: string[] = [];
  const errors: string[] = [];

  for (const alert of alerts) {
    const quote = byId.get(alert.watch_id);
    if (!quote || quote.stale || !isHit(alert, quote)) continue;

    if (alert.last_fired_at) {
      const elapsed = now - new Date(alert.last_fired_at).getTime();
      if (Number.isFinite(elapsed) && elapsed < RULE_COOLDOWN_MS) continue;
    }

    try {
      const result = await notifications.notify({
        eventKey: "market.alert",
        level: "warning",
        title: `行情提醒：${alert.name} ${formatPct(quote.change_pct)}`,
        body: `${alert.name}（${alert.code}）现价 ${quote.price}，${describeRule(alert)}。`,
        fields: [
          { label: "标的", value: `${alert.name}（${alert.code}）` },
          { label: "现价", value: String(quote.price) },
          { label: "涨跌幅", value: formatPct(quote.change_pct) },
          { label: "触发规则", value: describeRule(alert) },
          { label: "报价时间", value: quote.time || "—" },
        ],
        link: "/market",
        force: true,
      });
      if (result.sent) {
        market.markAlertFired(alert.id);
        fired.push(`market.alert:${alert.id}`);
      }
    } catch (error) {
      errors.push(`market.alert:${alert.id} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { fired, errors };
}

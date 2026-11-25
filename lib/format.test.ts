import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatCompactNumber,
  formatDate,
  formatMoney,
  formatPercent,
  shanghaiYmd,
} from "./format";

describe("format helpers", () => {
  // 2026-11-24T16:30:00Z = 北京时间 2026-11-25 00:30，跨日场景能暴露用本地时区取日期的错误。
  const acrossMidnight = "2026-11-24T16:30:00.000Z";

  it("按北京时间解析日期，不受运行机器 TZ 影响", () => {
    expect(shanghaiYmd(acrossMidnight)).toBe("2026-11-25");
    expect(formatDate(acrossMidnight)).toBe("2026.11.25 00:30");
    expect(formatClock(acrossMidnight)).toBe("00:30:00");
  });

  it("指数不加货币符号，基金保留 4 位，负号在币种前", () => {
    expect(formatMoney(7237.17, { kind: "index" })).toBe("7,237.17");
    expect(formatMoney(2.995, { kind: "fund" })).toBe("¥2.9950");
    expect(formatMoney(-1234.5, { currency: "USD" })).toBe("-$1,234.50");
    expect(formatMoney(4.2, { currency: "USD", sign: true })).toBe("+$4.20");
  });

  it("大数与百分比格式统一", () => {
    expect(formatCompactNumber(123_456_789)).toBe("1.23 亿");
    expect(formatCompactNumber(12_345)).toBe("1.23 万");
    expect(formatPercent(3.14159, true)).toBe("+3.14%");
  });
});

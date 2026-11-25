/**
 * 全站唯一的时间/时长/数值格式化入口。
 *
 * 之前同一个「3 分钟前」在 4 个组件里各写了一遍，格式还各不相同
 * （0:00 与 00:00、2026.1.5 与 2026-01-05），播放器与时间线对不上。
 * 客户端与服务端都能安全引入本文件（不 import server-only、不读 env）。
 *
 * 时间统一按 Asia/Shanghai 解释：服务器可能跑在 UTC，直接用本地取日期会让
 * 北京时间凌晨的流水/比赛被分到前一天。
 */

const TIME_ZONE = "Asia/Shanghai";

const shanghaiDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

const shanghaiPartsFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** 按北京时间拆出日期时间各部分（sv-SE 输出 YYYY-MM-DD HH:mm:ss，解析稳定）。 */
function shanghaiParts(date: Date): DateParts {
  const text = shanghaiPartsFormatter.format(date);
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!match) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 后台风格的完整时间，例如 `2026年1月5日 12:03`。 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  if (!date) return "—";
  return shanghaiDateTimeFormatter.format(date);
}

/** 前台风格的紧凑时间，例如 `2026.1.5 12:03`（北京时间）。 */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  if (!date) return "—";
  const parts = shanghaiParts(date);
  return `${parts.year}.${parts.month}.${parts.day} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** 只取北京时间的日期，例如 `2026-11-25`；用于分组、筛选与查询参数。 */
export function shanghaiYmd(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  if (!date) return "—";
  const parts = shanghaiParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** 月日 + 时分，例如 `11-25 09:30`（北京时间）。 */
export function formatDayTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  if (!date) return "—";
  const parts = shanghaiParts(date);
  return `${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** 月日，例如 `11-25`（北京时间）。 */
export function formatMonthDay(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  if (!date) return "—";
  const parts = shanghaiParts(date);
  return `${pad(parts.month)}-${pad(parts.day)}`;
}

/** 时分秒，例如 `16:05:33`（北京时间）。 */
export function formatClock(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  if (!date) return "—";
  const parts = shanghaiParts(date);
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * 相对时间：超过 `afterDays` 天后回落到 `formatDate`。
 * 未来时间（时钟漂移）按「刚刚」处理，不显示负数。
 */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  options: { afterDays?: number } = {},
): string {
  const { afterDays = 7 } = options;
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  if (!date) return "—";

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(diff / 86_400_000);
  if (days < afterDays) return `${days} 天前`;
  return formatDate(date);
}

/**
 * 已有「距今多少秒」时的相对文案，例如 `2 小时前`。
 *
 * 服务端算好的时长直接渲染，不必在组件里调用 `Date.now()`：
 * 渲染期取当前时间是纯函数规则不允许的，也会让 SSR 与客户端对不上。
 */
export function formatElapsed(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return "刚刚";
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/** 字节数转人类可读体积，例如 `1.2 MB`；无效值返回 `—`。 */
export function formatBytes(
  value: number | null | undefined,
  options: { fractionDigits?: number } = {},
): string {
  const { fractionDigits = 1 } = options;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }
  if (value < 1024) return `${Math.round(value)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(fractionDigits)} ${units[unit]}`;
}

/**
 * 播放进度时长。`padMinutes` 为 true 时输出 `00:00`，否则 `0:00`，
 * 用于统一原本两套互不一致的实现。
 */
export function formatDuration(
  seconds: number | null | undefined,
  options: { padMinutes?: boolean } = {},
): string {
  const { padMinutes = false } = options;
  const total = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : 0;
  if (total <= 0) return padMinutes ? "00:00" : "0:00";
  const minutes = Math.floor(total / 60);
  const rest = Math.floor(total % 60);
  const restText = String(rest).padStart(2, "0");
  return padMinutes
    ? `${String(minutes).padStart(2, "0")}:${restText}`
    : `${minutes}:${restText}`;
}

export interface MoneyOptions {
  currency?: "CNY" | "USD";
  /** 指数是「点」不是货币，传 point 时不加币种符号。 */
  kind?: "stock" | "index" | "fund";
  digits?: number;
  /** 正号是否显示，默认只在显式要求时用。 */
  sign?: boolean;
}

/** 金额/净值的统一格式：基金 4 位、指数不带符号、负数符号放在币种前面。 */
export function formatMoney(
  value: number | null | undefined,
  options: MoneyOptions = {},
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const { currency = "CNY", kind = "stock", sign = false } = options;
  const digits =
    options.digits ?? (kind === "fund" ? 4 : Math.abs(value) >= 1 ? 2 : 4);
  const body = Math.abs(value).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const prefix = value < 0 ? "-" : sign ? "+" : "";
  const unit =
    kind === "index" ? "" : currency === "USD" ? "$" : "¥";
  return `${prefix}${unit}${body}`;
}

/** 带正号的百分比，统一保留两位小数。 */
export function formatPercent(value: number | null | undefined, sign = false): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${sign && value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** 大数压缩：1.23 亿 / 12.34 万。 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(2)} 万`;
  return value.toLocaleString("zh-CN");
}

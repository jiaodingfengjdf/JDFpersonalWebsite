/**
 * 极小的展示格式化工具（UI 用）。
 *
 * 限制：纯展示逻辑，不做本地化（除中英文两套固定文案），不依赖时间库；
 * 「今天 / 昨天」按浏览器本地时区判断。
 */

const MONTHS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 字节数 → `0 B` / `1.5 KB` / `12 MB` …；无效值返回 `—`。 */
export function formatBytes(n?: number): string {
  if (!isFiniteNumber(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded.replace(/\.0$/, '')} ${units[unit]}`;
}

/** 时长 → `12 秒` / `1:05` / `1:02:03`；无效值返回 `0 秒`。 */
export function formatDuration(ms: number): string {
  if (!isFiniteNumber(ms) || ms <= 0) return '0 秒';
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;

  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${minutes}:${pad2(seconds)}`;
}

/** 时间戳 → 刚刚 / N 分钟前 / 今天 HH:mm / 昨天 HH:mm / M月D日 / YYYY-MM-DD。 */
export function formatRelativeTime(ts: number, lang: 'zh' | 'en' = 'zh'): string {
  if (!isFiniteNumber(ts) || ts <= 0) return '';
  const zh = lang !== 'en';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = now.getTime() - ts;

  if (diff < 60_000) return zh ? '刚刚' : 'just now';
  if (diff < 3_600_000) {
    const minutes = Math.max(1, Math.floor(diff / 60_000));
    return zh ? `${minutes} 分钟前` : `${minutes} min ago`;
  }

  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  if (ts >= startOfToday) return zh ? `今天 ${time}` : `Today ${time}`;
  if (ts >= startOfYesterday) return zh ? `昨天 ${time}` : `Yesterday ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return zh
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : `${MONTHS_EN[date.getMonth()]} ${date.getDate()}`;
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 按 key 去重，保留首次出现的顺序。 */
export function unique<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

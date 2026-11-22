/**
 * 重复任务的时间计算（纯函数，便于单独测试）。
 * 全部按「浏览器/设备本地时区」计算，和 latest_reminder、TTS 的行为保持一致。
 */
import type { MonthlyRule, RepeatKind, TaskRecurrence } from './types';

const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 1=周一 … 7=周日（与 ISO 一致），JS 的 getDay 是 0=周日。 */
export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function parseRepeatTime(time: unknown): { hour: number; minute: number } | null {
  if (typeof time !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

function parseMonthlyRule(value: unknown): MonthlyRule | null {
  const raw = String(value ?? 'day').toLowerCase();
  if (['day', 'lastday', 'lastweekday', 'nthweekday'].includes(raw)) {
    if (raw === 'lastday') return 'lastDay';
    if (raw === 'lastweekday') return 'lastWeekday';
    if (raw === 'nthweekday') return 'nthWeekday';
    return 'day';
  }
  return null;
}

/**
 * 解析工具参数里的重复规则：
 * - `{ kind: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly', time: '09:00', ... }`
 * - monthly 还接受 `monthlyRule`: day / lastDay / lastWeekday / nthWeekday（nth + weekday）
 * - 简写字符串：`daily@09:00` / `weekly@09:00@1` / `monthly@09:00@15`
 * 失败返回 null（调用方负责报错）。
 */
export function parseRecurrence(input: unknown): TaskRecurrence | null {
  if (!input) return null;

  if (typeof input === 'string') {
    const [kind, time, a] = input.split('@').map((part) => part.trim());
    return parseRecurrence({
      kind,
      time,
      weekday: kind === 'weekly' ? a : undefined,
      dayOfMonth: kind === 'monthly' ? a : undefined,
    });
  }

  if (typeof input !== 'object') return null;
  const raw = input as {
    kind?: unknown;
    freq?: unknown;
    time?: unknown;
    weekday?: unknown;
    dayOfMonth?: unknown;
    day?: unknown;
    month?: unknown;
    monthlyRule?: unknown;
    rule?: unknown;
    nth?: unknown;
  };
  const kind = String(raw.kind ?? raw.freq ?? '').toLowerCase();
  if (!['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(kind)) return null;

  const parsed = parseRepeatTime(raw.time);
  if (!parsed) return null;
  const time = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
  const k = kind as RepeatKind;

  if (k === 'daily' || k === 'weekdays') return { kind: k, time };

  if (k === 'weekly') {
    if (!isIntInRange(raw.weekday, 1, 7)) return null;
    return { kind: 'weekly', time, weekday: Number(raw.weekday) };
  }

  if (k === 'monthly') {
    const rule = parseMonthlyRule(raw.monthlyRule ?? raw.rule);
    if (!rule) return null;
    if (rule === 'day') {
      const dayOfMonth = raw.dayOfMonth ?? raw.day;
      if (!isIntInRange(dayOfMonth, 1, 31)) return null;
      return { kind: 'monthly', time, monthlyRule: 'day', dayOfMonth: Number(dayOfMonth) };
    }
    if (rule === 'nthWeekday') {
      if (!isIntInRange(raw.weekday, 1, 7) || !isIntInRange(raw.nth, 1, 5)) return null;
      return {
        kind: 'monthly',
        time,
        monthlyRule: 'nthWeekday',
        weekday: Number(raw.weekday),
        nth: Number(raw.nth),
      };
    }
    return { kind: 'monthly', time, monthlyRule: rule };
  }

  // yearly
  const dayOfMonth = raw.dayOfMonth ?? raw.day;
  if (!isIntInRange(raw.month, 1, 12) || !isIntInRange(dayOfMonth, 1, 31)) return null;
  return { kind: 'yearly', time, month: Number(raw.month), dayOfMonth: Number(dayOfMonth) };
}

/** 当月的第 day 号（超出当月天数时取最后一天）。 */
function clampDay(year: number, monthIndex: number, day: number): number {
  return Math.min(day, daysInMonth(year, monthIndex));
}

function lastWeekdayOfMonth(year: number, monthIndex: number): number {
  let day = daysInMonth(year, monthIndex);
  while (day > 0) {
    const wd = new Date(year, monthIndex, day).getDay();
    if (wd !== 0 && wd !== 6) return day;
    day -= 1;
  }
  return 1;
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekdayIso: number,
  nth: number,
): number {
  const target = weekdayIso % 7; // 1..7 → 0..6（周日=0）
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const offset = (target - firstDay + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const last = daysInMonth(year, monthIndex);
  if (day <= last) return day;
  // 第 N 个不存在（比如第 5 个周三）：取当月最后一次
  let fallback = last;
  while (fallback > 0 && new Date(year, monthIndex, fallback).getDay() !== target) fallback -= 1;
  return fallback > 0 ? fallback : last;
}

function monthlyDay(rec: TaskRecurrence, year: number, monthIndex: number): number {
  switch (rec.monthlyRule ?? 'day') {
    case 'lastDay':
      return daysInMonth(year, monthIndex);
    case 'lastWeekday':
      return lastWeekdayOfMonth(year, monthIndex);
    case 'nthWeekday':
      return nthWeekdayOfMonth(year, monthIndex, rec.weekday ?? 1, rec.nth ?? 1);
    default:
      return clampDay(year, monthIndex, rec.dayOfMonth ?? 1);
  }
}

/** 从 from 之后（严格大于）最近的一次触发时间。 */
export function nextOccurrence(rec: TaskRecurrence, from: number = Date.now()): number {
  const parsed = parseRepeatTime(rec.time) ?? { hour: 9, minute: 0 };
  const start = new Date(from);

  if (rec.kind === 'monthly' || rec.kind === 'yearly') {
    const maxOffset = rec.kind === 'monthly' ? 14 : 3;
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      const year = rec.kind === 'monthly' ? start.getFullYear() : start.getFullYear() + offset;
      const monthIndex =
        rec.kind === 'monthly' ? start.getMonth() + offset : (rec.month ?? 1) - 1;
      const day =
        rec.kind === 'monthly'
          ? monthlyDay(rec, year, monthIndex)
          : clampDay(year, monthIndex, rec.dayOfMonth ?? 1);
      const candidate = new Date(year, monthIndex, day, parsed.hour, parsed.minute, 0, 0);
      if (candidate.getTime() > from) return candidate.getTime();
    }
    return from + 86400000;
  }

  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + offset,
      parsed.hour,
      parsed.minute,
      0,
      0,
    );
    if (candidate.getTime() <= from) continue;

    const iso = isoWeekday(candidate);
    if (rec.kind === 'daily') return candidate.getTime();
    if (rec.kind === 'weekdays' && iso <= 5) return candidate.getTime();
    if (rec.kind === 'weekly' && iso === (rec.weekday ?? 1)) return candidate.getTime();
  }
  return from + 86400000;
}

/** 给模型/界面看的一句话描述。 */
export function describeRecurrence(rec?: TaskRecurrence): string {
  if (!rec) return '';
  if (rec.kind === 'daily') return `每天 ${rec.time}`;
  if (rec.kind === 'weekdays') return `工作日 ${rec.time}`;
  if (rec.kind === 'weekly') {
    const weekday = rec.weekday && rec.weekday >= 1 && rec.weekday <= 7 ? rec.weekday : 1;
    return `每${WEEKDAY_LABEL[weekday % 7]} ${rec.time}`;
  }
  if (rec.kind === 'monthly') {
    const rule = rec.monthlyRule ?? 'day';
    if (rule === 'lastDay') return `每月最后一天 ${rec.time}`;
    if (rule === 'lastWeekday') return `每月最后一个工作日 ${rec.time}`;
    if (rule === 'nthWeekday') {
      const weekday = rec.weekday && rec.weekday >= 1 && rec.weekday <= 7 ? rec.weekday : 1;
      return `每月第 ${rec.nth ?? 1} 个${WEEKDAY_LABEL[weekday % 7]} ${rec.time}`;
    }
    return `每月 ${rec.dayOfMonth ?? 1} 日 ${rec.time}`;
  }
  return `每年 ${rec.month ?? 1} 月 ${rec.dayOfMonth ?? 1} 日 ${rec.time}`;
}

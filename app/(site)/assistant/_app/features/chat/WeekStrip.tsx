import { useState } from 'react';
import type { AgentTask } from '../../agent/types';
import { ChevronLeftIcon, ChevronRightIcon } from '../../ui/Icons';

export function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addDays(ts: number, days: number): number {
  const date = new Date(ts);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** 周一作为一周开始；JS 里 getDay() 周日是 0。 */
function mondayOf(ts: number): number {
  const day = new Date(startOfDay(ts)).getDay();
  const offset = day === 0 ? 6 : day - 1;
  return addDays(startOfDay(ts), -offset);
}

function firstOfMonth(ts: number): number {
  const date = new Date(ts);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

/**
 * 月视图的 6×7 网格（周一开始），返回 42 个「当天 00:00」时间戳。
 * 纯函数，便于单独测试。
 */
export function buildMonthMatrix(monthAnchor: number): number[] {
  const start = mondayOf(firstOfMonth(monthAnchor));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

interface WeekStripProps {
  tasks: AgentTask[];
  selectedDay: number;
  onSelect: (day: number) => void;
  /** move 模式：点某天不是切换查看，而是把正在改期的任务移到那天 */
  mode?: 'select' | 'move';
  onMove?: (day: number) => void;
}

/** 「今天」上方的日历：周视图 / 月视图切换，点哪天看哪天的任务；move 模式下点哪天就把任务挪过去。 */
export default function WeekStrip({
  tasks,
  selectedDay,
  onSelect,
  mode = 'select',
  onMove,
}: WeekStripProps) {
  const today = Date.now();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [monthAnchor, setMonthAnchor] = useState(() => firstOfMonth(today));

  const counts = new Map<number, number>();
  for (const task of tasks) {
    if (task.status === 'done' || !task.dueAt) continue;
    const key = startOfDay(task.dueAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const days =
    view === 'week'
      ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      : buildMonthMatrix(monthAnchor);

  const monthIndex = new Date(monthAnchor).getMonth();
  const rangeLabel =
    view === 'week'
      ? `${new Date(weekStart).getMonth() + 1}月${new Date(weekStart).getDate()}日 – ${
          new Date(days[6]).getMonth() + 1
        }月${new Date(days[6]).getDate()}日`
      : `${new Date(monthAnchor).getFullYear()} 年 ${monthIndex + 1} 月`;

  const shift = (direction: -1 | 1) => {
    if (view === 'week') setWeekStart((prev) => addDays(prev, direction * 7));
    else {
      setMonthAnchor((prev) => {
        const date = new Date(prev);
        return new Date(date.getFullYear(), date.getMonth() + direction, 1).getTime();
      });
    }
  };

  const pick = (day: number) => {
    if (mode === 'move' && onMove) onMove(startOfDay(day));
    else onSelect(startOfDay(day));
  };

  return (
    <div className={`week-strip${mode === 'move' ? ' is-moving' : ''}`}>
      <div className="week-head">
        <button type="button" className="week-nav" aria-label="上一页" onClick={() => shift(-1)}>
          <ChevronLeftIcon size={16} />
        </button>
        <span className="week-range">{mode === 'move' ? '选择目标日期' : rangeLabel}</span>
        <button type="button" className="week-nav" aria-label="下一页" onClick={() => shift(1)}>
          <ChevronRightIcon size={16} />
        </button>
        <div className="week-view-toggle" role="group" aria-label="日历视图">
          <button
            type="button"
            className={`week-view-btn${view === 'week' ? ' is-on' : ''}`}
            aria-pressed={view === 'week'}
            onClick={() => setView('week')}
          >
            周
          </button>
          <button
            type="button"
            className={`week-view-btn${view === 'month' ? ' is-on' : ''}`}
            aria-pressed={view === 'month'}
            onClick={() => setView('month')}
          >
            月
          </button>
        </div>
      </div>

      {view === 'week' ? (
        <div className="week-days">
          {days.map((day, i) => {
            const count = counts.get(startOfDay(day)) ?? 0;
            const active = sameDay(day, selectedDay);
            const isToday = sameDay(day, today);
            return (
              <button
                key={day}
                type="button"
                data-day={startOfDay(day)}
                className={`week-day${active ? ' is-active' : ''}${isToday ? ' is-today' : ''}${
                  mode === 'move' ? ' is-target' : ''
                }`}
                aria-label={`${new Date(day).getMonth() + 1}月${new Date(day).getDate()}日，${count} 个任务`}
                aria-pressed={active}
                onClick={() => pick(day)}
              >
                <span className="week-wd">{WEEK_LABELS[i]}</span>
                <span className="week-num">{new Date(day).getDate()}</span>
                <span className={`week-dot${count > 0 ? ' has' : ''}`} aria-hidden />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="month-grid">
          {WEEK_LABELS.map((label) => (
            <span key={label} className="month-wd">
              {label}
            </span>
          ))}
          {days.map((day) => {
            const count = counts.get(startOfDay(day)) ?? 0;
            const active = sameDay(day, selectedDay);
            const isToday = sameDay(day, today);
            const outside = new Date(day).getMonth() !== monthIndex;
            return (
              <button
                key={day}
                type="button"
                data-day={startOfDay(day)}
                className={`month-day${active ? ' is-active' : ''}${isToday ? ' is-today' : ''}${
                  outside ? ' is-outside' : ''
                }${mode === 'move' ? ' is-target' : ''}`}
                aria-label={`${new Date(day).getMonth() + 1}月${new Date(day).getDate()}日，${count} 个任务`}
                aria-pressed={active}
                onClick={() => pick(day)}
              >
                <span className="month-num">{new Date(day).getDate()}</span>
                <span className={`week-dot${count > 0 ? ' has' : ''}`} aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

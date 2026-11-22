/** 周期任务模板：设置页一键添加，避免用户自己拼 repeat/time。 */
import type { TaskRecurrence } from './types';

export interface TaskTemplate {
  id: string;
  emoji: string;
  title: string;
  notes: string;
  recurrence: TaskRecurrence;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'weekly-review',
    emoji: '🧭',
    title: '每周复盘',
    notes: '这周做成了什么、卡在哪里、下周最重要的一件事。',
    recurrence: { kind: 'weekly', weekday: 1, time: '09:00' },
  },
  {
    id: 'weekly-plan',
    emoji: '🗓️',
    title: '每周计划',
    notes: '定下本周最重要的三件事，其余都往后排。',
    recurrence: { kind: 'weekly', weekday: 1, time: '08:30' },
  },
  {
    id: 'weekly-report',
    emoji: '📮',
    title: '写周报',
    notes: '把本周进展、风险、下周计划整理成一段话。',
    recurrence: { kind: 'weekly', weekday: 5, time: '18:00' },
  },
  {
    id: 'workday-standup',
    emoji: '☕',
    title: '每日站会',
    notes: '昨天做了什么、今天做什么、有什么阻塞。',
    recurrence: { kind: 'weekdays', time: '09:30' },
  },
  {
    id: 'daily-water',
    emoji: '💧',
    title: '起身喝水',
    notes: '站起来走两分钟，顺便看一眼远处。',
    recurrence: { kind: 'daily', time: '15:00' },
  },
  {
    id: 'monthly-bills',
    emoji: '🧾',
    title: '每月对账',
    notes: '把这个月的账单、订阅、报销过一遍。',
    recurrence: { kind: 'monthly', dayOfMonth: 1, time: '09:00' },
  },
  {
    id: 'yearly-checkup',
    emoji: '🩺',
    title: '年度体检',
    notes: '预约体检，顺便整理这一年的体检报告。',
    recurrence: { kind: 'yearly', month: 4, dayOfMonth: 1, time: '10:00' },
  },
];

export function findTemplate(id: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === id);
}

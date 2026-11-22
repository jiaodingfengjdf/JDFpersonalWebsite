/**
 * 个人 Agent 的数据模型：长期记忆、任务、笔记、客户端工具。
 * 这些数据都只存本机（IndexedDB），并且会以「关于用户 / 当前任务」的形式注入系统提示词。
 */

export interface Memory {
  id: string;
  /** 一句话事实，尽量自包含（模型抽取时会要求这样写）。 */
  text: string;
  tags: string[];
  source: 'auto' | 'user';
  createdAt: number;
  updatedAt: number;
  /** 命中次数，用于排序（越常用越靠前）。 */
  hits: number;
  lastUsedAt?: number;
}

export type TaskStatus = 'todo' | 'doing' | 'done';

/** 重复规则：让「每周一早上 9 点复盘」这类任务自动排下一次。 */
export type RepeatKind = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

/** 每月的几种排法：固定日 / 当月最后一天 / 当月最后一个工作日 / 第 N 个周几。 */
export type MonthlyRule = 'day' | 'lastDay' | 'lastWeekday' | 'nthWeekday';

export interface TaskRecurrence {
  kind: RepeatKind;
  /** 本地时间 HH:mm */
  time: string;
  /** kind = weekly：1=周一 … 7=周日；nthWeekday 时表示周几 */
  weekday?: number;
  /** kind = monthly / yearly：几号（1-31，超出当月天数时取当月最后一天） */
  dayOfMonth?: number;
  /** kind = yearly：几月（1-12） */
  month?: number;
  /** kind = monthly 的排法，默认 day（按 dayOfMonth） */
  monthlyRule?: MonthlyRule;
  /** monthlyRule = nthWeekday：第几个（1-5，超出时取当月最后一次） */
  nth?: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface AgentTask {
  id: string;
  title: string;
  status: TaskStatus;
  notes?: string;
  /** 截止时间（毫秒） */
  dueAt?: number;
  /** 提醒时间（毫秒），到点由前端触发通知 */
  reminderAt?: number;
  notified?: boolean;
  /** 重复规则；有它时「完成」会推进到下一次而不是结束 */
  recurrence?: TaskRecurrence;
  /** 上一次完成时间（重复任务用来算下一次） */
  lastCompletedAt?: number;
  /** 「每 N 分钟提醒直到完成」的间隔；有它时忽略提醒会再次排期 */
  snoozeMinutes?: number;
  /** 子任务清单；全部完成时父任务自动完成 */
  subtasks?: Subtask[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentNote {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** Anthropic Messages 协议里的自定义工具定义。 */
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  ok: boolean;
  /** 回传给模型的文本（tool_result.content） */
  content: string;
  /** 给 UI 展示的结构化结果 */
  data?: unknown;
}

/**
 * 工具执行上下文：由 store 注入，工具本身不直接依赖状态管理，
 * 这样可以在 Node 里单独测试。
 */
import type { FetchedPage, SearchOptions, SearchResponse } from '../api/tools';
import type { ImageResult } from '../api/image';

export interface ToolContext {
  now(): number;
  listMemories(): Memory[];
  addMemory(input: { text: string; tags?: string[] }): Memory;
  searchMemories(query: string, limit?: number): Memory[];
  deleteMemory(id: string): boolean;

  listNotes(query?: string): AgentNote[];
  addNote(input: { title?: string; text: string }): AgentNote;

  /** 用户所在地（来自设置），用于时间/时区描述 */
  location(): string;

  /** 调用 DeepSeek Search API（客户端直连，按成功次数计费） */
  webSearch(query: string, options?: SearchOptions): Promise<SearchResponse>;
  /** 调用 DeepSeek Fetch API，返回网页 Markdown 正文 */
  fetchPage(url: string): Promise<FetchedPage>;
  /** 调第三方 GPT Image 接口生成图片 */
  generateImage(prompt: string, options?: { aspectRatio?: string; quality?: string; images?: string[] }): Promise<ImageResult>;
}

export interface ToolDefinition {
  schema: ToolSchema;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

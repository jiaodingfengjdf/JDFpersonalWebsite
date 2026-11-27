/**
 * DeepSeek Chatbot 全家桶 API —— Messages（Anthropic 兼容）协议类型。
 * 文档：https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot
 *
 * 设计要点：
 * - 服务端下发的每个内容块都原样保存在本地，下一轮请求时原样回传（保留 kind / signature），
 *   这样「阅读链接」抓到的网页正文才能通过 signature 还原进上下文。
 * - 搜索结果、打开的网页、历史轮次的思考都不会真正进入后续上下文，但回传它们不会报错。
 */

export type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

import type { ToolSchema } from '../agent/types';
import { ASSISTANT_DEFAULT_MODEL } from '@/lib/assistant-models';

export type PersonaId = 'assistant' | 'coach' | 'tutor' | 'writer';

export type ReplyStyleId =
  | 'default'
  | 'strict'
  | 'friendly'
  | 'blunt'
  | 'imaginative'
  | 'efficient'
  | 'sarcastic'
  | 'coach'
  | 'socratic'
  | 'translationese'
  | 'xiaohongshu';

export interface ReplyStylePreset {
  id: ReplyStyleId;
  name: string;
  desc: string;
  /** 写进系统提示词的风格要求 */
  instruction: string;
}

export const REPLY_STYLES: ReplyStylePreset[] = [
  {
    id: 'default',
    name: '默认',
    desc: '不设定特定风格。',
    instruction: '按任务本身选择最合适的表达方式。',
  },
  {
    id: 'strict',
    name: '专业严谨',
    desc: '清晰、准确、值得信赖。',
    instruction: '专业严谨：术语准确，结论有依据，区分事实与推测，不确定就直说。',
  },
  {
    id: 'friendly',
    name: '亲和友善',
    desc: '温暖、平易近人、鼓励支持。',
    instruction: '亲和友善：语气温暖，先共情再给建议，多给肯定，少用命令句。',
  },
  {
    id: 'blunt',
    name: '直言不讳',
    desc: '简明扼要、不废话、直击要点。',
    instruction: '直言不讳：先给结论，砍掉客套与铺垫，有问题直接指出。',
  },
  {
    id: 'imaginative',
    name: '天马行空',
    desc: '富有想象力、善用比喻类比。',
    instruction: '天马行空：多用比喻和类比解释概念，鼓励发散想法，但结论仍要落地。',
  },
  {
    id: 'efficient',
    name: '高效务实',
    desc: '最少文字、最大信息量。',
    instruction: '高效务实：能一句说完不说两句，列表化、可执行，省略解释性铺垫。',
  },
  {
    id: 'sarcastic',
    name: '毒舌吐槽',
    desc: '犀利吐槽、但绝不伤人。',
    instruction: '毒舌吐槽：可以调侃、犀利吐槽，但只针对事情不针对人，最后仍给出可执行建议。',
  },
  {
    id: 'coach',
    name: '启发引导',
    desc: '用提问引导思考、授人以渔。',
    instruction: '启发引导：先反问一两个关键问题，再给提示，让对方自己得出结论，不要直接代劳。',
  },
  {
    id: 'socratic',
    name: '苏格拉底式追问',
    desc: '连续追问前提假设，逼出真正的问题。',
    instruction:
      '苏格拉底式追问：先用 1–2 个问题澄清对方的前提与目标，再指出其中未经验证的假设；不要直接给答案，只在对方卡住时给一个提示方向。语气克制、不居高临下。',
  },
  {
    id: 'translationese',
    name: '翻译腔',
    desc: '保留英文语序与长定语，术语附原文。',
    instruction:
      '翻译腔：保留英文的句序与长定语结构（「一个……的、被……的……」），术语首次出现附英文原文；不要为了顺口改写句子，但要保证信息不丢。',
  },
  {
    id: 'xiaohongshu',
    name: '小红书种草',
    desc: '标题党 + emoji 分行 + 痛点 + 转化引导。',
    instruction:
      '小红书种草体：一句抓人的标题（可用数字/反差/身份），正文分 3–5 行短句、每行可带 1 个 emoji，先讲人群痛点再讲体验与对比，最后给一句行动引导；不要编造功效与价格，涉及效果必须注明「个人体验」。',
  },
];

export const DEFAULT_TEAM = ['chief', 'researcher', 'writer'] as const;

export interface AgentTeammate {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

/** 智能体团队花名册：设置页可勾选，勾中的会写进系统提示词并可被点名调用。 */
export const AGENT_TEAM: AgentTeammate[] = [
  { id: 'chief', name: '主理人', emoji: '🧭', role: '统筹需求、拆解任务、汇总结论' },
  { id: 'researcher', name: '研究员', emoji: '🔍', role: '联网检索、核对事实、给出来源' },
  { id: 'writer', name: '文案', emoji: '✍️', role: '写作、改写、润色、结构化表达' },
  { id: 'coder', name: '工程师', emoji: '🛠️', role: '代码、调试、技术方案与命令' },
  { id: 'analyst', name: '分析师', emoji: '📊', role: '数据解读、对比取舍、风险提示' },
  { id: 'coach', name: '教练', emoji: '🏃', role: '拆解目标、督促进度、复盘' },
];

export type ToolKind =
  | 'search'
  | 'deep_search'
  | 'read_link'
  | 'image_search'
  | 'deep_image_search';

export type StopReason = 'end_turn' | 'max_tokens' | 'refusal' | string | null;

/* ------------------------------------------------------------------ */
/* 引用                                                                */
/* ------------------------------------------------------------------ */

export interface Citation {
  type: 'web_search_result_location';
  url: string;
  title: string | null;
  encrypted_index: string;
  /** 当前文本块截至该引用处的回答文本（不是来源摘录）。 */
  cited_text?: string;
}

/* ------------------------------------------------------------------ */
/* assistant 内容块                                                     */
/* ------------------------------------------------------------------ */

export interface TextBlock {
  type: 'text';
  text: string;
  citations?: Citation[];
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export type ServerToolAction =
  | { action: 'search'; queries?: string[] }
  | { action: 'open_page'; url: string }
  | { action: 'find_in_page'; url: string; pattern: string }
  | { action: 'read_link'; url: string }
  | { action: string; queries?: string[]; url?: string; pattern?: string };

export interface ServerToolUseBlock {
  type: 'server_tool_use';
  id: string;
  /** deepseek_web_search | deepseek_read_url */
  name: string;
  input: ServerToolAction;
  caller?: { type: string };
  kind?: ToolKind;
}

/** 客户端工具调用（我们自己执行的工具，如 remember / add_task）。 */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** 本地执行结果，仅用于 UI 展示；回传服务端前会被剥掉。 */
  result?: { content: string; is_error?: boolean };
}

/** 客户端工具结果，放在 user 消息里回传。 */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface WebSearchResultItem {
  type: 'web_search_result';
  title: string | null;
  url: string;
  /** 加密的网页内容，原样回传即可。 */
  encrypted_content?: string;
  page_age?: string | null;
  snippet?: string | null;
  site_name?: string | null;
  site_icon?: string | null;
  /** 仅图片搜索结果。 */
  image_url?: string | null;
}

export interface WebSearchToolError {
  type: 'web_search_tool_result_error';
  error_code: string;
}

export interface WebSearchToolResultBlock {
  type: 'web_search_tool_result';
  tool_use_id: string;
  content: WebSearchResultItem[] | WebSearchToolError[];
  kind?: ToolKind;
}

export interface WebFetchPage {
  type: 'web_fetch_result';
  url: string;
  content: {
    type: 'document';
    source: { type: 'text'; media_type: string; data: string };
    title: string | null;
  };
  published_at: string | null;
}

export interface WebFetchToolError {
  type: 'web_fetch_tool_result_error';
  error_code: string;
}

export interface WebFetchToolResultBlock {
  type: 'web_fetch_tool_result';
  tool_use_id: string;
  content: WebFetchPage | WebFetchToolError;
  kind?: ToolKind;
  /** 加密的网页正文，必须原样回传。 */
  signature?: string;
}

export type AssistantBlock =
  | TextBlock
  | ThinkingBlock
  | ServerToolUseBlock
  | ToolUseBlock
  | WebSearchToolResultBlock
  | WebFetchToolResultBlock;

/* ------------------------------------------------------------------ */
/* user 内容块                                                         */
/* ------------------------------------------------------------------ */

export interface UserTextBlock {
  type: 'text';
  text: string;
}

export interface UserImageBlock {
  type: 'image';
  source:
    | { type: 'base64'; media_type: MediaType; data: string }
    | { type: 'url'; url: string }
    | { type: 'file'; file_id: string };
}

export interface UserDocumentBlock {
  type: 'document';
  source:
    | { type: 'file'; file_id: string }
    | { type: 'text'; media_type: string; data: string };
  title?: string;
}

export type UserBlock = UserTextBlock | UserImageBlock | UserDocumentBlock | ToolResultBlock;

/* ------------------------------------------------------------------ */
/* usage                                                              */
/* ------------------------------------------------------------------ */

export interface ServerToolUsage {
  web_search_requests?: number;
  web_fetch_requests?: number;
  tool_search?: number;
  tool_fetch?: number;
  tool_image_search?: number;
}

export interface Usage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
  output_tokens_details?: { thinking_tokens?: number; safety_tokens?: number };
  server_tool_use?: ServerToolUsage;
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* 请求                                                               */
/* ------------------------------------------------------------------ */

export type ReminderPlatform = 'App' | 'Web';

export interface LatestReminder {
  /** YYYY-MM-DD */
  date: string;
  weekday: string;
  location: string;
  platform: ReminderPlatform;
  /** 语言自称，如 中文 / English */
  language: string;
}

export interface ThinkingConfig {
  type: 'enabled' | 'disabled';
}

export type SafetyLevel = 'low' | 'high';

export interface ApiToolDeclaration {
  type: 'deepseek_web_search' | 'deepseek_read_url';
  name: string;
}

export interface CreateMessageRequest {
  model: string;
  max_tokens?: number;
  stream?: boolean;
  system?: string;
  thinking?: ThinkingConfig;
  output_config?: { effort?: string };
  /** 服务端工具（type/name）与客户端工具（name/description/input_schema）的混合数组 */
  tools?: Array<ApiToolDeclaration | ToolSchema>;
  tool_choice?: { type: 'auto' | 'none' | 'any' };
  safety_check?: { level: SafetyLevel };
  title?: { enabled: boolean };
  metadata?: { user_id?: string };
  temperature?: number;
  messages: ApiMessage[];
}

export interface ApiMessage {
  role: 'user' | 'assistant' | 'latest_reminder';
  content: string | AssistantBlock[] | UserBlock[];
}

/* ------------------------------------------------------------------ */
/* 流式事件                                                            */
/* ------------------------------------------------------------------ */

export type DeltaKind =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'signature_delta'; signature: string }
  | { type: 'citations_delta'; citation: Citation }
  | { type: string; [k: string]: unknown };

export interface MessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: string;
    role: 'assistant';
    model: string;
    content: AssistantBlock[];
    stop_reason: StopReason;
    stop_sequence: string | null;
    usage?: Usage;
  };
}

export interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: AssistantBlock;
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: DeltaKind;
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: StopReason;
    stop_sequence: string | null;
    title?: string;
    stop_details?: { type: string; category: string | null; explanation: string | null };
  };
  usage?: Usage;
}

export interface MessageStopEvent {
  type: 'message_stop';
}

export interface StreamErrorEvent {
  type: 'error';
  error: { type?: string; message: string; code?: string };
  usage?: Usage;
}

export type StreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | StreamErrorEvent;

/* ------------------------------------------------------------------ */
/* 应用层模型（落盘）                                                   */
/* ------------------------------------------------------------------ */

export interface Attachment {
  id: string;
  fileId: string;
  filename: string;
  purpose: FilePurpose;
  kind: 'image' | 'document' | 'text';
  bytes?: number;
  /** 图片的 data URL：既是本地预览，也作为内联 base64 图片块发给模型。 */
  dataUrl?: string;
}

export type FilePurpose = 'user_data' | 'text_recognition' | 'rich_layout_recognition';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  createdAt: number;
  /** assistant：服务端内容块原样保存；user：文本/图片/文档块。 */
  blocks: AssistantBlock[] | UserBlock[];
  /** UI 展示用纯文本（用户输入原文）。 */
  text?: string;
  attachments?: Attachment[];
  usage?: Usage;
  stopReason?: StopReason;
  title?: string;
  /** 请求失败信息（网络/4xx/5xx/流中断）。 */
  error?: string;
  /** 是否被用户中断。 */
  aborted?: boolean;
  /** 是否用过联网工具（用过则不能续写）。 */
  usedTools?: boolean;
  /** 命中内容安全审核，回答已被服务端清空。 */
  refused?: boolean;
  /** 隐藏消息：只用于承载 tool_result，不在 UI 里显示。 */
  hidden?: boolean;
  model?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** 首次请求时抓到的模型标题，之后不再请求标题。 */
  titled?: boolean;
}

export interface Settings {
  displayName: string;
  welcomeMessage: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  thinking: boolean;
  effort: '' | 'low' | 'medium' | 'high';
  webSearch: boolean;
  readUrl: boolean;
  safety: SafetyLevel;
  autoTitle: boolean;
  maxTokens: number;
  /** 用户元信息标记 */
  reminderEnabled: boolean;
  location: string;
  /** 语言自称，如 中文 / English */
  language: string;
  theme: 'auto' | 'light' | 'dark';
  voiceId: 'stella' | 'tide';
  autoRead: boolean;
  /** 助理人设 */
  persona: PersonaId;
  /** 回复风格：concise 极简 / balanced 平衡 / detailed 详细 */
  replyStyle: ReplyStyleId;
  /** 对用户的称呼（空则用「你」） */
  addressName: string;
  /** 称呼语气：casual 你 / polite 您 */
  addressTone: 'casual' | 'polite';
  /** 启用的智能体团队（id 列表，第一个为主责） */
  team: string[];
  /** 每轮结束后自动从对话里抽取长期记忆 */
  autoMemory: boolean;
  /** 到点的任务提醒：应用内横幅 + （授权后）系统通知 */
  notifications: boolean;
  mockMode: boolean;
  /** 生图（第三方 GPT Image 网关） */
  imageBaseUrl: string;
  imageApiKey: string;
  imageModel: string;
  imageQuality: string;
  imageAspect: string;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: '私人 AI 助理',
  welcomeMessage: '有什么可以帮你的？支持深度思考、联网检索与文档解析。',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: ASSISTANT_DEFAULT_MODEL,
  systemPrompt: '',
  thinking: true,
  effort: '',
  webSearch: true,
  readUrl: true,
  safety: 'high',
  autoTitle: true,
  maxTokens: 8192,
  reminderEnabled: true,
  location: '',
  language: '中文',
  theme: 'auto',
  voiceId: 'stella',
  autoRead: false,
  persona: 'assistant',
  replyStyle: 'friendly',
  addressName: '',
  addressTone: 'casual',
  team: ['chief', 'researcher', 'writer'],
  autoMemory: true,
  notifications: true,
  mockMode: false,
  imageBaseUrl: 'https://grsai.dakka.com.cn',
  imageApiKey: '',
  imageModel: 'gpt-image-2.6',
  imageQuality: 'auto',
  imageAspect: '1024x1024',
  haptics: true,
};

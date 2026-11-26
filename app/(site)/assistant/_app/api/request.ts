/**
 * 把本地会话转换成 DeepSeek Messages 请求。
 *
 * 关键点（文档：多轮对话 / latest_reminder / 文件解析 / 图像理解）：
 * - 历史里的 assistant 内容块原样回传，保留 kind 与 signature，阅读过的网页才能被还原进上下文；
 * - 开启用户元信息标记时，每条 user 消息前紧挨一条 latest_reminder；
 * - 图片走内联 base64（image 块），文档走 Files API 的 file_id（document 块）。
 */
import type {
  ApiMessage,
  AssistantBlock,
  Attachment,
  ChatMessage,
  Conversation,
  CreateMessageRequest,
  PersonaId,
  Settings,
  UserBlock,
} from './types';
import { AGENT_TEAM, REPLY_STYLES } from './types';
import type { AgentTask, Memory } from '../agent/types';
import { buildMemorySection, buildTaskSection, selectMemoriesForPrompt } from '../agent/memory';
import { skillPromptSection, type Skill } from '../agent/skills';
import { CLIENT_TOOL_SCHEMAS } from '../agent/tools';

const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 生成 latest_reminder：`<date>,<weekday>,<location>,<platform>,<language>` */
export function latestReminderText(settings: Settings, now: Date = new Date()): string {
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const lang = settings.language.trim() || '中文';
  const isZh = lang.startsWith('中文');
  const weekday = isZh ? WEEKDAY_ZH[now.getDay()] : WEEKDAY_EN[now.getDay()];
  // 手机 App 形态，platform 固定 App
  return `${date},${weekday},${settings.location.trim()},App,${lang}`;
}

const BASE_RULES = [
  '默认使用简体中文回答；用户使用其他语言时跟随用户。',
  '回答准确、直接、结构化，善用 Markdown（列表、表格、代码块）提升可读性。',
  '不确定时明确说明不确定，不要编造事实；引用网页时给出可点击来源。',
].join('\n');

/** 人设：决定助理的说话方式与主动性，规则与记忆另外追加。 */
const PERSONAS: Record<PersonaId, string> = {
  assistant: [
    '你是用户的私人 AI 助理，运行在用户自己的手机 App 里。',
    '你像一位靠谱的秘书：先给出结论和可执行的动作，再补充理由，不啰嗦。',
    '遇到需要长期记住的事（偏好、身份、正在进行的目标），调用 remember 记下来；',
    '用户提到要做的事，主动用 add_task 落成任务，并在回答里告诉他你已经记下了。',
  ].join('\n'),
  coach: [
    '你是用户的目标教练，关注执行而不是安慰。',
    '每次回答都给一个「下一步最小动作」，并在合适时用 add_task 把动作落成任务。',
    '用户记录过目标或偏好时，主动引用长期记忆，帮他保持连续性。',
  ].join('\n'),
  tutor: [
    '你是用户的学习搭子，擅长把复杂概念拆成可验证的小步骤。',
    '解释时先给直觉，再给严谨定义，最后留一个可以自己动手验证的小练习。',
    '用户说过在学什么、卡在哪里，要记进长期记忆并在后续对话里用上。',
  ].join('\n'),
  writer: [
    '你是用户的中文写作搭档，语气克制、具体、不堆形容词。',
    '写东西时先确认读者和目的，再给成稿；用户给过的风格偏好要长期记住。',
  ].join('\n'),
};

export interface AgentPromptContext {
  memories: Memory[];
  tasks?: AgentTask[];
  skills?: Skill[];
  now: number;
}

export function buildSystemPrompt(settings: Settings, agent?: AgentPromptContext): string {
  const parts = [PERSONAS[settings.persona] ?? PERSONAS.assistant, BASE_RULES];

  // 回复风格
  const stylePreset =
    REPLY_STYLES.find((item) => item.id === settings.replyStyle) ?? REPLY_STYLES[0];
  parts.push('## 回复风格：' + stylePreset.name + '\n' + stylePreset.instruction);

  // 称呼
  const name = settings.addressName.trim();
  const tone = settings.addressTone === 'polite' ? '您' : '你';
  const call = name ? `${name}（称呼对方为「${name}」，自称「我」）` : tone;
  parts.push(
    `## 称呼\n默认称呼：${call}。不要每句都加称呼，只在开头、转折或收尾用；不要反复说「${name || tone}」显得机械。`,
  );

  // 智能体团队
  const enabled = AGENT_TEAM.filter((member) => settings.team.includes(member.id));
  if (enabled.length > 0) {
    const roster = enabled.map((member) => `- ${member.emoji} ${member.name}：${member.role}`).join('\n');
    const chief = enabled[0];
    parts.push(
      `## 智能体团队\n你的团队（点名前先说明是谁在说话，例如「${chief.name}：」）：\n${roster}\n\n规则：\n1. 默认由「${chief.name}」直接回答，不要每次都报队名；\n2. 需要检索/核对事实时，以「研究员」的视角处理并给出来源；写文案时切到「文案」口吻；\n3. 只有用户点名（例如「让工程师看看」）或任务明显跨界时，才显式切换角色，并在答案里说明切换理由；\n4. 多个角色都参与时，按「结论 → 依据 → 下一步」合并输出，不要各说一段。`,
    );
  }

  if (agent) {
    const memory = buildMemorySection(selectMemoriesForPrompt(agent.memories));
    if (memory) parts.push(memory);
    if (agent.tasks && agent.tasks.length > 0) {
      const taskSection = buildTaskSection(agent.tasks, agent.now);
      if (taskSection) parts.push(taskSection);
    }
    if (agent.skills && agent.skills.length > 0) {
      const skillSection = skillPromptSection(agent.skills);
      if (skillSection) parts.push(skillSection);
    }
  }
  const custom = settings.systemPrompt.trim();
  if (custom) parts.push(`## 用户自定义指令\n${custom}`);
  return parts.join('\n\n');
}

function attachmentBlock(att: Attachment): UserBlock | null {
  if (att.kind === 'image' && att.dataUrl) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(att.dataUrl);
    if (!match) return null;
    const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: match[2] } };
  }
  if (att.fileId) {
    return { type: 'document', source: { type: 'file', file_id: att.fileId } };
  }
  return null;
}

/** 单条 user 消息 → 内容块数组（附件在前、文本在后）。 */
export function userMessageBlocks(message: ChatMessage): UserBlock[] {
  const blocks: UserBlock[] = [];
  for (const att of message.attachments ?? []) {
    const block = attachmentBlock(att);
    if (block) blocks.push(block);
  }
  const text = (message.text ?? '').trim();
  if (text) blocks.push({ type: 'text', text });
  if (blocks.length === 0) blocks.push({ type: 'text', text: '（空消息）' });
  return blocks;
}

/** 历史 assistant 消息 → 可回传的内容块（保留 kind / signature，剥掉仅用于 UI 的字段）。 */
export function assistantReplayBlocks(message: ChatMessage, keepThinking: boolean): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  for (const block of message.blocks as AssistantBlock[]) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'thinking') {
      if (keepThinking && (block.thinking || block.signature)) blocks.push(block);
      continue;
    }
    if (block.type === 'tool_use') {
      // result 是本地展示用的，回传时必须去掉
      blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
      continue;
    }
    if (
      ['text', 'server_tool_use', 'web_search_tool_result', 'web_fetch_tool_result'].includes(
        block.type,
      )
    ) {
      blocks.push(block);
    }
  }
  return blocks;
}

export interface BuildOptions {
  /** 只发到这条用户消息为止（编辑/重发用）。 */
  upToMessageId?: string;
  /** 是否包含最后一条（可能未完成的）assistant 消息，用于「继续生成」。 */
  includeTrailingAssistant?: boolean;
}

export function buildApiMessages(
  conversation: Conversation,
  settings: Settings,
  options: BuildOptions = {},
): ApiMessage[] {
  const messages: ApiMessage[] = [];
  const list = conversation.messages;

  for (const message of list) {
    if (message.role === 'user') {
      // tool_result 这类隐藏消息原样回传，不加 latest_reminder
      if (message.hidden) {
        messages.push({ role: 'user', content: message.blocks as UserBlock[] });
        continue;
      }
      if (settings.reminderEnabled) {
        messages.push({ role: 'latest_reminder', content: latestReminderText(settings) });
      }
      messages.push({ role: 'user', content: userMessageBlocks(message) });
    } else {
      const blocks = assistantReplayBlocks(message, settings.thinking);
      if (blocks.length === 0 && !options.includeTrailingAssistant) continue;
      messages.push({ role: 'assistant', content: blocks });
    }
    if (options.upToMessageId && message.id === options.upToMessageId) break;
  }

  return messages;
}

export function buildRequestBody(
  settings: Settings,
  titleEnabled: boolean,
  agent?: AgentPromptContext,
): Omit<CreateMessageRequest, 'messages'> {
  const tools: Array<NonNullable<CreateMessageRequest['tools']>[number]> = [];
  if (settings.webSearch) tools.push({ type: 'deepseek_web_search', name: 'deepseek_web_search' });
  if (settings.readUrl) tools.push({ type: 'deepseek_read_url', name: 'deepseek_read_url' });
  // 客户端工具：记忆、任务、笔记、时间
  tools.push(...CLIENT_TOOL_SCHEMAS);

  const body: Omit<CreateMessageRequest, 'messages'> = {
    model: settings.model.trim() || 'deepseek-flash',
    max_tokens: settings.maxTokens > 0 ? settings.maxTokens : undefined,
    thinking: { type: settings.thinking ? 'enabled' : 'disabled' },
    system: buildSystemPrompt(settings, agent),
    tools,
  };

  if (settings.thinking && settings.effort) body.output_config = { effort: settings.effort };
  if (settings.safety === 'high') body.safety_check = { level: 'high' };
  if (titleEnabled) body.title = { enabled: true };

  return body;
}

/** 统计「继续生成」是否可用：用过联网工具的回复不能续写。 */
export function canContinue(message: ChatMessage): boolean {
  return message.role === 'assistant' && !message.usedTools;
}

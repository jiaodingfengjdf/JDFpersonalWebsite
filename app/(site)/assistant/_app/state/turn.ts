/**
 * 会话回合（turn）层：流式生成入口、共享常量与依赖契约。
 *
 * 分片状态：
 * 1. [已完成] StreamRunOptions / MAX_AGENT_STEPS 迁入本文件
 * 2. [已完成] TurnDeps 依赖契约 + runId/abort 所有权
 * 3. [已完成] runStream 主体迁入，store 只保留薄封装
 *
 * 约束：本文件只用 `import type` 触碰 store，绝不反向 import store 的值。
 * 因此打包后不存在运行时循环依赖，本文件也可以在 Node 里注入假 deps 直接单测。
 */
import { ApiError, applyDeltaToBlock, streamMessage } from '../api/client';
import { runMockChat } from '../api/mock';
import { buildApiMessages, buildRequestBody } from '../api/request';
import type {
  AssistantBlock,
  ChatMessage,
  Conversation,
  DeltaKind,
  StopReason,
  ToolResultBlock,
  ToolUseBlock,
  Usage,
} from '../api/types';
import { assistantText, mergeAdjacentTextBlocks, previewOf } from '../lib/message';
import { uid } from '../lib/uid';
import type { ToolContext, ToolResult } from '../agent/types';
import type { AppState } from './store';

/** 一次提问里最多允许连续调用几轮客户端工具（防死循环烧 Token）。 */
export const MAX_AGENT_STEPS = 6;

export interface StreamRunOptions {
  mode: 'new' | 'continue';
  target: ChatMessage;
  /** 「继续生成」时已存在的内容块（新块追加到其后） */
  baseBlocks?: AssistantBlock[];
}

/**
 * runStream 需要的全部外部能力。
 * 全部以函数形式注入，turn.ts 不 import store，彻底避免循环依赖。
 */
export interface TurnDeps {
  /** 读取当前全局状态（settings / memories / streamRev 等） */
  getState: () => AppState;
  /** 触发重渲染（只做 patch，不落盘） */
  setState: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  /** rAF 合并刷新流式内容 */
  flushSoon: () => void;
  /** 去抖落盘（400ms 合并） */
  schedulePersist: () => void;
  /** 取一个新的运行 id（调用后旧 id 即失效） */
  nextRunId: () => number;
  /** 判断某个运行 id 是否仍是最新一次（防止旧流回写） */
  isCurrent: (runId: number) => boolean;
  /** 掐掉上一个流并返回本次流的 controller（单流互斥唯一入口） */
  abortPrev: () => AbortController;
  /** 流结束时释放 controller 引用（只在它仍是当前 controller 时清空） */
  clearStream: (controller: AbortController) => void;
  executeTool: (name: string, input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
  toolContext: () => ToolContext;
  speakMessage: (id: string) => Promise<void>;
  extractMemories: (conv: Conversation) => Promise<void>;
  persistConversation: (conv: Conversation) => Promise<void>;
  toast: (text: string, kind?: 'info' | 'error' | 'success') => void;
}

/** 自动朗读（answer 生成完直接念）。当前产品决策为关闭，只保留手动点喇叭。 */
const AUTO_READ_ENABLED = false;

/** 生成新的运行 id，并让旧运行失效。 */
export function nextRunId(current: number): number {
  return current + 1;
}

/** 同一个会话里只允许一个流：新流启动前先掐掉旧的。 */
export function abortPrevious(controller: AbortController | null): AbortController {
  if (controller) {
    try {
      controller.abort();
    } catch {
      /* 已结束的 controller 直接忽略 */
    }
  }
  return new AbortController();
}

/** 新建一条空的 assistant 消息（模型名取自设置，占位用）。 */
export function createAssistantMessage(model: string): ChatMessage {
  return {
    id: uid('msg'),
    role: 'assistant',
    createdAt: Date.now(),
    blocks: [],
    model,
  };
}

/**
 * 跑一次流式回答，必要时驱动客户端工具循环（最多 MAX_AGENT_STEPS 轮）。
 *
 * 所有副作用都经 `deps` 落地：本函数只负责「请求 → 合并块 → 处理工具调用」，
 * 因此在测试里注入假的 deps 就能跑完整流程。
 */
export async function runStream(
  conv: Conversation,
  options: StreamRunOptions,
  deps: TurnDeps,
): Promise<void> {
  const { settings } = deps.getState();
  // 先取新 runId、再掐旧流：旧流被 abort 后走 finally，`isCurrent()` 变假直接返回，
  // 不会把「已停止」的状态写回全局。顺序调换会导致重复回答（「你好你好」）。
  const runId = deps.nextRunId();
  const controller = deps.abortPrev();
  const isCurrent = (): boolean => deps.isCurrent(runId);
  const titleEnabled = settings.autoTitle && !conv.titled && options.mode === 'new';

  let target = options.target;
  let base = options.baseBlocks ?? [];
  let mode = options.mode;
  let usedTools = false;

  deps.setState({
    streaming: true,
    streamingMessageId: target.id,
    streamRev: deps.getState().streamRev + 1,
  });

  try {
    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      // 每轮工具调用都有自己的目标消息；同步追加进会话，UI 就能看到「执行中」的每一步
      const incoming: AssistantBlock[] = [];
      const syncBlocks = (): void => {
        if (!isCurrent()) return;
        target.blocks = base.length ? [...base, ...incoming.filter(Boolean)] : incoming.filter(Boolean);
        deps.flushSoon();
      };

      const callbacks = {
        onStart: (info: { model?: string }) => {
          if (info.model) target.model = info.model;
          syncBlocks();
        },
        onBlockStart: (index: number, block: AssistantBlock) => {
          incoming[index] = block;
          syncBlocks();
        },
        onDelta: (index: number, delta: DeltaKind) => {
          if (!isCurrent()) return;
          const block = incoming[index];
          if (!block) return;
          applyDeltaToBlock(block, delta);
          deps.flushSoon();
        },
        onBlockStop: () => {
          deps.flushSoon();
        },
        onFinal: (delta: { stop_reason: StopReason; title?: string }, usage?: Usage) => {
          target.stopReason = delta.stop_reason;
          target.usage = usage;
          if (delta.title && titleEnabled) {
            conv.title = delta.title;
            conv.titled = true;
          }
        },
      };

      const apiMessages = buildApiMessages(conv, settings);
      const body = buildRequestBody(settings, titleEnabled && step === 0, {
        memories: deps.getState().memories,
        now: Date.now(),
      });

      const result = settings.mockMode
        ? await runMockChat({ messages: apiMessages, callbacks, signal: controller.signal })
        : await streamMessage({
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl,
            body,
            messages: apiMessages,
            signal: controller.signal,
            callbacks,
          });

      const merged = [...base, ...result.blocks].filter(Boolean);
      // 只有「继续生成」需要把新块并进上一条文本，普通回答保持多块（每块有独立引用）
      target.blocks = mode === 'continue' ? mergeAdjacentTextBlocks(merged) : merged;
      target.stopReason = result.stopReason;
      target.usage = result.usage;
      target.model = result.model ?? target.model;
      target.refused = result.stopReason === 'refusal';
      usedTools = usedTools || result.usedTools;
      if (result.title && titleEnabled) {
        conv.title = result.title;
        conv.titled = true;
      }

      // ---------- 客户端工具循环 ----------
      const toolUses = (result.blocks as AssistantBlock[]).filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      );
      if (result.stopReason !== 'tool_use' || toolUses.length === 0) break;

      const ctx = deps.toolContext();
      const results: ToolResultBlock[] = [];
      for (const call of toolUses) {
        const outcome = await deps.executeTool(call.name, call.input, ctx);
        // 结果挂在调用块上：UI 直接展示，历史回传时会剥掉这个字段
        call.result = { content: outcome.content, is_error: !outcome.ok };
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: outcome.content,
          is_error: !outcome.ok,
        });
        usedTools = true;
      }
      target.usedTools = true;
      target.blocks = [...(target.blocks as AssistantBlock[])];

      // tool_result 必须作为 user 消息回传；标记 hidden 让 UI 跳过
      conv.messages = [
        ...conv.messages,
        { id: uid('msg'), role: 'user', createdAt: Date.now(), blocks: results, hidden: true },
      ];
      const nextTarget = createAssistantMessage(deps.getState().settings.model);
      conv.messages = [...conv.messages, nextTarget];
      target = nextTarget;
      base = [];
      mode = 'new';
      deps.setState((s) => ({
        conversation: { ...conv },
        streamingMessageId: target.id,
        streamRev: s.streamRev + 1,
      }));
    }

    if (usedTools) target.usedTools = true;
  } catch (err) {
    // 真实流把取消包成 ApiError('aborted')；演示模式（mock）抛的是 DOMException AbortError。
    // 两种都算「用户主动停止」，不能当成错误红字显示。
    const aborted =
      (err instanceof ApiError && err.code === 'aborted') ||
      (err instanceof Error && err.name === 'AbortError');
    if (aborted) {
      target.aborted = true;
    } else {
      target.error = err instanceof Error ? err.message : String(err);
      if (err instanceof ApiError && err.status === 401) deps.setState({ view: 'settings' });
    }
  } finally {
    if (!isCurrent()) return;
    deps.clearStream(controller);
    // 兜底标题：首轮回答没有返回 title 时用用户消息前缀
    if (!conv.titled && options.mode === 'new') {
      const firstUser = conv.messages.find((m) => m.role === 'user');
      if (firstUser) {
        conv.title = previewOf(firstUser, 18);
        conv.titled = true;
      }
    }
    deps.setState((s) => ({
      streaming: false,
      streamingMessageId: null,
      streamRev: s.streamRev + 1,
      conversation: conv,
    }));
    await deps.persistConversation(conv);
    deps.schedulePersist();

    const latest = deps.getState();
    // 自动朗读：只对刚生成的这条回答，且必须有正文
    if (
      AUTO_READ_ENABLED &&
      latest.settings.autoRead &&
      !target.error &&
      !target.refused &&
      options.mode === 'new' &&
      assistantText(target).length > 0
    ) {
      void deps.speakMessage(target.id);
    }
    // 记忆抽取：不阻塞 UI；失败时把原因说出来，避免静默失效
    if (latest.settings.autoMemory && !latest.settings.mockMode && !target.error) {
      void deps.extractMemories(conv).catch((err) => {
        deps.toast(`记忆抽取失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      });
    }
  }
}

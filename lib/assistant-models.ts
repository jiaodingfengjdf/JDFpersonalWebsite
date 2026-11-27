/**
 * 站内 AI 助理的模型注册表（唯一事实源）。
 *
 * 服务端（contracts.ts / service.ts）与客户端（Composer、设置页、
 * DEFAULT_SETTINGS）都读这里，禁止在各处重复硬编码模型 id。
 *
 * 目前只有 DeepSeek 一个厂商：协议是 DeepSeek 的 Anthropic 兼容
 * Messages API，换其他厂商原生端点需要 Phase 3 的 provider 适配器。
 */

export interface AssistantModelInfo {
  /** 传给上游的模型 id。 */
  id: string;
  /** 中文名，展示用。 */
  name: string;
  /** 输入框 chip 上的短名。 */
  shortName: string;
  /** 是否支持深度思考（thinking 配置）。 */
  supportsThinking: boolean;
  /** 默认思考强度，'' 为不指定（由上游默认）。 */
  defaultEffort: "" | "low" | "medium" | "high";
  /** 单次最大输出上限（maxTokens 不得超过它）。 */
  maxTokensCap: number;
}

export const ASSISTANT_MODEL_REGISTRY: readonly AssistantModelInfo[] = [
  {
    id: "deepseek-flash",
    name: "DeepSeek Flash（快速）",
    shortName: "flash",
    supportsThinking: true,
    defaultEffort: "",
    maxTokensCap: 65536,
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro（旗舰）",
    shortName: "v4-pro",
    supportsThinking: true,
    defaultEffort: "",
    maxTokensCap: 65536,
  },
] as const;

export const ASSISTANT_MODEL_IDS = ASSISTANT_MODEL_REGISTRY.map(
  (model) => model.id,
) as unknown as readonly ["deepseek-flash", "deepseek-v4-pro"];

export type AssistantModelId = (typeof ASSISTANT_MODEL_IDS)[number];

export const ASSISTANT_DEFAULT_MODEL: AssistantModelId = "deepseek-flash";

/** 未知 id 回落到默认模型，避免 UI/请求里出现裸字符串。 */
export function assistantModelInfo(id: string): AssistantModelInfo {
  return (
    ASSISTANT_MODEL_REGISTRY.find((model) => model.id === id) ??
    ASSISTANT_MODEL_REGISTRY[0]
  );
}

export function isAssistantModelId(value: string): value is AssistantModelId {
  return (ASSISTANT_MODEL_IDS as readonly string[]).includes(value);
}

export function assistantModelDisplayName(id: string): string {
  return assistantModelInfo(id).name;
}

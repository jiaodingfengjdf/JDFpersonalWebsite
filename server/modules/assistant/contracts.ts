import { z } from "zod";

export const ASSISTANT_SETTINGS_CONFIG_KEY = "private:assistant_settings";
export const ASSISTANT_SETTINGS_DESCRIPTION = "站长专属 AI 助理配置（含加密密钥，私有禁止公开读取）";

export const ASSISTANT_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;
export const ASSISTANT_EFFORTS = ["", "low", "medium", "high"] as const;
export const ASSISTANT_PERSONAS = ["assistant", "coach", "tutor", "writer"] as const;
export const ASSISTANT_REPLY_STYLES = [
  "default",
  "strict",
  "friendly",
  "blunt",
  "imaginative",
  "efficient",
  "sarcastic",
  "coach",
  "socratic",
  "translationese",
  "xiaohongshu",
] as const;
export const ASSISTANT_TEAM_IDS = [
  "chief",
  "researcher",
  "writer",
  "coder",
  "analyst",
  "coach",
] as const;
export const ASSISTANT_IMAGE_MODELS = [
  "gpt-image-2.6",
  "gpt-image-2.6-flare",
  "gpt-image-2.6-sunburst",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2.5",
  "gpt-image-vip",
  "gpt-image-2-vip",
  "gpt-image-2",
] as const;
export const ASSISTANT_IMAGE_QUALITIES = [
  "auto",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export const ASSISTANT_IMAGE_ASPECTS = [
  "auto",
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1024x1024",
  "1024x1536",
  "1536x1024",
] as const;

export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];
export type AssistantReplyStyle = (typeof ASSISTANT_REPLY_STYLES)[number];
export type AssistantEffort = (typeof ASSISTANT_EFFORTS)[number];
export type AssistantTeamId = (typeof ASSISTANT_TEAM_IDS)[number];

export interface AssistantPublicConfig {
  displayName: string;
  welcomeMessage: string;
  model: string;
  thinking: boolean;
  effort: AssistantEffort;
  webSearch: boolean;
  readUrl: boolean;
  persona: AssistantPersona;
  replyStyle: AssistantReplyStyle;
  mockMode: boolean;
  configured: boolean;
  imageConfigured: boolean;
  updatedAt: string | null;
}

export interface AssistantAdminSettingsView {
  displayName: string;
  welcomeMessage: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  thinking: boolean;
  effort: AssistantEffort;
  webSearch: boolean;
  readUrl: boolean;
  safety: "low" | "high";
  autoTitle: boolean;
  autoMemory: boolean;
  persona: AssistantPersona;
  replyStyle: AssistantReplyStyle;
  addressName: string;
  addressTone: "casual" | "polite";
  team: string[];
  voiceId: "stella" | "tide";
  autoRead: boolean;
  mockMode: boolean;
  imageBaseUrl: string;
  imageModel: string;
  imageQuality: string;
  imageAspect: string;
  apiKeyConfigured: boolean;
  apiKeyMask: string;
  imageApiKeyConfigured: boolean;
  imageApiKeyMask: string;
  updatedAt: string | null;
}

export const DEFAULT_ASSISTANT_ADMIN_SETTINGS: Omit<
  AssistantAdminSettingsView,
  "apiKeyConfigured" | "apiKeyMask" | "imageApiKeyConfigured" | "imageApiKeyMask" | "updatedAt"
> = {
  displayName: "私人 AI 助理",
  welcomeMessage: "有什么可以帮你的？支持深度思考、联网检索与文档解析。",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  maxTokens: 8192,
  systemPrompt: "",
  thinking: true,
  effort: "",
  webSearch: true,
  readUrl: true,
  safety: "high",
  autoTitle: true,
  autoMemory: true,
  persona: "assistant",
  replyStyle: "friendly",
  addressName: "",
  addressTone: "casual",
  team: ["chief", "researcher", "writer"],
  voiceId: "stella",
  autoRead: false,
  mockMode: false,
  imageBaseUrl: "https://grsai.dakka.com.cn",
  imageModel: "gpt-image-2.6",
  imageQuality: "auto",
  imageAspect: "1024x1024",
};

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

const safeHttpUrl = (fallback: string) =>
  z
    .string()
    .trim()
    .max(500, "接口地址最多 500 个字符")
    .default(fallback)
    .refine(isValidHttpUrl, "接口地址必须以 http:// 或 https:// 开头")
    .transform((v) => v || fallback);

export const assistantAdminSettingsInput = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(60, "显示名称最多 60 个字符")
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.displayName)
      .transform((v) => v || DEFAULT_ASSISTANT_ADMIN_SETTINGS.displayName),
    welcomeMessage: z
      .string()
      .trim()
      .max(240, "欢迎语最多 240 个字符")
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.welcomeMessage),
    baseUrl: safeHttpUrl(DEFAULT_ASSISTANT_ADMIN_SETTINGS.baseUrl),
    model: z
      .string()
      .trim()
      .min(1, "模型名称不能为空")
      .max(80, "模型名称最多 80 个字符")
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.model),
    maxTokens: z.coerce
      .number()
      .int()
      .min(256, "最大输出不能小于 256")
      .max(65536, "最大输出不能大于 65536")
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.maxTokens),
    systemPrompt: z
      .string()
      .max(4000, "系统提示词最多 4000 个字符")
      .default(""),
    thinking: z.boolean().default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.thinking),
    effort: z.enum(ASSISTANT_EFFORTS).default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.effort),
    webSearch: z.boolean().default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.webSearch),
    readUrl: z.boolean().default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.readUrl),
    safety: z.enum(["low", "high"]).default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.safety),
    autoTitle: z.boolean().default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.autoTitle),
    autoMemory: z.boolean().default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.autoMemory),
    persona: z.enum(ASSISTANT_PERSONAS).default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.persona),
    replyStyle: z
      .enum(ASSISTANT_REPLY_STYLES)
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.replyStyle),
    addressName: z.string().trim().max(40, "称呼最多 40 个字符").default(""),
    addressTone: z.enum(["casual", "polite"]).default("casual"),
    team: z
      .array(z.enum(ASSISTANT_TEAM_IDS))
      .min(1, "至少保留 1 名智能体成员")
      .max(6)
      .default(["chief", "researcher", "writer"]),
    voiceId: z.enum(["stella", "tide"]).default("stella"),
    autoRead: z.boolean().default(false),
    mockMode: z.boolean().default(false),
    imageBaseUrl: safeHttpUrl(DEFAULT_ASSISTANT_ADMIN_SETTINGS.imageBaseUrl),
    imageModel: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.imageModel),
    imageQuality: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.imageQuality),
    imageAspect: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .default(DEFAULT_ASSISTANT_ADMIN_SETTINGS.imageAspect),
    apiKey: z.string().trim().max(4096, "API Key 过长").optional(),
    clearApiKey: z.boolean().default(false),
    imageApiKey: z.string().trim().max(4096, "生图 API Key 过长").optional(),
    clearImageApiKey: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.clearApiKey && data.apiKey && data.apiKey.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "清除 API Key 时不能同时提交新密钥",
      });
    }
    if (data.clearImageApiKey && data.imageApiKey && data.imageApiKey.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["imageApiKey"],
        message: "清除生图 API Key 时不能同时提交新密钥",
      });
    }
  });

export type AssistantAdminSettingsInput = z.infer<typeof assistantAdminSettingsInput>;

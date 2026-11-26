import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { AppDatabase } from "@/server/db/types";
import { siteConfig } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import { logError } from "@/server/http/logger";
import {
  ASSISTANT_EFFORTS,
  ASSISTANT_PERSONAS,
  ASSISTANT_REPLY_STYLES,
  ASSISTANT_SETTINGS_CONFIG_KEY,
  ASSISTANT_SETTINGS_DESCRIPTION,
  ASSISTANT_TEAM_IDS,
  DEFAULT_ASSISTANT_ADMIN_SETTINGS,
  type AssistantAdminSettingsInput,
  type AssistantAdminSettingsView,
  type AssistantEffort,
  type AssistantPersona,
  type AssistantPublicConfig,
  type AssistantReplyStyle,
} from "./contracts";
import {
  maskAssistantSecret,
  openAssistantSecret,
  sealAssistantSecret,
} from "./secrets";

interface StoredAssistantSettings {
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
  sealedApiKey: string;
  apiKeyMask: string;
  sealedImageApiKey: string;
  imageApiKeyMask: string;
  updatedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(raw: unknown, fallback: string): string {
  return typeof raw === "string" ? raw : fallback;
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function normalizeStored(raw: unknown, fallbackUpdatedAt: string | null): StoredAssistantSettings {
  const d = DEFAULT_ASSISTANT_ADMIN_SETTINGS;
  const obj = asRecord(raw);
  const rawTeam = Array.isArray(obj.team)
    ? obj.team.filter(
        (id): id is string =>
          typeof id === "string" && (ASSISTANT_TEAM_IDS as readonly string[]).includes(id),
      )
    : [];
  const team = rawTeam.length > 0 ? Array.from(new Set(rawTeam)) : [...d.team];
  const maxTokensNum = Number(obj.maxTokens);
  const maxTokens =
    Number.isFinite(maxTokensNum) && maxTokensNum >= 256 && maxTokensNum <= 65536
      ? Math.round(maxTokensNum)
      : d.maxTokens;

  return {
    displayName: str(obj.displayName, d.displayName).trim() || d.displayName,
    welcomeMessage: str(obj.welcomeMessage, d.welcomeMessage),
    baseUrl: str(obj.baseUrl, d.baseUrl).trim() || d.baseUrl,
    model: str(obj.model, d.model).trim() || d.model,
    maxTokens,
    systemPrompt: str(obj.systemPrompt, d.systemPrompt),
    thinking: bool(obj.thinking, d.thinking),
    effort: oneOf(obj.effort, ASSISTANT_EFFORTS, d.effort),
    webSearch: bool(obj.webSearch, d.webSearch),
    readUrl: bool(obj.readUrl, d.readUrl),
    safety: obj.safety === "low" ? "low" : "high",
    autoTitle: bool(obj.autoTitle, d.autoTitle),
    autoMemory: bool(obj.autoMemory, d.autoMemory),
    persona: oneOf(obj.persona, ASSISTANT_PERSONAS, d.persona),
    replyStyle: oneOf(obj.replyStyle, ASSISTANT_REPLY_STYLES, d.replyStyle),
    addressName: str(obj.addressName, d.addressName),
    addressTone: obj.addressTone === "polite" ? "polite" : "casual",
    team,
    voiceId: obj.voiceId === "tide" ? "tide" : "stella",
    autoRead: bool(obj.autoRead, d.autoRead),
    mockMode: bool(obj.mockMode, d.mockMode),
    imageBaseUrl: str(obj.imageBaseUrl, d.imageBaseUrl).trim() || d.imageBaseUrl,
    imageModel: str(obj.imageModel, d.imageModel).trim() || d.imageModel,
    imageQuality: str(obj.imageQuality, d.imageQuality).trim() || d.imageQuality,
    imageAspect: str(obj.imageAspect, d.imageAspect).trim() || d.imageAspect,
    sealedApiKey: str(obj.sealedApiKey, ""),
    apiKeyMask: str(obj.apiKeyMask, ""),
    sealedImageApiKey: str(obj.sealedImageApiKey, ""),
    imageApiKeyMask: str(obj.imageApiKeyMask, ""),
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : fallbackUpdatedAt,
  };
}

function toAdminView(stored: StoredAssistantSettings): AssistantAdminSettingsView {
  const apiKeyConfigured = stored.sealedApiKey.length > 0;
  const imageApiKeyConfigured = stored.sealedImageApiKey.length > 0;
  const apiKeyMask =
    stored.apiKeyMask || (apiKeyConfigured ? maskAssistantSecret(openAssistantSecret(stored.sealedApiKey)) : "");
  const imageApiKeyMask =
    stored.imageApiKeyMask ||
    (imageApiKeyConfigured ? maskAssistantSecret(openAssistantSecret(stored.sealedImageApiKey)) : "");

  return {
    displayName: stored.displayName,
    welcomeMessage: stored.welcomeMessage,
    baseUrl: stored.baseUrl,
    model: stored.model,
    maxTokens: stored.maxTokens,
    systemPrompt: stored.systemPrompt,
    thinking: stored.thinking,
    effort: stored.effort,
    webSearch: stored.webSearch,
    readUrl: stored.readUrl,
    safety: stored.safety,
    autoTitle: stored.autoTitle,
    autoMemory: stored.autoMemory,
    persona: stored.persona,
    replyStyle: stored.replyStyle,
    addressName: stored.addressName,
    addressTone: stored.addressTone,
    team: [...stored.team],
    voiceId: stored.voiceId,
    autoRead: stored.autoRead,
    mockMode: stored.mockMode,
    imageBaseUrl: stored.imageBaseUrl,
    imageModel: stored.imageModel,
    imageQuality: stored.imageQuality,
    imageAspect: stored.imageAspect,
    apiKeyConfigured,
    apiKeyMask,
    imageApiKeyConfigured,
    imageApiKeyMask,
    updatedAt: stored.updatedAt,
  };
}

function toPublicConfig(stored: StoredAssistantSettings): AssistantPublicConfig {
  return {
    displayName: stored.displayName,
    welcomeMessage: stored.welcomeMessage,
    model: stored.model,
    thinking: stored.thinking,
    effort: stored.effort,
    webSearch: stored.webSearch,
    readUrl: stored.readUrl,
    persona: stored.persona,
    replyStyle: stored.replyStyle,
    mockMode: stored.mockMode,
    configured: stored.sealedApiKey.length > 0 || stored.mockMode,
    imageConfigured: stored.sealedImageApiKey.length > 0,
    updatedAt: stored.updatedAt,
  };
}

async function readStoredRow(db: AppDatabase): Promise<StoredAssistantSettings> {
  const [row] = await db
    .select({
      value: siteConfig.value,
      updatedAt: siteConfig.updatedAt,
    })
    .from(siteConfig)
    .where(eq(siteConfig.key, ASSISTANT_SETTINGS_CONFIG_KEY))
    .limit(1);

  if (!row || !row.value) {
    return normalizeStored(undefined, null);
  }
  try {
    return normalizeStored(JSON.parse(row.value), row.updatedAt?.toISOString() ?? null);
  } catch {
    return normalizeStored(undefined, row.updatedAt?.toISOString() ?? null);
  }
}

export interface AssistantRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  imageBaseUrl: string;
  imageApiKey: string;
  model: string;
  systemPrompt: string;
  mockMode: boolean;
}

/**
 * 仅限服务端代理路由调用：从数据库解密读取站长已保存的 API Key 与端点，
 * 绝不向浏览器暴露明文密钥。
 */
export async function loadAssistantRuntimeConfig(
  db: AppDatabase = getDb(),
): Promise<AssistantRuntimeConfig> {
  const stored = await readStoredRow(db);
  return {
    baseUrl: stored.baseUrl,
    apiKey: stored.sealedApiKey ? openAssistantSecret(stored.sealedApiKey).trim() : "",
    imageBaseUrl: stored.imageBaseUrl,
    imageApiKey: stored.sealedImageApiKey
      ? openAssistantSecret(stored.sealedImageApiKey).trim()
      : "",
    model: stored.model,
    systemPrompt: stored.systemPrompt,
    mockMode: stored.mockMode,
  };
}

export async function loadAssistantAdminSettings(
  db: AppDatabase = getDb(),
): Promise<AssistantAdminSettingsView> {
  const stored = await readStoredRow(db);
  return toAdminView(stored);
}

/**
 * 公开安全元数据：严禁包含 API Key、内部端点或系统提示词。
 * 异常时回落到默认值，保证 `/assistant` 首屏渲染稳健。
 */
export async function loadAssistantPublicConfig(
  db: AppDatabase = getDb(),
): Promise<AssistantPublicConfig> {
  try {
    const stored = await readStoredRow(db);
    return toPublicConfig(stored);
  } catch (error) {
    logError("Failed to load assistant public config, falling back to defaults", error);
    return toPublicConfig(normalizeStored(undefined, null));
  }
}

export async function saveAssistantAdminSettings(
  input: AssistantAdminSettingsInput,
  db: AppDatabase = getDb(),
): Promise<AssistantAdminSettingsView> {
  const current = await readStoredRow(db);
  const now = new Date();
  const updatedAtIso = now.toISOString();

  let sealedApiKey = current.sealedApiKey;
  let apiKeyMask = current.apiKeyMask;
  if (input.clearApiKey) {
    sealedApiKey = "";
    apiKeyMask = "";
  } else if (input.apiKey && input.apiKey.length > 0) {
    sealedApiKey = sealAssistantSecret(input.apiKey);
    apiKeyMask = maskAssistantSecret(input.apiKey);
  }

  let sealedImageApiKey = current.sealedImageApiKey;
  let imageApiKeyMask = current.imageApiKeyMask;
  if (input.clearImageApiKey) {
    sealedImageApiKey = "";
    imageApiKeyMask = "";
  } else if (input.imageApiKey && input.imageApiKey.length > 0) {
    sealedImageApiKey = sealAssistantSecret(input.imageApiKey);
    imageApiKeyMask = maskAssistantSecret(input.imageApiKey);
  }

  const next: StoredAssistantSettings = {
    displayName: input.displayName,
    welcomeMessage: input.welcomeMessage,
    baseUrl: input.baseUrl,
    model: input.model,
    maxTokens: input.maxTokens,
    systemPrompt: input.systemPrompt,
    thinking: input.thinking,
    effort: input.effort,
    webSearch: input.webSearch,
    readUrl: input.readUrl,
    safety: input.safety,
    autoTitle: input.autoTitle,
    autoMemory: input.autoMemory,
    persona: input.persona,
    replyStyle: input.replyStyle,
    addressName: input.addressName,
    addressTone: input.addressTone,
    team: Array.from(new Set(input.team)),
    voiceId: input.voiceId,
    autoRead: input.autoRead,
    mockMode: input.mockMode,
    imageBaseUrl: input.imageBaseUrl,
    imageModel: input.imageModel,
    imageQuality: input.imageQuality,
    imageAspect: input.imageAspect,
    sealedApiKey,
    apiKeyMask,
    sealedImageApiKey,
    imageApiKeyMask,
    updatedAt: updatedAtIso,
  };

  const serialized = JSON.stringify(next);
  const [saved] = await db
    .insert(siteConfig)
    .values({
      key: ASSISTANT_SETTINGS_CONFIG_KEY,
      value: serialized,
      description: ASSISTANT_SETTINGS_DESCRIPTION,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: siteConfig.key,
      set: {
        value: serialized,
        description: ASSISTANT_SETTINGS_DESCRIPTION,
        updatedAt: now,
      },
    })
    .returning({ id: siteConfig.id });

  if (!saved) {
    throw errors.internal("保存 AI 助理配置失败");
  }
  return toAdminView(next);
}

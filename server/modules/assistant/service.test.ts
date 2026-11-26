import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/server/db/migrate";
import { openDatabase, type DatabaseConnection } from "@/server/db/open";
import * as schema from "@/server/db/schema";
import { createSiteConfigService } from "@/server/modules/site-config/service";
import {
  ASSISTANT_SETTINGS_CONFIG_KEY,
  assistantAdminSettingsInput,
  loadAssistantAdminSettings,
  loadAssistantPublicConfig,
  saveAssistantAdminSettings,
} from "./index";

let directory: string;
let connection: DatabaseConnection;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kirameku-assistant-"));
  connection = openDatabase(path.join(directory, "test.db"));
  runMigrations(connection);
  db = drizzle(connection, { schema });
});

afterEach(() => {
  connection?.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("assistant settings service", () => {
  it("returns safe defaults when no settings row exists", async () => {
    const adminView = await loadAssistantAdminSettings(db);
    const publicConfig = await loadAssistantPublicConfig(db);

    expect(adminView).toMatchObject({
      displayName: "私人 AI 助理",
      model: "deepseek-flash",
      apiKeyConfigured: false,
      apiKeyMask: "",
      imageApiKeyConfigured: false,
      imageApiKeyMask: "",
      updatedAt: null,
    });
    expect(publicConfig).toMatchObject({
      displayName: "私人 AI 助理",
      model: "deepseek-flash",
      configured: false,
      imageConfigured: false,
      updatedAt: null,
    });
    expect(publicConfig).not.toHaveProperty("apiKey");
    expect(publicConfig).not.toHaveProperty("baseUrl");
    expect(publicConfig).not.toHaveProperty("systemPrompt");
  });

  it("saves admin settings, masks secrets, preserves keys on blank updates, and clears on request", async () => {
    const first = await saveAssistantAdminSettings(
      assistantAdminSettingsInput.parse({
        displayName: "站长的私人助理",
        welcomeMessage: "欢迎体验站内 AI 助理",
        model: "deepseek-v4-pro",
        systemPrompt: "内部系统提示词，绝不能公开",
        apiKey: "sk-deepseek-secret-9876",
        imageApiKey: "img-secret-key-4321",
        thinking: true,
        webSearch: false,
      }),
      db,
    );

    expect(first).toMatchObject({
      displayName: "站长的私人助理",
      welcomeMessage: "欢迎体验站内 AI 助理",
      model: "deepseek-v4-pro",
      systemPrompt: "内部系统提示词，绝不能公开",
      apiKeyConfigured: true,
      apiKeyMask: "sk-••••9876",
      imageApiKeyConfigured: true,
      imageApiKeyMask: "img••••4321",
      webSearch: false,
    });
    expect(first).not.toHaveProperty("apiKey");
    expect(first).not.toHaveProperty("imageApiKey");

    // 留空保存不应覆盖已存密钥
    const second = await saveAssistantAdminSettings(
      assistantAdminSettingsInput.parse({
        displayName: "站长的私人助理 v2",
        model: "deepseek-flash",
      }),
      db,
    );
    expect(second.apiKeyConfigured).toBe(true);
    expect(second.apiKeyMask).toBe("sk-••••9876");
    expect(second.imageApiKeyConfigured).toBe(true);

    // 公开元数据绝不泄露密钥、端点或系统提示词
    const publicConfig = await loadAssistantPublicConfig(db);
    expect(publicConfig).toEqual({
      displayName: "站长的私人助理 v2",
      welcomeMessage: "有什么可以帮你的？支持深度思考、联网检索与文档解析。",
      model: "deepseek-flash",
      thinking: true,
      effort: "",
      webSearch: true,
      readUrl: true,
      persona: "assistant",
      replyStyle: "friendly",
      mockMode: false,
      configured: true,
      imageConfigured: true,
      updatedAt: second.updatedAt,
    });

    // site_config 的 getPublic() 必须隐藏 private: 键
    const publicSiteConfig = await createSiteConfigService(db).getPublic();
    expect(publicSiteConfig).not.toHaveProperty(ASSISTANT_SETTINGS_CONFIG_KEY);

    // 清除密钥后状态归零
    const cleared = await saveAssistantAdminSettings(
      assistantAdminSettingsInput.parse({
        clearApiKey: true,
        clearImageApiKey: true,
      }),
      db,
    );
    expect(cleared.apiKeyConfigured).toBe(false);
    expect(cleared.apiKeyMask).toBe("");
    expect(cleared.imageApiKeyConfigured).toBe(false);
    expect(cleared.imageApiKeyMask).toBe("");

    const publicAfterClear = await loadAssistantPublicConfig(db);
    expect(publicAfterClear.configured).toBe(false);
    expect(publicAfterClear.imageConfigured).toBe(false);
  });
});

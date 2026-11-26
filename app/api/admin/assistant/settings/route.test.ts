import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type DatabaseConnection } from "@/server/db/open";
import { runMigrations } from "@/server/db/migrate";
import { ADMIN_COOKIE, signAdminToken, signGithubToken } from "@/server/auth/session";
import { GITHUB_TOKEN_COOKIE } from "@/server/auth/constants";
import { ASSISTANT_SETTINGS_CONFIG_KEY } from "@/server/modules/assistant";
import { GET as getAdminSettings, PUT as putAdminSettings } from "./route";
import { GET as getPublicConfig } from "@/app/api/assistant/config/route";
import { GET as getPublicSiteConfig } from "@/app/api/site-config/route";

const envState = vi.hoisted(() => {
  const previousDb = process.env.DATABASE_PATH;
  const previousAuth = process.env.AUTH_SECRET;
  const directory = `${process.env.TMPDIR ?? "/tmp"}/kirameku-assistant-route-${process.pid}-${Date.now()}`;
  process.env.DATABASE_PATH = `${directory}/test.db`;
  process.env.AUTH_SECRET = "test-secret-for-assistant-settings-encryption-1234567890";
  return { previousDb, previousAuth, directory };
});

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

let connection: DatabaseConnection;
let adminId: number;
let githubUserId: number;

function getRequest(pathname: string): Request {
  return new Request(`http://localhost:3000${pathname}`);
}

function putRequest(pathname: string, body: unknown, origin = "http://localhost:3000"): Request {
  return new Request(`http://localhost:3000${pathname}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

async function asAdmin(): Promise<void> {
  cookieStore.set(ADMIN_COOKIE, await signAdminToken(adminId));
}

beforeAll(() => {
  fs.mkdirSync(envState.directory, { recursive: true });
  connection = openDatabase(path.join(envState.directory, "test.db"));
  runMigrations(connection);

  adminId = Number(
    connection
      .prepare('INSERT INTO "user" (username, hashed_password, is_admin) VALUES (?, ?, 1)')
      .run("admin", "unused-hash").lastInsertRowid,
  );
  githubUserId = Number(
    connection
      .prepare('INSERT INTO github_user (github_id, login, avatar, bio) VALUES (?, ?, ?, ?)')
      .run(54321, "visitor-gh", "", "").lastInsertRowid,
  );
});

afterAll(async () => {
  connection?.close();
  try {
    const { getSqlite } = await import("@/server/db/client");
    getSqlite().close();
  } catch {
    // ignore if never opened
  }
  fs.rmSync(envState.directory, { recursive: true, force: true });

  if (envState.previousDb === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = envState.previousDb;
  if (envState.previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = envState.previousAuth;
});

beforeEach(() => {
  cookieStore.clear();
});

describe("/api/admin/assistant/settings authorization & security", () => {
  it("rejects anonymous GET and PUT with 401", async () => {
    const getRes = await getAdminSettings(getRequest("/api/admin/assistant/settings"));
    const putRes = await putAdminSettings(
      putRequest("/api/admin/assistant/settings", { displayName: "Hacked" }),
    );

    expect(getRes.status).toBe(401);
    expect(putRes.status).toBe(401);
  });

  it("rejects GitHub visitor session with 401", async () => {
    cookieStore.set(
      GITHUB_TOKEN_COOKIE,
      await signGithubToken(githubUserId, "visitor-gh"),
    );

    const getRes = await getAdminSettings(getRequest("/api/admin/assistant/settings"));
    const putRes = await putAdminSettings(
      putRequest("/api/admin/assistant/settings", { displayName: "Hacked" }),
    );

    expect(getRes.status).toBe(401);
    expect(putRes.status).toBe(401);
  });

  it("rejects cross-origin PUT even for authenticated admin with 403", async () => {
    await asAdmin();
    const hostile = putRequest(
      "/api/admin/assistant/settings",
      { displayName: "CrossOrigin" },
      "https://evil.example",
    );

    const res = await putAdminSettings(hostile);
    expect(res.status).toBe(403);
  });

  it("allows authenticated same-origin admin to read/write and keeps secrets out of public endpoints", async () => {
    await asAdmin();

    const initialGet = await getAdminSettings(getRequest("/api/admin/assistant/settings"));
    expect(initialGet.status).toBe(200);
    const initialBody = await initialGet.json();
    expect(initialBody).toMatchObject({
      displayName: "私人 AI 助理",
      apiKeyConfigured: false,
    });
    expect(initialBody).not.toHaveProperty("apiKey");

    const updateRes = await putAdminSettings(
      putRequest("/api/admin/assistant/settings", {
        displayName: "JDF 专属 AI 助理",
        welcomeMessage: "你好，我是站长配置的 AI 助理。",
        model: "deepseek-v4-pro",
        systemPrompt: "只限站长可见的机密指令",
        apiKey: "sk-live-secret-token-8888",
        thinking: true,
        webSearch: true,
      }),
    );
    expect(updateRes.status).toBe(200);
    const savedBody = await updateRes.json();
    expect(savedBody).toMatchObject({
      displayName: "JDF 专属 AI 助理",
      welcomeMessage: "你好，我是站长配置的 AI 助理。",
      model: "deepseek-v4-pro",
      systemPrompt: "只限站长可见的机密指令",
      apiKeyConfigured: true,
      apiKeyMask: "sk-••••8888",
    });
    expect(savedBody).not.toHaveProperty("apiKey");
    expect(JSON.stringify(savedBody)).not.toContain("sk-live-secret-token-8888");

    // 切回未登录访客态，验证公开元数据接口安全
    cookieStore.clear();
    const publicRes = await getPublicConfig(getRequest("/api/assistant/config"));
    expect(publicRes.status).toBe(200);
    const publicBody = await publicRes.json();
    expect(publicBody).toMatchObject({
      displayName: "JDF 专属 AI 助理",
      welcomeMessage: "你好，我是站长配置的 AI 助理。",
      model: "deepseek-v4-pro",
      configured: true,
      imageConfigured: false,
    });
    expect(publicBody).not.toHaveProperty("apiKey");
    expect(publicBody).not.toHaveProperty("apiKeyMask");
    expect(publicBody).not.toHaveProperty("imageApiKey");
    expect(publicBody).not.toHaveProperty("systemPrompt");
    expect(publicBody).not.toHaveProperty("baseUrl");
    expect(publicBody).not.toHaveProperty("imageBaseUrl");
    expect(JSON.stringify(publicBody)).not.toContain("sk-live-secret-token-8888");
    expect(JSON.stringify(publicBody)).not.toContain("只限站长可见的机密指令");

    // 验证 /api/site-config 绝不泄露 private:assistant_settings
    const siteConfigRes = await getPublicSiteConfig(getRequest("/api/site-config"));
    expect(siteConfigRes.status).toBe(200);
    const siteConfigBody = await siteConfigRes.json();
    expect(siteConfigBody).not.toHaveProperty(ASSISTANT_SETTINGS_CONFIG_KEY);
    expect(JSON.stringify(siteConfigBody)).not.toContain("sk-live-secret-token-8888");
  });

  it("rejects invalid baseUrl or conflicting clearApiKey payload with 422", async () => {
    await asAdmin();

    const badUrl = await putAdminSettings(
      putRequest("/api/admin/assistant/settings", {
        baseUrl: "javascript:alert(1)",
      }),
    );
    expect(badUrl.status).toBe(422);

    const conflictClear = await putAdminSettings(
      putRequest("/api/admin/assistant/settings", {
        apiKey: "sk-new-key",
        clearApiKey: true,
      }),
    );
    expect(conflictClear.status).toBe(422);
  });
});

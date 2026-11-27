import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockLoadRuntime = vi.fn();
const mockGetAdminSession = vi.fn();

vi.mock("@/server/modules/assistant", () => ({
  loadAssistantRuntimeConfig: (...args: unknown[]) => mockLoadRuntime(...args),
}));

vi.mock("@/server/auth/guard", () => ({
  getAdminSession: (...args: unknown[]) => mockGetAdminSession(...args),
}));

import { POST } from "./route";

describe("POST /api/assistant/proxy/[...path]", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockLoadRuntime.mockReset();
    mockGetAdminSession.mockReset();
    mockGetAdminSession.mockResolvedValue({ id: 1, username: "admin" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects cross-origin or missing-origin requests with 403", async () => {
    const crossReq = new NextRequest("http://localhost:3000/api/assistant/proxy/messages", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-flash", messages: [] }),
    });
    const crossRes = await POST(crossReq, { params: Promise.resolve({ path: ["messages"] }) });
    expect(crossRes.status).toBe(403);

    const noOriginReq = new NextRequest("http://localhost:3000/api/assistant/proxy/messages", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-flash", messages: [] }),
    });
    const noOriginRes = await POST(noOriginReq, { params: Promise.resolve({ path: ["messages"] }) });
    expect(noOriginRes.status).toBe(403);
  });

  it("rejects anonymous non-admin callers with 401", async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/assistant/proxy/messages", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-flash", messages: [] }),
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["messages"] }) });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error?.code).toBe("unauthorized");
  });

  it("returns 400 when DeepSeek API key is not configured on server", async () => {
    mockLoadRuntime.mockResolvedValue({
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      imageBaseUrl: "https://grsai.dakka.com.cn",
      imageApiKey: "",
      model: "deepseek-flash",
      systemPrompt: "",
      mockMode: false,
    });

    const req = new NextRequest("http://localhost:3000/api/assistant/proxy/messages", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-flash", messages: [] }),
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["messages"] }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error?.code).toBe("no_api_key");
  });

  it("forwards messages with server-decrypted x-api-key for authenticated admin", async () => {
    mockLoadRuntime.mockResolvedValue({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-secret-deepseek-9999",
      imageBaseUrl: "https://grsai.dakka.com.cn",
      imageApiKey: "sk-secret-image-8888",
      model: "deepseek-flash",
      systemPrompt: "",
      mockMode: false,
    });

    const upstreamSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_1", content: [{ type: "text", text: "ok" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = upstreamSpy as unknown as typeof fetch;

    const req = new NextRequest("http://localhost:3000/api/assistant/proxy/messages", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-flash", messages: [], stream: false }),
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["messages"] }) });
    expect(res.status).toBe(200);
    expect(upstreamSpy).toHaveBeenCalledTimes(1);

    const [url, init] = upstreamSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/anthropic/v1/messages");
    const hdrs = new Headers(init.headers);
    expect(hdrs.get("x-api-key")).toBe("sk-secret-deepseek-9999");

    const bodyText = await res.text();
    expect(bodyText).not.toContain("sk-secret-deepseek-9999");
  });

  it("forwards image generation with server-decrypted imageApiKey", async () => {
    mockLoadRuntime.mockResolvedValue({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-secret-deepseek-9999",
      imageBaseUrl: "https://grsai.dakka.com.cn",
      imageApiKey: "sk-secret-image-8888",
      model: "deepseek-flash",
      systemPrompt: "",
      mockMode: false,
    });

    const upstreamSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "img_1", status: "succeeded", results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = upstreamSpy as unknown as typeof fetch;

    const req = new NextRequest("http://localhost:3000/api/assistant/proxy/image", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-image-2.6", prompt: "a blue sky" }),
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["image"] }) });
    expect(res.status).toBe(200);
    const [url, init] = upstreamSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://grsai.dakka.com.cn/v1/api/generate");
    const hdrs = new Headers(init.headers);
    expect(hdrs.get("authorization")).toBe("Bearer sk-secret-image-8888");
  });

  it("forwards PDF file uploads to DeepSeek /files with the server key", async () => {
    mockLoadRuntime.mockResolvedValue({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test-server-key",
      imageBaseUrl: "https://grsai.dakka.com.cn",
      imageApiKey: "sk-secret-image-8888",
      model: "deepseek-flash",
      systemPrompt: "",
      mockMode: false,
    });

    const upstreamSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "file_abc", filename: "bill.pdf", bytes: 1234, purpose: "rich_layout_recognition" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = upstreamSpy as unknown as typeof fetch;

    const form = new FormData();
    form.append("purpose", "rich_layout_recognition");
    form.append("file", new Blob(["%PDF-bill"], { type: "application/pdf" }), "bill.pdf");
    const req = new NextRequest("http://localhost:3000/api/assistant/proxy/files", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
      body: form,
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["files"] }) });
    expect(res.status).toBe(200);
    expect(upstreamSpy).toHaveBeenCalledTimes(1);
    const [url, init] = upstreamSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/files");
    const hdrs = new Headers(init.headers);
    expect(hdrs.get("authorization")).toBe("Bearer sk-test-server-key");
    const data = (await res.json()) as { id?: string };
    expect(data.id).toBe("file_abc");
  });

  it("rejects anonymous file uploads with 401", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const form = new FormData();
    form.append("purpose", "rich_layout_recognition");
    form.append("file", new Blob(["%PDF-bill"], { type: "application/pdf" }), "bill.pdf");
    const req = new NextRequest("http://localhost:3000/api/assistant/proxy/files", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
      body: form,
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["files"] }) });
    expect(res.status).toBe(401);
  });
});

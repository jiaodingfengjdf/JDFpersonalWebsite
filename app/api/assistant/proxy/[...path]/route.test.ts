import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockLoadRuntime = vi.fn();

vi.mock("@/server/modules/assistant", () => ({
  loadAssistantRuntimeConfig: (...args: unknown[]) => mockLoadRuntime(...args),
}));

import { POST } from "./route";

describe("POST /api/assistant/proxy/[...path]", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockLoadRuntime.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects cross-origin requests with 403", async () => {
    const req = new NextRequest("http://localhost:3000/api/assistant/proxy/messages", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-flash", messages: [] }),
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["messages"] }) });
    expect(res.status).toBe(403);
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

  it("forwards messages with server-decrypted x-api-key without leaking key", async () => {
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
});

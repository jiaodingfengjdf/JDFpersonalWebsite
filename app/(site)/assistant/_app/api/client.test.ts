import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createMessage, streamMessage } from "./client";
import type { ApiMessage } from "./types";

const MESSAGES: ApiMessage[] = [{ role: "user", content: "你好" }];

function sseResponse(): Response {
  const frames = [
    `data: ${JSON.stringify({
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "deepseek-flash",
        content: [{ type: "text", text: "" }],
        stop_reason: null,
        stop_sequence: null,
      },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "你好" },
    })}\n\n`,
    `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
    `data: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { input_tokens: 10, output_tokens: 5 },
    })}\n\n`,
    `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function streamArgs(model = "deepseek-v4-pro") {
  return {
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com",
    body: { model },
    messages: MESSAGES,
  };
}

describe("streamMessage 稳健性", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("429 后重试一次成功", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429, "rate limited"))
      .mockResolvedValueOnce(sseResponse());

    const result = await streamMessage(streamArgs());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ type: "text", text: "你好" });
  });

  it("429 两次后抛错，不再重试", async () => {
    mockFetch.mockResolvedValue(errorResponse(429, "rate limited"));

    await expect(streamMessage(streamArgs())).rejects.toMatchObject({
      code: "rate_limited",
    } satisfies Partial<ApiError>);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("模型不存在时回落到 deepseek-flash 并提示", async () => {
    mockFetch.mockImplementationOnce(async () =>
      errorResponse(404, "Model deepseek-v4-pro not found"),
    );
    mockFetch.mockImplementationOnce(async () => sseResponse());

    const result = await streamMessage(streamArgs("deepseek-v4-pro"));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(mockFetch.mock.calls[1][1].body)) as {
      model: string;
    };
    expect(secondBody.model).toBe("deepseek-flash");
    expect(result.fallbackNotice).toContain("deepseek-v4-pro");
    expect(result.blocks[0]).toMatchObject({ type: "text", text: "你好" });
  });

  it("400 内容审核不回落、只请求一次", async () => {
    mockFetch.mockResolvedValue(errorResponse(400, "Content Exists Risk"));

    await expect(streamMessage(streamArgs())).rejects.toMatchObject({
      code: "content_risk",
    } satisfies Partial<ApiError>);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("超时后抛 client_timeout", async () => {
    mockFetch.mockImplementation(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    await expect(
      streamMessage({ ...streamArgs(), timeoutMs: 50 }),
    ).rejects.toMatchObject({ code: "client_timeout" } satisfies Partial<ApiError>);
  });
});

describe("createMessage 稳健性", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("503 后重试一次成功", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(503, "busy"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const result = await createMessage({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      body: { model: "deepseek-v4-pro" },
      messages: MESSAGES,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("ok");
  });
});

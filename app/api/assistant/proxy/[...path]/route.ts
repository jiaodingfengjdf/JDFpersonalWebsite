import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/server/http/origin";
import { loadAssistantRuntimeConfig } from "@/server/modules/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store" };

function normalizeApiRoot(baseUrl: string, fallback: string): string {
  let root = (baseUrl || "").trim();
  if (!root) return fallback;
  if (!/^https?:\/\//i.test(root)) root = `https://${root}`;
  for (let i = 0; i < 8; i += 1) {
    const before = root;
    root = root.replace(/\/+$/, "");
    if (/\/v1$/i.test(root)) {
      root = root.slice(0, -3);
      continue;
    }
    if (/\/anthropic$/i.test(root)) {
      root = root.slice(0, -"/anthropic".length);
      continue;
    }
    root = root.replace(/\/+$/, "");
    if (root === before) break;
  }
  return root || fallback;
}

function jsonError(status: number, message: string, code: string) {
  return NextResponse.json(
    { error: { message, code } },
    { status, headers: NO_STORE },
  );
}

function buildPassthroughResponse(upstream: Response): Response {
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "private, no-store");
  if (contentType?.includes("text/event-stream")) {
    headers.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function handleProxy(
  request: Request,
  segments: string[],
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      assertSameOrigin(request);
    } catch {
      return jsonError(403, "跨站请求被拒绝", "forbidden");
    }
  }

  const action = segments[0] ?? "";
  const rest = segments.slice(1);
  const runtime = await loadAssistantRuntimeConfig();

  const deepseekRoot = normalizeApiRoot(
    runtime.baseUrl,
    "https://api.deepseek.com",
  );
  const imageRoot = (runtime.imageBaseUrl || "https://grsai.dakka.com.cn")
    .trim()
    .replace(/\/+$/, "");

  const incomingUrl = new URL(request.url);
  let targetUrl = "";
  const upstreamHeaders = new Headers();
  let upstreamBody: BodyInit | undefined;

  if (action === "messages" && request.method === "POST") {
    if (!runtime.apiKey) {
      return jsonError(400, "站长尚未在设置中配置 DeepSeek API Key", "no_api_key");
    }
    targetUrl = `${deepseekRoot}/anthropic/v1/messages`;
    upstreamHeaders.set("content-type", "application/json");
    upstreamHeaders.set("x-api-key", runtime.apiKey);
    upstreamHeaders.set("anthropic-version", "2023-06-01");
    upstreamHeaders.set("anthropic-beta", "files-api-2025-04-14");
    upstreamBody = await request.text();
  } else if (action === "tts" && request.method === "POST") {
    if (!runtime.apiKey) {
      return jsonError(400, "站长尚未在设置中配置 DeepSeek API Key", "no_api_key");
    }
    targetUrl = `${deepseekRoot}/v1/tools/tts`;
    upstreamHeaders.set("authorization", `Bearer ${runtime.apiKey}`);
    upstreamHeaders.set("content-type", "application/json");
    upstreamHeaders.set("accept", "audio/*, application/json");
    upstreamBody = await request.text();
  } else if (action === "asr" && request.method === "POST") {
    if (!runtime.apiKey) {
      return jsonError(400, "站长尚未在设置中配置 DeepSeek API Key", "no_api_key");
    }
    targetUrl = `${deepseekRoot}/v1/tools/asr`;
    upstreamHeaders.set("authorization", `Bearer ${runtime.apiKey}`);
    upstreamHeaders.set("accept", "application/json");
    const contentType = request.headers.get("content-type");
    if (contentType) upstreamHeaders.set("content-type", contentType);
    upstreamBody = await request.arrayBuffer();
  } else if (action === "search" && request.method === "POST") {
    if (!runtime.apiKey) {
      return jsonError(400, "站长尚未在设置中配置 DeepSeek API Key", "no_api_key");
    }
    targetUrl = `${deepseekRoot}/v1/tools/search`;
    upstreamHeaders.set("authorization", `Bearer ${runtime.apiKey}`);
    upstreamHeaders.set("content-type", "application/json");
    upstreamBody = await request.text();
  } else if (action === "fetch" && request.method === "POST") {
    if (!runtime.apiKey) {
      return jsonError(400, "站长尚未在设置中配置 DeepSeek API Key", "no_api_key");
    }
    targetUrl = `${deepseekRoot}/v1/tools/fetch`;
    upstreamHeaders.set("authorization", `Bearer ${runtime.apiKey}`);
    upstreamHeaders.set("content-type", "application/json");
    upstreamBody = await request.text();
  } else if (action === "files") {
    if (!runtime.apiKey) {
      return jsonError(400, "站长尚未在设置中配置 DeepSeek API Key", "no_api_key");
    }
    upstreamHeaders.set("authorization", `Bearer ${runtime.apiKey}`);
    upstreamHeaders.set("accept", "application/json");
    if (request.method === "POST" && rest.length === 0) {
      targetUrl = `${deepseekRoot}/files`;
      const contentType = request.headers.get("content-type");
      if (contentType) upstreamHeaders.set("content-type", contentType);
      upstreamBody = await request.arrayBuffer();
    } else if (request.method === "GET" && rest.length === 0) {
      targetUrl = `${deepseekRoot}/files${incomingUrl.search}`;
    } else if (request.method === "DELETE" && rest.length === 1 && rest[0]) {
      targetUrl = `${deepseekRoot}/files/${encodeURIComponent(rest[0])}`;
    } else {
      return jsonError(404, "不支持的文件操作", "not_found");
    }
  } else if (action === "image" && request.method === "POST") {
    if (!runtime.imageApiKey) {
      return jsonError(400, "站长尚未在设置中配置生图 API Key", "no_image_api_key");
    }
    targetUrl = `${imageRoot}/v1/api/generate`;
    upstreamHeaders.set("authorization", `Bearer ${runtime.imageApiKey}`);
    upstreamHeaders.set("content-type", "application/json");
    upstreamBody = await request.text();
  } else {
    return jsonError(404, "未知的助理代理端点", "not_found");
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: upstreamBody,
      signal: request.signal,
    });
    return buildPassthroughResponse(upstream);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError(499, "请求已取消", "aborted");
    }
    return jsonError(
      502,
      `上游服务连接失败：${error instanceof Error ? error.message : "网络异常"}`,
      "upstream_network_error",
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return handleProxy(request, path);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return handleProxy(request, path);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return handleProxy(request, path);
}

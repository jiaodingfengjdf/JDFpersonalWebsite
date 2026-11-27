import { afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import { executeTool} from "./tools";
import type { ToolContext} from "./types";
import { clearDraftsForTest} from "./drafts";

const NOW = Date.parse("2026-11-27T12:00:00+08:00");

const ACCOUNTS = [
{ id: 1, name: "现金", kind: "cash"},
{ id: 2, name: "微信", kind: "wechat"},
];
const CATEGORIES = [
{ id: 5, name: "餐饮", kind: "expense"},
{ id: 6, name: "工资", kind: "income"},
];

function jsonResponse(body: unknown, status = 200): Response {
return new Response(JSON.stringify(body), {
status,
headers: { "content-type": "application/json"},
});
}

function errorResponse(message: string, status: number): Response {
return new Response(JSON.stringify({ error: { message}}), {
status,
headers: { "content-type": "application/json"},
});
}

const ctx = {
now: () => NOW,
} as unknown as ToolContext;

describe("confirmed write tools", () => {
const originalFetch = globalThis.fetch;
const posted: Array<{ url: string; body: unknown}> = [];

beforeEach(() => {
clearDraftsForTest();
posted.length = 0;
globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
const url = String(input);
if (url.startsWith("/api/admin/ledger/accounts")) return jsonResponse(ACCOUNTS);
if (url.startsWith("/api/admin/ledger/categories")) return jsonResponse(CATEGORIES);
if (url.startsWith("/api/admin/ledger/transactions?")) return jsonResponse({ items: [], total: 0});
if (url === "/api/admin/ledger/transactions" && init?.method === "POST") {
const body = JSON.parse(String(init.body));
posted.push({ url, body});
if (body.external_id === "bill:重复:20261127:10") {
return errorResponse("该编号的流水已存在，可能是重复入账", 409);
}
return jsonResponse({ id: 12,...body});
}
if (url === "/api/admin/chatters" && init?.method === "POST") {
const body = JSON.parse(String(init.body));
posted.push({ url, body});
return jsonResponse({ id: 3,...body});
}
if (url === "/api/admin/collection" && init?.method === "POST") {
const body = JSON.parse(String(init.body));
posted.push({ url, body});
return jsonResponse({ id: 5,...body});
}
if (url === "/api/admin/posts" && init?.method === "POST") {
const body = JSON.parse(String(init.body));
posted.push({ url, body});
return jsonResponse({ id: 7,...body});
}
return errorResponse("not found", 404);
}) as unknown as typeof fetch;
});

afterEach(() => {
globalThis.fetch = originalFetch;
});

function draftIdOf(result: { ok: boolean; data?: unknown}): string {
const preview = (result.data as { writePreview?: { draftId?: string}} | undefined)
?.writePreview;
expect(result.ok).toBe(true);
expect(preview?.draftId).toMatch(/^draft_/);
return preview!.draftId!;
}

it("lists ledger accounts and categories for the model", async () => {
const result = await executeTool("list_ledger_options", {}, ctx);
expect(result.ok).toBe(true);
expect(result.content).toContain("微信（id 2");
expect(result.content).toContain("餐饮（id 5");
});

it("prepares a ledger transaction by name and confirms it once", async () => {
const prepared = await executeTool(
"prepare_ledger_transaction",
{
account_name: "微信",
category_name: "餐饮",
kind: "expense",
amount: 88.8,
occurred: "2026-11-27T12:30",
merchant: "星巴克",
external_id: "bill:星巴克:20261127:88.8",
},
ctx,
);
expect(prepared.ok).toBe(true);
expect(prepared.content).toContain("记一笔账");
expect(prepared.content).toContain("88.80");
expect(prepared.content).toContain("微信");
expect(prepared.content).toContain("餐饮");
const draftId = draftIdOf(prepared);

const confirmed = await executeTool("confirm_ledger_transaction", { draft_id: draftId}, ctx);
expect(confirmed.ok).toBe(true);
expect(confirmed.content).toContain("已记账");
expect(confirmed.content).toContain("88.80");
expect(posted).toHaveLength(1);
expect(posted[0].body).toMatchObject({
account_id: 2,
category_id: 5,
kind: "expense",
amount: 88.8,
merchant: "星巴克",
external_id: "bill:星巴克:20261127:88.8",
});

// 草稿单次消费：重复确认直接失败，不会写第二笔
const again = await executeTool("confirm_ledger_transaction", { draft_id: draftId}, ctx);
expect(again.ok).toBe(false);
expect(again.content).toContain("草稿已失效");
expect(posted).toHaveLength(1);
});

it("prepare fails on unknown account and invalid amount", async () => {
const noAccount = await executeTool(
"prepare_ledger_transaction",
{ account_name: "不存在的账户", amount: 10},
ctx,
);
expect(noAccount.ok).toBe(false);
expect(noAccount.content).toContain("没有名字叫");

const badAmount = await executeTool(
"prepare_ledger_transaction",
{ account_name: "微信", amount: 0},
ctx,
);
expect(badAmount.ok).toBe(false);
expect(badAmount.content).toContain("0.01");
});

it("duplicate external_id surfaces a friendly duplicate message", async () => {
const prepared = await executeTool(
"prepare_ledger_transaction",
{
account_name: "微信",
kind: "expense",
amount: 10,
merchant: "重复",
external_id: "bill:重复:20261127:10",
},
ctx,
);
const draftId = draftIdOf(prepared);
const confirmed = await executeTool("confirm_ledger_transaction", { draft_id: draftId}, ctx);
expect(confirmed.ok).toBe(false);
expect(confirmed.content).toContain("重复");
});

it("warns when a similar transaction already exists this month", async () => {
globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
const url = String(input);
if (url.startsWith("/api/admin/ledger/accounts")) return jsonResponse(ACCOUNTS);
if (url.startsWith("/api/admin/ledger/categories")) return jsonResponse(CATEGORIES);
if (url.startsWith("/api/admin/ledger/transactions?")) {
return jsonResponse({
items: [
{ id: 99, merchant: "星巴克", amount: 10, occurred_at: Date.parse("2026-11-27T09:00:00+08:00") },
],
total: 1,
});
}
return errorResponse("not found", 404);
}) as unknown as typeof fetch;
const prepared = await executeTool(
"prepare_ledger_transaction",
{ account_name: "微信", amount: 10, merchant: "星巴克", occurred: "2026-11-27T12:30" },
ctx,
);
expect(prepared.ok).toBe(true);
expect(prepared.content).toContain("提醒：");
expect(prepared.content).toContain("可能是同一张账单");
});

it("prepares and confirms a chatter draft (default draft, never auto-publish)", async () => {
const prepared = await executeTool(
"prepare_chatter",
{ content: "今天天气不错"},
ctx,
);
expect(prepared.ok).toBe(true);
expect(prepared.content).toContain("存为草稿");
const draftId = draftIdOf(prepared);
const confirmed = await executeTool("confirm_chatter", { draft_id: draftId}, ctx);
expect(confirmed.ok).toBe(true);
expect(confirmed.content).toContain("已保存为草稿碎碎念");
expect(posted[0].body).toMatchObject({ content: "今天天气不错", status: "draft"});
});

it("prepares a collection item and rejects an empty title", async () => {
const bad = await executeTool("prepare_collection", { title: " "}, ctx);
expect(bad.ok).toBe(false);

const prepared = await executeTool(
"prepare_collection",
{ title: "好文章", url: "https://example.com/a", kind: "link"},
ctx,
);
const draftId = draftIdOf(prepared);
const confirmed = await executeTool("confirm_collection", { draft_id: draftId}, ctx);
expect(confirmed.ok).toBe(true);
expect(confirmed.content).toContain("已加入收藏");
});

it("prepares a post draft only (never published) with an auto slug", async () => {
const prepared = await executeTool(
"prepare_post_draft",
{ title: "你好世界", content: "# 你好"},
ctx,
);
expect(prepared.ok).toBe(true);
expect(prepared.content).toContain("只存草稿，不发布");
expect(prepared.content).toMatch(/网址后缀：post-/);
const draftId = draftIdOf(prepared);
const confirmed = await executeTool("confirm_post_draft", { draft_id: draftId}, ctx);
expect(confirmed.ok).toBe(true);
expect(confirmed.content).toContain("已保存文章草稿");
expect(posted[0].body).toMatchObject({ status: "draft", title: "你好世界"});
});

it("discard cancels a draft with zero side effects", async () => {
const prepared = await executeTool(
"prepare_chatter",
{ content: "算了不发了"},
ctx,
);
const draftId = draftIdOf(prepared);
const discarded = await executeTool("discard_draft", { draft_id: draftId}, ctx);
expect(discarded.ok).toBe(true);
expect(discarded.content).toContain("已取消");
const confirmed = await executeTool("confirm_chatter", { draft_id: draftId}, ctx);
expect(confirmed.ok).toBe(false);
expect(posted).toHaveLength(0);
});

it("confirm with an unknown draft id fails cleanly", async () => {
const result = await executeTool(
"confirm_ledger_transaction",
{ draft_id: "draft_nope"},
ctx,
);
expect(result.ok).toBe(false);
expect(result.content).toContain("草稿已失效");
});

it("401 from the admin API surfaces a login hint", async () => {
globalThis.fetch = vi.fn(async () => errorResponse("请先登录", 401)) as unknown as typeof fetch;
const result = await executeTool(
"prepare_ledger_transaction",
{ account_name: "微信", amount: 10},
ctx,
);
expect(result.ok).toBe(false);
expect(result.content).toContain("登录");
});
});

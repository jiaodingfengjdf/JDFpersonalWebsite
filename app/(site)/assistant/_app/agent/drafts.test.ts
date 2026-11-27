import { describe, expect, it } from "vitest";
import {
  clearDraftsForTest,
  createDraft,
  discardDraft,
  DRAFT_TTL_MS,
  peekDraft,
  takeDraft,
} from "./drafts";

describe("write drafts", () => {
  it("creates a draft that can be peeked and consumed exactly once", () => {
    clearDraftsForTest();
    const draft = createDraft("ledger", { amount: 12.5 }, "支出 12.5 元", 1_000);
    expect(draft.id).toMatch(/^draft_/);
    expect(peekDraft(draft.id, 2_000)).toBe(draft);
    // 消费后再次取不到，重复确认会被挡住
    expect(takeDraft(draft.id, 2_000)).toBe(draft);
    expect(takeDraft(draft.id, 2_000)).toBeUndefined();
    expect(peekDraft(draft.id, 2_000)).toBeUndefined();
  });

  it("expires drafts after the TTL", () => {
    clearDraftsForTest();
    const draft = createDraft("chatter", { content: "hi" }, "碎碎念", 1_000);
    expect(peekDraft(draft.id, 1_000 + DRAFT_TTL_MS)).toBe(draft);
    expect(peekDraft(draft.id, 1_000 + DRAFT_TTL_MS + 1)).toBeUndefined();
    expect(takeDraft(draft.id, 1_000 + DRAFT_TTL_MS + 1)).toBeUndefined();
  });

  it("discard removes the draft and is idempotent", () => {
    clearDraftsForTest();
    const draft = createDraft("collection", { title: "x" }, "收藏 x", 1_000);
    expect(discardDraft(draft.id, 2_000)).toBe(true);
    expect(discardDraft(draft.id, 2_000)).toBe(false);
    expect(peekDraft(draft.id, 2_000)).toBeUndefined();
  });

  it("unknown ids resolve to undefined", () => {
    clearDraftsForTest();
    expect(peekDraft("draft_nope", 1_000)).toBeUndefined();
    expect(takeDraft("draft_nope", 1_000)).toBeUndefined();
  });
});

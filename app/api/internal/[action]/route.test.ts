import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunDuePostSchedules = vi.fn();
const mockRunChecksNow = vi.fn();
const mockFeedRefresh = vi.fn();
const mockPodcastRefreshAll = vi.fn();
const mockNotify = vi.fn();

vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    CRON_SECRET: "test-cron-secret-123",
  },
}));

vi.mock("@/server/db/client", () => ({
  isTursoConfigured: () => false,
  getLibsqlClient: vi.fn(),
}));

vi.mock("@/server/modules/posts", () => ({
  getPostsService: () => ({
    runDuePostSchedules: (...args: unknown[]) =>
      mockRunDuePostSchedules(...args),
  }),
}));

vi.mock("@/server/modules/notifications/scheduler", () => ({
  runChecksNow: (...args: unknown[]) => mockRunChecksNow(...args),
}));

vi.mock("@/server/modules/feed", () => ({
  getFeedService: () => ({
    refresh: (...args: unknown[]) => mockFeedRefresh(...args),
  }),
}));

vi.mock("@/server/modules/podcast", () => ({
  getPodcastService: () => ({
    refreshAll: (...args: unknown[]) => mockPodcastRefreshAll(...args),
  }),
}));

vi.mock("@/server/modules/notifications", () => ({
  getNotificationsService: () => ({
    notify: (...args: unknown[]) => mockNotify(...args),
  }),
}));

import { GET, POST } from "./route";

describe("/api/internal/[action]", () => {
  beforeEach(() => {
    mockRunDuePostSchedules.mockReset().mockResolvedValue(1);
    mockRunChecksNow.mockReset().mockResolvedValue({
      ran_at: "2026-11-27T00:00:00.000Z",
      outcomes: [],
      triggered: ["market.alert"],
      errors: [],
    });
    mockFeedRefresh
      .mockReset()
      .mockResolvedValue({ fetched: 5, inserted: 2, failed: 0 });
    mockPodcastRefreshAll
      .mockReset()
      .mockResolvedValue({ shows: 1, inserted: 1 });
    mockNotify.mockReset().mockResolvedValue({ sent: true, outcomes: [] });
  });

  it("rejects unauthorized cron requests with 401", async () => {
    const req = new Request("http://localhost:3000/api/internal/cron", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    const res = await POST(req, { params: Promise.resolve({ action: "cron" }) });
    expect(res.status).toBe(401);
  });

  it("executes scheduled post, alert checks, and feed refresh on valid secret", async () => {
    const req = new Request(
      "http://localhost:3000/api/internal/cron?feeds=1",
      {
        method: "GET",
        headers: { "x-cron-secret": "test-cron-secret-123" },
      },
    );
    const res = await GET(req, { params: Promise.resolve({ action: "cron" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.posts_changed).toBe(1);
    expect(body.triggered).toEqual(["market.alert"]);
    expect(body.feeds_refreshed).toBe(true);
    expect(mockFeedRefresh).toHaveBeenCalledTimes(1);
    expect(mockPodcastRefreshAll).toHaveBeenCalledTimes(1);
  });

  it("preserves POST /api/internal/notify behaviour", async () => {
    const req = new Request("http://localhost:3000/api/internal/notify", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventKey: "custom.probe",
        level: "info",
        title: "探针正常",
        body: "测试内容",
      }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ action: "notify" }),
    });
    expect(res.status).toBe(200);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});

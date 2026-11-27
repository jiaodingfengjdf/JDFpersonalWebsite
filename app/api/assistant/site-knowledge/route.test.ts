import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http/errors";

const mockRequireAdmin = vi.fn();
const mockSearch = vi.fn();
const mockCollectionList = vi.fn();
const mockFeedList = vi.fn();
const mockLibraryList = vi.fn();
const mockPodcastShows = vi.fn();
const mockGamesList = vi.fn();
const mockWatchList = vi.fn();
const mockAlbumsList = vi.fn();
const mockBookmarkSites = vi.fn();
const mockChatterList = vi.fn();
const mockMarketWatches = vi.fn();

vi.mock("@/server/auth/guard", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock("@/server/modules/search", () => ({
  getSearchService: () => ({ search: (...args: unknown[]) => mockSearch(...args) }),
}));

vi.mock("@/server/modules/collection", () => ({
  getCollectionService: () => ({ list: (...args: unknown[]) => mockCollectionList(...args) }),
}));

vi.mock("@/server/modules/feed", () => ({
  getFeedService: () => ({ list: (...args: unknown[]) => mockFeedList(...args) }),
}));

vi.mock("@/server/modules/library", () => ({
  getLibraryService: () => ({ list: (...args: unknown[]) => mockLibraryList(...args) }),
}));

vi.mock("@/server/modules/podcast", () => ({
  getPodcastService: () => ({ shows: (...args: unknown[]) => mockPodcastShows(...args) }),
}));

vi.mock("@/server/modules/games", () => ({
  getGamesService: () => ({ list: (...args: unknown[]) => mockGamesList(...args) }),
}));

vi.mock("@/server/modules/watch", () => ({
  getWatchService: () => ({ list: (...args: unknown[]) => mockWatchList(...args) }),
}));

vi.mock("@/server/modules/albums", () => ({
  getAlbumsService: () => ({ list: (...args: unknown[]) => mockAlbumsList(...args) }),
}));

vi.mock("@/server/modules/bookmarks", () => ({
  getBookmarksService: () => ({ listSites: (...args: unknown[]) => mockBookmarkSites(...args) }),
}));

vi.mock("@/server/modules/chatters", () => ({
  getChattersService: () => ({ list: (...args: unknown[]) => mockChatterList(...args) }),
}));

vi.mock("@/server/modules/market", () => ({
  getMarketService: () => ({ watches: (...args: unknown[]) => mockMarketWatches(...args) }),
}));

import { GET } from "./route";

function getRequest(query: string): Request {
  return new Request(
    `http://localhost:3000/api/assistant/site-knowledge?${query}`,
  );
}

function postHit(index: number) {
  return {
    id: index,
    title: `文章${index}`,
    slug: `post-${index}`,
    description: "",
    snippet: `正文片段${index}`,
    category: "技术",
    published_at: "2026-11-20T00:00:00.000Z",
  };
}

describe("GET /api/assistant/site-knowledge", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockSearch.mockReset();
    mockCollectionList.mockReset();
    mockFeedList.mockReset();
    mockLibraryList.mockReset();
    mockPodcastShows.mockReset();
    mockGamesList.mockReset();
    mockWatchList.mockReset();
    mockAlbumsList.mockReset();
    mockBookmarkSites.mockReset();
    mockChatterList.mockReset();
    mockMarketWatches.mockReset();
    mockRequireAdmin.mockResolvedValue({ id: 1, username: "admin" });
    mockSearch.mockResolvedValue({ query: "", total: 0, hits: [], fuzzy: false });
    mockCollectionList.mockResolvedValue({ items: [], total: 0, counts: {} });
    mockFeedList.mockResolvedValue([]);
    mockLibraryList.mockResolvedValue([]);
    mockPodcastShows.mockResolvedValue([]);
    mockGamesList.mockResolvedValue([]);
    mockWatchList.mockResolvedValue([]);
    mockAlbumsList.mockResolvedValue([]);
    mockBookmarkSites.mockResolvedValue([]);
    mockChatterList.mockResolvedValue([]);
    mockMarketWatches.mockResolvedValue([]);
  });

  it("未登录时返回 401", async () => {
    mockRequireAdmin.mockRejectedValue(
      new AppError("UNAUTHORIZED", "请先登录", 401),
    );

    const res = await GET(getRequest("q=智能体"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("无命中时返回空结果", async () => {
    const res = await GET(getRequest("q=不存在的词"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      query: string;
      total: number;
      results: unknown[];
    };
    expect(body).toEqual({ query: "不存在的词", total: 0, results: [] });
  });

  it("命中超过 5 条时只返回前 5 条，但 total 记全部", async () => {
    mockSearch.mockResolvedValue({
      query: "智能体",
      total: 8,
      hits: Array.from({ length: 8 }, (_, i) => postHit(i + 1)),
      fuzzy: false,
    });
    mockCollectionList.mockResolvedValue({
      items: [
        { title: "收藏1", url: "https://example.com/1", note: "", author: "", category_name: "" },
        { title: "收藏2", url: "https://example.com/2", note: "", author: "", category_name: "" },
        { title: "收藏3", url: "https://example.com/3", note: "", author: "", category_name: "" },
      ],
      total: 3,
      counts: {},
    });
    mockFeedList.mockResolvedValue([
      { title: "智能体新闻1", link: "https://news.example/1", summary: "智能体动态", source_name: "RSS", published_at: 1767225600000 },
      { title: "智能体新闻2", link: "https://news.example/2", summary: "智能体动态", source_name: "RSS", published_at: 1767225600000 },
      { title: "智能体新闻3", link: "https://news.example/3", summary: "智能体动态", source_name: "RSS", published_at: 1767225600000 },
    ]);

    const res = await GET(getRequest("q=智能体"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      results: Array<{ kind: string; title: string; url: string }>;
    };
    expect(body.total).toBe(14);
    expect(body.results).toHaveLength(5);
    expect(body.results.map((item) => item.kind)).toEqual([
      "post",
      "post",
      "post",
      "post",
      "post",
    ]);
    expect(body.results[0].url).toBe("/posts/post-1");
  });

  it("过长摘要截断到 200 字并加省略号", async () => {
    mockSearch.mockResolvedValue({
      query: "智能体",
      total: 1,
      hits: [{ ...postHit(1), snippet: "字".repeat(300) }],
      fuzzy: false,
    });

    const res = await GET(getRequest("q=智能体"));
    const body = (await res.json()) as {
      results: Array<{ snippet: string }>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].snippet).toHaveLength(201);
    expect(body.results[0].snippet.endsWith("…")).toBe(true);
  });

  it("收藏与新闻带正确的 kind、链接与来源", async () => {
    mockCollectionList.mockResolvedValue({
      items: [
        {
          title: "收藏A",
          url: "https://example.com/a",
          note: "备忘",
          author: "",
          category_name: "技术",
        },
      ],
      total: 1,
      counts: {},
    });
    mockFeedList.mockResolvedValue([
      {
        title: "智能体新闻B",
        link: "https://news.example/b",
        summary: "智能体新进展",
        source_name: "RSS源",
        published_at: 1767225600000,
      },
    ]);

    const res = await GET(getRequest("q=智能体"));
    const body = (await res.json()) as {
      results: Array<{
        kind: string;
        title: string;
        url: string;
        source?: string;
        published_at?: string | null;
      }>;
    };
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({
      kind: "collection",
      title: "收藏A",
      url: "https://example.com/a",
      source: "技术",
    });
    expect(body.results[1]).toMatchObject({
      kind: "news",
      title: "智能体新闻B",
      url: "https://news.example/b",
      source: "RSS源",
      published_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("缺少关键词时返回 422", async () => {
    const res = await GET(getRequest(""));
    expect(res.status).toBe(422);
  });

  it("新域（书架、播客、游戏、影视、相册、书签、碎碎念、自选）按关键词命中", async () => {
    mockLibraryList.mockResolvedValue([
      { title: "智能体开发指南", author: "张三", category: "技术", note: "实战" },
    ]);
    mockPodcastShows.mockResolvedValue([
      { title: "智能体电台", author: "李四", description: "聊智能体" },
    ]);
    mockGamesList.mockResolvedValue([
      { title: "智能体大冒险", platform: "Switch", note: "" },
    ]);
    mockWatchList.mockResolvedValue([
      { title: "智能体电影", kind: "movie", overview: "关于智能体的故事", note: "" },
    ]);
    mockAlbumsList.mockResolvedValue([
      { title: "智能体相册", description: "智能体合影", photo_count: 3 },
    ]);
    mockBookmarkSites.mockResolvedValue([
      { name: "智能体导航", url: "https://agents.example", description: "智能体工具箱" },
    ]);
    mockChatterList.mockResolvedValue([
      {
        content: "今天在研究智能体，收获很大",
        mood: "开心",
        created_at: "2026-11-20T00:00:00.000Z",
      },
    ]);
    mockMarketWatches.mockResolvedValue([
      { id: 1, kind: "stock", market: "cn", code: "600519", name: "贵州茅台" },
    ]);

    const res = await GET(getRequest("q=智能体"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      results: Array<{ kind: string; title: string; url: string }>;
    };
    // 前 5 条按文章、收藏、新闻、书架、播客…的顺序截断
    expect(body.total).toBe(7);
    expect(body.results.map((item) => item.kind)).toEqual([
      "library",
      "podcast",
      "game",
      "watch",
      "album",
    ]);
    expect(body.results[0]).toMatchObject({
      kind: "library",
      title: "智能体开发指南",
      url: "/library",
    });

    const marketRes = await GET(getRequest("q=茅台"));
    const marketBody = (await marketRes.json()) as {
      total: number;
      results: Array<{ kind: string; title: string; url: string }>;
    };
    expect(marketBody.total).toBe(1);
    expect(marketBody.results[0]).toMatchObject({
      kind: "market",
      title: "贵州茅台（600519）",
      url: "/market",
    });
  });

  it("单个来源失败时不拖垮整条路由", async () => {
    mockLibraryList.mockRejectedValue(new Error("db down"));
    mockPodcastShows.mockRejectedValue(new Error("db down"));
    mockSearch.mockResolvedValue({
      query: "智能体",
      total: 1,
      hits: [postHit(1)],
      fuzzy: false,
    });

    const res = await GET(getRequest("q=智能体"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(1);
  });
});

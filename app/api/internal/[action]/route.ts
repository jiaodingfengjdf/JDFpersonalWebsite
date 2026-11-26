import { revalidatePosts } from "@/lib/revalidate";
import { getLibsqlClient, isTursoConfigured } from "@/server/db/client";
import { readJson } from "@/server/http/body";
import { errors } from "@/server/http/errors";
import { handle } from "@/server/http/handler";
import { requireCronSecret } from "@/server/http/internal-auth";
import { getFeedService } from "@/server/modules/feed";
import { getNotificationsService } from "@/server/modules/notifications";
import { internalNotifyInput } from "@/server/modules/notifications/contracts";
import { runChecksNow } from "@/server/modules/notifications/scheduler";
import { describeError } from "@/server/modules/notifications/transport";
import { getPodcastService } from "@/server/modules/podcast";
import { getPostsService } from "@/server/modules/posts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ action: string }>;
}

/**
 * 统一内部运维与边缘调度中枢（严守 Vercel Hobby 函数数量上限）：
 * - POST /api/internal/notify  : 外部探针/CI 推送通知（保持原契约 100% 兼容）
 * - POST|GET /api/internal/cron: 由前置 Cloudflare Worker Cron Triggers 定时唤醒，
 *   统一执行文章排期发布、行情快照采样与涨跌预警、运维健康巡检，以及按需刷新 RSS / 播客源。
 */
let tursoIndexesEnsured = false;

async function ensureTursoIndexes(): Promise<void> {
  if (tursoIndexesEnsured || !isTursoConfigured()) return;
  const client = getLibsqlClient();
  await client.batch(
    [
      'CREATE INDEX IF NOT EXISTS "idx_post_list_order" ON "post" ("status", "is_pinned", "created_at", "id")',
      'CREATE INDEX IF NOT EXISTS "idx_post_status_scheduled_at" ON "post" ("status", "scheduled_at")',
      'CREATE INDEX IF NOT EXISTS "idx_photo_album_sort" ON "photo" ("album_id", "sort", "id")',
      {
        sql: 'INSERT OR IGNORE INTO "__migrations" ("filename", "applied_at") VALUES (?, ?)',
        args: ["0029_perf_indexes.sql", Date.now()],
      },
    ],
    "write",
  );
  tursoIndexesEnsured = true;
}

async function runCronTick(request: Request) {
  requireCronSecret(request);
  const url = new URL(request.url);
  const includeFeeds =
    url.searchParams.get("feeds") === "1" ||
    new Date().getUTCMinutes() < 15;

  const errorsList: string[] = [];

  try {
    await ensureTursoIndexes();
  } catch (error) {
    errorsList.push(`db.indexes: ${describeError(error)}`);
  }

  let scheduledPostsChanged = 0;

  try {
    scheduledPostsChanged = await getPostsService().runDuePostSchedules();
    if (scheduledPostsChanged > 0) {
      revalidatePosts();
    }
  } catch (error) {
    errorsList.push(`posts.schedule: ${describeError(error)}`);
  }

  let checkReport: Awaited<ReturnType<typeof runChecksNow>> | null = null;
  try {
    checkReport = await runChecksNow();
    if (checkReport.errors.length > 0) {
      errorsList.push(...checkReport.errors);
    }
  } catch (error) {
    errorsList.push(`notifications.checks: ${describeError(error)}`);
  }

  let feedResult: { fetched: number; inserted: number; failed: number } | null =
    null;
  let podcastResult: { shows: number; inserted: number } | null = null;

  if (includeFeeds) {
    const [feedSettled, podcastSettled] = await Promise.allSettled([
      getFeedService().refresh(),
      getPodcastService().refreshAll(),
    ]);
    if (feedSettled.status === "fulfilled") {
      feedResult = feedSettled.value;
    } else {
      errorsList.push(`feed.refresh: ${describeError(feedSettled.reason)}`);
    }
    if (podcastSettled.status === "fulfilled") {
      podcastResult = podcastSettled.value;
    } else {
      errorsList.push(
        `podcast.refresh: ${describeError(podcastSettled.reason)}`,
      );
    }
  }

  return {
    ok: true,
    ran_at: new Date().toISOString(),
    posts_changed: scheduledPostsChanged,
    triggered: checkReport?.triggered ?? [],
    feeds_refreshed: includeFeeds,
    feed: feedResult,
    podcast: podcastResult,
    errors: errorsList,
  };
}

export async function GET(request: Request, context: RouteContext) {
  return handle(
    async () => {
      const { action } = await context.params;
      if (action === "cron") {
        return runCronTick(request);
      }
      throw errors.notFound();
    },
    { request },
  );
}

export async function POST(request: Request, context: RouteContext) {
  return handle(
    async () => {
      const { action } = await context.params;
      if (action === "notify") {
        requireCronSecret(request);
        const input = internalNotifyInput.parse(await readJson(request));
        return getNotificationsService().notify(input, { recordSkip: true });
      }
      if (action === "cron") {
        return runCronTick(request);
      }
      throw errors.notFound();
    },
    { request },
  );
}

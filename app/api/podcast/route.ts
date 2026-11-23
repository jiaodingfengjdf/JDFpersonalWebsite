import { handle } from "@/server/http/handler";
import { getPodcastService } from "@/server/modules/podcast";
import { getAdminSession } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      const service = getPodcastService();
      const [shows, admin] = await Promise.all([service.shows(), getAdminSession()]);
      const requested = Number(new URL(request.url).searchParams.get("show"));
      const activeId = shows.some((show) => show.id === requested)
        ? requested
        : (shows.find((show) => show.episode_count > 0) ?? shows[0])?.id;
      const episodes = activeId ? await service.episodes(activeId) : [];
      return Response.json({
        shows: admin ? shows : shows.map((show) => ({ ...show, last_error: "" })),
        activeId: activeId ?? null,
        episodes: admin ? episodes : episodes.map((episode) => ({ ...episode, played: false, position: 0 })),
      }, { headers: { "cache-control": "private, no-store" } });
    },
    { request },
  );
}

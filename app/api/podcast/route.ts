import { handle } from "@/server/http/handler";
import { getPodcastService } from "@/server/modules/podcast";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      const service = getPodcastService();
      const shows = await service.shows();
      const requested = Number(new URL(request.url).searchParams.get("show"));
      const activeId = shows.some((show) => show.id === requested) ? requested : shows[0]?.id;
      const episodes = activeId ? await service.episodes(activeId) : [];
      return { shows, activeId: activeId ?? null, episodes };
    },
    { request },
  );
}

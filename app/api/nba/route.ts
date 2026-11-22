import { handle } from "@/server/http/handler";
import { getNbaService } from "@/server/modules/nba";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      const followOnly = new URL(request.url).searchParams.get("follow") === "1";
      const [games, teams] = await Promise.all([
        getNbaService().list({ followOnly }),
        getNbaService().teams(),
      ]);
      return { games, teams: teams.filter((team) => team.follow) };
    },
    { request },
  );
}

import { handle } from "@/server/http/handler";
import { getNbaService } from "@/server/modules/nba";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      const followOnly = new URL(request.url).searchParams.get("follow") === "1";
      const service = getNbaService();
      // 球队表只读一次，list 复用同一份数据来判断关注球队。
      const teams = await service.teams();
      const games = await service.list({ followOnly, teams });
      return { games, teams: teams.filter((team) => team.follow) };
    },
    { request },
  );
}

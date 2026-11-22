import { handle } from "@/server/http/handler";
import { getGamesService } from "@/server/modules/games";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => ({ items: await getGamesService().list() }), { request });
}

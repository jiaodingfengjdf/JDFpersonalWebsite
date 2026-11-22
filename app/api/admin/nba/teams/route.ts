import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { teamFollowInput } from "@/server/modules/nba/contracts";
import { getNbaService } from "@/server/modules/nba";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    return getNbaService().teams();
  }, { request });
}

export async function PUT(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = teamFollowInput.parse(await readJson(request));
      return getNbaService().setFollow(input.code, input.follow);
    },
    { request },
  );
}

import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { showInput } from "@/server/modules/podcast/contracts";
import { getPodcastService } from "@/server/modules/podcast";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = showInput.parse(await readJson(request));
      return getPodcastService().addShow(input.feedUrl);
    },
    { request },
  );
}

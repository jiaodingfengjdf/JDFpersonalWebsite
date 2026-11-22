import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { positionInput } from "@/server/modules/podcast/contracts";
import { getPodcastService } from "@/server/modules/podcast";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const id = Number((await params).id);
      const input = positionInput.parse(await readJson(request));
      return getPodcastService().savePosition(id, input.position, input.played);
    },
    { request },
  );
}

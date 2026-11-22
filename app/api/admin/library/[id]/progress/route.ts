import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { requireAdmin } from "@/server/auth/guard";
import { progressInput } from "@/server/modules/library/contracts";
import { getLibraryService } from "@/server/modules/library";

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
      const input = progressInput.parse(await readJson(request));
      return getLibraryService().saveProgress(id, input);
    },
    { request },
  );
}

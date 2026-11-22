import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { collectionIdParams, collectionInput } from "@/server/modules/collection/contracts";
import { getCollectionService } from "@/server/modules/collection";

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
      const { id } = collectionIdParams.parse(await params);
      const input = collectionInput.parse(await readJson(request));
      return getCollectionService().update(id, input);
    },
    { request },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const { id } = collectionIdParams.parse(await params);
      await getCollectionService().remove(id);
      return { ok: true };
    },
    { request },
  );
}

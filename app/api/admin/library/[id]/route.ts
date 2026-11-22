import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { bookInput } from "@/server/modules/library/contracts";
import { getLibraryService } from "@/server/modules/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    return { items: await getLibraryService().list() };
  }, { request });
}

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
      const input = bookInput.parse(await readJson(request));
      return getLibraryService().update(id, input);
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
      const id = Number((await params).id);
      return getLibraryService().remove(id);
    },
    { request },
  );
}

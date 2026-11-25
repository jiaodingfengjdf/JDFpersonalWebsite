import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { errors } from "@/server/http/errors";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { bookInput } from "@/server/modules/library/contracts";
import { getLibraryService } from "@/server/modules/library";
import { getUploadRoot } from "@/server/storage";
import { removeBookUpload } from "@/server/storage/books";

export const dynamic = "force-dynamic";

/** 单条书籍详情；列表逻辑在 GET /api/admin/library。 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(
    async () => {
      await requireAdmin();
      const id = Number((await params).id);
      if (!Number.isSafeInteger(id) || id <= 0) throw errors.notFound("书不存在");
      return { item: await getLibraryService().get(id) };
    },
    { request },
  );
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
      const service = getLibraryService();
      const book = await service.get(id);
      const result = await service.remove(id);
      await removeBookUpload(getUploadRoot(), book.file_url)
        .catch((error) => console.error("Failed to remove book upload", error));
      return result;
    },
    { request },
  );
}

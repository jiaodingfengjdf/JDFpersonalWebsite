import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { getCollectionService } from "@/server/modules/collection";
import { bookmarkImportInput } from "@/server/modules/collection/contracts";

export async function POST(request: Request) {
  return handle(async () => {
    assertWritable();
    assertSameOrigin(request);
    await requireAdmin();
    return getCollectionService().importBookmarks(bookmarkImportInput.parse(await readJson(request)));
  }, { request });
}

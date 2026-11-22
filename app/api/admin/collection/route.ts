import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { collectionInput, collectionQuery } from "@/server/modules/collection/contracts";
import { getCollectionService } from "@/server/modules/collection";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      await requireAdmin();
      const params = collectionQuery.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      const [result, categories] = await Promise.all([
        getCollectionService().list(params, { includePrivate: true }),
        getCollectionService().categories(),
      ]);
      return { ...result, categories };
    },
    { request },
  );
}

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = collectionInput.parse(await readJson(request));
      return getCollectionService().create(input);
    },
    { request },
  );
}

import { handle } from "@/server/http/handler";
import { collectionQuery } from "@/server/modules/collection/contracts";
import { getCollectionService } from "@/server/modules/collection";

export const dynamic = "force-dynamic";

/** 前台收藏列表：只返回公开条目，支持 kind / category / tag / q / status 过滤。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const params = collectionQuery.parse(
        Object.fromEntries(request.url ? new URL(request.url).searchParams : []),
      );
      const [result, categories] = await Promise.all([
        getCollectionService().list(params, { includePrivate: false }),
        getCollectionService().categories(),
      ]);
      return { ...result, categories };
    },
    { request },
  );
}

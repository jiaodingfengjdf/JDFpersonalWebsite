import { handle } from "@/server/http/handler";
import { watchStatus } from "@/server/modules/watch/contracts";
import { getWatchService } from "@/server/modules/watch";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      const requested = new URL(request.url).searchParams.get("status");
      const status = watchStatus.safeParse(requested);
      return { items: await getWatchService().list(status.success ? status.data : undefined) };
    },
    { request },
  );
}

import { handle } from "@/server/http/handler";
import { getLibraryService } from "@/server/modules/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => ({ items: await getLibraryService().list() }), { request });
}

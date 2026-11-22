import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { themeIdParams } from "@/server/modules/themes/contracts";
import { getThemesService } from "@/server/modules/themes";

export const dynamic = "force-dynamic";

/** 设为站点默认主题（同一时刻只有一个启用项）。 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();

      const { id } = themeIdParams.parse(await params);
      const activated = await getThemesService().activate(id);

      try {
        revalidatePath("/", "layout");
      } catch {
        // ignore non-request contexts
      }
      return activated;
    },
    { request },
  );
}

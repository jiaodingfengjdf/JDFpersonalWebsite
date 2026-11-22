import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { themeIdParams, themePresetInput } from "@/server/modules/themes/contracts";
import { getThemesService } from "@/server/modules/themes";

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

      const { id } = themeIdParams.parse(await params);
      const input = themePresetInput.parse(await readJson(request));
      const updated = await getThemesService().update(id, input);

      try {
        revalidatePath("/", "layout");
      } catch {
        // ignore non-request contexts
      }
      return updated;
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

      const { id } = themeIdParams.parse(await params);
      await getThemesService().remove(id);

      try {
        revalidatePath("/", "layout");
      } catch {
        // ignore non-request contexts
      }
      return { ok: true };
    },
    { request },
  );
}

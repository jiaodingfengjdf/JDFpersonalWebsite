import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { themePresetInput } from "@/server/modules/themes/contracts";
import { getThemesService } from "@/server/modules/themes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      await requireAdmin();
      return getThemesService().list();
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

      const input = themePresetInput.parse(await readJson(request));
      const created = await getThemesService().create(input);

      try {
        revalidatePath("/", "layout");
      } catch {
        // 非 Next 请求上下文（单测）里调用会抛错，不影响保存结果。
      }
      return created;
    },
    { request },
  );
}

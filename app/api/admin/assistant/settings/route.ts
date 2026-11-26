import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import {
  assistantAdminSettingsInput,
  loadAssistantAdminSettings,
  saveAssistantAdminSettings,
} from "@/server/modules/assistant";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  return handle(
    async () => {
      await requireAdmin();
      const settings = await loadAssistantAdminSettings();
      return Response.json(settings, { headers: NO_STORE_HEADERS });
    },
    { request },
  );
}

export async function PUT(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = assistantAdminSettingsInput.parse(await readJson(request));
      const saved = await saveAssistantAdminSettings(input);
      return Response.json(saved, { headers: NO_STORE_HEADERS });
    },
    { request },
  );
}

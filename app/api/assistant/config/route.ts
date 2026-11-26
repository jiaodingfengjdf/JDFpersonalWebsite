import { handle } from "@/server/http/handler";
import { loadAssistantPublicConfig } from "@/server/modules/assistant";

export const dynamic = "force-dynamic";

/** 公开只读 AI 助理元数据：严禁返回任何密钥、内部端点或系统提示词。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const config = await loadAssistantPublicConfig();
      return Response.json(config, {
        headers: { "cache-control": "private, no-store" },
      });
    },
    { request },
  );
}

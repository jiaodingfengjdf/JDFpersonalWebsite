import { getAdminSession } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";

export const dynamic = "force-dynamic";

/** 返回当前会话是否为管理员；访客同样返回 200 `{ isAdmin: false }`，避免控制台出现 401 噪音。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const admin = await getAdminSession();
      return Response.json(
        { isAdmin: Boolean(admin), username: admin?.username ?? null },
        { headers: { "cache-control": "private, no-store" } },
      );
    },
    { request },
  );
}

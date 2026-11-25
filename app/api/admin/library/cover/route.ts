import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/server/auth/guard";
import { errors } from "@/server/http/errors";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { assertWritable } from "@/server/http/write-guard";
import { getLibraryService } from "@/server/modules/library";
import { getUploadRoot } from "@/server/storage";
import {
  inspectCover,
  MAX_COVER_BYTES,
  removeCoverUpload,
  writeCoverUpload,
} from "@/server/storage/books";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload a book cover (JPG/PNG/WebP, <=5MB). When `bookId` is supplied the
 * cover is applied to that book atomically: a failed DB update rolls the
 * written file back, and the previous cover is removed only after success.
 */
export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      const admin = await requireAdmin();
      enforceRateLimit(`upload:cover:${admin.id}`, 20, 60 * 60 * 1000);

      const declared = Number(request.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_COVER_BYTES + 64 * 1024) {
        throw errors.payloadTooLarge("封面图片不能超过 5MB");
      }

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw errors.badRequest("无效的上传请求");
      }

      const file = form.get("file");
      if (!(file instanceof File)) throw errors.badRequest("请选择封面图片");
      if (!file.size) throw errors.badRequest("封面图片为空");
      if (file.size > MAX_COVER_BYTES) throw errors.payloadTooLarge("封面图片不能超过 5MB");

      const buffer = Buffer.from(await file.arrayBuffer());
      const image = inspectCover(buffer, file.type);

      let bookId: number | null = null;
      const bookIdInput = form.get("bookId");
      if (bookIdInput !== null) {
        bookId = Number(bookIdInput);
        if (!Number.isSafeInteger(bookId) || bookId <= 0) {
          throw errors.badRequest("书籍 ID 无效");
        }
      }

      const root = getUploadRoot();
      const filename = `${randomUUID()}.${image.ext}`;
      await writeCoverUpload(root, filename, buffer);
      const url = `/uploads/covers/${filename}`;

      try {
        if (bookId !== null) {
          const service = getLibraryService();
          const previous = await service.get(bookId);
          await service.setCover(bookId, url);
          if (previous.cover && previous.cover !== url) {
            await removeCoverUpload(root, previous.cover).catch((reason) =>
              console.error("Failed to clean up previous book cover", reason),
            );
          }
        }
      } catch (error) {
        await removeCoverUpload(root, url).catch((reason) =>
          console.error("Failed to clean up cover upload", reason),
        );
        throw error;
      }

      return { url };
    },
    { request },
  );
}

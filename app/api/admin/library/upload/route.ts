import { randomUUID } from "node:crypto";
import path from "node:path";
import { requireAdmin } from "@/server/auth/guard";
import { errors } from "@/server/http/errors";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { getLibraryService, isSafeCoverUrl } from "@/server/modules/library";
import { getUploadRoot } from "@/server/storage";
import {
  inspectCover,
  MAX_COVER_BYTES,
  removeBookUpload,
  removeCoverUpload,
  writeBookUpload,
  writeCoverUpload,
} from "@/server/storage/books";
import { splitChapters } from "@/lib/library-chapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;
const FORMATS: Record<string, "epub" | "txt"> = {
  ".epub": "epub",
  ".txt": "txt",
};

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();

      const declared = Number(request.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_BYTES + MAX_COVER_BYTES + 256 * 1024) {
        throw errors.payloadTooLarge("书籍文件不能超过 50MB，封面不能超过 5MB");
      }

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw errors.badRequest("无效的上传请求");
      }

      const file = form.get("file");
      if (!(file instanceof File)) throw errors.badRequest("请选择要上传的书籍文件");

      const ext = path.extname(file.name).toLowerCase();
      const format = FORMATS[ext];
      if (!format) throw errors.badRequest("只支持 EPUB 与 TXT");
      if (file.size > MAX_BYTES) throw errors.payloadTooLarge("书籍文件不能超过 50MB");
      if (!file.size) throw errors.badRequest("书籍文件为空");

      let buffer = Buffer.from(await file.arrayBuffer());
      let totalUnits = 0;
      if (format === "txt") {
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
          try {
            text = new TextDecoder("gb18030", { fatal: true }).decode(buffer);
          } catch {
            throw errors.badRequest("TXT 必须使用 UTF-8 或 GB18030 编码");
          }
        }
        totalUnits = splitChapters(text).length;
        if (!totalUnits) throw errors.badRequest("TXT 没有可阅读的内容");
        buffer = Buffer.from(text, "utf8");
        if (buffer.length > MAX_BYTES) throw errors.payloadTooLarge("转码后的 TXT 不能超过 50MB");
      } else if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
        throw errors.badRequest("无法识别 EPUB 文件");
      }
      const root = getUploadRoot();

      // A cover may arrive as a file (validated and stored here) or as a URL
      // selected from an existing upload. Both end up as a safe /uploads path.
      let cover = "";
      let coverWritten = false;
      const coverInput = form.get("cover");
      if (coverInput instanceof File && coverInput.size > 0) {
        if (coverInput.size > MAX_COVER_BYTES) {
          throw errors.payloadTooLarge("封面图片不能超过 5MB");
        }
        const coverBuffer = Buffer.from(await coverInput.arrayBuffer());
        const image = inspectCover(coverBuffer, coverInput.type);
        const coverFilename = `${randomUUID()}.${image.ext}`;
        await writeCoverUpload(root, coverFilename, coverBuffer);
        cover = `/uploads/covers/${coverFilename}`;
        coverWritten = true;
      } else if (typeof coverInput === "string" && coverInput.trim()) {
        cover = coverInput.trim();
        if (cover.length > 1000 || !isSafeCoverUrl(cover)) {
          throw errors.badRequest("封面地址无效");
        }
      }

      const filename = `${randomUUID()}${ext}`;
      const fileUrl = `/uploads/books/${filename}`;

      const titleFromName = file.name.replace(/\.[^.]+$/, "").trim() || "未命名";
      const authorInput = form.get("author");
      const author = typeof authorInput === "string" ? authorInput.trim().slice(0, 100) : "";
      try {
        await writeBookUpload(root, filename, buffer);
        const created = await getLibraryService().create({
          title: titleFromName.slice(0, 200),
          author,
          format,
          fileUrl,
          bytes: buffer.length,
          totalUnits,
          cover,
        });
        return { ...created, format, bytes: buffer.length, totalUnits };
      } catch (error) {
        await removeBookUpload(root, fileUrl).catch((reason) => console.error("Failed to clean up book upload", reason));
        if (coverWritten) {
          await removeCoverUpload(root, cover).catch((reason) => console.error("Failed to clean up cover upload", reason));
        }
        throw error;
      }
    },
    { request },
  );
}

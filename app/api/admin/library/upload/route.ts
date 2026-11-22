import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/server/auth/guard";
import { errors } from "@/server/http/errors";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { getLibraryService } from "@/server/modules/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;
const FORMATS: Record<string, "epub" | "txt"> = {
  ".epub": "epub",
  ".txt": "txt",
};

/** 粗略统计 TXT 章节数：匹配「第X章/节/回」或 Markdown 一级标题。 */
function countChapters(text: string): number {
  const matches = text.match(/^\s*(第[0-9一二三四五六七八九十百千]+[章节回]|#{1,2}\s+\S)/gm);
  return matches ? Math.max(1, matches.length) : 1;
}

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();

      const declared = Number(request.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_BYTES + 64 * 1024) {
        throw errors.payloadTooLarge("书籍文件不能超过 50MB");
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

      const buffer = Buffer.from(await file.arrayBuffer());
      const dir = path.join(process.cwd(), "public", "uploads", "books");
      await mkdir(dir, { recursive: true });
      const filename = `${randomUUID()}${ext}`;
      await writeFile(path.join(dir, filename), buffer);

      const titleFromName = file.name.replace(/\.[^.]+$/, "").trim() || "未命名";
      const authorInput = form.get("author");
      const author = typeof authorInput === "string" ? authorInput.trim().slice(0, 100) : "";
      const totalUnits = format === "txt" ? countChapters(buffer.toString("utf8")) : 0;

      const created = await getLibraryService().create({
        title: titleFromName.slice(0, 200),
        author,
        format,
        fileUrl: `/uploads/books/${filename}`,
        bytes: buffer.length,
        totalUnits,
        cover: "",
      });

      return { ...created, format, bytes: buffer.length, totalUnits };
    },
    { request },
  );
}

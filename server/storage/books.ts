import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { errors } from "@/server/http/errors";
import { inspectImage, type ImageFormat } from "./image";
import { resolveUploadPath, writeLocalImage } from "./local";

const BOOK_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(txt|epub)$/i;
const COVER_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

/** Cover images are deliberately capped lower than the general image upload. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_FORMATS: ReadonlySet<ImageFormat> = new Set(["jpeg", "png", "webp"]);

export function isBookUpload(segments: string[]): boolean {
  return segments.length === 2 && segments[0] === "books" && BOOK_FILENAME.test(segments[1]);
}

export function isCoverUpload(segments: string[]): boolean {
  return segments.length === 2 && segments[0] === "covers" && COVER_FILENAME.test(segments[1]);
}

/** Validate a cover via the shared magic-byte inspector, then apply cover-specific limits. */
export function inspectCover(buffer: Buffer, declaredType?: string | null) {
  if (!buffer.length) throw errors.badRequest("封面图片为空");
  if (buffer.length > MAX_COVER_BYTES) throw errors.payloadTooLarge("封面图片不能超过 5MB");
  const image = inspectImage(buffer, declaredType);
  if (!COVER_FORMATS.has(image.format)) {
    throw errors.unsupportedMediaType("封面仅支持 JPG/PNG/WebP");
  }
  return image;
}

export function writeBookUpload(root: string, filename: string, bytes: Buffer) {
  return writeLocalImage(root, `books/${filename}`, bytes);
}

export function writeCoverUpload(root: string, filename: string, bytes: Buffer) {
  return writeLocalImage(root, `covers/${filename}`, bytes);
}

export async function readBookUpload(root: string, segments: string[]) {
  if (!isBookUpload(segments)) throw errors.notFound("书籍文件不存在");
  const paths = [
    resolveUploadPath(root, segments),
    resolveUploadPath(path.join(process.cwd(), "public", "uploads"), segments),
  ];
  for (const file of paths) {
    try {
      return {
        body: await readFile(file),
        contentType: file.endsWith(".txt") ? "text/plain; charset=utf-8" : "application/epub+zip",
      };
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
  throw errors.notFound("书籍文件不存在");
}

export async function removeBookUpload(root: string, fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/")) return;
  const segments = fileUrl.slice("/uploads/".length).split("/");
  if (!isBookUpload(segments)) return;
  await removeUploadSegments(root, segments);
}

export async function removeCoverUpload(root: string, url: string) {
  if (!url.startsWith("/uploads/")) return;
  const segments = url.slice("/uploads/".length).split("/");
  if (!isCoverUpload(segments)) return;
  await removeUploadSegments(root, segments);
}

async function removeUploadSegments(root: string, segments: string[]) {
  const roots = new Set([root, path.join(process.cwd(), "public", "uploads")]);
  for (const directory of roots) {
    try {
      await unlink(resolveUploadPath(directory, segments));
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
}

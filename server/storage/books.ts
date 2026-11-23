import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { errors } from "@/server/http/errors";
import { resolveUploadPath, writeLocalImage } from "./local";

const BOOK_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(txt|epub)$/i;

export function isBookUpload(segments: string[]): boolean {
  return segments.length === 2 && segments[0] === "books" && BOOK_FILENAME.test(segments[1]);
}

export function writeBookUpload(root: string, filename: string, bytes: Buffer) {
  return writeLocalImage(root, `books/${filename}`, bytes);
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
  const roots = new Set([root, path.join(process.cwd(), "public", "uploads")]);
  for (const directory of roots) {
    try {
      await unlink(resolveUploadPath(directory, segments));
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
}

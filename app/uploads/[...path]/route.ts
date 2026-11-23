import { handle } from "@/server/http/handler";
import { getUploadRoot } from "@/server/storage";
import { readLocalImage } from "@/server/storage/local";
import { isBookUpload, readBookUpload } from "@/server/storage/books";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve files written by the local storage fallback.
 *
 * Production uses this handler: the bundled Caddy container proxies every
 * request, including `/uploads/*`, to the app. A host-level proxy may alias
 * `UPLOAD_DIR` instead. The app serves known image types and UUID book files
 * with explicit types and nosniff.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handle(
    async () => {
      const { path: segments } = await params;
      const root = getUploadRoot();
      const book = isBookUpload(segments);
      const { body, contentType } = await (book
        ? readBookUpload(root, segments)
        : readLocalImage(root, segments));

      return new Response(new Uint8Array(body), {
        headers: {
          "content-type": contentType,
          "content-length": String(body.byteLength),
          "x-content-type-options": "nosniff",
          "content-disposition": "inline",
          "cache-control": book ? "no-store" : "public, max-age=31536000, immutable",
        },
      });
    },
    { request },
  );
}

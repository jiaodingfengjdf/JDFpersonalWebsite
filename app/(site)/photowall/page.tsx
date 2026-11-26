import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import type { Album } from "@/components/photos/AlbumCard";
import type { Photo } from "@/types/photo";
import { getAlbumsService } from "@/server/modules/albums";
import { loadSiteSettings } from "@/server/modules/site-settings";
import PhotoWallClient from "./PhotoWallClient";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();

  return buildPageMetadata({
    title: `照片墙 · ${profile.siteTitle}`,
    description: "用照片记录生活的每一个瞬间",
    path: "/photowall",
  });
}

async function loadAlbums(): Promise<Album[]> {
  const service = getAlbumsService();
  const albumList = await service.list();
  albumList.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  const photosByAlbum = await service.listPhotosByAlbums(
    albumList.map((album) => album.id),
  );

  return albumList.map((album) => {
    const photos = photosByAlbum.get(album.id) ?? [];
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      updatedAt: album.updated_at,
      photoCount: album.photo_count,
      photos: photos
        .slice()
        .reverse()
        .map(
          (photo): Photo => ({
            id: String(photo.id),
            url: photo.url,
            caption: photo.caption,
            width: photo.width,
            height: photo.height,
            format: photo.format,
            orientation:
              (photo.orientation as Photo["orientation"]) || "landscape",
          }),
        ),
    };
  });
}

export default async function PhotoWallPage() {
  const albums = await loadAlbums().catch((error) => {
    console.error("Failed to load photo albums", error);
    return [];
  });

  return <PhotoWallClient albums={albums} />;
}

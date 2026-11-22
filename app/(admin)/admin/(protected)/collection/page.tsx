import type { Metadata } from "next";
import CollectionManager from "@/components/admin/CollectionManager";

export const metadata: Metadata = {
  title: "收藏 · Kirameku Admin",
  robots: { index: false, follow: false },
};

export default function AdminCollectionPage() {
  return <CollectionManager />;
}

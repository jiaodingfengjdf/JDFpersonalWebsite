import type { Metadata } from "next";
import NbaManager from "@/components/admin/NbaManager";

export const metadata: Metadata = {
  title: "NBA · 兴趣",
  robots: { index: false, follow: false },
};

export default function AdminNbaPage() {
  return <NbaManager />;
}

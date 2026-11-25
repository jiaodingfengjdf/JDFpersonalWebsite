import type { Metadata } from "next";
import NewsManager from "@/components/admin/NewsManager";

export const metadata: Metadata = {
  title: "新闻 · 兴趣",
  robots: { index: false, follow: false },
};

export default function AdminNewsPage() {
  return <NewsManager />;
}

import type { Metadata } from "next";
import LibraryManager from "@/components/admin/LibraryManager";

export const metadata: Metadata = {
  title: "书架 · Kirameku Admin",
  robots: { index: false, follow: false },
};

export default function AdminLibraryPage() {
  return <LibraryManager />;
}

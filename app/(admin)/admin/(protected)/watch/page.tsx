import type { Metadata } from "next";
import WatchManager from "@/components/admin/WatchManager";

export const metadata: Metadata = {
  title: "影视 · 兴趣",
  robots: { index: false, follow: false },
};

export default function AdminWatchPage() {
  return <WatchManager />;
}

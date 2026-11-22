import type { Metadata } from "next";
import WatchManager from "@/components/admin/WatchManager";

export const metadata: Metadata = {
  title: "影视 · Kirameku Admin",
  robots: { index: false, follow: false },
};

export default function AdminWatchPage() {
  return <WatchManager />;
}

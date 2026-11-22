import type { Metadata } from "next";
import PodcastManager from "@/components/admin/PodcastManager";

export const metadata: Metadata = {
  title: "播客 · Kirameku Admin",
  robots: { index: false, follow: false },
};

export default function AdminPodcastPage() {
  return <PodcastManager />;
}

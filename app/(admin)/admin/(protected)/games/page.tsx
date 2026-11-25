import type { Metadata } from "next";
import GamesManager from "@/components/admin/GamesManager";

export const metadata: Metadata = {
  title: "游戏 · 兴趣",
  robots: { index: false, follow: false },
};

export default function AdminGamesPage() {
  return <GamesManager />;
}

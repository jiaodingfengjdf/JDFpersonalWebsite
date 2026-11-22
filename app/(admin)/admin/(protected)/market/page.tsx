import type { Metadata } from "next";
import MarketManager from "@/components/admin/MarketManager";

export const metadata: Metadata = {
  title: "行情 · Kirameku Admin",
  robots: { index: false, follow: false },
};

export default function AdminMarketPage() {
  return <MarketManager />;
}

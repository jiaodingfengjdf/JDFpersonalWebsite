import type { Metadata } from "next";
import LedgerManager from "@/components/admin/LedgerManager";

export const metadata: Metadata = {
  title: "记账 · Kirameku Admin",
  robots: { index: false, follow: false },
};

export default function AdminLedgerPage() {
  return <LedgerManager />;
}

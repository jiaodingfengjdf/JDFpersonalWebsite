import type { Metadata } from "next";
import ThemeManager from "@/components/admin/ThemeManager";

export const metadata: Metadata = {
  title: "主题管理 · Kirameku Admin",
  robots: { index: false, follow: false },
};

export default function AdminThemesPage() {
  return <ThemeManager />;
}

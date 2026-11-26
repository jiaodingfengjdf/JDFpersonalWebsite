"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Bookmark,
  DatabaseBackup,
  FileText,
  FolderKanban,
  FolderOpen,
  ImageIcon,
  Images,
  LayoutDashboard,
  MessageSquare,
  Navigation,
  Palette,
  ScrollText,
  Settings,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { INTEREST_LABEL, INTEREST_MODULES } from "@/lib/interest-modules";
import { navDropdownIcons } from "@/lib/nav-dropdown-icons";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const primaryItems: NavItem[] = [
  { href: "/admin", label: "仪表盘", icon: LayoutDashboard, exact: true },
  { href: "/admin/posts", label: "文章", icon: FileText },
  { href: "/admin/chatters", label: "说说", icon: MessageSquare },
  { href: "/admin/projects", label: "项目", icon: FolderKanban },
  { href: "/admin/comments", label: "评论", icon: MessageSquare },
  { href: "/admin/taxonomy", label: "分类 / 标签", icon: FolderOpen },
  { href: "/admin/collection", label: "收藏", icon: Bookmark },
  { href: "/admin/bookmarks", label: "收藏分类", icon: FolderOpen },
  { href: "/admin/albums", label: "相册", icon: Images },
  { href: "/admin/media", label: "媒体库", icon: ImageIcon },
  { href: "/admin/themes", label: "主题管理", icon: Palette },
  { href: "/admin/site-settings", label: "站点设置", icon: Settings },
  { href: "/admin/navigation", label: "导航菜单", icon: Navigation },
  { href: "/admin/site-config", label: "站点配置", icon: SlidersHorizontal },
  { href: "/admin/visitors", label: "访客", icon: Users },
  { href: "/admin/analytics", label: "统计", icon: BarChart3 },
  { href: "/admin/backups", label: "备份", icon: DatabaseBackup },
  { href: "/admin/notifications", label: "预警通知", icon: BellRing },
  { href: "/admin/audit", label: "操作审计", icon: ScrollText },
  { href: "/admin/account", label: "账号", icon: UserRound },
];

/** 兴趣模块的后台入口：顺序与前台 INTEREST_MODULES 完全一致。 */
const interestItems: NavItem[] = INTEREST_MODULES.flatMap((module) =>
  module.adminHref
    ? [
        {
          href: module.adminHref,
          label: module.label,
          icon: navDropdownIcons[module.icon],
        },
      ]
    : [],
);

function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              active
                ? "bg-sky-500/10 font-medium text-sky-700 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-none"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "size-4",
                active
                  ? "text-sky-600 dark:text-sky-300"
                  : "text-slate-400 dark:text-slate-500",
              )}
              aria-hidden
            />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

const groupTitleClass =
  "px-3 pb-2 pt-4 text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase first:pt-0 dark:text-slate-600";

export default function AdminNav() {
  return (
    <nav className="mt-8 space-y-1" aria-label="后台导航">
      <p className={groupTitleClass}>Workspace</p>
      <NavLinks items={primaryItems} />
      <p className={groupTitleClass}>{INTEREST_LABEL}</p>
      <NavLinks items={interestItems} />
    </nav>
  );
}

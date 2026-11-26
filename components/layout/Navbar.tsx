"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  Home,
  BookOpen,
  MessageSquare,
  FolderGit2,
  Camera,
  Clock,
  Music,
  Sun,
  Moon,
  Menu,
  X,
  Settings,
  Bookmark,
  ChevronDown,
  ExternalLink,
  Link2,
  Search,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import {
  isExternalHref,
  isInternalHref,
  isNavLinkActive,
  type NavDropdownConfig,
  type NavDropdownLink,
} from "@/lib/nav-dropdown";
import { navDropdownIcons } from "@/lib/nav-dropdown-icons";
import {
  defaultInterestDropdownConfig,
  INTEREST_MODULES,
  interestModuleByHref,
} from "@/lib/interest-modules";

const SettingsPanel = dynamic(() => import("@/components/ui/SettingsPanel"), { ssr: false });

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  blank?: boolean;
};

const navLinks: NavLink[] = [
  { href: "/", label: "首页", icon: Home },
  { href: "/posts", label: "文章", icon: BookOpen },
  { href: "/moments", label: "说说", icon: MessageSquare },
  { href: "/bookmark", label: "收藏", icon: Bookmark },
  { href: "/projects", label: "项目", icon: FolderGit2 },
  { href: "/photowall", label: "照片墙", icon: Camera },
  { href: "/timeline", label: "归档", icon: Clock },
  { href: "/music", label: "音乐", icon: Music },
  { href: "/assistant", label: "助理", icon: Sparkles },
];

function NavDropdownItem({
  link,
  pathname,
  onSelect,
  className,
}: {
  link: NavDropdownLink;
  pathname: string;
  onSelect: () => void;
  className: string;
}) {
  const external = isExternalHref(link.href);
  const matchedModule = !external ? interestModuleByHref(link.href) : undefined;
  const ItemIcon = matchedModule ? navDropdownIcons[matchedModule.icon] : null;
  const isActive = !external && isNavLinkActive(pathname, link.href);

  const resolvedClassName = `${className} focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
    isActive
      ? "bg-sky-500/12 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300 font-medium"
      : ""
  }`;

  const content = (
    <div className="flex items-start gap-2.5">
      {ItemIcon ? (
        <ItemIcon
          className={`mt-0.5 size-4 shrink-0 ${
            isActive
              ? "text-sky-600 dark:text-sky-400"
              : "text-slate-400 dark:text-slate-500"
          }`}
          aria-hidden="true"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{link.label}</span>
          {external ? (
            <ExternalLink className="size-3 shrink-0 opacity-50" aria-hidden />
          ) : null}
        </span>
        {link.description ? (
          <span className="block truncate text-[11px] opacity-70">
            {link.description}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!external && isInternalHref(link.href)) {
    return (
      <Link
        href={link.href}
        onClick={onSelect}
        aria-current={isActive ? "page" : undefined}
        className={resolvedClassName}
      >
        {content}
      </Link>
    );
  }

  return (
    <a
      href={link.href}
      onClick={onSelect}
      className={resolvedClassName}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {content}
    </a>
  );
}

function resolveAdminHref(pathname: string): string {
  const matchedInterest = INTEREST_MODULES.find(
    (module) =>
      module.adminHref &&
      (pathname === module.href || pathname.startsWith(`${module.href}/`)),
  );
  if (matchedInterest?.adminHref) return matchedInterest.adminHref;
  if (pathname === "/posts" || pathname.startsWith("/posts/")) return "/admin/posts";
  if (pathname === "/moments" || pathname.startsWith("/moments/")) return "/admin/chatters";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "/admin/projects";
  if (pathname === "/photowall" || pathname.startsWith("/photowall/")) return "/admin/albums";
  return "/admin";
}

export default function Navbar({
  navDropdown: initialNavDropdown,
}: {
  /** 服务端读取的导航配置，SSR 首屏即就绪，无需客户端重复拉取。 */
  navDropdown?: NavDropdownConfig;
} = {}) {
  const { profile } = useSiteSettings();
  const pathname = usePathname();
  const { toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const navDropdown = initialNavDropdown ?? defaultInterestDropdownConfig();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileGroupOpen, setIsMobileGroupOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const openedByHover = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (controller.signal.aborted) return;
        const session = payload as { isAdmin?: boolean } | null;
        setIsAdmin(Boolean(session?.isAdmin));
      })
      .catch(() => {
        // 会话检测失败时保持非管理员视图。
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        openedByHover.current = false;
        setIsDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        openedByHover.current = false;
        setIsSettingsOpen(false);
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // 子站页面隐藏主站导航栏
  if (pathname.startsWith("/garden")) return null;

  const activeDropdown =
    navDropdown.enabled && navDropdown.links.length > 0 ? navDropdown : null;
  const DropdownIcon = activeDropdown ? navDropdownIcons[activeDropdown.icon] : Link2;
  const dropdownActive = activeDropdown
    ? activeDropdown.links.some((link) => isNavLinkActive(pathname, link.href))
    : false;
  const dropdownItemClass =
    "block rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-sky-500/10 hover:text-sky-600 dark:text-slate-300 dark:hover:bg-sky-500/10 dark:hover:text-sky-300";
  const dropdownItemMobileClass =
    "block rounded-lg px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100/50 dark:text-slate-400 dark:hover:bg-slate-800/50";

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card rounded-none border-x-0 border-t-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 2xl:max-w-[86rem]">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              className="flex shrink-0 items-center space-x-0.5 whitespace-nowrap select-none"
            >
              <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                {profile.authorName}
              </span>
              <span className="text-xl font-bold text-sky-500 dark:text-sky-400" style={{ fontFamily: "serif" }}>
                的
              </span>
              <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                秘密小窝
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden min-w-0 items-center gap-x-1 xl:flex">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    target={link.blank ? "_blank" : undefined}
                    rel={link.blank ? "noopener noreferrer" : undefined}
                    className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition-all duration-200 2xl:px-3 ${
                      isActive
                        ? "text-sky-600 dark:text-sky-400"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{link.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="navbar-indicator"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-sky-500 rounded-full"
                        transition={{
                          type: "spring",
                          stiffness: 350,
                          damping: 30,
                        }}
                      />
                    )}
                  </Link>
                );
              })}

              {activeDropdown && (
                <div
                  ref={dropdownRef}
                  className="relative"
                  onMouseEnter={() => {
                    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
                    openedByHover.current = true;
                    setIsDropdownOpen(true);
                  }}
                  onMouseLeave={() => {
                    if (!openedByHover.current) return;
                    openedByHover.current = false;
                    setIsDropdownOpen(false);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (openedByHover.current) {
                        openedByHover.current = false;
                        return;
                      }
                      setIsDropdownOpen((open) => !open);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setIsDropdownOpen(false);
                      }
                    }}
                    aria-haspopup="true"
                    aria-expanded={isDropdownOpen}
                    aria-controls="navbar-dropdown-menu"
                    className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition-all duration-200 2xl:px-3 ${
                      dropdownActive
                        ? "text-sky-600 dark:text-sky-400"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    <DropdownIcon className="h-4 w-4 shrink-0" />
                    <span
                      className="max-w-[4rem] truncate"
                      title={activeDropdown.label}
                    >
                      {activeDropdown.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                    {dropdownActive && (
                      <motion.div
                        layoutId="navbar-indicator"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-sky-500 rounded-full"
                        transition={{
                          type: "spring",
                          stiffness: 350,
                          damping: 30,
                        }}
                      />
                    )}
                  </button>

                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div
                        id="navbar-dropdown-menu"
                        initial={{ opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute right-0 top-full z-50 w-64 origin-top-right pt-1"
                      >
                        <div className="rounded-2xl border border-white/50 bg-white/90 p-2 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
                          <ul className="max-h-[min(24rem,calc(100dvh-6rem))] space-y-0.5 overflow-y-auto overscroll-contain">
                            {activeDropdown.links.map((link) => (
                              <li key={`${link.label}-${link.href}`}>
                                <NavDropdownItem
                                  link={link}
                                  pathname={pathname}
                                  onSelect={() => setIsDropdownOpen(false)}
                                  className={dropdownItemClass}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Quick Command, Theme Toggle, Settings & Mobile Menu */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isAdmin && (
                <Link
                  href={resolveAdminHref(pathname)}
                  title="前往管理后台"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>后台</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  window.dispatchEvent(new CustomEvent("open-command-palette"));
                }}
                title="快速搜索与跳转 (/ 或 Ctrl+Shift+K)"
                aria-label="打开全局搜索与命令面板"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 bg-white/40 dark:bg-slate-800/50 hover:bg-white/70 dark:hover:bg-slate-700/70 border border-white/40 dark:border-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <Search className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <kbd className="hidden sm:inline-block rounded bg-slate-200/70 dark:bg-slate-700/80 px-1.5 py-0.5 font-mono text-[11px] leading-none text-slate-600 dark:text-slate-300">
                  /
                </kbd>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                title="切换明暗主题"
                aria-label="切换明暗主题"
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <Sun className="hidden dark:block w-5 h-5" />
                <Moon className="block dark:hidden w-5 h-5" />
              </button>

              <div className="relative" ref={settingsRef}>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  title="设置"
                  aria-label="打开外观设置"
                  className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {isSettingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <SettingsPanel onClose={() => setIsSettingsOpen(false)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? "收起菜单" : "展开菜单"}
                aria-expanded={isMobileMenuOpen}
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100/50 dark:text-slate-400 dark:hover:bg-slate-800/50 xl:hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {activeDropdown ? (
        <noscript>
          <div style={{ padding: "4.5rem 1rem 1rem" }}>
            <p>{activeDropdown.label}</p>
            <ul>
              {activeDropdown.links.map((link) => (
                <li key={`${link.label}-${link.href}`}>
                  <a href={link.href}>
                    {link.label}
                    {link.description ? `：${link.description}` : ""}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </noscript>
      ) : null}

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain glass-card rounded-none border-x-0 xl:hidden"
          >
            <div className="p-4 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    target={link.blank ? "_blank" : undefined}
                    rel={link.blank ? "noopener noreferrer" : undefined}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{link.label}</span>
                  </Link>
                );
              })}

              {activeDropdown && (
                <div className="mt-1 border-t border-slate-200/60 pt-1 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsMobileGroupOpen((open) => !open)}
                    aria-expanded={isMobileGroupOpen}
                    aria-controls="navbar-mobile-dropdown"
                    className={`flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                      dropdownActive
                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <DropdownIcon className="w-5 h-5" />
                      <span className="font-medium">{activeDropdown.label}</span>
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${isMobileGroupOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isMobileGroupOpen && (
                      <motion.div
                        id="navbar-mobile-dropdown"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1 pb-1 pl-6">
                          {activeDropdown.links.map((link) => (
                            <NavDropdownItem
                              key={`${link.label}-${link.href}`}
                              link={link}
                              pathname={pathname}
                              onSelect={() => setIsMobileMenuOpen(false)}
                              className={dropdownItemMobileClass}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

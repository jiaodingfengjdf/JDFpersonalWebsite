import { Geist_Mono } from "next/font/google";
import "highlight.js/styles/vs2015.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemePresetProvider } from "@/components/providers/ThemePresetProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { BackgroundProvider } from "@/components/providers/BackgroundProvider";
import { MusicProvider } from "@/components/providers/MusicProvider";
import { EffectProvider } from "@/components/providers/EffectProvider";
import { SiteSettingsProvider } from "@/components/providers/SiteSettingsProvider";
import BackgroundRenderer from "@/components/layout/BackgroundRenderer";
import Navbar from "@/components/layout/Navbar";
import ClientWidgets from "@/components/layout/ClientWidgets";
import ClickEffect from "@/components/ui/ClickEffect";
import RadialMenu from "@/components/ui/RadialMenu";
import MouseTrail from "@/components/ui/MouseTrail";
import SeasonalEffect from "@/components/ui/SeasonalEffect";
import KiraSparkle from "@/components/ui/KiraSparkle";
import VisitorTracker from "@/components/layout/VisitorTracker";
import { WELCOME_SESSION_KEY } from "@/lib/welcome";
import { defaultInterestDropdownConfig } from "@/lib/interest-modules";
import {
  NAV_DROPDOWN_CONFIG_KEY,
  parseNavDropdownConfig,
  type NavDropdownConfig,
} from "@/lib/nav-dropdown";
import { logError } from "@/server/http/logger";
import { getSiteConfigService } from "@/server/modules/site-config";
import { loadSiteSettings } from "@/server/modules/site-settings";
import { getThemesService } from "@/server/modules/themes";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * 服务端读取导航栏「兴趣」配置。
 *
 * 必须在 SSR 阶段就有值：否则爬虫与无 JS 环境看到的 HTML 里根本没有这个栏目。
 * 数据库缺失 / JSON 损坏 / 解析为空时统一回落到默认菜单，栏目永不消失。
 * 返回值是纯对象，可以安全地作为 prop 传给客户端组件。
 */
async function loadNavDropdownConfig(): Promise<NavDropdownConfig> {
  try {
    const config = await getSiteConfigService().getPublic();
    const parsed = parseNavDropdownConfig(config[NAV_DROPDOWN_CONFIG_KEY]);
    return parsed.links.length > 0 ? parsed : defaultInterestDropdownConfig();
  } catch (error) {
    logError("Failed to load nav dropdown, falling back to defaults", error);
    return defaultInterestDropdownConfig();
  }
}

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Site settings are read once per render here and handed to client components
  // through context, so the navbar, background and widgets all render the
  // admin-configured values on the first paint.
  const [settings, themes, navDropdown] = await Promise.all([
    loadSiteSettings(),
    getThemesService().listPublic(),
    loadNavDropdownConfig(),
  ]);
  const bootMode = themes.active?.mode ?? "auto";

  return (
    <SiteSettingsProvider value={settings}>
      {/*
        阻塞式引导脚本：在首次绘制前确定「欢迎屏是否已看」与「明暗主题」，
        这样服务端 HTML 不必猜测客户端状态，也就不会产生水合不匹配
        （主题相关的图标改用 CSS 切换，见 Navbar）。
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var s=sessionStorage.getItem(${JSON.stringify(WELCOME_SESSION_KEY)});if(s||location.pathname!=="/"){document.documentElement.classList.add("welcome-seen")}else{sessionStorage.setItem(${JSON.stringify(WELCOME_SESSION_KEY)},"1")}}catch(e){}try{var t=localStorage.getItem("theme-mode")||${JSON.stringify(bootMode)};if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.dataset.theme=t;localStorage.setItem("theme",t);}catch(e){}`,
        }}
      />
      <ThemePresetProvider active={themes.active} presets={themes.presets}>
        <ThemeProvider>
        <EffectProvider>
        <BackgroundProvider>
          <MusicProvider>
            <ToastProvider>
              <div
                className={`${geistMono.variable} flex min-h-screen flex-col`}
              >
                <BackgroundRenderer />
                <VisitorTracker />
                <ClickEffect />
                <RadialMenu />
                <MouseTrail />
                <SeasonalEffect />
                <KiraSparkle />
                <Navbar navDropdown={navDropdown} />
                <main className="flex-1 pt-16">{children}</main>
                <ClientWidgets />
              </div>
            </ToastProvider>
          </MusicProvider>
        </BackgroundProvider>
      </EffectProvider>
        </ThemeProvider>
      </ThemePresetProvider>
    </SiteSettingsProvider>
  );
}

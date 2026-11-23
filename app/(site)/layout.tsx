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
import { loadSiteSettings } from "@/server/modules/site-settings";
import { getThemesService } from "@/server/modules/themes";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Site settings are read once per render here and handed to client components
  // through context, so the navbar, background and widgets all render the
  // admin-configured values on the first paint.
  const [settings, themes] = await Promise.all([
    loadSiteSettings(),
    getThemesService().listPublic(),
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
                <Navbar />
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

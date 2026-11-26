/**
 * 助理嵌进站点后，深/浅色与 CSS 变量都收敛在 .assistant-root 容器上，
 * 并实时跟随站点 <html> 的 `.dark` / `data-theme` 切换，绝不反向改写 <html>。
 */
export type ResolvedTheme = "light" | "dark";

let observerAttached = false;

/** 读取站点当前的真实明暗主题（优先 <html class="dark"> / <html data-theme>）。 */
export function resolveSiteTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  const attr = root.dataset.theme;
  if (attr === "dark" || attr === "light") return attr;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

/** 将站点主题同步到 .assistant-root[data-theme]，供 Mermaid 等脚本读取。 */
export function syncThemeHost(): ResolvedTheme {
  const resolved = resolveSiteTheme();
  if (typeof document === "undefined") return resolved;
  const host = document.querySelector<HTMLElement>(".assistant-root");
  if (host && host.getAttribute("data-theme") !== resolved) {
    host.setAttribute("data-theme", resolved);
  }
  return resolved;
}

function ensureSiteThemeObserver(): void {
  if (observerAttached || typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return;
  }
  observerAttached = true;
  const observer = new MutationObserver(() => {
    syncThemeHost();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
}

export function themeHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  ensureSiteThemeObserver();
  const host = document.querySelector<HTMLElement>(".assistant-root");
  if (host && !host.getAttribute("data-theme")) {
    host.setAttribute("data-theme", resolveSiteTheme());
  }
  return host;
}

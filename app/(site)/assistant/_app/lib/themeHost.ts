/**
 * 助理嵌进站点后，深/浅色与 CSS 变量都收敛在 .assistant-root 容器上，
 * 不再改写 <html data-theme>，避免影响站点主题。
 */
export function themeHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".assistant-root");
}

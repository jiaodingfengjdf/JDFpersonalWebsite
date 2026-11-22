"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useThemePreset } from "@/components/providers/ThemePresetProvider";

type Theme = "light" | "dark";
type ThemeMode = Theme | "auto";

interface ThemeContextType {
  theme: Theme;
  /** 访客的明暗偏好：auto 跟随系统。 */
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  mode: "auto",
  toggleTheme: () => {},
  setTheme: () => {},
  setMode: () => {},
});

const MODE_KEY = "theme-mode";
const LEGACY_KEY = "theme";

function systemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The blocking bootstrap script in `app/layout.tsx` already resolved the theme
 *  before React hydrated; read that decision back instead of guessing. */
function readBootstrappedTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  try {
    // 兼容旧的 `theme` 键（内联引导脚本与第三方组件仍会读它）。
    localStorage.setItem(LEGACY_KEY, theme);
  } catch {
    // 隐私模式下 localStorage 可能不可写，主题仍应在本次会话内生效。
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preset = useThemePreset();
  const presetMode = (preset.current?.mode ?? "auto") as ThemeMode;

  const [theme, setThemeState] = useState<Theme>(readBootstrappedTheme);
  const [mode, setModeState] = useState<ThemeMode>(presetMode);

  const apply = useCallback((nextMode: ThemeMode) => {
    const resolved: Theme = nextMode === "auto" ? systemTheme() : nextMode;
    setThemeState(resolved);
    applyTheme(resolved);
    return resolved;
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- 从本地偏好 / 主题预设恢复明暗模式 */
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MODE_KEY);
    } catch {
      stored = null;
    }
    const initial: ThemeMode =
      stored === "light" || stored === "dark" || stored === "auto" ? stored : presetMode;
    setModeState(initial);
    apply(initial);
  }, [presetMode, apply]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // auto 模式下跟随系统切换
  useEffect(() => {
    if (mode !== "auto") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media?.addEventListener) return;
    const handler = () => {
      const resolved: Theme = media.matches ? "dark" : "light";
      setThemeState(resolved);
      applyTheme(resolved);
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [mode]);

  const persistMode = useCallback(
    (nextMode: ThemeMode) => {
      setModeState(nextMode);
      apply(nextMode);
      try {
        localStorage.setItem(MODE_KEY, nextMode);
      } catch {
        // ignore
      }
    },
    [apply],
  );

  const setMode = useCallback((nextMode: ThemeMode) => persistMode(nextMode), [persistMode]);

  const setTheme = useCallback((nextTheme: Theme) => persistMode(nextTheme), [persistMode]);

  const toggleTheme = useCallback(() => {
    // 以 DOM 为准，避免快速连点或跨标签页时状态与真实主题漂移。
    const current: Theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    persistMode(current === "dark" ? "light" : "dark");
  }, [persistMode]);

  const value = useMemo(
    () => ({ theme, mode, toggleTheme, setTheme, setMode }),
    [theme, mode, toggleTheme, setTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

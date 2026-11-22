"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo } from "react";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import { useThemePreset } from "@/components/providers/ThemePresetProvider";

interface BackgroundContextType {
  bgImage: string;
  bgBlur: number;
  /** 当前主题是否为渐变主题（渐变时忽略 bgImage）。 */
  useGradient: boolean;
  gradientColors: string[];
  /** 当前可选的背景图列表（主题图集或站点图集）。 */
  images: string[];
  setBgImage: (img: string) => void;
  setBgBlur: (blur: number) => void;
}

const BackgroundContext = createContext<BackgroundContextType>({
  bgImage: "",
  bgBlur: 0,
  useGradient: false,
  gradientColors: [],
  images: [],
  setBgImage: () => {},
  setBgBlur: () => {},
});

export function useBackground() {
  return useContext(BackgroundContext);
}

const IMAGE_KEY = "bg-image";
const BLUR_KEY = "bg-blur";

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const { appearance } = useSiteSettings();
  const { current } = useThemePreset();

  const presetIsGradient = current?.kind === "gradient";
  const images = useMemo(
    () => (current && current.kind === "image" ? current.images : appearance.bgImages),
    [current, appearance.bgImages],
  );
  const gradientColors = useMemo(
    () => (presetIsGradient && current?.colors.length ? current.colors : appearance.themeColors),
    [presetIsGradient, current, appearance.themeColors],
  );
  const useGradient = presetIsGradient || (!current && appearance.useGradient);

  const [bgImage, setBgImage] = useState(images[images.length - 1] ?? "");
  const [bgBlur, setBgBlur] = useState(current?.blur ?? 20);
  const [mounted, setMounted] = useState(false);
  /** 记住上一次的主题，切换主题时按新主题的默认模糊度走，而不是沿用旧值。 */
  const presetRef = useRef<number | null>(current?.id ?? null);

  // Restore persisted preferences after hydration; server render uses defaults.
  /* eslint-disable react-hooks/set-state-in-effect -- restore persisted client preferences after hydration */
  useEffect(() => {
    const presetChanged = presetRef.current !== (current?.id ?? null);
    presetRef.current = current?.id ?? null;

    let savedImg: string | null = null;
    let savedBlur: string | null = null;
    try {
      savedImg = localStorage.getItem(IMAGE_KEY);
      savedBlur = localStorage.getItem(BLUR_KEY);
    } catch {
      savedImg = null;
      savedBlur = null;
    }

    setBgImage(savedImg && images.includes(savedImg) ? savedImg : (images[images.length - 1] ?? ""));
    // 换主题时应用该主题自带的模糊度；否则沿用访客手动调过的值。
    setBgBlur(!presetChanged && savedBlur ? Number(savedBlur) : (current?.blur ?? 20));
    setMounted(true);
  }, [images, current]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(IMAGE_KEY, bgImage);
    } catch {
      // ignore
    }
  }, [bgImage, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(BLUR_KEY, String(bgBlur));
    } catch {
      // ignore
    }
  }, [bgBlur, mounted]);

  return (
    <BackgroundContext.Provider
      value={{ bgImage, bgBlur, useGradient, gradientColors, images, setBgImage, setBgBlur }}
    >
      {children}
    </BackgroundContext.Provider>
  );
}

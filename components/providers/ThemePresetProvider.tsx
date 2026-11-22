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
import type { ThemePresetPublic } from "@/server/modules/themes/contracts";

interface ThemePresetContextValue {
  /** 站点默认主题 + 全部可选主题（服务端注入）。 */
  active: ThemePresetPublic | null;
  presets: ThemePresetPublic[];
  /** 访客当前选中的主题；null 表示跟随站点默认。 */
  current: ThemePresetPublic | null;
  presetId: number | null;
  setPresetId: (id: number | null) => void;
}

const ThemePresetContext = createContext<ThemePresetContextValue>({
  active: null,
  presets: [],
  current: null,
  presetId: null,
  setPresetId: () => {},
});

export function useThemePreset() {
  return useContext(ThemePresetContext);
}

const STORAGE_KEY = "theme-preset";

export function ThemePresetProvider({
  active,
  presets,
  children,
}: {
  active: ThemePresetPublic | null;
  presets: ThemePresetPublic[];
  children: ReactNode;
}) {
  const [presetId, setPresetIdState] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  // 访客的选择只存本地，不写库；服务器渲染阶段先用站点默认，避免闪烁。
  /* eslint-disable react-hooks/set-state-in-effect -- restore persisted client preference after hydration */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && presets.some((preset) => String(preset.id) === saved)) {
      setPresetIdState(Number(saved));
    }
    setMounted(true);
  }, [presets]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setPresetId = useCallback((id: number | null) => {
    setPresetIdState(id);
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  const value = useMemo<ThemePresetContextValue>(() => {
    const selected = presetId === null ? null : presets.find((item) => item.id === presetId) ?? null;
    return {
      active,
      presets,
      current: selected ?? active ?? (mounted ? null : active),
      presetId,
      setPresetId,
    };
  }, [active, presets, presetId, setPresetId, mounted]);

  return <ThemePresetContext.Provider value={value}>{children}</ThemePresetContext.Provider>;
}

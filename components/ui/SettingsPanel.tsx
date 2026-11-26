"use client";

import { useState } from "react";
import Image from "next/image";
import { useBackground } from "@/components/providers/BackgroundProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useThemePreset } from "@/components/providers/ThemePresetProvider";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import { bypassImageOptimization } from "@/lib/image";

export default function SettingsPanel({ onClose: _onClose }: { onClose: () => void }) {
  const { bgImage, bgBlur, setBgImage, setBgBlur, images, useGradient } = useBackground();
  const { theme, mode, setMode } = useTheme();
  const { presets, active, presetId, setPresetId } = useThemePreset();
  const { appearance } = useSiteSettings();
  const currentIndex = images.indexOf(bgImage);
  const [showGrid, setShowGrid] = useState(false);

  const hasImageBackground = !useGradient && images.length > 0 && Boolean(bgImage);

  function prev() {
    if (images.length === 0) return;
    const idx = (currentIndex - 1 + images.length) % images.length;
    setBgImage(images[idx]);
  }

  function next() {
    if (images.length === 0) return;
    const idx = (currentIndex + 1) % images.length;
    setBgImage(images[idx]);
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5.5rem)] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-white/50 bg-white/92 p-4 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/92">
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">外观与主题</h3>
      </div>

      {/* 主题预设 */}
      <div className={hasImageBackground ? "mb-4" : ""}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            主题风格
          </label>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {presetId === null ? `站点默认${active ? ` · ${active.name}` : ""}` : "自定义"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setPresetId(null)}
            className={`relative h-12 overflow-hidden rounded-lg border text-[11px] font-medium transition-all ${
              presetId === null
                ? "border-sky-500 ring-1 ring-sky-400"
                : "border-slate-200/70 hover:border-sky-300 dark:border-white/10"
            }`}
            style={{
              background:
                active?.kind === "image" && (active.cover || active.images[0])
                  ? `url(${active.cover || active.images[0]}) center/cover`
                  : `linear-gradient(135deg, ${(active?.colors.length ? active.colors : appearance.themeColors).join(", ")})`,
            }}
            title="跟随站点默认主题"
          >
            <span className="absolute inset-0 bg-slate-950/35" />
            <span className="relative text-white">默认</span>
          </button>

          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setPresetId(preset.id)}
              className={`relative h-12 overflow-hidden rounded-lg border text-[11px] font-medium transition-all ${
                presetId === preset.id
                  ? "border-sky-500 ring-1 ring-sky-400"
                  : "border-slate-200/70 hover:border-sky-300 dark:border-white/10"
              }`}
              style={{
                background:
                  preset.kind === "image" && (preset.cover || preset.images[0])
                    ? `url(${preset.cover || preset.images[0]}) center/cover`
                    : `linear-gradient(135deg, ${preset.colors.join(", ")})`,
              }}
              title={preset.description || preset.name}
            >
              <span className="absolute inset-0 bg-slate-950/35" />
              <span className="relative line-clamp-2 px-1 text-white">{preset.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-1 rounded-lg bg-slate-100/80 p-0.5 dark:bg-slate-800/70">
          {(
            [
              ["auto", "跟随系统"],
              ["light", "浅色"],
              ["dark", "深色"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                mode === value
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              title={value === "auto" ? `当前系统：${theme === "dark" ? "深色" : "浅色"}` : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 仅在图片型主题下展示背景图切换与模糊调节 */}
      {hasImageBackground && (
        <>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                背景图
              </label>
              {images.length > 1 && (
                <button
                  type="button"
                  title="查看全部背景"
                  onClick={() => setShowGrid(!showGrid)}
                  className="w-5 h-5 rounded flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    {showGrid ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    )}
                  </svg>
                </button>
              )}
            </div>

            {showGrid && images.length > 1 && (
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {images.map((img) => (
                  <button
                    key={img}
                    type="button"
                    title="选择此背景"
                    onClick={() => {
                      setBgImage(img);
                      setShowGrid(false);
                    }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video ${
                      bgImage === img
                        ? "border-sky-500 ring-1 ring-sky-500/30"
                        : "border-transparent hover:border-sky-300"
                    }`}
                  >
                    <Image
                      src={img}
                      alt="背景"
                      fill
                      sizes="80px"
                      unoptimized={bypassImageOptimization(img)}
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="relative rounded-xl overflow-hidden border-2 border-white/30 dark:border-white/10 aspect-video">
              <Image
                src={bgImage}
                alt="当前背景"
                fill
                sizes="288px"
                unoptimized={bypassImageOptimization(bgImage)}
                className="object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    title="上一张"
                    onClick={prev}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="下一张"
                    onClick={next}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
              背景模糊度
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                title="背景模糊度"
                value={bgBlur}
                onChange={(e) => setBgBlur(Number(e.target.value))}
                className="flex-1 h-1.5 bg-white/40 dark:bg-slate-700/50 rounded-full appearance-none outline-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #0284c7 ${(bgBlur / 20) * 100}%, rgba(148,163,184,0.4) ${(bgBlur / 20) * 100}%)`,
                }}
              />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-10 text-right">
                {bgBlur}px
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

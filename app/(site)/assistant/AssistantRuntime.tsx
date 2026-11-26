"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";
import type {
  AssistantAuthSnapshot,
  AssistantPublicConfig,
} from "./_app/state/store";
import "./_app/styles/app.scoped.css";
import "./_app/ui/markdown.scoped.css";
import "./_app/features/agent/agent.scoped.css";
import "./_app/styles/override.css";

export interface AssistantRuntimeProps {
  initialAuth: AssistantAuthSnapshot;
  initialPublicConfig: AssistantPublicConfig;
}

/**
 * 助理源码已并入 app/(site)/assistant/_app，作为一个客户端 React 子树渲染。
 * - 只在前端挂载（ssr:false）：它的 store 在模块初始化时就依赖 window / IndexedDB。
 * - 样式已收敛到 .assistant-root 作用域，不影响站点其它页面。
 * - 自动同步全站 ThemeProvider 的浅色 / 深色主题到 .assistant-root[data-theme]。
 */
const AssistantApp = dynamic(() => import("./_app/App"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center p-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/40 bg-white/55 px-8 py-6 text-center shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-800/55">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          正在唤醒私人 AI 助理…
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          正在同步对话环境与权限状态
        </p>
      </div>
    </div>
  ),
});

export default function AssistantRuntime({
  initialAuth,
  initialPublicConfig,
}: AssistantRuntimeProps) {
  const { theme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }, [theme]);

  return (
    <div
      ref={rootRef}
      data-theme={theme === "dark" ? "dark" : "light"}
      className="assistant-root fixed inset-x-0 bottom-0 top-16 z-30 overflow-hidden"
    >
      <AssistantApp
        initialAuth={initialAuth}
        initialPublicConfig={initialPublicConfig}
      />
    </div>
  );
}

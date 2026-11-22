"use client";

import dynamic from "next/dynamic";
import "./_app/styles/app.scoped.css";
import "./_app/ui/markdown.scoped.css";
import "./_app/features/agent/agent.scoped.css";
import "./_app/styles/override.css";

/**
 * 助理源码已并入 app/(site)/assistant/_app，作为一个客户端 React 子树渲染。
 * - 只在前端挂载（ssr:false）：它的 store 在模块初始化时就依赖 window / IndexedDB。
 * - 样式已收敛到 .assistant-root 作用域，不影响站点其它页面。
 */
const AssistantApp = dynamic(() => import("./_app/App"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-slate-400">正在启动助理…</div>
  ),
});

export default function AssistantRuntime() {
  return (
    <div className="assistant-root fixed inset-x-0 bottom-0 top-16 z-30 overflow-hidden">
      <AssistantApp />
    </div>
  );
}

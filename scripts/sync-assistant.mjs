#!/usr/bin/env node
/**
 * 把外部「chatbot私人助理」项目同步进本站。
 *
 *   <外部项目>/src  →  app/(site)/assistant/_app
 *
 * 同步后自动完成站点化改造（上游代码本身不动，只改副本）：
 *   1. styles/app.css、ui/markdown.css、features/agent/agent.css
 *      收敛成 *.scoped.css，全部选择器挂到 .assistant-root 下；
 *   2. 主题写入/读取从 <html data-theme> 改到容器（新增 _app/lib/themeHost.ts）；
 *   3. CSS import 改指向 scoped 版本；
 *   4. 删掉 main.tsx（入口由站点页面挂载）；
 *   5. 生成 override.css，锁住 .app/.chat-screen 高度，避免输入框被裁；
 *   6. 缺失时补出 AssistantRuntime.tsx / page.tsx 两个站点外壳文件。
 *
 * 用法：
 *   node scripts/sync-assistant.mjs /path/to/chatbot私人助理
 *   ASSISTANT_SRC=/path/to/chatbot私人助理 node scripts/sync-assistant.mjs
 *
 * 选项：
 *   --dry-run   只打印将要做的改动，不写文件
 *   --check     同步完成后执行 npx tsc --noEmit
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const SITE_ROOT = process.cwd();
const TARGET = path.join(SITE_ROOT, "app", "(site)", "assistant", "_app");
const RUNTIME = path.join(SITE_ROOT, "app", "(site)", "assistant", "AssistantRuntime.tsx");
const PAGE = path.join(SITE_ROOT, "app", "(site)", "assistant", "page.tsx");

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positional = args.filter((arg) => !arg.startsWith("--"));
const dryRun = flags.has("--dry-run");
const runCheck = flags.has("--check");

const sourceRoot = positional[0] ?? process.env.ASSISTANT_SRC ?? "";

const warnings = [];
const applied = [];

function note(message) {
  applied.push(message);
  console.log(`  ✓ ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`  ! ${message}`);
}

/* ------------------------------------------------------------------ */
/* CSS 作用域收敛                                                      */
/* ------------------------------------------------------------------ */

function scopeSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(",")
    .map((part) => {
      let sel = part.trim();
      if (!sel) return sel;
      sel = sel.replace(/^:root(\[data-theme='([a-z]+)'\])?/, (_, attr) =>
        attr ? `.assistant-root${attr}` : ".assistant-root",
      );
      if (sel.startsWith(".assistant-root")) return sel;
      if (/^(html|body)$/.test(sel)) return ".assistant-root";
      if (/^[a-zA-Z]/.test(sel) || /^\*/.test(sel) || /^::?/.test(sel)) {
        return `.assistant-root ${sel}`;
      }
      return sel;
    })
    .join(", ");
}

function scopeCss(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    const brace = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (semi !== -1 && (brace === -1 || semi < brace)) {
      out += css.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    if (brace === -1) {
      out += css.slice(i);
      break;
    }
    const prelude = css.slice(i, brace).trim();
    let depth = 0;
    let j = brace;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = css.slice(brace + 1, j);
    if (prelude.startsWith("@")) {
      if (/^@(keyframes|-webkit-keyframes|font-face|page)/.test(prelude)) {
        out += `${prelude}{${body}}`;
      } else {
        out += `${prelude}{${scopeCss(body)}}`;
      }
    } else {
      out += `${scopeSelector(prelude)}{${body}}`;
    }
    i = j + 1;
  }
  return out;
}

const CSS_FILES = [
  ["styles/app.css", "styles/app.scoped.css"],
  ["ui/markdown.css", "ui/markdown.scoped.css"],
  ["features/agent/agent.css", "features/agent/agent.scoped.css"],
];

/* ------------------------------------------------------------------ */
/* 文本补丁                                                            */
/* ------------------------------------------------------------------ */

async function patchFile(relPath, patches) {
  const file = path.join(TARGET, relPath);
  if (!existsSync(file)) {
    warn(`缺少文件 ${relPath}，跳过`);
    return;
  }
  let text = await readFile(file, "utf8");
  for (const patch of patches) {
    if (text.includes(patch.marker)) {
      note(`${relPath}: 已是目标状态（${patch.label}）`);
      continue;
    }
    if (!text.includes(patch.find)) {
      warn(`${relPath}: 未匹配到「${patch.label}」，上游可能已改动，请人工确认`);
      continue;
    }
    text = text.replace(patch.find, patch.replace);
    note(`${relPath}: ${patch.label}`);
  }
  if (!dryRun) await writeFile(file, text, "utf8");
}

const THEME_HOST = `/**
 * 助理嵌进站点后，深/浅色与 CSS 变量都收敛在 .assistant-root 容器上，
 * 不再改写 <html data-theme>，避免影响站点主题。
 */
export function themeHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".assistant-root");
}
`;

const OVERRIDE_CSS = `/* 站点内嵌时的布局兜底：确保助理铺满容器、底部输入框不被裁掉 */
.assistant-root {
  height: auto !important;
}

.assistant-root .app {
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden;
}

.assistant-root .chat-screen,
.assistant-root .settings-screen {
  height: 100% !important;
  min-height: 0 !important;
}

.assistant-root .messages {
  min-height: 0;
}
`;

const RUNTIME_TSX = `"use client";

import dynamic from "next/dynamic";
import "./_app/styles/app.scoped.css";
import "./_app/ui/markdown.scoped.css";
import "./_app/features/agent/agent.scoped.css";
import "./_app/styles/override.css";

/**
 * 助理源码在 app/(site)/assistant/_app（由 scripts/sync-assistant.mjs 同步）。
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
`;

const PAGE_TSX = `import type { Metadata } from "next";
import AssistantRuntime from "./AssistantRuntime";

export const metadata: Metadata = {
  title: "私人 AI 助理",
  description: "站内 AI 助理（DeepSeek）：对话、记忆与设置只保存在本机浏览器。",
};

export default function AssistantPage() {
  return <AssistantRuntime />;
}
`;

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  if (!sourceRoot) {
    console.error("缺少外部项目路径。用法：node scripts/sync-assistant.mjs <chatbot私人助理目录>");
    process.exit(1);
  }
  const src = path.resolve(sourceRoot);
  const srcApp = path.join(src, "src");
  if (!existsSync(path.join(srcApp, "App.tsx"))) {
    console.error(`不是有效的助理项目（找不到 ${path.join(srcApp, "App.tsx")}）：${src}`);
    process.exit(1);
  }

  console.log(`源项目：${src}`);
  console.log(`目标目录：${path.relative(SITE_ROOT, TARGET)}${dryRun ? "（dry-run，不写入）" : ""}`);

  if (dryRun) {
    const entries = await readdir(srcApp, { withFileTypes: true });
    console.log(`  将复制 ${entries.length} 个顶层条目`);
  } else {
    await rm(TARGET, { recursive: true, force: true });
    await mkdir(path.dirname(TARGET), { recursive: true });
    await cp(srcApp, TARGET, { recursive: true });
    note(`复制源码 ${path.relative(SITE_ROOT, srcApp)} → ${path.relative(SITE_ROOT, TARGET)}`);
  }

  if (!existsSync(TARGET) && !dryRun) {
    console.error("复制失败：目标目录不存在");
    process.exit(1);
  }

  /* 1. CSS 作用域 */
  for (const [from, to] of CSS_FILES) {
    const file = path.join(TARGET, from);
    if (!existsSync(file)) {
      warn(`缺少 ${from}，跳过作用域化`);
      continue;
    }
    const css = await readFile(file, "utf8");
    const scoped = scopeCss(css).replace(/height: 100vh;\s*\n\s*height: 100dvh;/g, "height: 100%;");
    if (!dryRun) await writeFile(path.join(TARGET, to), scoped, "utf8");
    note(`${from} → ${to}（${css.length} → ${scoped.length} bytes）`);
  }

  /* 2. 主题宿主 */
  if (!dryRun) {
    await mkdir(path.join(TARGET, "lib"), { recursive: true });
    await writeFile(path.join(TARGET, "lib/themeHost.ts"), THEME_HOST, "utf8");
  }
  note("写入 lib/themeHost.ts");

  /* 3. store.ts 主题写入 */
  await patchFile("state/store.ts", [
    {
      marker: 'themeHost()?.setAttribute("data-theme"',
      label: "主题写入改到容器",
      find: "  document.documentElement.dataset.theme = dark ? 'dark' : 'light';",
      replace: '  themeHost()?.setAttribute("data-theme", dark ? "dark" : "light");',
    },
    {
      marker: "import { themeHost } from '../lib/themeHost';",
      label: "补充 themeHost import",
      find: "import { uid } from '../lib/uid';",
      replace: "import { uid } from '../lib/uid';\nimport { themeHost } from '../lib/themeHost';",
    },
  ]);

  /* 4. markdown.tsx 主题读取 + CSS 指向 */
  await patchFile("ui/markdown.tsx", [
    {
      marker: "import './markdown.scoped.css'",
      label: "CSS 指向 scoped 版本",
      find: "import './markdown.css'",
      replace: "import './markdown.scoped.css'",
    },
    {
      marker: "themeHost()?.dataset.theme",
      label: "主题读取改到容器",
      find: "return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default'",
      replace: "return themeHost()?.dataset.theme === 'dark' ? 'dark' : 'default'",
    },
    {
      marker: "from '../lib/themeHost'",
      label: "补充 themeHost import",
      find: "import type { Citation } from '../api/types'",
      replace: "import type { Citation } from '../api/types'\nimport { themeHost } from '../lib/themeHost'",
    },
  ]);

  /* 5. AgentPanel CSS 指向 */
  await patchFile("features/agent/AgentPanel.tsx", [
    {
      marker: "import './agent.scoped.css';",
      label: "CSS 指向 scoped 版本",
      find: "import './agent.css';",
      replace: "import './agent.scoped.css';",
    },
  ]);

  /* 6. 删掉 Vite 入口 */
  const mainFile = path.join(TARGET, "main.tsx");
  if (existsSync(mainFile)) {
    if (!dryRun) await rm(mainFile, { force: true });
    note("移除 main.tsx（站点页面负责挂载）");
  }

  /* 7. 布局兜底 */
  if (!dryRun) {
    await mkdir(path.join(TARGET, "styles"), { recursive: true });
    await writeFile(path.join(TARGET, "styles/override.css"), OVERRIDE_CSS, "utf8");
  }
  note("写入 styles/override.css");

  /* 8. 站点外壳文件 */
  for (const [file, content, label] of [
    [RUNTIME, RUNTIME_TSX, "AssistantRuntime.tsx"],
    [PAGE, PAGE_TSX, "page.tsx"],
  ]) {
    if (!existsSync(file)) {
      if (!dryRun) await writeFile(file, content, "utf8");
      note(`补出 ${label}`);
    }
  }

  /* 9. 校验目录结构 */
  const required = ["App.tsx", "state/store.ts", "ui/markdown.tsx", "api/client.ts"];
  for (const rel of required) {
    if (!existsSync(path.join(TARGET, rel))) warn(`缺少必要文件 ${rel}`);
  }

  console.log(`\n完成：${applied.length} 项改动，${warnings.length} 条警告`);
  if (warnings.length > 0) {
    console.log("警告明细：");
    for (const item of warnings) console.log(`  - ${item}`);
  }

  if (runCheck) {
    console.log("\n执行 npx tsc --noEmit …");
    try {
      execSync("npx tsc --noEmit", { stdio: "inherit", cwd: SITE_ROOT });
      console.log("typecheck 通过");
    } catch {
      console.error("typecheck 失败，请按上面的报错修上游差异");
      process.exitCode = 1;
    }
  }

  if (warnings.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

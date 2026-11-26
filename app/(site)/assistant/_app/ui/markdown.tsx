/**
 * Markdown 渲染器（手机端阅读优化）。
 *
 * 关键取舍：
 * - markdown-it / 高亮逻辑是模块级单例：解析本身是纯函数，没必要跟着组件重建。
 * - 代码块复制、mermaid、引用角标都需要真实 DOM，所以用 dangerouslySetInnerHTML 挂载，
 *   副作用统一收敛在 useEffect 中，依赖 html（html 变化即意味着 DOM 被整体替换）。
 * - 引用角标用占位符 ⟦c1⟧ 做文本节点替换：正文里出现任何奇怪字符都不会破坏 markdown 解析。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import { openImageViewer } from './imageViewer'
import type { Citation } from '../api/types'
import { themeHost } from '../lib/themeHost'
import './markdown.scoped.css'

/* ------------------------------------------------------------------ */
/* 常量与单例                                                          */
/* ------------------------------------------------------------------ */

/** U+27E6 / U+27E7：左右白方括号，正文占位符用它们包住 c + 序号。 */
const CITE_OPEN = '\u27E6'
const CITE_CLOSE = '\u27E7'

/** 带 g 的正则不能跨文本节点复用，这里只留 source，使用时新建实例。 */
const CITE_SOURCE = '\\u27E6c(\\d+)\\u27E7'
const CITE_TEST = new RegExp(CITE_SOURCE)

/** 未知语言时 highlightAuto 的候选白名单：覆盖常见技术栈，避免误判成冷门语言。 */
const AUTO_LANGS = [
  'typescript',
  'javascript',
  'json',
  'bash',
  'shell',
  'python',
  'html',
  'xml',
  'css',
  'scss',
  'sql',
  'yaml',
  'toml',
  'markdown',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
  'diff',
  'dockerfile',
  'nginx',
  'powershell',
  'ini',
]

/** 和 sanitize 白名单保持一致的协议限制，供后处理阶段复用。 */
const SAFE_HREF = /^(?:https?|mailto|tel):/i

interface RenderEnv {
  streaming: boolean
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 精确语言优先；未知语言走白名单自动识别；再失败就原样转义。 */
function highlightToHtml(code: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    }
    const auto = hljs.highlightAuto(code, AUTO_LANGS)
    return auto.value || escapeHtml(code)
  } catch {
    return escapeHtml(code)
  }
}

const LANG_DISPLAY: Record<string, string> = {
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JSX',
  py: 'Python',
  python: 'Python',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Shell',
  shell: 'Shell',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  md: 'Markdown',
  markdown: 'Markdown',
  go: 'Go',
  rust: 'Rust',
  rs: 'Rust',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  cs: 'C#',
  dockerfile: 'Dockerfile',
  diff: 'Diff',
  text: 'Plain Text',
}

function displayLang(label: string): string {
  const key = label.trim().toLowerCase()
  return LANG_DISPLAY[key] ?? (label || 'Plain Text')
}

function buildCodeBlock(code: string, label: string, lang: string): string {
  const lineCount = code ? code.split('\n').length : 0
  const prettyLabel = displayLang(label)
  return (
    `<div class="code-block" data-lang="${escapeHtml(label)}">` +
    '<div class="code-head">' +
    '<div class="code-head-left">' +
    `<span class="code-lang">${escapeHtml(prettyLabel)}</span>` +
    (lineCount > 0 ? `<span class="code-lines">${lineCount} 行</span>` : '') +
    '</div>' +
    '<button class="code-copy" type="button" data-copy aria-label="复制代码">复制代码</button>' +
    '</div>' +
    `<pre class="code-pre"><code class="hljs">${highlightToHtml(code, lang)}</code></pre>` +
    '</div>'
  )
}

const md = new MarkdownIt({
  html: false, // 正文里的裸 HTML 一律当文本，配合 DOMPurify 双层兜底
  linkify: true,
  breaks: true,
  typographer: false,
})

// 「模糊邮箱」会把 a@b.c 这种非 mailto 文本也变成链接，手机上误触率很高，关掉。
md.linkify?.set({ fuzzyEmail: false })

// 表格外层包一层横向滚动容器，宽表不会撑破对话气泡或页面布局。
md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>'
md.renderer.rules.table_close = () => '</table></div>'

// 自定义 fence：代码块要带语言栏和复制按钮，mermaid 要留占位给组件渲染。
md.renderer.rules.fence = (tokens, idx, _options, env): string => {
  const token = tokens[idx]
  if (!token) return ''

  const info = token.info.trim()
  const lang = (info.split(/\s+/)[0] ?? '').toLowerCase()
  // 末尾换行由 <pre> 负责排版，去掉避免代码块底部空一行。
  const code = token.content.replace(/\n$/, '')
  const streaming = (env as RenderEnv | undefined)?.streaming === true

  if (lang === 'mermaid' || lang === 'mmd') {
    // 流式追加时源码还不完整，先按普通代码块展示，避免图表反复重排造成抖动。
    if (!streaming) {
      return `<div class="mermaid-block" data-mermaid="${escapeHtml(code)}"></div>`
    }
    return buildCodeBlock(code, lang, lang)
  }

  const label = lang || 'text'
  return buildCodeBlock(code, label, lang)
}

const SANITIZE_CONFIG = {
  ADD_ATTR: ['target', 'rel', 'data-lang', 'data-mermaid', 'data-copy', 'aria-label'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
}

/* ------------------------------------------------------------------ */
/* 引用角标                                                            */
/* ------------------------------------------------------------------ */

/** 对外导出：生成正文里使用的引用占位符。 */
export function citationMarker(n: number): string {
  return `${CITE_OPEN}c${n}${CITE_CLOSE}`
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function citationTitle(citation: Citation): string {
  const title = citation.title?.trim()
  return title || hostOf(citation.url) || '来源'
}

function applyCitationAnchor(anchor: HTMLAnchorElement, citation: Citation): void {
  const href = citation.url.trim()
  if (SAFE_HREF.test(href)) {
    anchor.setAttribute('href', href)
  } else {
    // 协议不在白名单里就不给可点链接，只保留序号。
    anchor.removeAttribute('href')
  }
  anchor.setAttribute('target', '_blank')
  anchor.setAttribute('rel', 'noopener noreferrer')
  anchor.setAttribute('title', citationTitle(citation))
}

function buildCitationMark(index: number, citation: Citation): HTMLElement {
  const sup = document.createElement('sup')
  sup.className = 'cite'
  sup.dataset.cite = String(index)
  const anchor = document.createElement('a')
  anchor.textContent = String(index)
  applyCitationAnchor(anchor, citation)
  sup.appendChild(anchor)
  return sup
}

/**
 * citations 常常比正文晚到（流式 citations_delta），此时先落一个隐藏占位，
 * 等引用到位再升级成角标，避免占位符被提前吞掉。
 */
function buildPendingMark(index: number): HTMLElement {
  const node = document.createElement('span')
  node.className = 'cite-pending'
  node.dataset.cite = String(index)
  node.hidden = true
  return node
}

function replaceMarkers(root: HTMLElement, citations: Citation[] | undefined): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      // 代码、已有角标内部不处理：那里是用户内容，改了反而破坏语义。
      if (parent.closest('pre, code, .cite, .cite-pending')) return NodeFilter.FILTER_REJECT
      const value = node.nodeValue ?? ''
      return CITE_TEST.test(value) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  // 先收集再替换，避免边遍历边改 DOM 导致 walker 指针失效。
  const targets: Text[] = []
  let current = walker.nextNode()
  while (current) {
    targets.push(current as Text)
    current = walker.nextNode()
  }

  for (const node of targets) {
    const text = node.nodeValue ?? ''
    const re = new RegExp(CITE_SOURCE, 'g')
    const fragment = document.createDocumentFragment()
    let cursor = 0
    let match: RegExpExecArray | null = re.exec(text)
    while (match) {
      if (match.index > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)))
      }
      const index = Number(match[1])
      const citation = Number.isFinite(index) ? citations?.[index - 1] : undefined
      // 序号越界：视觉上替换为空（只留隐藏占位，便于后续 citations 补齐）。
      fragment.appendChild(citation ? buildCitationMark(index, citation) : buildPendingMark(index))
      cursor = match.index + match[0].length
      match = re.exec(text)
    }
    if (cursor === 0) continue
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)))
    }
    node.parentNode?.replaceChild(fragment, node)
  }
}

/** 已存在的角标 / 占位同步到最新 citations（流式场景下 citations 会后到）。 */
function syncMarks(root: HTMLElement, citations: Citation[] | undefined): void {
  const marks = root.querySelectorAll<HTMLElement>('[data-cite]')
  for (const mark of Array.from(marks)) {
    const index = Number(mark.dataset.cite)
    const citation = Number.isFinite(index) ? citations?.[index - 1] : undefined

    if (!citation) {
      // 越界角标直接移除；隐藏占位保留，等引用补齐。
      if (mark.classList.contains('cite')) mark.remove()
      continue
    }

    if (mark.classList.contains('cite-pending')) {
      mark.replaceWith(buildCitationMark(index, citation))
      continue
    }

    const anchor = mark.querySelector('a')
    if (anchor) applyCitationAnchor(anchor, citation)
  }
}

function hardenLinks(root: HTMLElement): void {
  const links = root.querySelectorAll<HTMLAnchorElement>('a[href]')
  for (const link of Array.from(links)) {
    if (/^https?:/i.test(link.getAttribute('href') ?? '')) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    }
  }
}

function hardenImages(root: HTMLElement): void {
  const images = root.querySelectorAll<HTMLImageElement>("img")
  for (const image of Array.from(images)) {
    image.setAttribute("loading", "lazy")
    image.setAttribute("decoding", "async")
    image.setAttribute("referrerpolicy", "no-referrer")

    if (image.closest(".md-figure")) continue
    const src = image.getAttribute("src") || ""
    if (!/^https?:|^data:image\//i.test(src)) continue

    const figure = document.createElement("figure")
    figure.className = "md-figure"
    image.replaceWith(figure)
    figure.appendChild(image)

    image.classList.add("md-figure-img")
    image.onclick = () => openImageViewer(src)

    const bar = document.createElement("div")
    bar.className = "md-figure-bar"

    const openButton = document.createElement("button")
    openButton.type = "button"
    openButton.textContent = "看大图"
    openButton.onclick = () => openImageViewer(src)

    const saveButton = document.createElement("button")
    saveButton.type = "button"
    saveButton.textContent = "保存到相册"
    saveButton.onclick = () => {
      void saveImage(src, saveButton)
    }

    bar.append(openButton, saveButton)
    figure.appendChild(bar)
  }
}

/** 全屏查看：应用内浮层，不跳浏览器。 */

/** 保存：原生写入手机存储的 Pictures 目录，浏览器走 blob 下载。 */
async function saveImage(src: string, button: HTMLButtonElement): Promise<void> {
  const label = button.textContent
  button.textContent = "保存中…"
  try {
    const response = await fetch(src)
    const blob = await response.blob()
    const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg"
    const filename = "agent-image-" + Date.now() + "." + ext

    const isNative = Boolean(
      (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
    )

    if (isNative) {
      const base64 = await blobToBase64(blob)
      const mod = (await import("@capacitor/filesystem")) as unknown as {
        Filesystem: {
          writeFile(options: { path: string; data: string; directory: string; recursive?: boolean }): Promise<unknown>
        }
        Directory: Record<string, string>
      }
      await mod.Filesystem.writeFile({
        path: "Pictures/" + filename,
        data: base64,
        directory: mod.Directory.ExternalStorage,
        recursive: true,
      })
      button.textContent = "已保存"
      notify("已保存到手机存储/Pictures/" + filename, "success")
    } else {
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      button.textContent = "已保存"
    }
  } catch (err) {
    button.textContent = "保存失败"
    notify(err instanceof Error ? err.message : "保存失败", "error")
  } finally {
    setTimeout(() => {
      button.textContent = label
    }, 1800)
  }
}

function notify(text: string, kind: string): void {
  void import("../state/store")
    .then((mod) => {
      const fn = (mod as { toast?: (t: string, k?: string) => void }).toast
      if (fn) fn(text, kind)
    })
    .catch(() => undefined)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? "")
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.onerror = () => reject(new Error("读取图片失败"))
    reader.readAsDataURL(blob)
  })
}

/* ------------------------------------------------------------------ */
/* mermaid                                                             */
/* ------------------------------------------------------------------ */

/** mermaid 只在浏览器里动态加载，避免把它的体积塞进首屏包。 */
interface MermaidApi {
  initialize(config: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}

let mermaidSeq = 0
let mermaidModule: MermaidApi | null = null

/** 每次渲染都要唯一的 id，否则多张图会互相覆盖。 */
function nextMermaidId(): string {
  mermaidSeq += 1
  return `mmd-${mermaidSeq}`
}

function currentMermaidTheme(): 'dark' | 'default' {
  return themeHost()?.dataset.theme === 'dark' ? 'dark' : 'default'
}

async function loadMermaid(): Promise<MermaidApi> {
  let api = mermaidModule
  if (!api) {
    // mermaid 的 ESM/CJS 导出形态在不同打包器下不一致，这里同时兼容 default 与命名空间。
    const loaded: unknown = await import('mermaid')
    const candidate = (loaded as { default?: unknown }).default ?? loaded
    api = candidate as MermaidApi
    mermaidModule = api
  }
  // 每次渲染前重新 initialize：主题可能在两次渲染之间被用户切换。
  api.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: currentMermaidTheme(),
    fontFamily: 'inherit',
  })
  return api
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}

/** 失败兜底：错误提示 + 原始源码，全部用 textContent，绝不注入第三方字符串。 */
function showMermaidError(block: HTMLElement, source: string, message: string): void {
  block.textContent = ''
  const note = document.createElement('div')
  note.className = 'mermaid-error'
  note.textContent = `图表渲染失败：${message}`

  const pre = document.createElement('pre')
  pre.className = 'code-pre'
  const code = document.createElement('code')
  code.className = 'hljs'
  code.textContent = source
  pre.appendChild(code)

  block.append(note, pre)
}

/* ------------------------------------------------------------------ */
/* 组件                                                               */
/* ------------------------------------------------------------------ */

export interface MarkdownProps {
  text: string
  /** 与正文占位符编号一一对应：第 n 个引用对应 ⟦cn⟧。 */
  citations?: Citation[]
  /** 流式追加中：跳过 mermaid 渲染，避免每次增量都重排图表。 */
  streaming?: boolean
  className?: string
}

export default function Markdown({ text, citations, streaming = false, className }: MarkdownProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 引用角标的增删更新由下方 useEffect 中的 syncMarks 原地完成，无需重建整段 HTML。
  const html = useMemo(() => {
    const raw = md.render(text ?? '', { streaming } satisfies RenderEnv)
    return DOMPurify.sanitize(raw, SANITIZE_CONFIG)
  }, [text, streaming])

  const handleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLElement>('[data-copy]')
    if (!button) return

    const block = button.closest('.code-block')
    const code = block?.querySelector('pre code')
    const source = code?.textContent ?? ''
    if (!source) return

    // 触感反馈放在手势里，异步复制不影响 iOS 的 vibrate 判定。
    navigator.vibrate?.(10)

    const flash = (label: string, copied: boolean): void => {
      button.textContent = label
      button.classList.toggle('is-copied', copied)
      window.setTimeout(() => {
        if (button.isConnected) {
          button.textContent = '复制代码'
          button.classList.remove('is-copied')
        }
      }, 1500)
    }
    flash('已复制 ✓', true)

    void copyPlainText(source).then((ok) => {
      if (!ok && button.isConnected) flash('复制失败', false)
    })
  }, [])

  // 轻量后处理：链接、图片、引用角标。html 变化或引用表变化都要重跑。
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    hardenLinks(root)
    hardenImages(root)
    replaceMarkers(root, citations)
    syncMarks(root, citations)
  }, [html, citations])

  // mermaid 单独一个 effect：只跟 html 走，citations 变化不必重画图表。
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block[data-mermaid]'))
    if (blocks.length === 0) return

    let cancelled = false
    void (async () => {
      // 动态 import 失败（离线 / 包被裁剪）时，每张图都退化成源码块，不要把整条消息搞崩。
      const api = await loadMermaid().catch((error: unknown) => {
        const message = errorText(error)
        for (const block of blocks) {
          showMermaidError(block, block.getAttribute('data-mermaid') ?? '', message)
        }
        return null
      })
      if (!api) return

      for (const block of blocks) {
        if (cancelled || !block.isConnected) return
        // StrictMode 下 effect 会跑两次，已经有 svg 的容器跳过。
        if (block.querySelector('svg')) continue

        const source = block.getAttribute('data-mermaid') ?? ''
        if (!source.trim()) {
          block.textContent = ''
          continue
        }

        const id = nextMermaidId()
        try {
          const { svg } = await api.render(id, source)
          if (cancelled || !block.isConnected) return
          if (!svg) throw new Error('空图表')
          block.innerHTML = svg
        } catch (error) {
          if (cancelled || !block.isConnected) return
          // mermaid 失败时可能往 body 里留下临时节点，清掉避免污染文档。
          const stray = document.getElementById(id)
          if (stray && !block.contains(stray)) stray.remove()
          showMermaidError(block, source, errorText(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [html])

  const classes = className ? `md ${className}` : 'md'
  return (
    <div
      ref={rootRef}
      className={classes}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** clipboard 在非安全上下文 / 老 WebView 里会直接抛错，这里做一层降级。 */
async function copyPlainText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续走 textarea 降级
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

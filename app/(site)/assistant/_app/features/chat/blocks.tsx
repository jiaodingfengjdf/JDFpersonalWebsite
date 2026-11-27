/** 助手回答的各种内容块渲染：思考、联网工具调用、正文。 */
import { useEffect, useMemo, useState } from 'react';
import type {
  AssistantBlock,
  Citation,
  ServerToolUseBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  WebFetchToolResultBlock,
  WebFetchPage,
  WebSearchResultItem,
  WebSearchToolResultBlock,
} from '../../api/types';
import Markdown, { citationMarker } from '../../ui/markdown';
import { hostOf, textWithCitationMarkers } from '../../lib/message';
import type { WritePreviewData } from '../../agent/tools';
import { confirmPendingDraft, discardPendingDraft } from '../../state/store';
import {
  BookIcon,
  BrainIcon,
  ChevronDownIcon,
  GlobeIcon,
  LinkIcon,
  SearchIcon,
  SparkIcon,
} from '../../ui/Icons';

const KIND_LABEL: Record<string, string> = {
  search: '联网搜索',
  deep_search: '深度思考搜索',
  read_link: '阅读链接',
  image_search: '图片搜索',
  deep_image_search: '图片搜索',
};

const FETCH_ERROR: Record<string, string> = {
  url_not_accessible: '无法读取该链接',
  url_not_allowed: '不允许读取该链接（或未通过内容安全审核）',
  unavailable: '网页读取失败或调用未完成',
};

/** 客户端工具 → 界面上的一句话标签 */
const CLIENT_TOOL_LABEL: Record<string, { label: string; summaryKey?: string }> = {
  remember: { label: '记住这条', summaryKey: 'text' },
  search_memory: { label: '查询记忆', summaryKey: 'query' },
  forget_memory: { label: '忘记一条记忆' },
  add_task: { label: '新建任务', summaryKey: 'title' },
  list_tasks: { label: '查看任务' },
  update_task: { label: '更新任务' },
  add_note: { label: '保存笔记', summaryKey: 'title' },
  list_notes: { label: '查找笔记', summaryKey: 'query' },
  get_time: { label: '查看时间' },
  generate_image: { label: '生成图片', summaryKey: 'prompt' },
  web_search: { label: '联网搜索', summaryKey: 'query' },
  read_page: { label: '阅读网页', summaryKey: 'url' },
  site_query: { label: '查询站点数据', summaryKey: 'resource' },
  site_search: { label: '搜索站内知识', summaryKey: 'query' },
  list_ledger_options: { label: '查看账本账户与分类' },
  prepare_ledger_transaction: { label: '准备记账', summaryKey: 'merchant' },
  confirm_ledger_transaction: { label: '确认记账' },
  prepare_chatter: { label: '准备碎碎念', summaryKey: 'content' },
  confirm_chatter: { label: '确认发碎碎念' },
  prepare_collection: { label: '准备收藏', summaryKey: 'title' },
  confirm_collection: { label: '确认加收藏' },
  prepare_post_draft: { label: '准备文章草稿', summaryKey: 'title' },
  confirm_post_draft: { label: '确认存草稿' },
  discard_draft: { label: '取消写入' },
};

function clientToolSummary(block: ToolUseBlock): string {
  const spec = CLIENT_TOOL_LABEL[block.name];
  const value = spec?.summaryKey ? block.input[spec.summaryKey] : undefined;
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  const first = Object.values(block.input).find((v) => typeof v === 'string' && v.trim());
  return typeof first === 'string' ? first.slice(0, 80) : '';
}

const SEARCH_ERROR: Record<string, string> = {
  unavailable: '搜索服务暂时不可用',
  max_uses_exceeded: '搜索次数超出上限',
  too_many_requests: '搜索过于频繁',
  query_too_long: '搜索词过长',
  invalid_input: '搜索词无效',
};

function fmtTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* 思考                                                               */
/* ------------------------------------------------------------------ */

export function ThinkingView({
  block,
  streaming,
}: {
  block: ThinkingBlock;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(streaming);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(streaming));
    const started = Date.now();
    const timer = streaming ? setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000) : undefined;
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [streaming]);

  const text = block.thinking.trim();
  const empty = text.length === 0;

  return (
    <div className={`thinking ${open ? 'is-open' : ''} ${streaming ? 'is-streaming' : ''}`}>
      <button
        type="button"
        className="thinking-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="thinking-ico">
          <BrainIcon size={15} />
        </span>
        <span className="thinking-label">
          {streaming && empty ? '正在深度思考…' : streaming ? `深度思考中 ${seconds}s` : '已深度思考'}
        </span>
        {!streaming && !empty ? (
          <span className="thinking-meta">{text.length} 字</span>
        ) : null}
        {streaming ? <span className="thinking-dots" aria-hidden /> : null}
        <span className="thinking-toggle-hint">{open ? '收起' : '展开'}</span>
        <ChevronDownIcon size={16} className="thinking-chev" />
      </button>
      {open ? (
        <div className="thinking-body">
          {empty ? <span className="thinking-ghost">模型正在多步推理…</span> : text}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 搜索结果                                                           */
/* ------------------------------------------------------------------ */

function SiteBadge({ name, icon }: { name?: string | null; icon?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (icon && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 任意外部搜索站点图标无法走 next/image 域名白名单
      <img
        className="site-badge"
        src={icon}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return <span className="site-badge site-badge-fallback">{(name ?? hostOf(icon ?? '')).slice(0, 1) || '·'}</span>;
}

function SearchResultList({ items }: { items: WebSearchResultItem[] }) {
  const images = items.filter((item) => item.image_url);
  if (images.length > 0) {
    return (
      <div className="image-grid">
        {images.map((item, i) => (
          <a
            key={`${item.url}-${i}`}
            className="image-cell"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 外部搜索图片域名不固定 */}
            <img src={item.image_url ?? ''} alt={item.title ?? ''} loading="lazy" referrerPolicy="no-referrer" />
            {item.site_name ? <span className="image-site">{item.site_name}</span> : null}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="results">
      {items.map((item, i) => (
        <a
          key={`${item.url}-${i}`}
          className="result"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="result-top">
            <SiteBadge name={item.site_name} icon={item.site_icon} />
            <span className="result-site">{item.site_name ?? hostOf(item.url)}</span>
            {item.page_age ? <span className="result-age">{fmtTime(item.page_age)}</span> : null}
          </div>
          <div className="result-title">{item.title ?? item.url}</div>
          {item.snippet ? <div className="result-snippet">{item.snippet}</div> : null}
        </a>
      ))}
    </div>
  );
}

function errorText(list: WebSearchToolResultBlock['content']): string | null {
  const first = list[0];
  if (first && first.type === 'web_search_tool_result_error') {
    return SEARCH_ERROR[first.error_code] ?? `搜索失败（${first.error_code}）`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 工具调用卡片                                                        */
/* ------------------------------------------------------------------ */

export function ToolCallCard({
  call,
  searchResult,
  fetchResult,
}: {
  call: ServerToolUseBlock;
  searchResult?: WebSearchToolResultBlock;
  fetchResult?: WebFetchToolResultBlock;
}) {
  const kind = call.kind ?? (call.name === 'deepseek_read_url' ? 'read_link' : 'search');
  const [open, setOpen] = useState(true);
  const inp = call.input as { action?: string; queries?: string[]; url?: string; pattern?: string };
  const queries = inp.queries ?? [];
  const url = inp.url;
  const pattern = inp.pattern;
  const isSearch = inp.action === 'search';

  const page: WebFetchPage | null =
    fetchResult && fetchResult.content.type === 'web_fetch_result' ? fetchResult.content : null;
  const fetchError =
    fetchResult && fetchResult.content.type === 'web_fetch_tool_result_error'
      ? FETCH_ERROR[fetchResult.content.error_code] ?? `读取失败（${fetchResult.content.error_code}）`
      : null;
  const searchError = searchResult ? errorText(searchResult.content) : null;
  const results = searchResult
    ? (searchResult.content.filter((c) => c.type === 'web_search_result') as WebSearchResultItem[])
    : [];

  const Icon = isSearch ? (kind.startsWith('deep') ? BrainIcon : SearchIcon) : pattern ? SearchIcon : call.name === 'deepseek_read_url' ? LinkIcon : BookIcon;

  return (
    <div className={`tool-card tool-${kind}${open ? ' is-open' : ''}${searchError || fetchError ? ' is-error' : ''}`}>
      <button
        type="button"
        className="tool-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-ico">
          <Icon size={15} />
        </span>
        <span className="tool-name">
          {pattern
            ? '页内查找'
            : isSearch
              ? KIND_LABEL[kind] ?? '联网搜索'
              : kind === 'read_link'
                ? '阅读网页'
                : '打开网页'}
        </span>
        <span className="tool-meta">
          {isSearch && queries.length > 0
            ? `${queries.length} 组关键词`
            : isSearch
              ? '图片搜索'
              : url
                ? hostOf(url)
                : ''}
        </span>
        {searchError || fetchError ? (
          <span className="tool-error">失败</span>
        ) : results.length > 0 ? (
          <span className="tool-ok">{results.length} 条结果</span>
        ) : page ? (
          <span className="tool-ok">已读取</span>
        ) : null}
        <ChevronDownIcon size={15} className="tool-chev" />
      </button>

      {open ? (
        <div className="tool-body">
          {queries.length > 0 ? (
            <div className="chips">
              {queries.map((q, i) => (
                <span key={`${q}-${i}`} className="chip chip-query">
                  {q}
                </span>
              ))}
            </div>
          ) : null}

          {pattern ? (
            <div className="chips">
              <span className="chip">查找：{pattern}</span>
              <span className="chip">{url ? hostOf(url) : ''}</span>
            </div>
          ) : null}

          {page ? (
            <a className="page-card" href={page.url} target="_blank" rel="noopener noreferrer">
              <BookIcon size={16} className="page-ico" />
              <span className="page-main">
                <span className="page-title">{page.content.title ?? page.url}</span>
                <span className="page-meta">
                  {hostOf(page.url)}
                  {page.published_at ? ` · ${fmtTime(page.published_at)}` : ''}
                </span>
              </span>
            </a>
          ) : null}

          {fetchError ? <div className="tool-note tool-note-error">{fetchError}</div> : null}
          {searchError ? <div className="tool-note tool-note-error">{searchError}</div> : null}

          {results.length > 0 ? <SearchResultList items={results} /> : null}
          {!searchError && results.length === 0 && isSearch && !fetchError ? (
            <div className="tool-note">没有找到相关结果</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 整条回答                                                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 待确认写入卡片                                                      */
/* ------------------------------------------------------------------ */

/**
 * prepare_* 工具返回的确认卡：展示待写入内容，下拉框可改账户/分类/状态，
 * 点「确认写入」才会真正写库；点「取消」则丢弃草稿、没有任何副作用。
 * 确认/取消都直接走 store，不经过模型。
 */
function WritePreviewCard({ preview }: { preview: WritePreviewData }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'confirming' | 'confirmed' | 'cancelled'>('idle');
  const [error, setError] = useState('');

  const valueOf = (key: string, fallback: string): string => overrides[key] ?? fallback;

  const onConfirm = async (): Promise<void> => {
    setStatus('confirming');
    setError('');
    const changed: Record<string, unknown> = {};
    for (const field of preview.fields) {
      const value = valueOf(field.key, field.value);
      if (value !== field.value) changed[field.key] = value;
    }
    const result = await confirmPendingDraft(preview.draftId, preview.confirmTool, changed);
    if (result.ok) {
      setStatus('confirmed');
    } else {
      setStatus('idle');
      setError(result.message);
    }
  };

  const onCancel = (): void => {
    discardPendingDraft(preview.draftId);
    setStatus('cancelled');
  };

  if (status === 'confirmed') {
    return <div className="write-preview-done">✓ 已确认写入，结果见下方新消息。</div>;
  }
  if (status === 'cancelled') {
    return <div className="write-preview-done">已取消，没有改动任何数据。</div>;
  }

  return (
    <div className="write-preview">
      <div className="write-preview-title">{preview.title} · 待确认</div>
      <div className="write-preview-rows">
        {preview.fields.map((field) => (
          <label key={field.key} className="write-preview-row">
            <span className="write-preview-label">{field.label}</span>
            {field.options ? (
              <select
                className="write-preview-select"
                value={valueOf(field.key, field.value)}
                disabled={status === 'confirming'}
                onChange={(event) =>
                  setOverrides((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="write-preview-value">{field.value}</span>
            )}
          </label>
        ))}
      </div>
      <p className="write-preview-hint">核对无误后点「确认写入」才会真正写库；改了下拉框再点确认，会按改后的值写入。</p>
      {error ? <div className="write-preview-error">{error}</div> : null}
      <div className="write-preview-actions">
        <button
          type="button"
          className="write-preview-confirm"
          disabled={status === 'confirming'}
          onClick={() => void onConfirm()}
        >
          {status === 'confirming' ? '写入中…' : '确认写入'}
        </button>
        <button
          type="button"
          className="write-preview-cancel"
          disabled={status === 'confirming'}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  );
}

/** 客户端工具（记忆 / 任务 / 笔记 / 时间）的一次调用 */
export function ClientToolCard({ block }: { block: ToolUseBlock }) {
  const [open, setOpen] = useState(false);
  const label = CLIENT_TOOL_LABEL[block.name]?.label ?? block.name;
  const summary = clientToolSummary(block);
  const result = block.result;
  const failed = Boolean(result?.is_error);
  const preview = (result?.data as { writePreview?: WritePreviewData } | undefined)
    ?.writePreview;

  return (
    <div className={`tool-card tool-client${open ? ' is-open' : ''}${failed ? ' is-error' : ''}`}>
      <button
        type="button"
        className="tool-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-ico tool-ico-client">
          <SparkIcon size={15} />
        </span>
        <span className="tool-name">{label}</span>
        <span className="tool-meta">{summary}</span>
        {failed ? (
          <span className="tool-error">失败</span>
        ) : result ? (
          <span className="tool-ok">已完成</span>
        ) : (
          <span className="tool-pending">执行中</span>
        )}
        <ChevronDownIcon size={15} className="tool-chev" />
      </button>
      {preview ? (
        <div className="tool-body">
          <WritePreviewCard preview={preview} />
        </div>
      ) : null}
      {open ? (
        <div className="tool-body">
          <pre className="tool-result">{result?.content ?? '执行中…'}</pre>
        </div>
      ) : null}
    </div>
  );
}

export function AssistantBlocks({
  blocks,
  citations,
  streaming,
}: {
  blocks: AssistantBlock[];
  citations: Citation[];
  streaming: boolean;
}) {
  // 把「调用 → 结果」配对，结果块不再单独渲染
  const consumed = useMemo(() => {
    const set = new Set<number>();
    blocks.forEach((block, i) => {
      if (block.type !== 'server_tool_use') return;
      blocks.forEach((other, j) => {
        if (j === i) return;
        if (
          (other.type === 'web_search_tool_result' || other.type === 'web_fetch_tool_result') &&
          other.tool_use_id === block.id
        ) {
          set.add(j);
        }
      });
    });
    return set;
  }, [blocks]);

  const resultByCall = useMemo(() => {
    const map = new Map<string, { search?: WebSearchToolResultBlock; fetch?: WebFetchToolResultBlock }>();
    for (const block of blocks) {
      if (block.type === 'web_search_tool_result') {
        map.set(block.tool_use_id, { ...map.get(block.tool_use_id), search: block });
      } else if (block.type === 'web_fetch_tool_result') {
        map.set(block.tool_use_id, { ...map.get(block.tool_use_id), fetch: block });
      }
    }
    return map;
  }, [blocks]);

  return (
    <div className="blocks">
      {blocks.map((block, index) => {
        if (consumed.has(index)) return null;

        if (block.type === 'thinking') {
          return <ThinkingView key={`t-${index}`} block={block} streaming={streaming} />;
        }

        if (block.type === 'server_tool_use') {
          const pair = resultByCall.get(block.id);
          return (
            <ToolCallCard
              key={`c-${block.id || index}`}
              call={block}
              searchResult={pair?.search}
              fetchResult={pair?.fetch}
            />
          );
        }

        if (block.type === 'tool_use') {
          return <ClientToolCard key={`tu-${block.id || index}`} block={block} />;
        }

        if (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') {
          // 没有对应调用的孤儿结果块：当作独立卡片展示
          return (
            <div key={`r-${index}`} className="tool-card">
              <div className="tool-head static">
                <span className="tool-ico">
                  <GlobeIcon size={15} />
                </span>
                <span className="tool-name">
                  {block.type === 'web_search_tool_result' ? '搜索结果' : '网页内容'}
                </span>
              </div>
              {block.type === 'web_search_tool_result' ? (
                <div className="tool-body">
                  <SearchResultList
                    items={block.content.filter((c) => c.type === 'web_search_result') as WebSearchResultItem[]}
                  />
                </div>
              ) : null}
            </div>
          );
        }

        const textBlock = block as TextBlock;
        const marked = textWithCitationMarkers(textBlock.text, textBlock.citations, citations, citationMarker);
        return (
          <Markdown
            key={`x-${index}`}
            text={marked}
            citations={citations}
            streaming={streaming && index === blocks.length - 1}
          />
        );
      })}
    </div>
  );
}


"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2, FileText, ArrowLeft, X } from "lucide-react";
import type { SearchResult } from "@/lib/api/search";
import type { CrossResult } from "@/server/modules/search/cross";
import { formatDate } from "@/lib/format";

export default function SearchClient({
  initialQuery,
  initialResult,
  groups,
  incomplete,
}: {
  initialQuery: string;
  initialResult: SearchResult;
  groups: CrossResult["groups"];
  incomplete: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const result: SearchResult = initialResult;
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function submit(next: string) {
    const q = next.trim();
    startTransition(() => {
      if (q === initialQuery) router.refresh();
      else router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    });
  }

  const busy = pending;
  const showEmptyState = initialQuery !== "" && !incomplete && result.hits.length === 0 && groups.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6 md:py-12">
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-indigo-500 dark:text-slate-400"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
      </div>

      <h1 className="mb-1 text-xl font-bold text-slate-800 dark:text-white md:text-2xl">
        站内搜索
      </h1>
      <p className="mb-6 break-words text-sm text-slate-600 dark:text-slate-300" role="status">
        {initialQuery ? `「${initialQuery}」的搜索结果` : "搜索文章、说说、收藏、书架、影视、游戏、新闻与播客。"}
      </p>

      <form
        noValidate
        className="relative mb-8"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={input}
          type="text"
          autoFocus={!initialQuery}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="输入关键词"
          aria-label="搜索关键词"
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          className="w-full rounded-2xl border border-slate-200/80 bg-white/70 py-3 pl-11 pr-32 text-sm text-slate-800 shadow-sm backdrop-blur transition-all placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
        />
        {value && (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={() => {
              setValue("");
              input.current?.focus();
              if (initialQuery) submit("");
            }}
            className="absolute right-24 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-300"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          搜索
        </button>
      </form>

      {incomplete && (
        <p role="alert" className="mb-5 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          部分搜索结果暂时无法加载。请重新搜索。
        </p>
      )}
      {result.hits.length > 0 && (
        <section className="mb-7">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">文章 · {result.total} 篇</h2>
        <ul className="space-y-3">
          {result.hits.map((hit) => (
            <li key={hit.id}>
              <Link
                href={`/posts/${hit.slug}`}
                className="group block rounded-2xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-indigo-300/60 hover:shadow-lg dark:border-white/10 dark:bg-slate-800/50 dark:hover:border-indigo-400/40"
              >
                <div className="mb-1.5 flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                  <h3 className="text-base font-semibold text-slate-800 transition-colors group-hover:text-indigo-500 dark:text-slate-100">
                    {hit.title}
                  </h3>
                </div>
                {hit.snippet && (
                  <p className="mb-2 line-clamp-2 pl-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {hit.snippet}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pl-6 text-xs text-slate-400">
                  {hit.category && (
                    <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-indigo-500">
                      {hit.category}
                    </span>
                  )}
                  {hit.published_at && (
                    <span>{formatDate(hit.published_at)}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.kind} className="mb-7">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{group.label}</h2>
          <ul className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/60">
            {group.items.map((hit) => (
              <li key={hit.id}>
                <Link href={hit.href} className="block rounded-xl px-4 py-3 hover:bg-indigo-500/10 focus-visible:outline-2 focus-visible:outline-indigo-500">
                  <h3 className="break-words text-sm font-medium text-slate-800 dark:text-slate-100">{hit.title}</h3>
                  {hit.detail && <p className="mt-1 line-clamp-2 break-words text-xs text-slate-600 dark:text-slate-300">{hit.detail}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {showEmptyState && (
        <div className="rounded-2xl border border-dashed border-slate-200/80 py-14 text-center dark:border-white/10">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            没有找到相关内容，换个关键词试试。
          </p>
          {result.fuzzy && (
            <p className="mt-2 text-xs text-slate-400">
              试试更长的关键词（三个字以上可以走全文索引，结果更准）。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

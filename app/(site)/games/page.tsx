import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import GlassPanel from "@/components/site/GlassPanel";
import RatingStars from "@/components/site/RatingStars";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { getAdminSession } from "@/server/auth/guard";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getGamesService } from "@/server/modules/games";
import type { GameItemView, GameStatus } from "@/server/modules/games/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/games");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

// 四种状态都有对应出口；组标题与后台状态标签统一为「通关 / 弃坑」。
const GROUPS: Array<{ key: GameStatus; label: string }> = [
  { key: "playing", label: "在玩" },
  { key: "done", label: "通关" },
  { key: "backlog", label: "愿望单" },
  { key: "dropped", label: "弃坑" },
];

export default async function GamesPage() {
  let items: GameItemView[] = [];
  let failed = false;
  try {
    items = await getGamesService().list();
  } catch (error) {
    console.error("Failed to load games", error);
    failed = true;
  }
  const admin = await getAdminSession();
  const done = items.filter((item) => item.status === "done");
  const totalHours = items.reduce((sum, item) => sum + item.hours, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Gamepad2 className="h-6 w-6 text-sky-500" />
            {MODULE.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {failed
              ? "加载失败"
              : `共 ${items.length} 款（含弃坑）· 通关 ${done.length} · 累计 ${totalHours.toFixed(1)} 小时`}
          </p>
        </div>
        {admin ? (
          <Link
            href="/admin/games"
            className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            管理
          </Link>
        ) : null}
      </div>

      {failed ? (
        <AsyncState
          tone="error"
          title="游戏列表加载失败"
          description="数据暂时取不到，点击下方按钮重新加载。"
          actionLabel="重新加载"
          actionHref={MODULE.href}
        />
      ) : items.length === 0 ? (
        <GlassPanel as="p" tone="soft" padding="lg" className="text-center text-sm text-slate-500">
          还没有记录，去后台「游戏」添加。
        </GlassPanel>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((group) => {
            const list = items.filter((item) => item.status === group.key);
            if (list.length === 0) return null;
            return (
              <section key={group.key}>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">
                  {group.label}（{list.length}）
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((item) => (
                    <GlassPanel
                      key={item.id}
                      id={`game-${item.id}`}
                      padding="sm"
                      className="flex gap-3"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-slate-200/60 dark:bg-slate-700/60">
                        {item.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链
                          <img src={item.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-lg">🎮</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {[item.platform, item.hours > 0 ? `${item.hours}h` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                          {item.rating > 0 ? (
                            <>
                              {item.platform || item.hours > 0 ? " · " : null}
                              <RatingStars value={item.rating} size="sm" />
                              <span className="text-slate-400">{item.rating}/5</span>
                            </>
                          ) : null}
                        </p>
                        {item.note && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.note}</p>
                        )}
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

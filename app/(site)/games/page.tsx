import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { getGamesService } from "@/server/modules/games";
import type { GameStatus } from "@/server/modules/games/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return { title: `游戏 · ${profile.siteTitle}`, description: "在玩、通关与愿望单" };
}

const STATUS_LABEL: Record<GameStatus, string> = {
  playing: "在玩",
  done: "通关",
  backlog: "愿望单",
  dropped: "弃坑",
};

export default async function GamesPage() {
  const items = await getGamesService().list().catch(() => []);
  const playing = items.filter((item) => item.status === "playing");
  const done = items.filter((item) => item.status === "done");
  const backlog = items.filter((item) => item.status === "backlog");
  const totalHours = items.reduce((sum, item) => sum + item.hours, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
            <Gamepad2 className="h-6 w-6 text-sky-500" />
            游戏
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            共 {items.length} 款 · 通关 {done.length} · 累计 {totalHours.toFixed(1)} 小时
          </p>
        </div>
        <Link
          href="/admin/games"
          className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
        >
          管理
        </Link>
      </div>

      {items.length === 0 && (
        <p className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
          还没有记录，去后台「游戏」添加。
        </p>
      )}

      <div className="space-y-6">
        {[
          { key: "playing", label: "在玩", list: playing },
          { key: "done", label: "已通关", list: done },
          { key: "backlog", label: "愿望单", list: backlog },
        ]
          .filter((group) => group.list.length > 0)
          .map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">
                {group.label}（{group.list.length}）
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.list.map((item) => (
                  <div
                    key={item.id}
                    id={`game-${item.id}`}
                    className="flex gap-3 rounded-2xl border border-white/40 bg-white/45 p-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-slate-200/60 dark:bg-slate-700/60">
                      {item.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链
                        <img src={item.cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-lg">🎮</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {[item.platform, STATUS_LABEL[item.status], item.hours > 0 ? `${item.hours}h` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.note && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}

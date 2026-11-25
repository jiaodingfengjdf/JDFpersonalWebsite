/**
 * 「兴趣」栏目的单一事实来源。
 *
 * 导航菜单、径向菜单、后台侧栏、sitemap 与页面元数据都从这里派生，
 * 避免同一个模块在四处叫四个名字（此前「新闻 / 新闻流 / 内容」三套并存）。
 * 本文件不含服务端依赖，客户端与服务端均可引入。
 */
import type { NavDropdownIconName } from "./nav-dropdown";

export interface InterestModule {
  key: string;
  /** 菜单标签（短）。 */
  label: string;
  /** 页面 H1 与 metadata 标题。 */
  pageTitle: string;
  href: string;
  /** 菜单副标题。 */
  navDescription: string;
  /** metadata description，与页面实际内容一致。 */
  description: string;
  icon: NavDropdownIconName;
  adminHref?: string;
  /** 是否允许搜索引擎收录；私密页与搜索结果页不收录。 */
  indexable: boolean;
  requiresAdmin?: boolean;
}

export const INTEREST_MODULES: readonly InterestModule[] = [
  {
    key: "news",
    label: "新闻",
    pageTitle: "新闻",
    href: "/news",
    navDescription: "RSS 聚合",
    description: "科技、国内、国际、财经与设计的 RSS 新闻聚合。",
    icon: "newspaper",
    adminHref: "/admin/news",
    indexable: true,
  },
  {
    key: "market",
    label: "行情",
    pageTitle: "行情",
    href: "/market",
    navDescription: "A 股 / 美股 / 基金",
    description: "自选股票、基金与指数行情，支持分时、日K、周K、月K 与涨跌提醒。",
    icon: "trending-up",
    adminHref: "/admin/market",
    indexable: true,
  },
  {
    key: "nba",
    label: "NBA",
    pageTitle: "NBA",
    href: "/nba",
    navDescription: "赛程与比分",
    description: "近期 NBA 赛程、比分与关注球队。",
    icon: "trophy",
    adminHref: "/admin/nba",
    indexable: true,
  },
  {
    key: "digest",
    label: "简报",
    pageTitle: "简报",
    href: "/digest",
    navDescription: "每日一览",
    description: "新闻、行情、NBA、收藏与账本的每日一览。",
    icon: "calendar",
    indexable: true,
  },
  {
    key: "library",
    label: "书架",
    pageTitle: "书架",
    href: "/library",
    navDescription: "EPUB / TXT 阅读",
    description: "EPUB 与 TXT 在线阅读，记录未读、在读、读完与搁置。",
    icon: "book",
    adminHref: "/admin/library",
    indexable: true,
  },
  {
    key: "podcast",
    label: "播客",
    pageTitle: "播客",
    href: "/podcast",
    navDescription: "订阅收听",
    description: "订阅的播客节目与单集，支持倍速播放与收听位置记录。",
    icon: "headphones",
    adminHref: "/admin/podcast",
    indexable: true,
  },
  {
    key: "watch",
    label: "影视",
    pageTitle: "影视",
    href: "/watch",
    navDescription: "想看 / 在看 / 看完",
    description: "想看、在看、看完与弃了的影视记录、评分与短评。",
    icon: "clapperboard",
    adminHref: "/admin/watch",
    indexable: true,
  },
  {
    key: "games",
    label: "游戏",
    pageTitle: "游戏",
    href: "/games",
    navDescription: "在玩 / 通关 / 愿望单",
    description: "在玩、通关、愿望单与弃坑的游戏记录、时长与短评。",
    icon: "gamepad",
    adminHref: "/admin/games",
    indexable: true,
  },
  {
    key: "ledger",
    label: "记账",
    pageTitle: "记账",
    href: "/ledger",
    navDescription: "收支与预算",
    description: "私人账本：收支流水、预算进度与账户余额。",
    icon: "wallet",
    adminHref: "/admin/ledger",
    indexable: false,
    requiresAdmin: true,
  },
  {
    key: "search",
    label: "搜索",
    pageTitle: "站内搜索",
    href: "/search",
    navDescription: "文章与各兴趣模块",
    description: "跨文章、说说、收藏、书架、影视、游戏、新闻、播客、行情自选与 NBA 球队/比赛的站内检索。",
    icon: "search",
    indexable: false,
  },
] as const;

export const INTEREST_LABEL = "兴趣";

export function interestModuleByHref(href: string): InterestModule | undefined {
  return INTEREST_MODULES.find((module) => module.href === href);
}

/** 默认菜单配置：数据库没有配置时用它兜底，避免整个栏目消失。 */
export function defaultInterestDropdownConfig() {
  return {
    enabled: true,
    label: INTEREST_LABEL,
    icon: "sparkles" as const,
    links: INTEREST_MODULES.map((module) => ({
      label: module.label,
      href: module.href,
      description: module.navDescription,
    })),
  };
}

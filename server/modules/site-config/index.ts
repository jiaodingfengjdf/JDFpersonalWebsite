import { cache } from "react";
import { unstable_cache } from "next/cache";
import { safeRevalidateTag } from "@/lib/revalidate";
import { getDb } from "@/server/db/client";
import { env } from "@/server/env";
import { createSiteConfigService, type PublicSiteConfig } from "./service";

export function getSiteConfigService() {
  const base = createSiteConfigService(getDb());
  return {
    ...base,
    async create(input: Parameters<typeof base.create>[0]) {
      const res = await base.create(input);
      safeRevalidateTag("site-config");
      return res;
    },
    async update(
      key: Parameters<typeof base.update>[0],
      input: Parameters<typeof base.update>[1],
    ) {
      const res = await base.update(key, input);
      safeRevalidateTag("site-config");
      return res;
    },
    async remove(id: Parameters<typeof base.remove>[0]) {
      const res = await base.remove(id);
      safeRevalidateTag("site-config");
      return res;
    },
  };
}

const fetchCrossRequestPublicConfig = unstable_cache(
  async (): Promise<PublicSiteConfig> => {
    return createSiteConfigService(getDb()).getPublic();
  },
  ["public-site-config-v1"],
  { revalidate: 60, tags: ["site-config"] },
);

const fetchRequestDedupedPublicConfig = cache(
  async (): Promise<PublicSiteConfig> => {
    if (env.NODE_ENV === "test") {
      return createSiteConfigService(getDb()).getPublic();
    }
    try {
      return await fetchCrossRequestPublicConfig();
    } catch {
      return createSiteConfigService(getDb()).getPublic();
    }
  },
);

/**
 * 请求级去重 + 跨请求 60s 缓存的公开站点配置读取（后台修改配置时通过 `site-config` tag 即时失效），
 * 将每次页面渲染 3~5 次跨区 Turso 全表扫描收敛为 0~1 次。
 */
export async function getCachedPublicSiteConfig(): Promise<PublicSiteConfig> {
  return fetchRequestDedupedPublicConfig();
}

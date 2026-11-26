export interface SiteAdminErrorDetail {
  path: string;
  message: string;
}

interface ErrorPayload {
  error?: {
    message?: string;
    details?: SiteAdminErrorDetail[];
  };
}

export class SiteAdminApiError extends Error {
  readonly status: number;
  readonly details: SiteAdminErrorDetail[];

  constructor(
    message: string,
    status: number,
    details: SiteAdminErrorDetail[] = [],
  ) {
    super(message);
    this.name = "SiteAdminApiError";
    this.status = status;
    this.details = details;
  }
}

export async function siteAdminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new SiteAdminApiError("管理员登录状态已失效，请前往 /admin/login 重新登录后重试。", 401);
    }
    const errorPayload = payload as ErrorPayload | null;
    throw new SiteAdminApiError(
      errorPayload?.error?.message ?? `请求失败（${response.status}）`,
      response.status,
      errorPayload?.error?.details ?? [],
    );
  }

  return payload as T;
}

export function describeSiteAdminError(error: unknown): string {
  if (error instanceof SiteAdminApiError) {
    if (error.details.length > 0) {
      return `${error.message}：${error.details
        .map((detail) => `${detail.path || "字段"} ${detail.message}`)
        .join("；")}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

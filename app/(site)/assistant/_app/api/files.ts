/**
 * Files API（用于文档 / 图片输入）。
 *
 * 文档路径：
 * - POST {apiRoot}/files            —— multipart 上传，返回 file_id
 * - GET  {apiRoot}/files?limit&order —— 列出已上传文件
 * - DELETE {apiRoot}/files/{id}     —— 删除文件
 *
 * 限制：
 * - 上传必须「先 append purpose、再 append file」，顺序反了服务端返回 400。
 * - 不要手动设置 Content-Type，浏览器会自动补 multipart 的 boundary。
 * - 上传进度只能用 XMLHttpRequest（fetch 没有上传进度事件）。
 * - `text_recognition` 不会被 `pickPurpose()` 自动选中，需要在调用处显式指定。
 */

import type { FilePurpose } from './types';
import { ApiError, apiRoot } from './voice';

/** 上传结果。 */
export interface UploadedFile {
  id: string;
  filename: string;
  bytes: number;
  purpose: FilePurpose;
}

/** listFiles 返回项。 */
export interface RemoteFile {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  purpose: string;
}

export type FileKind = 'image' | 'document' | 'text';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
/** 需要版面/OCR 能力才能读的文档。 */
const RICH_LAYOUT_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx'];
/** 纯文本/结构化文本/代码 —— 直接按 user_data 读。 */
const TEXT_EXT = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'h', 'cpp', 'hpp',
  'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sh', 'bash', 'ps1',
  'html', 'css', 'scss', 'xml', 'yml', 'yaml', 'toml', 'ini', 'sql', 'log',
];
/** 表格/电子书按 user_data 处理。 */
const DATA_EXT = ['xlsx', 'xls', 'epub', 'mobi'];

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

function extOf(file: File): string {
  const name = typeof file.name === 'string' ? file.name : '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function mimeOf(file: File): string {
  return typeof file.type === 'string' ? file.type.toLowerCase() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(source: unknown, key: string): string | undefined {
  const record = asRecord(source);
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(source: unknown, key: string): number | undefined {
  const record = asRecord(source);
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractDetail(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const nested = asRecord(asRecord(parsed)?.error);
    const message =
      readString(nested, 'message') ??
      readString(parsed, 'message') ??
      readString(parsed, 'detail');
    if (message) return message.slice(0, 300);
  } catch {
    /* 非 JSON，用原文 */
  }
  return trimmed.slice(0, 300);
}

function requireApiKey(apiKey: string): string {
  const key = (apiKey ?? '').trim();
  if (!key) {
    throw new ApiError('请先在设置中填写 API Key', { code: 'no_api_key' });
  }
  return key;
}

function withDetail(message: string, detail?: string): string {
  return detail ? `${message}（${detail}）` : message;
}

const PURPOSES: readonly FilePurpose[] = ['user_data', 'text_recognition', 'rich_layout_recognition'];

function isPurpose(value: string | undefined): value is FilePurpose {
  return value !== undefined && (PURPOSES as readonly string[]).includes(value);
}

function mapWriteError(status: number, detail?: string): ApiError {
  const options = { status, detail };
  if (status === 400) {
    return new ApiError(
      withDetail('文件请求无效（可能格式不支持，或 purpose 未排在 file 之前）', detail),
      { ...options, code: 'bad_request' },
    );
  }
  if (status === 401 || status === 403) {
    return new ApiError('API Key 无效或没有文件接口权限', { ...options, code: 'unauthorized' });
  }
  if (status === 404) {
    return new ApiError('文件不存在或已被删除', { ...options, code: 'not_found' });
  }
  if (status === 408) {
    return new ApiError('请求超时，请检查网络后重试', { ...options, code: 'timeout' });
  }
  if (status === 413) {
    return new ApiError('文件过大，服务器拒绝接收', { ...options, code: 'file_too_large' });
  }
  if (status === 429) {
    return new ApiError('文件请求过于频繁，请稍后再试', { ...options, code: 'rate_limited' });
  }
  if (status === 500) {
    return new ApiError('服务器内部错误，请稍后重试', { ...options, code: 'server_error' });
  }
  if (status === 503) {
    return new ApiError('文件服务暂时不可用，请稍后再试', { ...options, code: 'unavailable' });
  }
  if (status === 504) {
    return new ApiError('文件服务超时，请稍后再试', { ...options, code: 'gateway_timeout' });
  }
  return new ApiError(withDetail(`文件请求失败（HTTP ${status}）`, detail), {
    ...options,
    code: 'http_error',
  });
}

/* ------------------------------------------------------------------ */
/* 分类                                                                */
/* ------------------------------------------------------------------ */

/**
 * 按文件类型选择上传 purpose。
 * 图片 → user_data；pdf/doc/docx/ppt/pptx → rich_layout_recognition；
 * txt/md/csv/json/代码/xlsx/xls/epub/mobi → user_data；无法判断时回退 rich_layout_recognition。
 * 注意：`text_recognition` 需要调用处显式指定。
 */
export function pickPurpose(file: File): FilePurpose {
  const ext = extOf(file);
  const mime = mimeOf(file);

  if (IMAGE_MIME.includes(mime) || IMAGE_EXT.includes(ext)) return 'user_data';
  if (RICH_LAYOUT_EXT.includes(ext)) return 'rich_layout_recognition';
  if (TEXT_EXT.includes(ext) || DATA_EXT.includes(ext)) return 'user_data';

  return 'rich_layout_recognition';
}

/** 粗分文件种类：图片 / 文档（需要解析渲染）/ 纯文本。 */
export function kindOfFile(file: File): FileKind {
  const ext = extOf(file);
  const mime = mimeOf(file);

  if (mime.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image';
  if (TEXT_EXT.includes(ext)) return 'text';

  // 未知扩展名时用 MIME 兜底。
  if (!ext) {
    if (mime.startsWith('text/')) return 'text';
    if (mime.startsWith('image/')) return 'image';
  }

  return 'document';
}

/* ------------------------------------------------------------------ */
/* 上传 / 列表 / 删除                                                   */
/* ------------------------------------------------------------------ */

export interface UploadFileArgs {
  apiKey: string;
  baseUrl: string;
  file: File;
  purpose?: FilePurpose;
  signal?: AbortSignal;
  /** 进度回调，percent 为 0..100。 */
  onProgress?: (percent: number, loaded: number, total: number) => void;
}

/**
 * 上传文件（XMLHttpRequest，带上传进度）。
 * multipart 里必须先 `purpose` 后 `file`，否则服务端 400。
 */
export function uploadFile(args: UploadFileArgs): Promise<UploadedFile> {
  const apiKey = requireApiKey(args.apiKey);
  const file = args.file;
  if (!file) {
    return Promise.reject(new ApiError('没有选择文件', { code: 'no_file' }));
  }

  const purpose: FilePurpose = args.purpose ?? pickPurpose(file);
  const url = `${apiRoot(args.baseUrl)}/files`;

  if (args.signal?.aborted) {
    return Promise.reject(new ApiError('上传已取消', { code: 'aborted', name: 'AbortError' }));
  }

  return new Promise<UploadedFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('Accept', 'application/json');
    // 不设置 Content-Type：让浏览器写 multipart boundary。

    const total = typeof file.size === 'number' && file.size > 0 ? file.size : 0;
    let lastPercent = -1;

    if (xhr.upload) {
      xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
        if (!args.onProgress) return;
        const loaded = event.loaded;
        const denominator = event.lengthComputable && event.total > 0 ? event.total : total;
        const percent =
          denominator > 0 ? Math.min(100, Math.round((loaded / denominator) * 100)) : 0;
        if (percent !== lastPercent) {
          lastPercent = percent;
          args.onProgress(percent, loaded, denominator);
        }
      };
      xhr.upload.onload = () => {
        if (args.onProgress && lastPercent < 100) {
          lastPercent = 100;
          args.onProgress(100, total, total);
        }
      };
    }

    const onAbortSignal = () => {
      xhr.abort();
    };
    args.signal?.addEventListener('abort', onAbortSignal);

    const finish = () => {
      args.signal?.removeEventListener('abort', onAbortSignal);
    };

    xhr.onload = () => {
      finish();
      const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
      if (xhr.status >= 200 && xhr.status < 300) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          reject(
            new ApiError('上传结果无法解析，请重试', {
              status: xhr.status,
              code: 'bad_json',
            }),
          );
          return;
        }
        const id = readString(parsed, 'id');
        if (!id) {
          reject(
            new ApiError('上传结果缺少文件 ID，请重试', {
              status: xhr.status,
              code: 'bad_payload',
            }),
          );
          return;
        }
        const parsedPurpose = readString(parsed, 'purpose');
        resolve({
          id,
          filename: readString(parsed, 'filename') ?? file.name,
          bytes: readNumber(parsed, 'bytes') ?? file.size,
          purpose: isPurpose(parsedPurpose) ? parsedPurpose : purpose,
        });
        return;
      }
      reject(mapWriteError(xhr.status, extractDetail(text)));
    };

    xhr.onerror = () => {
      finish();
      reject(new ApiError('上传失败，请检查网络连接后重试', { code: 'network_error' }));
    };

    xhr.ontimeout = () => {
      finish();
      reject(new ApiError('上传超时，请检查网络后重试', { code: 'timeout' }));
    };

    xhr.onabort = () => {
      finish();
      reject(new ApiError('上传已取消', { code: 'aborted', name: 'AbortError' }));
    };

    const form = new FormData();
    // 顺序敏感：purpose 必须在 file 之前。
    form.append('purpose', purpose);
    form.append('file', file, file.name || 'file');

    try {
      xhr.send(form);
    } catch {
      finish();
      reject(new ApiError('上传启动失败，请重试', { code: 'send_failed' }));
    }
  });
}

/** 列出已上传文件（GET /files）。 */
export async function listFiles(args: {
  apiKey: string;
  baseUrl: string;
  limit?: number;
  order?: 'asc' | 'desc';
  signal?: AbortSignal;
}): Promise<RemoteFile[]> {
  const apiKey = requireApiKey(args.apiKey);
  const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 20)));
  const order = args.order ?? 'desc';
  const url = `${apiRoot(args.baseUrl)}/files?limit=${limit}&order=${order}`;

  if (args.signal?.aborted) {
    throw new ApiError('请求已取消', { code: 'aborted', name: 'AbortError' });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: args.signal,
    });
  } catch (err) {
    if (args.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new ApiError('请求已取消', { code: 'aborted', name: 'AbortError' });
    }
    throw new ApiError('获取文件列表失败，请检查网络连接后重试', { code: 'network_error' });
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = extractDetail(await response.text());
    } catch {
      detail = undefined;
    }
    throw mapWriteError(response.status, detail);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new ApiError('文件列表无法解析，请重试', {
      status: response.status,
      code: 'bad_json',
    });
  }

  const rawList = asRecord(parsed)?.data;
  if (!Array.isArray(rawList)) return [];

  const files: RemoteFile[] = [];
  for (const item of rawList) {
    const id = readString(item, 'id');
    if (!id) continue;
    files.push({
      id,
      filename: readString(item, 'filename') ?? id,
      bytes: readNumber(item, 'bytes') ?? 0,
      created_at: readNumber(item, 'created_at') ?? 0,
      purpose: readString(item, 'purpose') ?? 'user_data',
    });
  }
  return files;
}

/** 删除文件（DELETE /files/{id}）。 */
export async function deleteFile(args: {
  apiKey: string;
  baseUrl: string;
  fileId: string;
  signal?: AbortSignal;
}): Promise<void> {
  const apiKey = requireApiKey(args.apiKey);
  const id = (args.fileId ?? '').trim();
  if (!id) {
    throw new ApiError('缺少文件 ID，无法删除', { code: 'no_file_id' });
  }

  if (args.signal?.aborted) {
    throw new ApiError('请求已取消', { code: 'aborted', name: 'AbortError' });
  }

  let response: Response;
  try {
    response = await fetch(`${apiRoot(args.baseUrl)}/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: args.signal,
    });
  } catch (err) {
    if (args.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new ApiError('请求已取消', { code: 'aborted', name: 'AbortError' });
    }
    throw new ApiError('删除文件失败，请检查网络连接后重试', { code: 'network_error' });
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = extractDetail(await response.text());
    } catch {
      detail = undefined;
    }
    throw mapWriteError(response.status, detail);
  }
}

/** 把 Blob / File 读成 data URL（图片本地预览用）。 */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new ApiError('无法读取文件内容', { code: 'read_failed' }));
    };
    reader.onerror = () => {
      reject(new ApiError('无法读取文件内容', { code: 'read_failed' }));
    };
    try {
      reader.readAsDataURL(file);
    } catch {
      reject(new ApiError('无法读取文件内容', { code: 'read_failed' }));
    }
  });
}

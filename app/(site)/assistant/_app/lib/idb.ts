/**
 * 极简 IndexedDB key-value 存储（会话、设置）。
 * 隐私优先：API Key 与会话全部只存在本机浏览器/App 沙箱，不上传任何服务器（除直连 DeepSeek API）。
 * 若 IndexedDB 不可用（Safari 无痕模式等），自动退化为 localStorage。
 */

const DB_NAME = 'deepseek-pocket-assistant';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
let fallbackToLocal = false;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

function lsKey(key: string): string {
  return `${DB_NAME}:${key}`;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (fallbackToLocal) {
    const raw = localStorage.getItem(lsKey(key));
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    fallbackToLocal = true;
    return kvGet<T>(key);
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (fallbackToLocal) {
    try {
      localStorage.setItem(lsKey(key), JSON.stringify(value));
    } catch {
      // 配额溢出：静默忽略，内存态仍然可用
    }
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    fallbackToLocal = true;
    await kvSet(key, value);
  }
}

export async function kvDel(key: string): Promise<void> {
  if (fallbackToLocal) {
    localStorage.removeItem(lsKey(key));
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    fallbackToLocal = true;
    await kvDel(key);
  }
}

export async function kvKeys(): Promise<string[]> {
  if (fallbackToLocal) {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(`${DB_NAME}:`))
      .map((k) => k.slice(DB_NAME.length + 1));
  }
  try {
    const db = await openDb();
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result.map(String));
      req.onerror = () => reject(req.error);
    });
  } catch {
    fallbackToLocal = true;
    return kvKeys();
  }
}

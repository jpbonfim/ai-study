/**
 * Persistent cache of rendered (sanitized) HTML in IndexedDB. Keys embed the document version,
 * so edits never serve stale content; TTL and an LRU bound keep storage small.
 */

const DB_NAME = 'study-render-cache';
const STORE = 'entries';

interface CacheEntry {
  key: string;
  value: unknown;
  /** Last write or read (LRU + TTL). */
  touchedAt: number;
  size: number;
}

export interface CacheStats {
  count: number;
  bytes: number;
}

let settings = { ttlMs: 1440 * 60 * 1000, maxEntries: 50 };

export function configureRenderCache(config: { ttlMinutes: number; maxEntries: number }): void {
  if (config.ttlMinutes > 0) settings.ttlMs = config.ttlMinutes * 60 * 1000;
  if (config.maxEntries > 0) settings = { ...settings, maxEntries: config.maxEntries };
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const request = fn(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function readCache<T>(key: string): Promise<T | null> {
  const entry = await run<CacheEntry | undefined>('readonly', (s) => s.get(key));
  if (!entry) return null;
  if (Date.now() - entry.touchedAt > settings.ttlMs) {
    void run('readwrite', (s) => s.delete(key));
    return null;
  }
  void run('readwrite', (s) => s.put({ ...entry, touchedAt: Date.now() }));
  return entry.value as T;
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  const size = JSON.stringify(value).length * 2;
  await run('readwrite', (s) => s.put({ key, value, touchedAt: Date.now(), size } satisfies CacheEntry));
  await enforceLimits();
}

async function allEntries(): Promise<CacheEntry[]> {
  return (await run<CacheEntry[]>('readonly', (s) => s.getAll())) ?? [];
}

async function enforceLimits(): Promise<void> {
  const entries = await allEntries();
  const now = Date.now();
  const expired = entries.filter((e) => now - e.touchedAt > settings.ttlMs);
  const alive = entries.filter((e) => now - e.touchedAt <= settings.ttlMs).sort((a, b) => a.touchedAt - b.touchedAt);
  const overflow = alive.slice(0, Math.max(0, alive.length - settings.maxEntries));
  for (const entry of [...expired, ...overflow]) await run('readwrite', (s) => s.delete(entry.key));
}

export async function cacheStats(): Promise<CacheStats> {
  const entries = await allEntries();
  return { count: entries.length, bytes: entries.reduce((sum, e) => sum + e.size, 0) };
}

export async function clearRenderCache(): Promise<void> {
  await run('readwrite', (s) => s.clear());
}

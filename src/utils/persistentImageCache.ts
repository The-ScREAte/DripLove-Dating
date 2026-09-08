// Persistent (IndexedDB-backed) image cache - unlike the in-memory blob Map in
// imageCache.ts, this survives app restarts/reloads, so a photo that loaded
// once while online can still render with no internet the next time the app
// opens. Every lookup/write degrades to a no-op when IndexedDB isn't
// available (private browsing, older WebViews) rather than throwing.

const DB_NAME = 'driplove-image-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;
// Capped so the cache can't grow unbounded on a long-lived session - oldest
// entries (by cachedAt) are evicted first once the limit is crossed.
const MAX_ENTRIES = 400;

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('cachedAt', 'cachedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
};

const evictIfNeeded = (db: IDBDatabase) => {
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const overBy = countReq.result - MAX_ENTRIES;
      if (overBy <= 0) return;
      const index = store.index('cachedAt');
      let deleted = 0;
      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && deleted < overBy) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
    };
  } catch {
    // Best-effort only - a failed eviction just means the cache grows a
    // little past its cap, not a correctness problem.
  }
};

const getCachedBlob = async (url: string): Promise<Blob | null> => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(url);
      req.onsuccess = () => resolve((req.result?.blob as Blob) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const putCachedBlob = async (url: string, blob: Blob): Promise<void> => {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ url, blob, cachedAt: Date.now() });
    tx.oncomplete = () => evictIfNeeded(db);
  } catch {
    // ignore - caching is a best-effort optimization, never load-bearing
  }
};

// Fire-and-forget: fetches `url` and stores it if not already cached. Safe to
// call on every successful <img> load - it no-ops quickly once cached.
export const warmImageCache = (url: string): void => {
  if (!url) return;
  void (async () => {
    try {
      const existing = await getCachedBlob(url);
      if (existing) return;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return;
      await putCachedBlob(url, blob);
    } catch {
      // Offline or blocked - nothing to warm right now.
    }
  })();
};

// Resolves to a fresh object URL for the cached blob, or null if this url was
// never cached. Caller is responsible for revoking the returned object URL
// once it's no longer rendered.
export const getCachedObjectUrl = async (url: string): Promise<string | null> => {
  const blob = await getCachedBlob(url);
  if (!blob) return null;
  return URL.createObjectURL(blob);
};

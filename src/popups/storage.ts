import type { PopupRecord } from './types';

/**
 * The ONE persistence helper for popup history. Safe when storage is blocked
 * (private mode, quota): falls back to memory for the session.
 */
const KEY = 'dl_popups_v1';

interface UserBlob {
  firstSeenAt: number;
  popups: Record<string, PopupRecord>;
}
type Blob = Record<string, UserBlob>;

export interface PopupStorage {
  getFirstSeen(userId: string, now: number): number;
  getRecord(userId: string, id: string): PopupRecord | null;
  setRecord(userId: string, id: string, rec: PopupRecord): void;
}

const emptyRecord = (): PopupRecord => ({
  lastShownAt: null,
  dayKey: '',
  dayCount: 0,
  total: 0,
  lastOutcome: null,
});

export const localDayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export const newRecord = emptyRecord;

export const createLocalPopupStorage = (backing?: Pick<Storage, 'getItem' | 'setItem'>): PopupStorage => {
  let memory: Blob = {};
  let useMemory = false;

  const store = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
    if (backing) return backing;
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  };

  const read = (): Blob => {
    if (useMemory) return memory;
    try {
      const raw = store()?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          memory = parsed as Blob;
          return memory;
        }
      }
    } catch {
      // unreadable: continue with memory
    }
    return memory;
  };

  const write = (blob: Blob): void => {
    memory = blob;
    if (useMemory) return;
    try {
      store()?.setItem(KEY, JSON.stringify(blob));
    } catch {
      useMemory = true;
    }
  };

  const user = (blob: Blob, userId: string, now: number): UserBlob => {
    const existing = blob[userId];
    if (existing && typeof existing === 'object') {
      if (!existing.popups) existing.popups = {};
      return existing;
    }
    const created: UserBlob = { firstSeenAt: now, popups: {} };
    blob[userId] = created;
    return created;
  };

  return {
    getFirstSeen(userId, now) {
      const blob = read();
      const had = !!blob[userId]?.firstSeenAt;
      const u = user(blob, userId, now);
      if (!had) write(blob);
      return u.firstSeenAt;
    },
    getRecord(userId, id) {
      const rec = read()[userId]?.popups?.[id];
      return rec ? { ...emptyRecord(), ...rec } : null;
    },
    setRecord(userId, id, rec) {
      const blob = read();
      const u = user(blob, userId, Date.now());
      u.popups[id] = rec;
      write(blob);
    },
  };
};

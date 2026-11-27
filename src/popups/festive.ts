/**
 * Festive greeting scheduling: shown only on the festival itself, once per person per festival occurrence
 * (e.g. 'christmas-2026'). Opening the app after the festival has passed shows nothing - we only ever ask while today is
 * inside the window, and the coordinator re-checks eligibility at the moment it would show.
 */
import { festiveKey, seasonOverride } from '@/utils/seasons';

const storageKey = (userId: string) => `dl_festive_seen_v1:${userId}`;

const readSeen = (userId: string): string[] => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const hasSeenFestival = (userId: string, key: string): boolean => readSeen(userId).includes(key);

export const markFestivalSeen = (userId: string, key: string): void => {
  try {
    const next = [...new Set([...readSeen(userId), key])].slice(-12); // a few years of festivals is plenty
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* storage blocked: worst case it shows again next open during the same festival */
  }
};

/** The festival to greet for today, or null (ordinary day / already greeted). A `?season=` preview always greets. */
export const festivalDue = (userId: string, now: Date = new Date()): string | null => {
  const preview = seasonOverride();
  if (preview) return `preview-${preview.id}`;
  const key = festiveKey(now);
  return key && !hasSeenFestival(userId, key) ? key : null;
};

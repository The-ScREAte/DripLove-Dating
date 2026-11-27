/**
 * Rating state persistence (localStorage, always wrapped - private windows and
 * blocked storage must never break the app). One key, migrates the old
 * "driplove_rating_funnel_v2" / "driplove_rating_v1" keys once.
 */
import { emptyState, pruneState, type RatingState } from './ratingEngine';

export const STORAGE_KEY = 'driplove_rating_v3';
const LEGACY_FUNNEL_KEY = 'driplove_rating_funnel_v2';
const LEGACY_V1_KEY = 'driplove_rating_data';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const defaultKV = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const loadRatingState = (now = Date.now(), kv: KV | null = defaultKV()): RatingState => {
  const fresh = emptyState(now);
  if (!kv) return fresh;
  try {
    const raw = kv.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RatingState>;
      if (parsed && parsed.v === 3) {
        return pruneState({ ...fresh, ...parsed } as RatingState, now);
      }
    }
    // One-time migration: anyone who tapped "Yes" in the old funnel stays
    // suppressed (they were already asked + the DB flag mirrors it).
    const legacy = kv.getItem(LEGACY_FUNNEL_KEY);
    if (legacy) {
      const l = JSON.parse(legacy) as { respondedYes?: boolean; lastShownAt?: number | null };
      const migrated: RatingState = {
        ...fresh,
        hasRated: Boolean(l.respondedYes),
        requests: l.respondedYes && l.lastShownAt ? [l.lastShownAt] : [],
      };
      saveRatingState(migrated, kv);
      kv.removeItem?.(LEGACY_FUNNEL_KEY);
      kv.removeItem?.(LEGACY_V1_KEY);
      return migrated;
    }
  } catch {
    // corrupt data - start clean
  }
  return fresh;
};

export const saveRatingState = (state: RatingState, kv: KV | null = defaultKV()): void => {
  if (!kv) return;
  try {
    kv.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / blocked - decisions just fall back to defaults next time
  }
};

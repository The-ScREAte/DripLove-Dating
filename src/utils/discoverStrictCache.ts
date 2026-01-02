/**
 * Strict 5-Profile Cache for Instant Discover Loads
 * 
 * Architecture:
 * - Always cache exactly 5 "next" profiles (ready to show)
 * - Discover opens instantly by rendering those 5 from cache
 * - On swipe: remove from cache immediately, update nextFive window
 * - On Premium change: hard refresh (clear cache, reset feed)
 * - No repetition: exclude swiped + already loaded in all paths
 * 
 * Storage: Capacitor Preferences (works on iOS/Android/Web)
 */

import { Preferences } from '@capacitor/preferences';
import { PotentialMatch } from '@/types';

export type CachedProfile = PotentialMatch & {
  // Minimal info needed to render instantly
  images?: string[];
  distance?: number;
};

export type DiscoverCacheRecord = {
  version: number;
  signature: string;
  savedAt: number; // Date.now()
  nextFive: CachedProfile[]; // EXACTLY 5 max
};

const CACHE_KEY = (userId: string) => `discover_next5_v1_${userId}`;
const CACHE_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Load cached next 5 profiles
 * Returns null if:
 * - No cache exists
 * - Version mismatch
 * - Expired (>24h)
 */
export async function loadNextFiveCache(userId: string): Promise<DiscoverCacheRecord | null> {
  if (!userId) return null;

  try {
    const { value } = await Preferences.get({ key: CACHE_KEY(userId) });
    if (!value) return null;

    const parsed = JSON.parse(value) as DiscoverCacheRecord;
    
    // Validate version
    if (parsed.version !== CACHE_VERSION) return null;
    
    // Check expiry
    if (Date.now() - parsed.savedAt > TTL_MS) return null;
    
    return parsed;
  } catch (err) {
    console.error('[discoverStrictCache] Failed to load cache:', err);
    return null;
  }
}

/**
 * Save next 5 profiles to cache
 * Enforces strict max 5 profiles
 */
export async function saveNextFiveCache(userId: string, record: DiscoverCacheRecord): Promise<void> {
  if (!userId) return;

  try {
    // Enforce strict max 5
    const clean: DiscoverCacheRecord = {
      ...record,
      version: CACHE_VERSION,
      savedAt: Date.now(),
      nextFive: (record.nextFive || []).slice(0, 5),
    };

    await Preferences.set({ 
      key: CACHE_KEY(userId), 
      value: JSON.stringify(clean) 
    });
  } catch (err) {
    console.error('[discoverStrictCache] Failed to save cache:', err);
  }
}

/**
 * Clear cache (used on Premium change, logout, etc.)
 */
export async function clearNextFiveCache(userId: string): Promise<void> {
  if (!userId) return;

  try {
    await Preferences.remove({ key: CACHE_KEY(userId) });
  } catch (err) {
    console.error('[discoverStrictCache] Failed to clear cache:', err);
  }
}

/**
 * Build feed signature that changes when filters or Premium status change
 * This prevents stale cache and guarantees hard switch between free/premium feeds
 */
export function buildDiscoverSignature(params: {
  userId: string;
  isPremium: boolean;
  selectedCountries: string[];
  distanceKm: number;
  ageMin?: number;
  ageMax?: number;
  genderPref?: string;
}): string {
  const stable = {
    u: params.userId,
    p: params.isPremium ? 1 : 0,
    c: [...params.selectedCountries].sort(),
    d: params.distanceKm,
    a: [params.ageMin ?? 18, params.ageMax ?? 99],
    g: params.genderPref ?? 'any',
    v: 1, // bump if algorithm changes
  };
  
  return JSON.stringify(stable);
}

/**
 * Utility: Deduplicate array by id
 */
export function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/**
 * Utility: Filter out swiped profiles
 */
export function filterOutSwiped<T extends { id: string }>(
  list: T[], 
  swipedSet: Set<string>
): T[] {
  return list.filter(p => !swipedSet.has(p.id));
}

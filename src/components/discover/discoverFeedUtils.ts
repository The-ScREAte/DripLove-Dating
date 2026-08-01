import { normalizeCountryCode } from '@/utils/countryCode';
import { createDeterministicShuffle } from '@/utils/discoverCache';
import { applyActivityWeighting } from '@/utils/activityWeighting';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

export const uniqUuids = (values: unknown[]): string[] => Array.from(new Set(values.filter(isUuid)));

export const todayStr = () => new Date().toISOString().split('T')[0];

// Keep weighting bounded to the head slice to cap CPU on large decks.
export const applyLightActivityWeighting = <T,>(profiles: T[], seed: string, headSize = 32): T[] => {
  if (!profiles || profiles.length === 0) return profiles;
  const head = profiles.slice(0, headSize);
  const tail = profiles.slice(headSize);
  const weightedHead = applyActivityWeighting(head as never[], seed) as T[];
  return [...weightedHead, ...tail];
};

export const getUserFeedSeed = (userId: string): string => {
  const dateStr = todayStr();
  return `${userId}_${dateStr}`;
};

const swipeCountCacheKey = (userId: string) => `driplove_swipe_count_${userId}_${todayStr()}`;

export const readCachedSwipeCount = (userId: string): number | null => {
  try {
    const raw = localStorage.getItem(swipeCountCacheKey(userId));
    if (!raw) return null;
    const parsed = Number(JSON.parse(raw));
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.floor(parsed);
  } catch {
    return null;
  }
};

export const writeCachedSwipeCount = (userId: string, count: number) => {
  try {
    if (!Number.isFinite(count) || count < 0) return;
    localStorage.setItem(swipeCountCacheKey(userId), JSON.stringify(Math.floor(count)));
  } catch {
    // ignore
  }
};

export const formatUuidInFilter = (ids: string[], maxLen = 3500) => {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return '()';

  const build = (count: number) => `(${unique.slice(0, count).join(',')})`;
  if (build(unique.length).length <= maxLen) return build(unique.length);

  let low = 0;
  let high = unique.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (build(mid).length <= maxLen) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low > 0 ? build(low) : '()';
};

export const hashStringToInt = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const seededRandomFromString = (seedStr: string) => {
  let seed = hashStringToInt(seedStr);
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
};

export const getTrustedBaseCountryCode = (countryCode: unknown, country: unknown): string => {
  const cc = normalizeCountryCode(String(countryCode || ''));
  const cn = normalizeCountryCode(String(country || ''));
  if (cc && cn && cc !== cn) return cn;
  return cc || cn;
};

export const isLocalCountryForFreeUser = (
  p: { country_code?: unknown; country?: unknown },
  baseCountryCode: string
): boolean => {
  if (!baseCountryCode) return false;
  const cc = normalizeCountryCode(String(p?.country_code || ''));
  const cn = normalizeCountryCode(String(p?.country || ''));
  if (cc && cn) return cc === baseCountryCode && cn === baseCountryCode;
  return (cc || cn) === baseCountryCode;
};

export const mixByCountryRoundRobin = <T extends { country_code?: string | null; id: string }>(
  profiles: T[],
  countryCodes: string[],
  seed: string
): T[] => {
  const orderedCountries = countryCodes.map(normalizeCountryCode).filter(Boolean);
  if (orderedCountries.length <= 1) return profiles;

  const buckets = new Map<string, T[]>();
  for (const c of orderedCountries) buckets.set(c, []);
  for (const p of profiles) {
    const cc = normalizeCountryCode(p.country_code || '');
    if (!cc) continue;
    if (!buckets.has(cc)) continue;
    buckets.get(cc)!.push(p);
  }

  for (const c of orderedCountries) {
    const list = buckets.get(c)!;
    buckets.set(c, createDeterministicShuffle(list, `${seed}_${c}`));
  }

  const rand = seededRandomFromString(seed);
  const result: T[] = [];
  let countryIndex = 0;

  while (true) {
    let hasAny = false;
    for (const c of orderedCountries) {
      if (buckets.get(c)!.length > 0) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) break;

    const currentCountry = orderedCountries[countryIndex % orderedCountries.length];
    const list = buckets.get(currentCountry);

    if (list && list.length > 0) {
      const r = rand();
      let chunkSize = 1;
      if (r > 0.7 && list.length >= 2) chunkSize = 2;
      if (r > 0.85 && list.length >= 3) chunkSize = 3;

      for (let i = 0; i < chunkSize && list.length > 0; i++) {
        result.push(list.shift()!);
      }
    }

    countryIndex++;
  }

  return result;
};

export const buildFeedSignature = (
  baseCountryCode: string,
  unlockedCountries: string[],
  isPremium: boolean,
  maxDistance: number
) => {
  const base = normalizeCountryCode(baseCountryCode);
  const unlockedSignature = isPremium
    ? unlockedCountries.map(normalizeCountryCode).filter(Boolean).sort().join(',')
    : '';
  return `v10_${hashStringToInt(`${base}|${unlockedSignature}|${maxDistance}|${isPremium ? 'premium' : 'free'}`).toString(36)}`;
};

export const buildSavedOrderKey = (userId: string, feedSignature: string) =>
  `driplove_profile_order_${userId}_${todayStr()}_${feedSignature}`;

export const readPersistentItem = (key: string): string | null => {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // ignore
  }
  try {
    const v = sessionStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // ignore
  }
  return null;
};

export const writePersistentItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export const normalizeCountryCodeList = (value: unknown, baseCountryCode?: string): string[] => {
  const normalize = (items: unknown[]): string[] => {
    const baseNorm = typeof baseCountryCode === 'string' ? normalizeCountryCode(baseCountryCode) : undefined;
    const result = items
      .filter((c): c is string => typeof c === 'string')
      .map((c) => normalizeCountryCode(c))
      .filter((c) => c.length > 0);
    return baseNorm ? result.filter((c) => c !== baseNorm) : result;
  };

  if (Array.isArray(value)) {
    return normalize(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalize(parsed);
    } catch {
      // ignore
    }

    const cleaned = trimmed.replace(/[{}[\]"]+/g, '');
    const parts = cleaned.split(',').map((s) => normalizeCountryCode(s)).filter(Boolean);
    return normalize(parts);
  }

  return [];
};

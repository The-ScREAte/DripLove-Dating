/**
 * Pure helpers for Circle's category counts and the locked-tile teasers.
 *
 * HONESTY RULES (shown to users as advertising, so they are strict):
 *  - A teaser number is ALWAYS rounded DOWN to a friendly bucket ("1k+", "850+"), never up, so
 *    it can never claim more people than there really are.
 *  - When the true count is unknown (the count query failed / is still loading) we do NOT invent
 *    a specific figure. The fallback is deliberately vague ("Many") and is only used for the
 *    decorative lock tile, never as a statistic.
 */

const MS_PER_DAY = 86_400_000;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The date-of-birth window that matches an age range, so the age filter can run in the database
 * (count queries no longer download every row just to check ages client-side).
 * `latest` = born on/before this date => at least `minAge`; `earliest` = born on/after this date
 * => at most `maxAge`. Both inclusive, as ISO yyyy-mm-dd.
 */
export const dobBoundsForAgeRange = (
  minAge: number,
  maxAge: number,
  now: Date = new Date()
): { earliest: string; latest: string } => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const latest = new Date(Date.UTC(y - minAge, m, d));
  // age <= maxAge  <=>  not yet (maxAge + 1) => born AFTER (today - (maxAge + 1) years)
  const earliest = new Date(Date.UTC(y - (maxAge + 1), m, d) + MS_PER_DAY);
  return { earliest: isoDate(earliest), latest: isoDate(latest) };
};

/** Exact value up to this many people; refine by real distance only below it (cheap). */
export const EXACT_RADIUS_REFINE_MAX = 250;

/**
 * One decimal, rounded DOWN, trailing ".0" dropped, with k / M suffix: 1000 -> "1k", 2149 -> "2.1k",
 * 15800 -> "15.8k", 1_000_000 -> "1M". Integer math only (no float rounding surprises).
 */
const compactDown = (n: number): string => {
  if (n >= 1_000_000) {
    const m = Math.floor(n / 100_000) / 10;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  const k = Math.floor(n / 100) / 10;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
};

/**
 * Compact display for an exact count on an UNLOCKED tile: "42", "1.2k". Rounds down.
 */
export const formatCountCompact = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  return compactDown(n);
};

/**
 * Marketing label for the LOCKED tile - always the largest friendly step that is <= the true
 * count, with a "+", so it can never overstate:
 *   < 10        exact            7      -> "7"
 *   10 - 99     floor to 10      57     -> "50+"
 *   100 - 999   floor to 50      850    -> "850+", 999 -> "950+"
 *   >= 1000     one decimal k    2149   -> "2.1k+", 15800 -> "15.8k+"
 *   >= 1M       one decimal M    1.2M   -> "1.2M+"
 * Returns null for 0 (nothing to advertise).
 */
export const teaserBucketLabel = (trueCount: number): string | null => {
  if (!Number.isFinite(trueCount) || trueCount <= 0) return null;
  const n = Math.floor(trueCount);
  if (n < 10) return String(n);
  if (n < 100) return `${Math.floor(n / 10) * 10}+`;
  if (n < 1000) return `${Math.floor(n / 50) * 50}+`;
  return `${compactDown(n)}+`;
};

/**
 * What the locked tile shows. `count === null` means the real count is unavailable: we then show
 * a vague, clearly-qualitative label (never a made-up figure).
 */
export const teaserDisplay = (count: number | null): { label: string | null; vague: boolean } => {
  if (count === null) return { label: null, vague: true };
  return { label: teaserBucketLabel(count), vague: false };
};

/**
 * Deterministic hue per (category, day) for the decorative blurred avatars on a locked tile, so the
 * cluster looks varied but does not reshuffle on every render. Decorative only - no real data.
 */
export const teaserHues = (key: string, count = 4, day: string = isoDate(new Date())): number[] => {
  let h = 2166136261;
  const s = `${key}:${day}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const base = Math.abs(h) % 360;
  // brand-adjacent spread (pink/magenta/purple/blue/warm) rather than the whole wheel
  const palette = [330, 300, 275, 255, 20, 345];
  return Array.from({ length: count }, (_, i) => palette[(Math.abs(base) + i * 2) % palette.length]);
};

/**
 * Removing someone from a swipe deck that is being shown must not move the card the user is on.
 * `index` is the position of the CURRENT card. Removing an earlier person shifts everything left,
 * so the index follows; removing the current person leaves the index (the next one slides in);
 * removing a later person changes nothing. (The old code removed the just-swiped person AFTER
 * already advancing the index, which skipped one profile on every swipe.)
 */
export const removeFromDeck = (
  ids: string[],
  index: number,
  removedId: string
): { ids: string[]; index: number; removed: boolean } => {
  const at = ids.indexOf(removedId);
  if (at === -1) return { ids, index, removed: false };
  const next = ids.filter((id) => id !== removedId);
  return { ids: next, index: at < index ? Math.max(0, index - 1) : index, removed: true };
};

/**
 * Where a profile whose like/pass failed to save goes back in the deck: right after the current
 * card (so the user gets it next without it replacing what they are looking at).
 */
export const rollbackInsertIndex = (currentIndex: number, length: number): number =>
  Math.min(currentIndex + 1, length);

/** How many cards ahead have their photos prefetched/decoded (the next two get ALL photos). */
export const PREFETCH_AHEAD = 4;
export const prefetchWindow = (index: number, length: number): { full: number[]; first: number[] } => {
  const full: number[] = [];
  const first: number[] = [];
  for (let i = index; i < Math.min(length, index + PREFETCH_AHEAD); i++) {
    (i - index < 2 ? full : first).push(i);
  }
  return { full, first };
};

/** Small deterministic hue for a decorative placeholder, derived from any string (carries no identity). */
export const hueFromString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const palette = [330, 300, 275, 255, 20, 345];
  return palette[Math.abs(h) % palette.length];
};

/**
 * Which pool the tile counts describe.
 *  - 'worldwide' = the ENTIRE APP: every member of the circle, with NO country, gender, age or
 *    distance filter (only the viewer, non-active/archived accounts and blocked pairs are left
 *    out). Shown on LOCKED tiles to a FREE viewer, and to a PREMIUM viewer who has not picked any
 *    countries yet (with a hint to pick some). Because the pill is just a member count it is
 *    simply true.
 *  - 'selected' = a PREMIUM viewer who picked countries: their home country (distance-limited, as
 *    in the deck) plus the selected ones, with their own preferences - so the number equals what
 *    they will actually see in the deck.
 */
export interface CircleCountScope {
  mode: 'worldwide' | 'selected';
  /** null = no country filter at all (entire app). */
  countryCodes: string[] | null;
  /** null = no age filter at all. */
  ageRange: { min: number; max: number } | null;
  /** Apply the viewer's gender preference / reciprocal preference. false for the entire-app total. */
  applyGender: boolean;
  applyDistance: boolean;
  showCountryHint: boolean;
}

const uniqueCodes = (codes: (string | null | undefined)[]): string[] =>
  Array.from(new Set(codes.map((c) => (c || '').trim().toUpperCase()).filter(Boolean)));

export const buildCircleCountScope = (o: {
  isPremium?: boolean;
  homeCountry?: string | null;
  selectedCountries?: string[] | null;
  prefs: { minAge?: number | null; maxAge?: number | null };
}): CircleCountScope => {
  const home = (o.homeCountry || '').trim().toUpperCase();
  const selected = uniqueCodes(o.selectedCountries ?? []).filter((c) => c !== home);
  if (o.isPremium === true && selected.length > 0) {
    return {
      mode: 'selected',
      countryCodes: uniqueCodes([home, ...selected]),
      ageRange: { min: o.prefs.minAge || 18, max: o.prefs.maxAge || 99 },
      applyGender: true,
      applyDistance: true,
      showCountryHint: false,
    };
  }
  return {
    mode: 'worldwide',
    countryCodes: null,
    ageRange: null,
    applyGender: false,
    applyDistance: false,
    showCountryHint: o.isPremium === true,
  };
};

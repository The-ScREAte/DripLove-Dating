/**
 * Activity-Based Visibility Weighting
 * 
 * Bias feed toward recently active users (within 72 hours) without filtering anyone out.
 * This is Tinder-style behavior: active users appear earlier and more frequently,
 * but inactive users are still shown (just later in the queue).
 * 
 * SAFETY:
 * - No users are removed (only reordered)
 * - No filters are touched
 * - No premium logic is touched
 * - Deterministic shuffle still applies
 */

// Minimal interface - profiles just need id and optional activity timestamps
export interface ProfileWithActivity {
  id: string;
  last_login_at?: string | null;
  created_at?: string | null;
  current_streak?: number | null;
}

// 72-hour activity window (Tinder's standard)
const ACTIVE_WINDOW_MS = 72 * 60 * 60 * 1000;

// Seeded random for deterministic shuffling within activity groups
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  const random = seededRandom(hashString(seed));
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Exponential decay half-life-ish constant for recency scoring. With this
// value: active 2h ago ≈ 0.96, 24h ≈ 0.60, 72h ≈ 0.22, 7 days ≈ 0.03 - a
// smooth curve instead of a flat "in the last 72h or not" line, so someone
// active 2 hours ago is meaningfully preferred over someone active 71 hours
// ago instead of the two being treated identically.
const RECENCY_DECAY_CONSTANT_HOURS = 48;

// How much a deterministic per-profile jitter can perturb the decay score
// before sorting. Small relative to the 0-1 decay range on purpose: it's
// enough to reshuffle people who are all in a similar activity tier (e.g.
// several people all active within the last few hours), but nowhere near
// enough for a genuinely stale profile to ever jump ahead of an active one -
// this is what keeps the "always the single most-recently-active person
// first, for everyone, every day" staleness a hard sort would produce from
// happening, while still following the exponential curve, not a bucket line.
const RECENCY_JITTER_AMPLITUDE = 0.15;

function recencyDecayScore(lastActiveStr: string | null | undefined, now: number): number {
  if (!lastActiveStr) return 0; // no activity data at all - treat as maximally stale
  const lastActiveMs = new Date(lastActiveStr).getTime();
  if (!Number.isFinite(lastActiveMs)) return 0;
  const hoursSince = Math.max(0, (now - lastActiveMs) / (60 * 60 * 1000));
  return Math.exp(-hoursSince / RECENCY_DECAY_CONSTANT_HOURS);
}

// Daily login streak priority (see record_daily_login in
// supabase/migrations/20260920180000_daily_login_streak.sql and the streak
// flash UI): every 5 consecutive days is one "streak level" - day 1-5 is
// level 1, day 6-10 is level 2, and so on. Each level adds a small, capped
// boost on top of the recency decay score above, so a long streak gives a
// real edge in ranking without ever letting streak alone override genuine
// recent activity (the boost is well under the 0-1 decay range, and caps
// out rather than growing unbounded for very long streaks).
const STREAK_LEVEL_SIZE = 5;
const STREAK_BOOST_PER_LEVEL = 0.05;
const STREAK_BOOST_CAP = 0.35;

export function getStreakLevel(streak: number | null | undefined): number {
  if (!streak || streak < 1) return 0;
  return Math.floor((streak - 1) / STREAK_LEVEL_SIZE) + 1;
}

function streakBoost(streak: number | null | undefined): number {
  const level = getStreakLevel(streak);
  return Math.min(STREAK_BOOST_CAP, level * STREAK_BOOST_PER_LEVEL);
}

/**
 * Reorder profiles by a smooth, exponentially-decaying recency score instead
 * of a binary "active within 72h or not" bucket split. More recently active
 * people rank higher on a continuous curve; a small deterministic jitter
 * (seeded, so it's stable for a given user/day) keeps people within a
 * similar activity tier from always landing in the exact same order, without
 * ever letting a stale profile leapfrog an active one.
 *
 * This is still a SOFT weighting - no one is removed, just reordered.
 */
export function applyActivityWeighting<T extends { id: string; last_login_at?: string | null; created_at?: string | null; current_streak?: number | null }>(
  profiles: T[],
  seed: string = ''
): T[] {
  if (profiles.length === 0) return [];

  const now = Date.now();
  const jitterRandom = seededRandom(hashString(`${seed}_recency_jitter`));

  const scored = profiles.map((profile) => {
    // Use last_login_at if available, fallback to created_at (account creation = first activity)
    const lastActiveStr = profile.last_login_at || profile.created_at;
    const decay = recencyDecayScore(lastActiveStr, now);
    const jitter = (jitterRandom() - 0.5) * RECENCY_JITTER_AMPLITUDE;
    const boost = streakBoost(profile.current_streak);
    return { profile, rank: decay + jitter + boost };
  });

  scored.sort((a, b) => b.rank - a.rank);
  return scored.map((s) => s.profile);
}

/**
 * Get rescue candidates for swipe fatigue.
 * Returns recently active profiles that could help break a no-match streak.
 * 
 * @param profiles - All available profiles
 * @param count - Number of rescue profiles to return
 * @param seed - Seed for deterministic shuffling
 * @returns Array of recently active profiles
 */
export function getSwipeFatigueRescueCandidates<T extends { id: string; last_login_at?: string | null; created_at?: string | null }>(
  profiles: T[],
  count: number = 3,
  seed: string = '',
  likedMeIds?: Iterable<string>
): T[] {
  if (profiles.length === 0) return [];
  
  const now = Date.now();
  const likedSet = likedMeIds ? new Set(Array.from(likedMeIds)) : null;
  
  // Find recently active profiles
  const activeCandidates = profiles.filter(profile => {
    const lastActiveStr = profile.last_login_at || profile.created_at;
    if (!lastActiveStr) return false;
    
    const lastActiveMs = new Date(lastActiveStr).getTime();
    return now - lastActiveMs <= ACTIVE_WINDOW_MS;
  }); 

  // Prefer “liked me” candidates first (still activity-gated)
  const activeLikedMe = likedSet
    ? activeCandidates.filter((p) => likedSet.has(p.id))
    : [];
  const activeNonLiked = likedSet
    ? activeCandidates.filter((p) => !likedSet.has(p.id))
    : activeCandidates;
  
  if (activeCandidates.length === 0) return [];
  
  // Shuffle deterministically within groups, then take top N
  const shuffledLiked = shuffleWithSeed(activeLikedMe, `${seed}_rescue_liked_me`);
  const shuffledOther = shuffleWithSeed(activeNonLiked, `${seed}_rescue_active`);

  const seen = new Set<string>();
  const merged: T[] = [];
  for (const p of [...shuffledLiked, ...shuffledOther]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
    if (merged.length >= count) break;
  }

  return merged;
}

/**
 * Inject rescue profiles into the feed with proper spacing.
 * Respects the 15% cap on injected profiles.
 * 
 * @param feed - Current feed array
 * @param rescueProfiles - Profiles to inject
 * @param options - Injection options
 * @returns Feed with rescue profiles injected
 */
export function injectRescueProfiles<T extends { id: string }>(
  feed: T[],
  rescueProfiles: T[],
  options: {
    maxPercent?: number;
    spacing?: [number, number]; // [min, max] positions between injections
    startPosition?: number;
    seed?: string; // required for deterministic spacing
  } = {}
): T[] {
  if (rescueProfiles.length === 0 || feed.length === 0) return feed;
  
  const { maxPercent = 0.15, spacing = [3, 6], startPosition = 0, seed = '' } = options;
  const random = seededRandom(hashString(`${seed}_spacing`));
  
  // Cap at maxPercent of feed
  const maxToInject = Math.ceil(feed.length * maxPercent);
  const toInject = rescueProfiles.slice(0, maxToInject);
  
  // Remove duplicates (profiles already in feed)
  const feedIds = new Set(feed.map(p => p.id));
  const uniqueToInject = toInject.filter(p => !feedIds.has(p.id));
  
  if (uniqueToInject.length === 0) return feed;
  
  // Create result with injections
  const result = [...feed];
  let injected = 0;
  let currentPos = startPosition;
  
  for (const profile of uniqueToInject) {
    // Calculate next injection position
    const [minSpace, maxSpace] = spacing;
    const space = minSpace + Math.floor(random() * (maxSpace - minSpace + 1));
    currentPos += space;
    
    if (currentPos >= result.length) break;
    
    // Insert at position
    result.splice(currentPos, 0, profile);
    injected++;
    currentPos++; // Account for the inserted item
  }
  
  return result;
}

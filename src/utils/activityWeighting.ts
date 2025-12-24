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

export interface ProfileWithActivity {
  id: string;
  last_login_at?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
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

/**
 * Categorize profiles by recent activity and reorder for better matching.
 * Active users (logged in within 72h) appear first, shuffled.
 * Less active users appear after, also shuffled.
 * 
 * This is a SOFT weighting - no one is removed, just reordered.
 */
export function applyActivityWeighting<T extends ProfileWithActivity>(
  profiles: T[],
  seed: string = ''
): T[] {
  if (profiles.length === 0) return [];
  
  const now = Date.now();
  const activeProfiles: T[] = [];
  const lessActiveProfiles: T[] = [];
  
  for (const profile of profiles) {
    // Use last_login_at if available, fallback to created_at (account creation = first activity)
    const lastActiveStr = profile.last_login_at || profile.created_at;
    
    if (!lastActiveStr) {
      // No activity data - treat as less active
      lessActiveProfiles.push(profile);
      continue;
    }
    
    const lastActiveMs = new Date(lastActiveStr).getTime();
    
    if (now - lastActiveMs <= ACTIVE_WINDOW_MS) {
      activeProfiles.push(profile);
    } else {
      lessActiveProfiles.push(profile);
    }
  }
  
  // Shuffle each group deterministically for variety, then concatenate
  // Active users come first for higher match probability
  const shuffledActive = shuffleWithSeed(activeProfiles, `${seed}_active`);
  const shuffledLessActive = shuffleWithSeed(lessActiveProfiles, `${seed}_less_active`);
  
  return [...shuffledActive, ...shuffledLessActive];
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
export function getSwipeFatigueRescueCandidates<T extends ProfileWithActivity>(
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

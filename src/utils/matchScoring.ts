/**
 * Tier 2 — Compatibility Scoring
 *
 * Scores a candidate against the viewer using only signals the viewer (and,
 * symmetrically, the candidate) actually engaged with. Nothing here is a
 * hard filter — Tier 1 (gender/orientation, age, distance cap, exclusions)
 * always runs first and is untouched by this module.
 *
 * "Unset" detection (Option B): `interests`/personality sliders/`max_distance`
 * are never persisted as NULL in this schema - every save writes a default
 * value (`interests = []`, sliders = 50, `max_distance` defaults to 250 at
 * the app layer and is force-corrected to 50 by a DB trigger if it's ever
 * NULL) whether or not the person actually touched the control. There is no
 * reliable way today to tell "chose the default" apart from "never touched
 * it." Rather than block this on a schema/form-flow change, we treat those
 * default-looking values as "not set" - the accepted risk is a small number
 * of people who deliberately chose exactly-neutral getting silently skipped
 * for that one component, which is a much smaller miss than never
 * differentiating engaged users from disengaged ones at all.
 *
 * A scoring component only fires when BOTH sides show real signal for it -
 * this is what "no blank score, no penalty" means in practice: a candidate
 * who never set interests isn't scored 0 for interest overlap, the
 * component is simply skipped for that pair, same as it would be if the
 * viewer hadn't set interests either.
 */

export interface ScorableProfile {
  interests?: string[] | null;
  introvert_extrovert?: number | null;
  spontaneous_planner?: number | null;
  messy_organized?: number | null;
}

const INTEREST_WEIGHT = 0.4;
const PERSONALITY_WEIGHT = 0.3;
const DISTANCE_WEIGHT = 0.3;

// Default value every slider is saved with unless actively dragged - see
// module docblock for why this is treated as "unset" rather than a real
// deliberate-neutral choice.
const SLIDER_DEFAULT = 50;

// Distance decay's characteristic radius: at this distance the decay factor
// is 1/e (~37%); by ~3x this distance it's under 5%. 25km keeps the curve
// meaningful within typical city-scale distances while still leaving a small
// non-zero preference even for far-away matches within the hard cap (soft
// decay, not a second cutoff).
const DISTANCE_SOFT_RADIUS_KM = 25;

const hasEngagedInterests = (interests?: string[] | null): interests is string[] =>
  Array.isArray(interests) && interests.length > 0;

const hasEngagedPersonality = (profile: ScorableProfile): boolean => {
  const sliders = [profile.introvert_extrovert, profile.spontaneous_planner, profile.messy_organized];
  return sliders.some((v) => typeof v === 'number' && Number.isFinite(v) && v !== SLIDER_DEFAULT);
};

const interestOverlapScore = (viewerInterests: string[], candidateInterests: string[]): number => {
  const viewerSet = new Set(viewerInterests.map((i) => i.toLowerCase().trim()));
  const candidateSet = new Set(candidateInterests.map((i) => i.toLowerCase().trim()));
  let shared = 0;
  for (const interest of viewerSet) {
    if (candidateSet.has(interest)) shared++;
  }
  const denominator = Math.max(viewerSet.size, candidateSet.size);
  if (denominator === 0) return 0;
  return shared / denominator;
};

const personalityProximityScore = (viewer: ScorableProfile, candidate: ScorableProfile): number => {
  const pairs: Array<[number | null | undefined, number | null | undefined]> = [
    [viewer.introvert_extrovert, candidate.introvert_extrovert],
    [viewer.spontaneous_planner, candidate.spontaneous_planner],
    [viewer.messy_organized, candidate.messy_organized],
  ];
  const diffs = pairs.map(([a, b]) => {
    const av = typeof a === 'number' && Number.isFinite(a) ? a : SLIDER_DEFAULT;
    const bv = typeof b === 'number' && Number.isFinite(b) ? b : SLIDER_DEFAULT;
    return Math.abs(av - bv);
  });
  const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
  // Sliders are 0-100, so the max possible avg diff is 100.
  return 1 - avgDiff / 100;
};

const distanceDecayScore = (distanceKm: number): number => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  return Math.exp(-distanceKm / DISTANCE_SOFT_RADIUS_KM);
};

/**
 * Returns a 0-1 compatibility score, or `null` if Tier 2 should be skipped
 * entirely for this pair (no component had real signal on both sides) - the
 * caller should fall through to Tier 3 pool ordering with no score applied,
 * never render a "0% compatible" badge for a null result.
 */
export const computeCompatibilityScore = (
  viewer: ScorableProfile,
  candidate: ScorableProfile,
  distanceKm: number | null | undefined
): number | null => {
  let weightedSum = 0;
  let totalWeight = 0;

  const viewerInterests = viewer.interests ?? [];
  const candidateInterests = candidate.interests ?? [];
  if (hasEngagedInterests(viewerInterests) && hasEngagedInterests(candidateInterests)) {
    weightedSum += interestOverlapScore(viewerInterests, candidateInterests) * INTEREST_WEIGHT;
    totalWeight += INTEREST_WEIGHT;
  }

  if (hasEngagedPersonality(viewer) && hasEngagedPersonality(candidate)) {
    weightedSum += personalityProximityScore(viewer, candidate) * PERSONALITY_WEIGHT;
    totalWeight += PERSONALITY_WEIGHT;
  }

  // Distance always fires (no "unset" branch - see design note in the
  // conversation this module was built from: max_distance never has a real
  // unset state in this schema, and a soft preference for closer matches
  // isn't a genuine "intent signal" the way interests/personality are, so
  // there's no meaningful downside to always applying it).
  if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
    weightedSum += distanceDecayScore(distanceKm) * DISTANCE_WEIGHT;
    totalWeight += DISTANCE_WEIGHT;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
};

// --- Deterministic per-user-per-day shuffle, same technique used elsewhere
// in the Discover feed (country mixing, activity weighting) - reordering
// stays stable for a given user across a session/day instead of jittering
// on every re-render, then rotates the next day.
function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  let state = hashSeed(seed);
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const HIGH_COMPATIBILITY_THRESHOLD = 0.6;
const MID_COMPATIBILITY_THRESHOLD = 0.35;

/**
 * Biases a deck toward higher Tier 2 compatibility scores WITHOUT collapsing
 * it into a strict "best score first" sort - that would fight the fairness/
 * variety machinery already built into the feed (country round-robin,
 * account-age stratification, per-day randomization), which exists so the
 * same handful of top-scoring profiles don't get shown to everyone while
 * everyone else goes unseen. Instead this buckets into three compatibility
 * tiers and shuffles within each bucket (same "bucket + shuffle" pattern the
 * existing activity weighting already uses), so higher-compatibility
 * profiles tend to surface earlier without becoming a rigid leaderboard.
 *
 * Profiles where Tier 2 didn't fire at all (`score === null` - no shared
 * signal either way) land in the middle bucket, same as a genuinely
 * middling score - "skip scoring" means "don't penalize or reward," which a
 * neutral bucket placement satisfies without needing a fourth bucket.
 */
export const applyCompatibilityWeighting = <T extends { id: string } & ScorableProfile>(
  profiles: T[],
  viewer: ScorableProfile,
  distanceById: Record<string, number | undefined>,
  seed: string
): T[] => {
  if (profiles.length === 0) return profiles;

  const high: T[] = [];
  const mid: T[] = [];
  const low: T[] = [];

  for (const profile of profiles) {
    const score = computeCompatibilityScore(viewer, profile, distanceById[profile.id]);
    if (score === null || (score >= MID_COMPATIBILITY_THRESHOLD && score < HIGH_COMPATIBILITY_THRESHOLD)) {
      mid.push(profile);
    } else if (score >= HIGH_COMPATIBILITY_THRESHOLD) {
      high.push(profile);
    } else {
      low.push(profile);
    }
  }

  return [
    ...seededShuffle(high, `${seed}_compat_high`),
    ...seededShuffle(mid, `${seed}_compat_mid`),
    ...seededShuffle(low, `${seed}_compat_low`),
  ];
};

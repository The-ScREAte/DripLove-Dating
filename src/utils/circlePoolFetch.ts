// Circle's "light pool of eligible people" fetch, extracted out of
// CirclePage.tsx so it can be called from two places without drifting out of
// sync: CirclePage's own effect (a live fetch on mount/param change) and
// MainApp's proactive background preloader (see preloadCircleData there),
// which is what actually makes Circle feel instant - Chat and Liked Me both
// already warm a window-level cache in the background right after login,
// before the user has ever opened either tab, so by the time they tap in
// it's already there. Circle never had an equivalent, so it was the one tab
// that always started from a blank loading spinner.
import { supabase } from '@/integrations/supabase/client';
import { CurrentUser } from '@/types';
import { calculateAge } from '@/utils/discoverCache';
import { normalizeCountryCode } from '@/utils/countryCode';
import { matchesReciprocalPreference, normalizeCountryCodeList } from '@/components/discover/discoverFeedUtils';
import { parseFavorites } from '@/constants/favorites';
import { calculateDistance } from '@/constants/locationData';

// Mirrors DiscoverPage.tsx's own distance-cap constants exactly, so Circle's
// notion of "how far is too far" never drifts from Discover's - free users
// get the same generous-but-capped radius, premium the same uncapped one.
const DEFAULT_MAX_DISTANCE_KM = 50;
const FREE_USER_MAX_DISTANCE_KM = 600;
// Approximate km-per-degree of latitude - same conversion DiscoverPage uses
// to turn a straight-line distance cap into the RPC's lat/lon bounding box,
// which is then narrowed to a true circle by the client-side calculateDistance
// check below (a bounding box is a rough pre-filter, not the real answer).
const KM_PER_DEGREE_LATITUDE = 111.32;

export interface CircleProfile {
  id: string;
  first_name: string;
  last_name: string;
  bio: string;
  city: string;
  country: string;
  country_code: string;
  occupation: string;
  education_level: string;
  date_of_birth: string;
  interests: string[];
  gender: string;
  preference?: string;
  relationship_intent?: string;
  love_style?: string[];
  pets?: string[];
  communication_style?: string[];
  family_plans?: string | null;
  social_media?: string | null;
  favorites?: { category: string; detail?: string; topArtists?: string[]; link?: string }[] | null;
  adinkra_symbols?: string[] | null;
  languages?: string[] | null;
  introvert_extrovert?: number | null;
  spontaneous_planner?: number | null;
  messy_organized?: number | null;
  smoking?: string | null;
  drinking?: string | null;
  exercise_level?: string | null;
  sleeping_schedule?: string | null;
  last_login_at?: string | null;
  is_verified?: boolean;
  max_distance?: number | null;
  distance_preference?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  fun_fact?: string | null;
  perfect_first_date?: string | null;
  last_googled?: string | null;
  firstImage: string | null;
}

export const getCircleGenderFilter = (userPreference: string) => {
  if (userPreference === 'male') return ['male'];
  if (userPreference === 'female') return ['female'];
  return ['male', 'female', 'other'];
};

// Matches Discover's own exclusion set exactly (see DiscoverPage.tsx's
// excludedIds) - people who've liked YOU are deliberately not excluded
// there (they still surface in the deck; Liked Me is what shows the
// "someone likes you" side of it), so Circle doesn't exclude them either.
// Only your own actions - a like/pass you gave, a match, a block either
// way, or an active cooldown - take someone out of the pool. Exported on
// its own (not just inlined in fetchCirclePool) so a stored Recommended/
// Similar batch can be reconciled against the REAL current exclusion set,
// not against whether someone happened to land in this call's random
// 80-row pool sample - a still-undecided person can miss that sample by
// chance and must never be treated as "decided" because of it.
export const fetchCircleExclusionIds = async (userId: string): Promise<Set<string>> => {
  const [likesRes, matchesRes, blocksRes, passesRes, cooldownsRes] = await Promise.all([
    supabase.from('likes').select('liked_id').eq('liker_id', userId),
    supabase.from('matches').select('user1_id,user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
    supabase.from('blocks').select('blocked_id,blocker_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    supabase.from('passes').select('passed_id').eq('passer_id', userId).gte('passed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('match_cooldowns').select('user1_id,user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).gt('expires_at', new Date().toISOString()),
  ]);

  const excluded = new Set<string>([userId]);
  (likesRes.data || []).forEach((l) => l.liked_id && excluded.add(l.liked_id));
  (matchesRes.data || []).forEach((m) => excluded.add(m.user1_id === userId ? m.user2_id : m.user1_id));
  (blocksRes.data || []).forEach((b) => { if (b.blocked_id) excluded.add(b.blocked_id); if (b.blocker_id) excluded.add(b.blocker_id); });
  (passesRes.data || []).forEach((p) => p.passed_id && excluded.add(p.passed_id));
  (cooldownsRes.data || []).forEach((c) => excluded.add(c.user1_id === userId ? c.user2_id : c.user1_id));
  return excluded;
};

// Same exclusion rules Discover uses (not liked/passed/matched/blocked/on
// cooldown, reciprocal preference, home country, age range, and now max
// distance too) - just enough to draw a few rows from, not the full
// swipeable deck.
export const fetchCirclePool = async (
  currentUser: CurrentUser,
  isPremium?: boolean
): Promise<CircleProfile[]> => {
  if (!currentUser?.id) return [];
  const userId = currentUser.id;
  const baseCountryCode = normalizeCountryCode(currentUser.country_code || '');
  const allowedGenders = getCircleGenderFilter(currentUser.preference || 'everyone');
  const minAge = currentUser.min_age || 18;
  const maxAge = currentUser.max_age || 99;

  const excluded = await fetchCircleExclusionIds(userId);

  // Same distance-cap formula as DiscoverPage.tsx: your own set distance
  // (max_distance, falling back to the older distance_preference field,
  // falling back to a sane 50km default), capped at 600km for free users -
  // premium can use their full setting. Only meaningful when we actually
  // have the viewer's coordinates; otherwise Circle stays country-only, the
  // same way Discover itself falls back when location is unavailable.
  const userLat = currentUser.latitude;
  const userLon = currentUser.longitude;
  const rawMaxDistance = Number(currentUser.max_distance ?? currentUser.distance_preference ?? DEFAULT_MAX_DISTANCE_KM);
  const safeMaxDistanceUncapped = Number.isFinite(rawMaxDistance) && rawMaxDistance > 0 ? rawMaxDistance : DEFAULT_MAX_DISTANCE_KM;
  const maxDistanceKm = isPremium ? safeMaxDistanceUncapped : Math.min(safeMaxDistanceUncapped, FREE_USER_MAX_DISTANCE_KM);
  const hasCoords = typeof userLat === 'number' && typeof userLon === 'number';
  const radiusDegrees = hasCoords ? maxDistanceKm / KM_PER_DEGREE_LATITUDE : null;

  let countryCodes: string[];
  if (baseCountryCode) {
    countryCodes = isPremium
      ? Array.from(new Set([baseCountryCode, ...normalizeCountryCodeList(currentUser.unlocked_countries, baseCountryCode)]))
      : [baseCountryCode];
  } else {
    const { data: countryRows } = await supabase
      .from('profiles')
      .select('country_code')
      .eq('account_status', 'active')
      .not('country_code', 'is', null);
    countryCodes = Array.from(new Set((countryRows || []).map((r) => normalizeCountryCode(r.country_code || '')).filter(Boolean)));
    if (countryCodes.length === 0) return [];
  }

  const POOL_LIMIT = 80;
  type ProfileRow = Omit<CircleProfile, 'firstImage'>;

  // Same active-then-archived top-up Discover uses for its own feed (see
  // fetchUnlockedCountryProfiles) - without this, Circle silently starved
  // any time the active-only pool was thin (a real case: one test account's
  // country had 112 total eligible people but 109 of them were archived,
  // leaving only 3 active - Discover's feed mixes archived candidates in to
  // compensate, Circle's didn't, so it looked broken/empty by comparison).
  const { data: activeData, error: activeError } = await supabase.rpc('get_random_discover_profiles', {
    p_country_codes: countryCodes,
    p_allowed_genders: allowedGenders,
    p_archived: false,
    p_excluded_ids: Array.from(excluded),
    p_limit: POOL_LIMIT,
    p_lat: hasCoords ? userLat : null,
    p_lon: hasCoords ? userLon : null,
    p_radius_degrees: radiusDegrees,
  });
  const activeRows: ProfileRow[] = (!activeError && Array.isArray(activeData)) ? (activeData as unknown as ProfileRow[]) : [];

  let rows: ProfileRow[] = activeRows;
  if (activeRows.length < POOL_LIMIT) {
    const archivedExcludedIds = Array.from(new Set([...excluded, ...activeRows.map((p) => p.id)]));
    const { data: archivedData, error: archivedError } = await supabase.rpc('get_random_discover_profiles', {
      p_country_codes: countryCodes,
      p_allowed_genders: allowedGenders,
      p_archived: true,
      p_excluded_ids: archivedExcludedIds,
      p_limit: POOL_LIMIT - activeRows.length,
      p_lat: hasCoords ? userLat : null,
      p_lon: hasCoords ? userLon : null,
      p_radius_degrees: radiusDegrees,
    });
    const archivedRows: ProfileRow[] = (!archivedError && Array.isArray(archivedData)) ? (archivedData as unknown as ProfileRow[]) : [];
    rows = [...activeRows, ...archivedRows];
  }

  const eligible = rows
    .filter((p) => matchesReciprocalPreference(currentUser.gender, p.preference))
    .filter((p) => {
      if (!p.date_of_birth) return false;
      const age = calculateAge(p.date_of_birth);
      return age >= minAge && age <= maxAge;
    })
    // The RPC's radius is a rough lat/lon bounding box (cheap to index, not
    // a true circle) - this narrows it to the real distance, same
    // "client-side enforcement" step Discover does. A candidate missing
    // coordinates simply isn't excluded by it (they already passed the
    // country filter, which is the fallback signal for them).
    .filter((p) => {
      if (!hasCoords || !p.latitude || !p.longitude) return true;
      return calculateDistance(userLat as number, userLon as number, p.latitude, p.longitude) <= maxDistanceKm;
    });

  const ids = eligible.map((p) => p.id);
  const { data: imageRows } = ids.length
    ? await supabase.from('user_images').select('user_id, image_url, image_order').in('user_id', ids).eq('is_approved', true).neq('image_order', -1).order('image_order', { ascending: true })
    : { data: [] as { user_id: string; image_url: string }[] };

  const firstImageByUser: Record<string, string> = {};
  (imageRows || []).forEach((row) => { if (!firstImageByUser[row.user_id]) firstImageByUser[row.user_id] = row.image_url; });

  return eligible
    .filter((p) => firstImageByUser[p.id])
    .map((p) => ({ ...p, favorites: parseFavorites(p.favorites), firstImage: firstImageByUser[p.id] }));
};

export type CircleRowKey = 'recommended' | 'similar';

// Persisted snapshot of exactly who's shown in a Recommended/Similar row -
// see supabase/migrations/20260918000000_circle_row_batches.sql. The whole
// point is stability: once a batch is stored, it stays until every person in
// it has been decided (liked/passed/matched/blocked, from anywhere in the
// app), not just until the next re-ranking happens to prefer someone else.
export const fetchStoredCircleBatch = async (userId: string, rowKey: CircleRowKey): Promise<string[] | null> => {
  const { data } = await supabase
    .from('circle_row_batches')
    .select('profile_ids')
    .eq('user_id', userId)
    .eq('row_key', rowKey)
    .maybeSingle();
  return (data?.profile_ids as string[] | undefined) ?? null;
};

// Empty array clears the stored row entirely (nothing left to reconcile
// against next time) rather than leaving a stale empty-array row behind.
export const saveCircleBatch = async (userId: string, rowKey: CircleRowKey, profileIds: string[]): Promise<void> => {
  if (profileIds.length === 0) {
    await supabase.from('circle_row_batches').delete().eq('user_id', userId).eq('row_key', rowKey);
    return;
  }
  await supabase
    .from('circle_row_batches')
    .upsert(
      { user_id: userId, row_key: rowKey, profile_ids: profileIds, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,row_key' }
    );
};

// Reconstructs full CircleProfile records (with photo) for specific ids -
// used when reconciling a stored batch: a member who's still genuinely
// undecided (not in fetchCircleExclusionIds) but simply wasn't drawn into
// this call's random pool sample still needs their profile/photo fetched
// directly, rather than being dropped for a reason that has nothing to do
// with whether they've been decided.
export const fetchCircleProfilesByIds = async (ids: string[]): Promise<CircleProfile[]> => {
  if (ids.length === 0) return [];
  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, preference, relationship_intent, love_style, pets, communication_style, family_plans, social_media, favorites, adinkra_symbols, languages, introvert_extrovert, spontaneous_planner, messy_organized, smoking, drinking, exercise_level, sleeping_schedule, last_login_at, is_verified, max_distance, distance_preference, fun_fact, perfect_first_date, last_googled')
    .in('id', ids);
  if (error || !Array.isArray(rows)) return [];

  const { data: imageRows } = await supabase
    .from('user_images')
    .select('user_id, image_url, image_order')
    .in('user_id', ids)
    .eq('is_approved', true)
    .neq('image_order', -1)
    .order('image_order', { ascending: true });

  const firstImageByUser: Record<string, string> = {};
  (imageRows || []).forEach((row) => { if (!firstImageByUser[row.user_id]) firstImageByUser[row.user_id] = row.image_url; });

  type ProfileRow = Omit<CircleProfile, 'firstImage'>;
  return (rows as unknown as ProfileRow[])
    .filter((p) => firstImageByUser[p.id])
    .map((p) => ({ ...p, favorites: parseFavorites(p.favorites), firstImage: firstImageByUser[p.id] }));
};

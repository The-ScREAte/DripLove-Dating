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

// Same exclusion rules Discover uses (not liked/passed/matched/blocked/on
// cooldown, reciprocal preference, home country, age range) - just enough to
// draw a few rows from, not the full swipeable deck.
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

  const [likesRes, likedByRes, matchesRes, blocksRes, passesRes, cooldownsRes] = await Promise.all([
    supabase.from('likes').select('liked_id').eq('liker_id', userId),
    supabase.from('likes').select('liker_id').eq('liked_id', userId),
    supabase.from('matches').select('user1_id,user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
    supabase.from('blocks').select('blocked_id,blocker_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    supabase.from('passes').select('passed_id').eq('passer_id', userId).gte('passed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('match_cooldowns').select('user1_id,user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).gt('expires_at', new Date().toISOString()),
  ]);

  const excluded = new Set<string>([userId]);
  (likesRes.data || []).forEach((l) => l.liked_id && excluded.add(l.liked_id));
  (likedByRes.data || []).forEach((l) => l.liker_id && excluded.add(l.liker_id));
  (matchesRes.data || []).forEach((m) => excluded.add(m.user1_id === userId ? m.user2_id : m.user1_id));
  (blocksRes.data || []).forEach((b) => { if (b.blocked_id) excluded.add(b.blocked_id); if (b.blocker_id) excluded.add(b.blocker_id); });
  (passesRes.data || []).forEach((p) => p.passed_id && excluded.add(p.passed_id));
  (cooldownsRes.data || []).forEach((c) => excluded.add(c.user1_id === userId ? c.user2_id : c.user1_id));

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

  const { data: rows, error } = await supabase.rpc('get_random_discover_profiles', {
    p_country_codes: countryCodes,
    p_allowed_genders: allowedGenders,
    p_archived: false,
    p_excluded_ids: Array.from(excluded),
    p_limit: 80,
  });

  if (error || !Array.isArray(rows)) return [];

  type ProfileRow = Omit<CircleProfile, 'firstImage'>;
  const eligible = (rows as unknown as ProfileRow[])
    .filter((p) => matchesReciprocalPreference(currentUser.gender, p.preference))
    .filter((p) => {
      if (!p.date_of_birth) return false;
      const age = calculateAge(p.date_of_birth);
      return age >= minAge && age <= maxAge;
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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PotentialMatch, CurrentUser } from '@/types';
import { calculateAge } from '@/utils/discoverCache';
import { normalizeCountryCode } from '@/utils/countryCode';
import { matchesReciprocalPreference, normalizeCountryCodeList } from './discover/discoverFeedUtils';
import { parseFavorites } from '@/constants/favorites';
import { fetchCirclePool, CircleProfile } from '@/utils/circlePoolFetch';

// How long a cached pool snapshot (see window.circleCache, populated by
// MainApp's preloadCircleData) is trusted before a fresh fetch replaces it -
// same order of magnitude as Chat/Liked Me's own background refresh cadence.
const CIRCLE_CACHE_TTL_MS = 2 * 60 * 1000;
import ProfilePreviewModal from './profile/ProfilePreviewModal';
import { useToast } from '@/hooks/use-toast';
import {
  Plane,
  Clapperboard,
  Dumbbell,
  Palette,
  BadgeCheck,
  Baby,
  Ban,
  Gem,
  PartyPopper,
  Handshake,
  Music,
  Trophy,
  BookOpen,
  ChefHat,
  Camera,
  Disc3,
  Gamepad2,
  Trees,
  Cpu,
  Shirt,
  UtensilsCrossed,
  PawPrint,
  Share2,
  Compass,
  Laugh,
  Waves,
  Mountain,
  type LucideIcon,
} from 'lucide-react';

// One icon per interest tag (see src/constants/formData.ts) - shown as the
// shared-thing badge on a card instead of spelling the interest out as text.
const INTEREST_ICONS: Record<string, LucideIcon> = {
  Travel: Plane,
  Music: Music,
  Movies: Clapperboard,
  Sports: Trophy,
  Reading: BookOpen,
  Cooking: ChefHat,
  Photography: Camera,
  Dancing: Disc3,
  Gaming: Gamepad2,
  Art: Palette,
  Fitness: Dumbbell,
  Nature: Trees,
  Technology: Cpu,
  Fashion: Shirt,
  Food: UtensilsCrossed,
  Animals: PawPrint,
  Adventure: Compass,
  Comedy: Laugh,
  Beach: Waves,
  Mountains: Mountain,
};

interface SharedTrait {
  icon: LucideIcon;
  label: string;
}

// Everything on the profile worth counting toward "how compatible do these
// two look": interests, pets, social media, favorites, cultural (adinkra)
// signs, languages, personality sliders, and lifestyle. Each is its own
// category - matching on it at all (regardless of how many individual
// items overlap within it) counts as one of the categories below, so the
// percentage reads as "how many parts of your profile line up," not a raw
// item-count that would unfairly favor someone with a long interests list.
interface Compatibility {
  // One entry per shared interest (Adventure, Music, ...), for the row of
  // small icon badges on the card - can be several. Only interests get an
  // icon; every other category only ever affects the percentage.
  interestIcons: SharedTrait[];
  percent: number;
}

type ProfileTraits = {
  interests?: string[] | null;
  pets?: string[] | null;
  social_media?: string | null;
  favorites?: { category: string }[] | null;
  adinkra_symbols?: string[] | null;
  languages?: string[] | null;
  introvert_extrovert?: number | null;
  spontaneous_planner?: number | null;
  messy_organized?: number | null;
  smoking?: string | null;
  drinking?: string | null;
  exercise_level?: string | null;
  sleeping_schedule?: string | null;
  occupation?: string | null;
  education_level?: string | null;
  relationship_intent?: string | null;
};

const TOTAL_COMPATIBILITY_CATEGORIES = 10;

const getCompatibility = (me: ProfileTraits, other: ProfileTraits): Compatibility => {
  const interestIcons: SharedTrait[] = [];
  let matchedCategories = 0;

  // 1. Interests
  const myInterests = new Set(me.interests || []);
  const sharedInterests = (other.interests || []).filter((i) => myInterests.has(i));
  sharedInterests.forEach((i) => { if (INTEREST_ICONS[i]) interestIcons.push({ icon: INTEREST_ICONS[i], label: i }); });
  if (sharedInterests.length > 0) matchedCategories += 1;

  // 2. Pets
  const myPets = new Set(me.pets || []);
  if ((other.pets || []).some((v) => myPets.has(v))) matchedCategories += 1;

  // 3. Social media
  if (me.social_media && me.social_media === other.social_media) matchedCategories += 1;

  // 4. Favorites (matched by category - Sports, Music, etc. - not the exact pick)
  const myFavoriteCategories = new Set((me.favorites || []).map((f) => f.category));
  if ((other.favorites || []).some((f) => myFavoriteCategories.has(f.category))) matchedCategories += 1;

  // 5. Cultural (adinkra) signs
  const mySigns = new Set(me.adinkra_symbols || []);
  if ((other.adinkra_symbols || []).some((v) => mySigns.has(v))) matchedCategories += 1;

  // 6. Languages
  const myLanguages = new Set(me.languages || []);
  if ((other.languages || []).some((v) => myLanguages.has(v))) matchedCategories += 1;

  // 7. Personality sliders (0-100) - counts as a match when most of the
  // three land on the same side of the midpoint (e.g. both extroverted).
  const sliderPairs: [number | null | undefined, number | null | undefined][] = [
    [me.introvert_extrovert, other.introvert_extrovert],
    [me.spontaneous_planner, other.spontaneous_planner],
    [me.messy_organized, other.messy_organized],
  ];
  const alignedSliders = sliderPairs.filter(
    ([a, b]) => typeof a === 'number' && typeof b === 'number' && (a < 50) === (b < 50)
  ).length;
  if (alignedSliders >= 2) matchedCategories += 1;

  // 8. Lifestyle (smoking/drinking/exercise/sleep) - counts as a match when
  // at least half of the set fields agree exactly.
  const lifestylePairs: [string | null | undefined, string | null | undefined][] = [
    [me.smoking, other.smoking],
    [me.drinking, other.drinking],
    [me.exercise_level, other.exercise_level],
    [me.sleeping_schedule, other.sleeping_schedule],
  ];
  const alignedLifestyle = lifestylePairs.filter(([a, b]) => a && b && a === b).length;
  if (alignedLifestyle >= 2) matchedCategories += 1;

  // 9. Work/education (same occupation OR same education level counts)
  if (
    (me.occupation && other.occupation && me.occupation === other.occupation) ||
    (me.education_level && other.education_level && me.education_level === other.education_level)
  ) {
    matchedCategories += 1;
  }

  // 10. Relationship preference (what they're each looking for)
  if (me.relationship_intent && other.relationship_intent && me.relationship_intent === other.relationship_intent) {
    matchedCategories += 1;
  }

  return { interestIcons, percent: Math.round((matchedCategories / TOTAL_COMPATIBILITY_CATEGORIES) * 100) };
};

interface CirclePageProps {
  currentUser: CurrentUser;
  isPremium?: boolean;
  isActiveTab?: boolean;
}

// CircleProfile + the pool fetch itself now live in '@/utils/circlePoolFetch'
// so MainApp's background preloader can call the exact same fetch (see
// preloadCircleData there) instead of a second, drifting copy of this logic.

// The filter a tile browses by, when tapped - matches
// get_circle_category_profiles' own optional params 1:1 (exactly one of
// these is ever set per tile). Omitted entirely for the Games tile, which
// doesn't filter/browse people at all.
interface CategoryFilter {
  relationshipIntent?: string;
  familyPlans?: string[];
  isVerified?: boolean;
  interest?: string;
  hasMusic?: boolean;
  hasSocialMedia?: boolean;
  hasPets?: boolean;
}

interface CategoryTile {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number | null;
  filter?: CategoryFilter;
  isGameLink?: boolean;
}

// One shared definition list for the category grid - both the count effect
// and the tap-to-browse handler read from this, so a tile's label/icon/
// filter can never drift out of sync between "what the number says" and
// "what tapping it actually shows you." Games is first and is the one tile
// that doesn't filter/browse people at all - it just opens the mini-games.
const CATEGORY_DEFS: Array<{ key: string; label: string; icon: CategoryTile['icon']; filter?: CategoryFilter; isGameLink?: boolean }> = [
  { key: 'games', label: 'Level Up Your Game', icon: Gamepad2, isGameLink: true },
  { key: 'serious', label: 'Serious commitment', icon: Gem, filter: { relationshipIntent: 'serious' } },
  { key: 'casual', label: 'Short-term fun', icon: PartyPopper, filter: { relationshipIntent: 'casual' } },
  { key: 'open', label: 'Open to anything', icon: Handshake, filter: { relationshipIntent: 'open_to_anything' } },
  { key: 'verified', label: 'Verified Users', icon: BadgeCheck, filter: { isVerified: true } },
  { key: 'wants_kids', label: 'Wants Kids', icon: Baby, filter: { familyPlans: ['want_children', 'have_and_want_more'] } },
  { key: 'child_free', label: 'Child-Free', icon: Ban, filter: { familyPlans: ['dont_want_children'] } },
  { key: 'travel', label: 'Travel', icon: Plane, filter: { interest: 'Travel' } },
  { key: 'sporty', label: 'Sporty', icon: Dumbbell, filter: { interest: 'Sports' } },
  { key: 'creative', label: 'Creatives', icon: Palette, filter: { interest: 'Art' } },
  { key: 'music', label: 'Music Lovers', icon: Music, filter: { hasMusic: true } },
  { key: 'social', label: 'Social Butterflies', icon: Share2, filter: { hasSocialMedia: true } },
  { key: 'pet', label: 'Pet Lovers', icon: PawPrint, filter: { hasPets: true } },
];

const getGenderFilter = (userPreference: string) => {
  if (userPreference === 'male') return ['male'];
  if (userPreference === 'female') return ['female'];
  return ['male', 'female', 'other'];
};

// Turns a CircleProfile into the shape ProfilePreviewModal/buildSlides expect.
// Only the fields those actually read are worth filling in here - Circle is
// a lightweight browse surface, not the full Discover deck, so this is
// intentionally thinner than DiscoverPage's own toPotentialMatch.
const toPotentialMatch = (p: CircleProfile): PotentialMatch => ({
  id: p.id,
  first_name: p.first_name,
  last_name: p.last_name,
  bio: p.bio || '',
  city: p.city || '',
  country: p.country || '',
  country_code: p.country_code || '',
  occupation: p.occupation || '',
  education_level: p.education_level || '',
  date_of_birth: p.date_of_birth,
  interests: p.interests || [],
  images: [],
  is_verified: p.is_verified,
  gender: p.gender,
  preference: p.preference,
  relationship_intent: p.relationship_intent,
  love_style: p.love_style,
  pets: p.pets,
  communication_style: p.communication_style,
  family_plans: p.family_plans || undefined,
  social_media: p.social_media || undefined,
  favorites: p.favorites || undefined,
  adinkra_symbols: p.adinkra_symbols || undefined,
  languages: p.languages || undefined,
  introvert_extrovert: p.introvert_extrovert ?? undefined,
  spontaneous_planner: p.spontaneous_planner ?? undefined,
  messy_organized: p.messy_organized ?? undefined,
  smoking: p.smoking || undefined,
  drinking: p.drinking || undefined,
  exercise_level: p.exercise_level || undefined,
  sleeping_schedule: p.sleeping_schedule || undefined,
  max_distance: p.max_distance ?? undefined,
  distance_preference: p.distance_preference ?? undefined,
  fun_fact: p.fun_fact || undefined,
  perfect_first_date: p.perfect_first_date || undefined,
  last_googled: p.last_googled || undefined,
});

const PeopleRow = ({
  title,
  subtitle,
  items,
  onSelect,
  showIcons = false,
}: {
  title: string;
  subtitle?: string;
  items: { p: CircleProfile; interestIcons: SharedTrait[]; percent: number }[];
  onSelect: (p: CircleProfile) => void;
  // Interest icons only make sense on the "Similar interests" row - showing
  // them on "Recommended for you" too was confusing since that row isn't
  // specifically about shared interests.
  showIcons?: boolean;
}) => {
  if (items.length === 0) return null;
  return (
    <div className="mb-7">
      <h2 className="text-white font-semibold text-base px-6 mb-0.5">{title}</h2>
      {subtitle && <p className="text-white/40 text-xs px-6 mb-2">{subtitle}</p>}
      <div className="flex gap-4 overflow-x-auto px-6 pt-1 pb-3 scrollbar-hide" style={{ scrollSnapType: 'x proximity', scrollPaddingLeft: 24 }}>
        {items.map(({ p, interestIcons, percent }) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="flex-shrink-0 w-40 text-left rounded-2xl bg-black border border-pink-500/20 shadow-lg overflow-hidden p-0"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="relative w-40 h-48 bg-white/5">
              {p.firstImage && (
                <img src={p.firstImage} alt={p.first_name} className="w-full h-full object-cover" loading="lazy" />
              )}
              {percent > 0 && (
                <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {percent}%
                </span>
              )}
              {showIcons && interestIcons.length > 0 && (
                <div className="absolute bottom-2 right-2 flex gap-1">
                  {interestIcons.slice(0, 3).map(({ icon: Icon, label }, i) => (
                    <span
                      key={`${label}-${i}`}
                      className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center"
                      title={label}
                      aria-label={label}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="px-3 py-2.5">
              <p className="text-white text-sm font-medium truncate">
                {p.first_name}, {calculateAge(p.date_of_birth)}
              </p>
              {(p.city || p.country) && (
                <p className="text-white/50 text-xs truncate">
                  {[p.city, p.country].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const CirclePage = ({ currentUser, isPremium }: CirclePageProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pool, setPool] = useState<CircleProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryTile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<CircleProfile | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  // A tapped category tile (e.g. "Travel") opens a real filtered swipe deck -
  // people matching just that one thing, browsed and liked/passed exactly
  // like Discover, distinct from the single-profile preview opened from the
  // Recommended/Similar rows above.
  const [categoryBrowse, setCategoryBrowse] = useState<{ label: string; profiles: CircleProfile[] } | null>(null);
  const [categoryBrowseIndex, setCategoryBrowseIndex] = useState(0);
  const [loadingCategoryKey, setLoadingCategoryKey] = useState<string | null>(null);

  // A light pool of eligible people, fetched via the shared fetchCirclePool
  // (see '@/utils/circlePoolFetch') so this stays in lockstep with MainApp's
  // background preloader instead of drifting as two separate copies of the
  // same query. Cache-first: if MainApp already warmed window.circleCache in
  // the background (the same way it does for Chat/Liked Me), this paints
  // instantly with that snapshot and no spinner, then quietly refreshes -
  // Circle previously had no such cache at all, so every visit (even ones
  // seconds apart) started from a completely blank loading state.
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    const userId = currentUser.id;

    const cached = window.circleCache?.get(userId);
    const isFresh = !!cached && Date.now() - cached.timestamp < CIRCLE_CACHE_TTL_MS;
    if (cached) {
      setPool(cached.pool as unknown as CircleProfile[]);
      setLoading(false);
    }
    // Fresh-enough cache: skip the network round-trip entirely instead of
    // refetching every single time the effect's deps happen to re-run.
    if (isFresh) return;

    const load = async () => {
      if (!cached) setLoading(true);
      try {
        const withPhotos = await fetchCirclePool(currentUser, isPremium);
        if (!cancelled) {
          setPool(withPhotos);
          setLoading(false);
          window.circleCache?.set(userId, { pool: withPhotos, timestamp: Date.now() });
        }
      } catch {
        if (!cancelled && !cached) { setPool([]); setLoading(false); }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [currentUser, isPremium]);

  // Real counts for the category grid, filtered exactly the way the pool
  // above is: same country(ies), same reciprocal gender preference, active/
  // non-admin only. A raw sitewide count ("3410 people want something
  // serious") isn't a useful number if 3000 of them aren't people this
  // viewer could ever actually match with - this is "how many people YOU
  // could actually match with are looking for this," which is what the
  // tile is actually promising.
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;

    const load = async () => {
      const baseCountryCode = normalizeCountryCode(currentUser.country_code || '');
      const allowedGenders = getGenderFilter(currentUser.preference || 'everyone');
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
      }
      if (countryCodes.length === 0) {
        if (!cancelled) setCategories(CATEGORY_DEFS.map((d) => ({ key: d.key, label: d.label, icon: d.icon, count: d.isGameLink ? null : 0, filter: d.filter, isGameLink: d.isGameLink })));
        return;
      }

      const countFor = async (filter?: CategoryFilter): Promise<number> => {
        // "Verified" isn't a plain column filter a REST query can express -
        // it's the same >=85%-profile-completion formula used everywhere
        // else in the app for the "Verified" checkmark (the real is_verified
        // column has no adoption yet - see the RPC's own comment), computed
        // server-side by a dedicated RPC.
        if (filter?.isVerified) {
          const { data, error } = await supabase.rpc('count_circle_verified_profiles', {
            p_country_codes: countryCodes,
            p_allowed_genders: allowedGenders,
            p_viewer_gender: currentUser.gender || '',
          });
          if (error) return 0;
          return typeof data === 'number' ? data : 0;
        }
        let q = supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .in('country_code', countryCodes)
          .in('gender', allowedGenders);
        // Reciprocal: this profile has to actually be open to the viewer's
        // own gender too, not just be a gender the viewer is into.
        if (currentUser.gender) {
          q = q.or(`preference.eq.${currentUser.gender},preference.eq.everyone`);
        }
        if (filter?.relationshipIntent) q = q.eq('relationship_intent', filter.relationshipIntent);
        if (filter?.familyPlans) q = q.in('family_plans', filter.familyPlans);
        if (filter?.interest) q = q.contains('interests', [filter.interest]);
        if (filter?.hasMusic) q = q.contains('favorites', [{ category: 'Music' }]);
        if (filter?.hasSocialMedia) q = q.not('social_media', 'is', null).neq('social_media', '');
        if (filter?.hasPets) q = q.not('pets', 'is', null).neq('pets', []);
        const { count } = await q;
        return count ?? 0;
      };

      const results = await Promise.all(CATEGORY_DEFS.map((d) => (d.isGameLink ? Promise.resolve(null) : countFor(d.filter))));
      if (!cancelled) {
        setCategories(CATEGORY_DEFS.map((d, i) => ({ key: d.key, label: d.label, icon: d.icon, count: results[i], filter: d.filter, isGameLink: d.isGameLink })));
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.country_code, currentUser?.preference, currentUser?.gender, currentUser?.unlocked_countries, isPremium]);

  const me = useMemo(() => ({
    interests: currentUser?.interests,
    pets: currentUser?.pets,
    social_media: currentUser?.social_media,
    favorites: parseFavorites(currentUser?.favorites),
    adinkra_symbols: currentUser?.adinkra_symbols,
    languages: currentUser?.languages,
    introvert_extrovert: currentUser?.introvert_extrovert,
    spontaneous_planner: currentUser?.spontaneous_planner,
    messy_organized: currentUser?.messy_organized,
    smoking: currentUser?.smoking,
    drinking: currentUser?.drinking,
    exercise_level: currentUser?.exercise_level,
    sleeping_schedule: currentUser?.sleeping_schedule,
    occupation: currentUser?.occupation,
    education_level: currentUser?.education_level,
    relationship_intent: currentUser?.relationship_intent,
  }), [currentUser?.interests, currentUser?.pets, currentUser?.social_media, currentUser?.favorites, currentUser?.adinkra_symbols, currentUser?.languages, currentUser?.introvert_extrovert, currentUser?.spontaneous_planner, currentUser?.messy_organized, currentUser?.smoking, currentUser?.drinking, currentUser?.exercise_level, currentUser?.sleeping_schedule, currentUser?.occupation, currentUser?.education_level, currentUser?.relationship_intent]);

  // "Active" means logged in recently enough to plausibly respond - a
  // recommendation full of accounts that haven't opened the app in months
  // isn't useful even if their profile matches well on paper. Falls back to
  // ranking everyone by compatibility alone when too few active people
  // exist, rather than showing an empty/near-empty row.
  const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
  const isRecentlyActive = useCallback((p: CircleProfile) => {
    if (!p.last_login_at) return false;
    return Date.now() - new Date(p.last_login_at).getTime() <= ACTIVE_WINDOW_MS;
  }, []);

  // Recommended for you: everyone in the pool, ranked by how much they
  // actually have in common with this profile - not just first-come order.
  // Ranks by compatibility, but always keeps recently-active people ahead of
  // inactive ones (a great match who hasn't opened the app in months is a
  // worse recommendation than a decent match who's actually around right
  // now) - falls back to ranking everyone by compatibility alone once the
  // active candidates run out, rather than cutting the row short.
  const rankByActiveThenCompatibility = useCallback(
    <T extends { p: CircleProfile; percent: number }>(items: T[]): T[] =>
      [...items].sort((a, b) => {
        const activeDiff = Number(isRecentlyActive(b.p)) - Number(isRecentlyActive(a.p));
        return activeDiff !== 0 ? activeDiff : b.percent - a.percent;
      }),
    [isRecentlyActive]
  );

  // Recommended for you: everyone in the pool, ranked by how much they
  // actually have in common with this profile across every category that
  // counts (interests, cultural signs, favorites, social media, pets,
  // languages, personality, lifestyle, work/education, and relationship
  // preference - see getCompatibility) - not just first-come order.
  const recommended = useMemo(() => {
    const scored = pool.map((p) => ({ p, ...getCompatibility(me, p) }));
    return rankByActiveThenCompatibility(scored).slice(0, 5);
  }, [pool, me, rankByActiveThenCompatibility]);

  // A second, genuinely different set of 5 - people who share at least ONE
  // of those same categories but didn't make the top-5 above. Never repeats
  // anyone from Recommended (showing the same face twice reads as broken,
  // not just repetitive) - if too few people share anything at all, the row
  // is simply shorter (PeopleRow hides itself entirely at zero), which is
  // correct behavior, not a bug to paper over with a repeat.
  const similarInterests = useMemo(() => {
    const alreadyShown = new Set(recommended.map((r) => r.p.id));
    const scored = pool
      .filter((p) => !alreadyShown.has(p.id))
      .map((p) => ({ p, ...getCompatibility(me, p) }))
      .filter((x) => x.percent > 0);
    return rankByActiveThenCompatibility(scored).slice(0, 5);
  }, [pool, me, recommended, rankByActiveThenCompatibility]);

  const loadImagesForProfile = useCallback(async (profileId: string) => {
    const { data } = await supabase
      .from('user_images')
      .select('image_url, image_order')
      .eq('user_id', profileId)
      .eq('is_approved', true)
      .neq('image_order', -1)
      .order('image_order', { ascending: true });
    return (data || []).map((r) => r.image_url);
  }, []);

  const openProfile = useCallback(async (profile: CircleProfile) => {
    setSelectedProfile(profile);
    setSelectedImages(await loadImagesForProfile(profile.id));
  }, [loadImagesForProfile]);

  const closeProfileView = useCallback(() => {
    setSelectedProfile(null);
    setCategoryBrowse(null);
    setCategoryBrowseIndex(0);
    setSelectedImages([]);
  }, []);

  // Guards against a double-fire from the swipe gesture's own exit-animation
  // timeout landing while a second gesture is somehow already in flight.
  const [isSwipeActionPending, setIsSwipeActionPending] = useState(false);

  // Same RPCs Discover/Liked Me use for a real like/pass - usage-limit
  // enforcement and mutual-match detection happen server-side in these, not
  // here, so swiping from Circle behaves identically to swiping anywhere
  // else in the app rather than being a second, divergent code path. Shared
  // between the single-profile preview (Recommended/Similar) and a category
  // browse deck - the only difference is what happens to the view afterward:
  // close back to the grid, or advance to the next card in the deck.
  const performSwipeAction = useCallback(async (profile: CircleProfile, direction: 'like' | 'pass') => {
    if (isSwipeActionPending || !currentUser?.id) return;
    setIsSwipeActionPending(true);
    setPool((prev) => prev.filter((p) => p.id !== profile.id));

    if (categoryBrowse) {
      const nextIndex = categoryBrowseIndex + 1;
      if (nextIndex < categoryBrowse.profiles.length) {
        const nextProfile = categoryBrowse.profiles[nextIndex];
        setCategoryBrowseIndex(nextIndex);
        setSelectedImages(nextProfile.firstImage ? [nextProfile.firstImage] : []);
        loadImagesForProfile(nextProfile.id).then(setSelectedImages);
      } else {
        toast({ title: "That's everyone", description: `You've seen everyone in "${categoryBrowse.label}" for now.` });
        closeProfileView();
      }
    } else {
      closeProfileView();
    }

    try {
      if (direction === 'like') {
        const { data, error } = await supabase.rpc('like_and_usage_batched', {
          liker_id_param: currentUser.id,
          liked_id_param: profile.id,
          premium_param: !!isPremium,
        });
        if (error) throw error;
        const madeMatch = !!data && typeof data === 'object' && Boolean((data as Record<string, unknown>).match);
        if (madeMatch) {
          toast({ title: "It's a match! 🎉", description: `You and ${profile.first_name} liked each other.` });
          if (typeof window !== 'undefined') {
            const win = window as Window & { chatMatchesCache?: Map<string, unknown> };
            win.chatMatchesCache?.delete(currentUser.id);
            window.dispatchEvent(new CustomEvent('newMatch', { detail: { userId: currentUser.id } }));
          }
        }
      } else {
        const { error } = await supabase.rpc('pass_and_usage_batched', {
          passer_id_param: currentUser.id,
          passed_id_param: profile.id,
          premium_param: !!isPremium,
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error(`Error ${direction === 'like' ? 'liking' : 'passing'} from Circle:`, error);
      // Not restored to the pool/deck - the like/pass may well have gone
      // through server-side (usage-limit RPCs can partially succeed), and
      // mistakenly showing this person again isn't worth risking a
      // duplicate action.
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setIsSwipeActionPending(false);
    }
  }, [isSwipeActionPending, currentUser?.id, isPremium, toast, categoryBrowse, categoryBrowseIndex, loadImagesForProfile, closeProfileView]);

  const handleCircleLike = useCallback((profile: CircleProfile) => performSwipeAction(profile, 'like'), [performSwipeAction]);
  const handleCirclePass = useCallback((profile: CircleProfile) => performSwipeAction(profile, 'pass'), [performSwipeAction]);

  // Tapping a category tile - Games just navigates away; every other tile
  // fetches a real, filtered deck (same eligibility gates the main pool
  // uses - country, reciprocal preference, active/non-admin, and the same
  // already-liked/passed/matched/blocked/cooldown exclusions - plus the
  // one condition that tile promises) and opens it as a swipeable deck.
  const handleCategoryClick = useCallback(async (tile: CategoryTile) => {
    if (tile.isGameLink) {
      navigate('/games');
      return;
    }
    if (!currentUser?.id || loadingCategoryKey) return;
    setLoadingCategoryKey(tile.key);
    try {
      const userId = currentUser.id;
      const baseCountryCode = normalizeCountryCode(currentUser.country_code || '');
      const allowedGenders = getGenderFilter(currentUser.preference || 'everyone');

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
      }
      if (countryCodes.length === 0) {
        toast({ title: 'No matches yet', description: `No one is available for "${tile.label}" right now.` });
        return;
      }

      // Same exclusion set the main pool uses - never show someone already
      // liked/passed/matched/blocked/on cooldown.
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

      const { data: rows, error } = await supabase.rpc('get_circle_category_profiles', {
        p_country_codes: countryCodes,
        p_allowed_genders: allowedGenders,
        p_viewer_gender: currentUser.gender || '',
        p_excluded_ids: Array.from(excluded),
        p_limit: 60,
        p_relationship_intent: tile.filter?.relationshipIntent ?? null,
        p_family_plans: tile.filter?.familyPlans ?? null,
        p_is_verified: typeof tile.filter?.isVerified === 'boolean' ? tile.filter.isVerified : null,
        p_interest: tile.filter?.interest ?? null,
        p_has_music: typeof tile.filter?.hasMusic === 'boolean' ? tile.filter.hasMusic : null,
        p_has_social_media: typeof tile.filter?.hasSocialMedia === 'boolean' ? tile.filter.hasSocialMedia : null,
        p_has_pets: typeof tile.filter?.hasPets === 'boolean' ? tile.filter.hasPets : null,
      });
      if (error) throw error;
      if (!Array.isArray(rows) || rows.length === 0) {
        toast({ title: 'No matches yet', description: `No one new matches "${tile.label}" right now.` });
        return;
      }

      type ProfileRow = Omit<CircleProfile, 'firstImage'>;
      const eligible = (rows as unknown as ProfileRow[]).filter((p) => {
        if (!p.date_of_birth) return false;
        const age = calculateAge(p.date_of_birth);
        return age >= (currentUser.min_age || 18) && age <= (currentUser.max_age || 99);
      });

      const ids = eligible.map((p) => p.id);
      const { data: imageRows } = ids.length
        ? await supabase.from('user_images').select('user_id, image_url, image_order').in('user_id', ids).eq('is_approved', true).neq('image_order', -1).order('image_order', { ascending: true })
        : { data: [] as { user_id: string; image_url: string }[] };
      const firstImageByUser: Record<string, string> = {};
      (imageRows || []).forEach((row) => { if (!firstImageByUser[row.user_id]) firstImageByUser[row.user_id] = row.image_url; });

      const withPhotos: CircleProfile[] = eligible
        .filter((p) => firstImageByUser[p.id])
        .map((p) => ({ ...p, favorites: parseFavorites(p.favorites), firstImage: firstImageByUser[p.id] }));

      if (withPhotos.length === 0) {
        toast({ title: 'No matches yet', description: `No one new matches "${tile.label}" right now.` });
        return;
      }

      setCategoryBrowse({ label: tile.label, profiles: withPhotos });
      setCategoryBrowseIndex(0);
      setSelectedImages(withPhotos[0].firstImage ? [withPhotos[0].firstImage] : []);
      loadImagesForProfile(withPhotos[0].id).then(setSelectedImages);
    } catch (err) {
      console.error('Error loading category browse:', err);
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setLoadingCategoryKey(null);
    }
  }, [currentUser, isPremium, toast, loadingCategoryKey, navigate, loadImagesForProfile]);

  const activeProfile = categoryBrowse ? categoryBrowse.profiles[categoryBrowseIndex] : selectedProfile;
  const nextBrowseProfile = categoryBrowse ? categoryBrowse.profiles[categoryBrowseIndex + 1] : undefined;

  if (activeProfile) {
    return (
      <ProfilePreviewModal
        profile={toPotentialMatch(activeProfile)}
        images={selectedImages.length ? selectedImages : (activeProfile.firstImage ? [activeProfile.firstImage] : [])}
        onClose={closeProfileView}
        onBack={closeProfileView}
        onLike={() => handleCircleLike(activeProfile)}
        onPass={() => handleCirclePass(activeProfile)}
        topLabel={categoryBrowse ? categoryBrowse.label : undefined}
        nextPreviewImageUrl={nextBrowseProfile?.firstImage || undefined}
        readOnly
      />
    );
  }

  return (
    <div className="h-full w-full bg-black overflow-y-auto scrollbar-hide">
      <div className="sticky top-0 z-10 bg-black pt-2 pb-2">
        <h2 className="text-white font-semibold text-base px-6 mb-1">Circle</h2>
        <p className="text-white/40 text-xs px-6">Made easy to spot and find who's right for you.</p>
      </div>
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : pool.length === 0 ? (
          <div className="px-6 pb-2">
            <p className="text-white/40 text-sm">No new people to show right now. Check back soon.</p>
          </div>
        ) : (
          <>
            <PeopleRow title="Recommended for you" items={recommended} onSelect={openProfile} />
            <PeopleRow title="Similar interests" items={similarInterests} onSelect={openProfile} showIcons />
          </>
        )}

        <div className="grid grid-cols-2 gap-3 pb-4" style={{ paddingLeft: 24, paddingRight: 24 }}>
          {categories.map((tile) => {
            const { key, label, icon: Icon, count, isGameLink } = tile;
            const isLoadingThis = loadingCategoryKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCategoryClick(tile)}
                disabled={!isGameLink && loadingCategoryKey !== null}
                className={`text-left rounded-2xl border px-4 py-5 flex flex-col items-center gap-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  isGameLink
                    ? 'bg-gradient-to-br from-pink-600/20 to-purple-600/20 border-pink-500/30 active:from-pink-600/30 active:to-purple-600/30'
                    : 'bg-white/[0.04] border-white/10 active:bg-white/[0.08]'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isGameLink ? 'bg-pink-500/20 border border-pink-500/40' : 'bg-pink-500/10 border border-pink-500/25'}`}>
                  {isLoadingThis ? (
                    <div className="w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5 text-pink-500" />
                  )}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="text-white text-sm font-medium leading-tight">{label}</span>
                  {!isGameLink && count !== null && <span className="text-white/40 text-xs ml-2 flex-shrink-0">{count}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CirclePage;

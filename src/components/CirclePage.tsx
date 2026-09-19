import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PotentialMatch, CurrentUser } from '@/types';
import { calculateAge } from '@/utils/discoverCache';
import { normalizeCountryCode } from '@/utils/countryCode';
import { matchesReciprocalPreference } from './discover/discoverFeedUtils';
import { parseFavorites } from '@/constants/favorites';
import {
  fetchCirclePool,
  CircleProfile,
  CircleRowKey,
  fetchStoredCircleBatch,
  saveCircleBatch,
  fetchCircleExclusionIds,
  fetchCircleProfilesByIds,
  getCircleDistanceParams,
  getCircleCountrySplit,
  isCircleProfileEligible,
} from '@/utils/circlePoolFetch';
import { calculateDistance } from '@/constants/locationData';
import PremiumUpgrade from './PremiumUpgrade';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { getCircleDailyLikeLimit, getCircleLikesUsedToday, recordCircleLike } from '@/utils/circleSwipeLimit';
import { publishSwipeDecision } from '@/utils/swipeSync';

// Recommended for you / Similar interests only ever show a handful at a
// time, then go on cooldown instead of silently backfilling from the pool.
// Both tiers see the same 4-card batch (free sees it has real options, not
// just one) - the difference is what's actually interactive: premium can
// swipe all 4, free only ever gets ONE real "lucky swipe" (the top-ranked
// card, index 0) with the other 3 shown locked purely as a teaser (tapping
// any of those three opens the premium upsell, never a profile). Swiping
// the one available free card - or, for premium, working through all 4 -
// exhausts the whole row and starts its cooldown.
const ROW_BATCH_SIZE = 4;
const PREMIUM_ROW_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FREE_ROW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// Compatibility tiers - rank-based (top half of whoever actually has
// anything in common with the viewer, sorted best-first, is "High"; the
// rest is "Medium") rather than a fixed percentage cutoff: a fixed floor
// like "50%+" sounds right in the abstract, but real profiles are sparse
// enough across getCompatibility's 10 categories that an entire real pool
// can top out at 30% - a flat threshold like that would leave the row with
// nothing to show at all. This way there's always a "better half" to call
// High as long as anyone in the pool shares anything with the viewer.
//
// Same composition rule for both rows (Recommended/Similar) and both tiers
// (free/premium): try for 3 High + 1 Medium, with the Medium card leading
// (display position 1) and the three Highs following in descending order
// (so the single best match overall lands in position 2, not position 1).
// Free vs premium only changes which of these cards are actually
// swipeable, never which people or what order (see recommendedItems/
// similarItems below) - a thin pool just yields fewer than 4 cards, never
// a different shape.
const composeCircleBatch = <T extends { percent: number }>(rankedDescByScore: T[]): T[] => {
  if (rankedDescByScore.length === 0) return [];

  const highCount = Math.max(1, Math.ceil(rankedDescByScore.length / 2));
  const highTier = rankedDescByScore.slice(0, highCount);
  const mediumTier = rankedDescByScore.slice(highCount);

  const highs = highTier.slice(0, 3);
  const medium = mediumTier[0];

  if (!medium) {
    // No Medium tier to draw from (small pool) - just take the best up to
    // 4, still leading with the second-best so the top match lands second.
    const fallback = rankedDescByScore.slice(0, ROW_BATCH_SIZE);
    if (fallback.length < 2) return fallback;
    const [first, second, ...rest] = fallback;
    return [second, first, ...rest];
  }

  return [medium, ...highs];
};

// How long a cached pool snapshot (see window.circleCache, populated by
// MainApp's preloadCircleData) is trusted before a fresh fetch replaces it -
// same order of magnitude as Chat/Liked Me's own background refresh cadence.
const CIRCLE_CACHE_TTL_MS = 2 * 60 * 1000;

// Category tile counts run 12 separate count queries - cheap individually but
// slow in aggregate, and identical on every remount within a short window.
// Module-level (survives remounts, not just this component instance) so
// flipping tabs and back doesn't re-run all 12 every time.
const CATEGORY_COUNTS_CACHE_TTL_MS = 2 * 60 * 1000;
let categoryCountsCache: { key: string; categories: CategoryTile[]; timestamp: number } | null = null;
import ProfilePreviewModal from './profile/ProfilePreviewModal';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
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
  Lock,
  RefreshCw,
  Crown,
  Heart,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
  // Set when a "meet <person>" notification is tapped while the app is
  // already running - opens that person's profile inside Circle.
  deepLinkProfileId?: string | null;
  onDeepLinkConsumed?: () => void;
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

// Free users see every tile (so they know what's there) but can't browse
// into these five - a small lock badge in the corner, tapping opens the
// premium upsell instead of the filtered deck. Kept as its own set rather
// than a field on CATEGORY_DEFS so the free/premium gating is one visible
// list, not scattered across each tile's definition.
const PREMIUM_ONLY_CATEGORY_KEYS = new Set(['serious', 'casual', 'open', 'verified', 'music', 'social', 'travel']);

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

// A ring that visually drains as the cooldown counts down, with the time
// remaining as its own label ("18h", "43m") instead of a static "tomorrow" -
// updates live off the same once-a-minute tick that already re-checks
// cooldown expiry elsewhere on this page.
const CircularCountdown = ({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) => {
  const clamped = Math.max(0, Math.min(remainingMs, totalMs));
  const pct = totalMs > 0 ? clamped / totalMs : 0;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const hours = Math.floor(clamped / (60 * 60 * 1000));
  const minutes = Math.floor((clamped % (60 * 60 * 1000)) / (60 * 1000));
  const label = hours > 0 ? `${hours}h` : `${Math.max(minutes, 1)}m`;
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg width="56" height="56" className="absolute inset-0 -rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={radius} fill="none" stroke="#ec4899" strokeWidth="4"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        />
      </svg>
      <span className="text-white text-xs font-semibold">{label}</span>
    </div>
  );
};

// A blurred, camouflaged placeholder card - same footprint as a real card so
// it sits naturally in the scroll row. Shown at the end of a premium row
// while a refill is still hours away, or standing alone once a row's fully
// exhausted/locked (see renderCircleRow) - never a real profile, always
// "something's coming back" rather than the row just going blank.
const RefillCard = ({
  label,
  sublabel,
  onClick,
  countdown,
}: {
  label: string;
  sublabel?: string;
  onClick?: () => void;
  // When set, shows the countdown ring instead of the plain refresh icon -
  // only meaningful once a real cooldown has actually started (see
  // renderCircleRow), never for the "more's coming once you finish" preview.
  countdown?: { remainingMs: number; totalMs: number };
}) => {
  const content = (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-pink-950 via-purple-950/90 to-black" />
      <div className="absolute inset-0 bg-white/5" style={{ backdropFilter: 'blur(6px)' }} />
      <div className="relative h-full flex flex-col items-center justify-center gap-2 px-3 text-center">
        {countdown ? (
          <CircularCountdown remainingMs={countdown.remainingMs} totalMs={countdown.totalMs} />
        ) : onClick ? (
          // This card is itself an upgrade CTA (free tier's exhausted row) -
          // same gold Crown as every other upgrade trigger in the app,
          // instead of the plain pink refresh icon used for a purely
          // informational "more's coming" card.
          <div className="w-9 h-9 rounded-full bg-yellow-500/15 border border-yellow-500/40 flex items-center justify-center">
            <Crown className="w-4 h-4 text-yellow-400" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/10 border border-pink-500/30 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-pink-300" />
          </div>
        )}
        <p className="text-white text-sm font-semibold leading-tight">{label}</p>
        {sublabel && <p className="text-white/50 text-xs leading-snug">{sublabel}</p>}
      </div>
    </>
  );
  const className = "flex-shrink-0 w-40 h-60 rounded-2xl border border-pink-500/20 shadow-lg overflow-hidden relative text-left";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={{ scrollSnapAlign: 'start' }}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={{ scrollSnapAlign: 'start' }}>
      {content}
    </div>
  );
};

// How long the very first card's badge waits before it teaches itself, and
// how long it stays expanded before sliding back to just the number.
const COMPATIBILITY_HINT_DELAY_MS = 600;
const COMPATIBILITY_HINT_HOLD_MS = 10_000;

// The compact "10%" badge every card shows - except the very first card in
// a row, which briefly expands to "10% Compatible" once, shortly after
// appearing, so a new user learns what the number means without needing a
// label on every single card. Pure CSS transition (max-width + opacity),
// no animation library needed.
const CompatibilityBadge = ({ percent, showHint }: { percent: number; showHint?: boolean }) => {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!showHint) return;
    const openTimer = setTimeout(() => setExpanded(true), COMPATIBILITY_HINT_DELAY_MS);
    const closeTimer = setTimeout(() => setExpanded(false), COMPATIBILITY_HINT_DELAY_MS + COMPATIBILITY_HINT_HOLD_MS);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  }, [showHint]);

  return (
    <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold py-0.5 pl-2 pr-2 rounded-full flex items-center">
      <span className="whitespace-nowrap">{percent}%</span>
      <span
        className="whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin-left] duration-500 ease-out"
        style={{
          maxWidth: expanded ? 84 : 0,
          opacity: expanded ? 1 : 0,
          marginLeft: expanded ? 4 : 0,
        }}
      >
        Compatible
      </span>
    </span>
  );
};

const PeopleRow = ({
  title,
  subtitle,
  items,
  onSelect,
  showIcons = false,
  onLockedTap,
  trailingCard,
}: {
  title: string;
  subtitle?: string;
  // Free-tier gating is per-item: photo blurred + lock badge (same visual
  // treatment as Liked Me), name/country still visible, tapping opens the
  // premium upsell instead of the profile - never onSelect. Lets a single
  // row mix one real, unlocked card with locked teaser cards (free users'
  // one "lucky swipe" among 3 locked previews).
  items: { p: CircleProfile; interestIcons: SharedTrait[]; percent: number; locked?: boolean }[];
  onSelect: (p: CircleProfile) => void;
  // Interest icons only make sense on the "Similar interests" row - showing
  // them on "Recommended for you" too was confusing since that row isn't
  // specifically about shared interests.
  showIcons?: boolean;
  onLockedTap?: () => void;
  // Appended after the real cards - see RefillCard.
  trailingCard?: React.ReactNode;
}) => {
  if (items.length === 0) return null;
  return (
    <div className="mb-7">
      <h2 className="text-white font-semibold text-base px-6 mb-0.5">{title}</h2>
      {subtitle && <p className="text-white/40 text-xs px-6 mb-2">{subtitle}</p>}
      <div className="flex gap-4 overflow-x-auto px-6 pt-1 pb-0 scrollbar-hide" style={{ scrollSnapType: 'x proximity', scrollPaddingLeft: 24 }}>
        {items.map(({ p, interestIcons, percent, locked }, index) => (
          <button
            key={p.id}
            onClick={() => (locked ? onLockedTap?.() : onSelect(p))}
            className="flex-shrink-0 w-40 text-left rounded-2xl bg-black border border-pink-500/20 shadow-lg overflow-hidden p-0"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="relative w-40 h-48 bg-white/5">
              {p.firstImage && (
                <img src={p.firstImage} alt={p.first_name} className={`w-full h-full object-cover ${locked ? 'blur-md' : ''}`} loading="lazy" />
              )}
              {locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="bg-black/80 border border-pink-500/40 backdrop-blur-sm rounded-full p-2.5">
                    <Lock className="w-5 h-5 text-pink-300" />
                  </div>
                </div>
              )}
              {percent > 0 && <CompatibilityBadge percent={percent} showHint={index === 0} />}
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
        {trailingCard}
      </div>
    </div>
  );
};

const CirclePage = ({ currentUser, isPremium, deepLinkProfileId, onDeepLinkConsumed }: CirclePageProps) => {
  const { toast } = useToast();
  const { sendMatchNotification, sendMultipleLikesNotification } = usePushNotifications(currentUser?.id);
  const navigate = useNavigate();
  // Same eligibility signal PremiumUpgrade.tsx's own "Start Free Trial"
  // buttons use - already correctly platform-aware: web/PWA has no native
  // store to ask, so this stays false there (falls back to "Subscribe");
  // iOS/Android only read true once the actual store confirms a trial
  // offer is available for this account.
  const { eligibleForTrial } = useFreeTrialOffer(currentUser?.id);
  const [pool, setPool] = useState<CircleProfile[]>([]);
  const [loading, setLoading] = useState(true);
  // Tiles render immediately with their label/icon and no count (count: null
  // already renders as no number - see the grid below) instead of the whole
  // grid staying blank until all 12 count queries finish. Real counts fill
  // in underneath a moment later without blocking anything visible.
  const [categories, setCategories] = useState<CategoryTile[]>(() =>
    CATEGORY_DEFS.map((d) => ({ key: d.key, label: d.label, icon: d.icon, count: null, filter: d.filter, isGameLink: d.isGameLink }))
  );
  const [selectedProfile, setSelectedProfile] = useState<CircleProfile | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  // A tapped category tile (e.g. "Travel") opens a real filtered swipe deck -
  // people matching just that one thing, browsed and liked/passed exactly
  // like Discover, distinct from the single-profile preview opened from the
  // Recommended/Similar rows above.
  const [categoryBrowse, setCategoryBrowse] = useState<{ label: string; profiles: CircleProfile[] } | null>(null);
  const [categoryBrowseIndex, setCategoryBrowseIndex] = useState(0);
  const [loadingCategoryKey, setLoadingCategoryKey] = useState<string | null>(null);

  // Recommended/Similar row state: null batch = not computed yet (still
  // waiting on the pool or cooldown status), [] = computed but empty (pool
  // had no eligible people), non-empty = the actual snapshot currently
  // shown. Cooldown timestamps (ms, null = no cooldown on record) come from
  // circle_row_cooldowns; a null batch is recomputed from the pool the
  // moment its row's cooldown is clear.
  const [rowCooldowns, setRowCooldowns] = useState<Record<CircleRowKey, number | null>>({ recommended: null, similar: null });
  const [rowCooldownsLoaded, setRowCooldownsLoaded] = useState(false);
  // Hydrated straight from window.circleRowsCache (if a previous mount this
  // session already resolved it) so reopening Circle shows the same
  // Recommended/Similar rows instantly instead of going through the whole
  // stored-batch-fetch-and-reconcile dance - and its loading state - again.
  const [recommendedBatch, setRecommendedBatch] = useState<CircleProfile[] | null>(
    () => (window.circleRowsCache?.get(currentUser?.id || '')?.recommended as CircleProfile[] | undefined) ?? null
  );
  const [similarBatch, setSimilarBatch] = useState<CircleProfile[] | null>(
    () => (window.circleRowsCache?.get(currentUser?.id || '')?.similar as CircleProfile[] | undefined) ?? null
  );
  // Which row a currently-open profile preview came from, so a like/pass
  // removes it from the right batch instead of just the general pool.
  const [activeRowKey, setActiveRowKey] = useState<CircleRowKey | null>(null);
  const [showCirclePremiumUpgrade, setShowCirclePremiumUpgrade] = useState(false);
  // Set to a locked category tile's label the moment it's tapped - shows the
  // lightweight upsell overlay (not the full PremiumUpgrade page yet) with
  // that label worked into the copy; null hides it. Subscribing there is
  // what actually opens the full page.
  const [lockedTileLabel, setLockedTileLabel] = useState<string | null>(null);
  // Set the moment a category tap comes back with nobody - shows a proper
  // banner (upgrade + adjust-preferences, same pattern as Discover's own
  // empty state) instead of just a toast that a user could easily miss.
  const [emptyCategoryLabel, setEmptyCategoryLabel] = useState<string | null>(null);
  // Circle's own daily right-like allowance, refilling at midnight.
  const [circleLikesUsed, setCircleLikesUsed] = useState(0);
  const [circleLikesLoaded, setCircleLikesLoaded] = useState(false);
  const [showCircleOutOfLikes, setShowCircleOutOfLikes] = useState(false);
  const circleDailyLimit = getCircleDailyLikeLimit(isPremium);
  const circleLikesLeft = Math.max(0, circleDailyLimit - circleLikesUsed);
  // Ticks once a minute purely to force a re-check of cooldown expiry while
  // the tab stays open (e.g. left open across midnight) - the actual expiry
  // math reads Date.now() fresh each time, this just triggers that recheck.
  const [cooldownTick, setCooldownTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCooldownTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Today's Circle like count, read once per mount (the row is keyed by
  // date, so it refills on its own each new day).
  useEffect(() => {
    if (!currentUser?.id) { setCircleLikesLoaded(true); return; }
    let cancelled = false;
    void (async () => {
      const used = await getCircleLikesUsedToday(currentUser.id);
      if (cancelled) return;
      setCircleLikesUsed(used);
      setCircleLikesLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, isPremium]);

  // A decision made in Discover must disappear from every Circle surface
  // immediately, without waiting for cache expiry or a remount.
  useEffect(() => {
    if (!currentUser?.id) return;
    const onProfileDecided = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; profileId?: string }>).detail;
      if (detail?.userId !== currentUser.id || !detail.profileId) return;
      const profileId = detail.profileId;
      setPool((prev) => prev.filter((profile) => profile.id !== profileId));
      setRecommendedBatch((prev) => prev?.filter((profile) => profile.id !== profileId) ?? prev);
      setSimilarBatch((prev) => prev?.filter((profile) => profile.id !== profileId) ?? prev);
      setCategoryBrowse((prev) => prev ? { ...prev, profiles: prev.profiles.filter((profile) => profile.id !== profileId) } : prev);
      if (selectedProfile?.id === profileId) {
        setSelectedProfile(null);
        setCategoryBrowse(null);
        setCategoryBrowseIndex(0);
        setSelectedImages([]);
        setActiveRowKey(null);
      }
      categoryCountsCache = null;
    };
    window.addEventListener('profileDecided', onProfileDecided);
    return () => window.removeEventListener('profileDecided', onProfileDecided);
  }, [currentUser?.id, selectedProfile?.id]);


  // Load this user's row cooldowns once - see supabase/migrations/20260917000000_circle_row_cooldowns.sql
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('circle_row_cooldowns')
        .select('row_key, exhausted_at')
        .eq('user_id', currentUser.id);
      if (cancelled) return;
      const next: Record<CircleRowKey, number | null> = { recommended: null, similar: null };
      (data || []).forEach((row: { row_key: string; exhausted_at: string }) => {
        if (row.row_key === 'recommended' || row.row_key === 'similar') {
          next[row.row_key] = new Date(row.exhausted_at).getTime();
        }
      });
      setRowCooldowns(next);
      setRowCooldownsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const rowCooldownMs = isPremium ? PREMIUM_ROW_COOLDOWN_MS : FREE_ROW_COOLDOWN_MS;

  // A cooldown that's actually expired clears itself here (and drops the
  // stale batch so the compute effect below builds a fresh one) instead of
  // needing a full remount to notice.
  useEffect(() => {
    setRowCooldowns((prev) => {
      const recommendedExpired = prev.recommended !== null && Date.now() - prev.recommended >= rowCooldownMs;
      const similarExpired = prev.similar !== null && Date.now() - prev.similar >= rowCooldownMs;
      if (!recommendedExpired && !similarExpired) return prev;
      if (recommendedExpired) setRecommendedBatch(null);
      if (similarExpired) setSimilarBatch(null);
      return {
        recommended: recommendedExpired ? null : prev.recommended,
        similar: similarExpired ? null : prev.similar,
      };
    });
  }, [cooldownTick, rowCooldownMs]);

  const markRowExhausted = useCallback(async (key: CircleRowKey) => {
    const now = Date.now();
    setRowCooldowns((prev) => ({ ...prev, [key]: now }));
    if (!currentUser?.id) return;
    try {
      await supabase.from('circle_row_cooldowns').upsert(
        { user_id: currentUser.id, row_key: key, exhausted_at: new Date(now).toISOString() },
        { onConflict: 'user_id,row_key' }
      );
    } catch {
      // Best-effort - local state already reflects the cooldown for this session.
    }
  }, [currentUser?.id]);

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

    const cacheKey = `${currentUser.id}:${currentUser.country_code || ''}:${currentUser.preference || ''}:${currentUser.gender || ''}:${isPremium ? '1' : '0'}`;
    if (
      categoryCountsCache &&
      categoryCountsCache.key === cacheKey &&
      Date.now() - categoryCountsCache.timestamp < CATEGORY_COUNTS_CACHE_TTL_MS
    ) {
      setCategories(categoryCountsCache.categories);
      return;
    }

    const load = async () => {
      const allowedGenders = getGenderFilter(currentUser.preference || 'everyone');
      // Home country counts respect the viewer's distance; unlocked premium
      // countries are not distance-bound (same rule Discover uses).
      const split = getCircleCountrySplit(currentUser, isPremium);
      let homeCountryCodes = split.homeCountryCodes;
      const unlockedCountryCodes = split.unlockedCountryCodes;
      if (homeCountryCodes.length === 0) {
        const { data: countryRows } = await supabase
          .from('profiles')
          .select('country_code')
          .eq('account_status', 'active')
          .not('country_code', 'is', null);
        homeCountryCodes = Array.from(new Set((countryRows || []).map((r) => normalizeCountryCode(r.country_code || '')).filter(Boolean)));
      }
      if (homeCountryCodes.length === 0 && unlockedCountryCodes.length === 0) {
        if (!cancelled) setCategories(CATEGORY_DEFS.map((d) => ({ key: d.key, label: d.label, icon: d.icon, count: d.isGameLink ? null : 0, filter: d.filter, isGameLink: d.isGameLink })));
        return;
      }

      // Same exclusion set/distance rules the actual category browse and
      // Discover use - without these the number on each tile was counting
      // people already liked/passed/matched/blocked, archived accounts, and
      // anyone regardless of distance, so it promised far more real matches
      // than existed (e.g. one real account: tile said 114, real count was 0).
      const [excluded, { userLat, userLon, hasCoords, maxDistanceKm, radiusDegrees }] = await Promise.all([
        fetchCircleExclusionIds(currentUser.id),
        Promise.resolve(getCircleDistanceParams(currentUser, isPremium)),
      ]);

      const countForCountries = async (
        codes: string[],
        applyRadius: boolean,
        filter?: CategoryFilter
      ): Promise<number> => {
        if (codes.length === 0) return 0;
        const useBox = applyRadius && hasCoords && radiusDegrees !== null;
        let q = supabase
          .from('profiles')
          .select('id, latitude, longitude, date_of_birth')
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .eq('is_archived', false)
          .in('country_code', codes)
          .in('gender', allowedGenders);
        if (excluded.size > 0) {
          q = q.not('id', 'in', `(${Array.from(excluded).join(',')})`);
        }
        if (useBox) {
          q = q
            .gte('latitude', (userLat as number) - (radiusDegrees as number))
            .lte('latitude', (userLat as number) + (radiusDegrees as number))
            .gte('longitude', (userLon as number) - (radiusDegrees as number))
            .lte('longitude', (userLon as number) + (radiusDegrees as number));
        }
        // Reciprocal: this profile has to actually be open to the viewer's
        // own gender too, not just be a gender the viewer is into.
        if (currentUser.gender) {
          q = q.or(`preference.eq.${currentUser.gender},preference.eq.everyone`);
        }
        if (filter?.relationshipIntent) q = q.eq('relationship_intent', filter.relationshipIntent);
        if (filter?.isVerified) q = q.eq('is_verified', true);
        if (filter?.familyPlans) q = q.in('family_plans', filter.familyPlans);
        if (filter?.interest) q = q.contains('interests', [filter.interest]);
        if (filter?.hasMusic) q = q.contains('favorites', [{ category: 'Music' }]);
        if (filter?.hasSocialMedia) q = q.not('social_media', 'is', null).neq('social_media', '');
        if (filter?.hasPets) q = q.not('pets', 'is', null).neq('pets', []);
        const { data, error } = await q;
        if (error || !data) return 0;
        return data.filter((profile) => {
          if (!profile.date_of_birth) return false;
          const age = calculateAge(profile.date_of_birth);
          if (age < (currentUser.min_age || 18) || age > (currentUser.max_age || 99)) return false;
          if (!applyRadius || !hasCoords || typeof profile.latitude !== 'number' || typeof profile.longitude !== 'number') return true;
          return calculateDistance(userLat as number, userLon as number, profile.latitude, profile.longitude) <= maxDistanceKm;
        }).length;
      };

      const countFor = async (filter?: CategoryFilter): Promise<number> => {
        const [home, unlocked] = await Promise.all([
          countForCountries(homeCountryCodes, true, filter),
          countForCountries(unlockedCountryCodes, false, filter),
        ]);
        return home + unlocked;
      };

      const results = await Promise.all(CATEGORY_DEFS.map((d) => (d.isGameLink ? Promise.resolve(null) : countFor(d.filter))));
      if (!cancelled) {
        const withCounts = CATEGORY_DEFS.map((d, i) => ({ key: d.key, label: d.label, icon: d.icon, count: results[i], filter: d.filter, isGameLink: d.isGameLink }));
        setCategories(withCounts);
        categoryCountsCache = { key: cacheKey, categories: withCounts, timestamp: Date.now() };
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

  // Recommended for you / Similar interests: a PERSISTED snapshot (see
  // supabase/migrations/20260918000000_circle_row_batches.sql), not just an
  // in-memory one - reopening Circle, or reloading the app entirely, shows
  // exactly the same people until each one is actually decided (liked/
  // passed/matched/blocked - from Circle, Discover, Liked Me, anywhere),
  // never a fresh re-ranking that could bump someone undecided out just
  // because the pool happened to shift. Reconciliation checks the REAL
  // exclusion set (fetchCircleExclusionIds), not mere presence in this
  // call's random pool sample - a still-undecided person can miss that
  // sample by chance and must never be read as "decided" because of it.
  // Composition (see composeCircleBatch): 3 High-tier matches + 1 Medium,
  // same for free and premium alike - nobody with zero shared categories
  // ever surfaces in either row. Similar interests never repeats anyone
  // from Recommended. Free users only ever get to actually swipe index 0 of
  // this batch (see recommendedItems/similarItems below) - the other 3 are
  // a locked, non-interactive teaser.
  useEffect(() => {
    if (!rowCooldownsLoaded || loading || pool.length === 0 || !currentUser?.id) return;
    const userId = currentUser.id;
    let cancelled = false;

    const resolveRow = async (
      key: CircleRowKey,
      currentBatch: CircleProfile[] | null,
      setBatch: (b: CircleProfile[]) => void,
      excludeFromRanking: Set<string>
    ): Promise<CircleProfile[]> => {
      const exhaustedAt = rowCooldowns[key];
      const inCooldown = exhaustedAt !== null && Date.now() - exhaustedAt < rowCooldownMs;
      if (inCooldown) return [];
      if (currentBatch !== null) return currentBatch;

      const storedIds = await fetchStoredCircleBatch(userId, key);
      if (cancelled) return [];

      if (storedIds && storedIds.length > 0) {
        const decided = await fetchCircleExclusionIds(userId);
        if (cancelled) return [];
        const stillUndecidedIds = storedIds.filter((id) => !decided.has(id));

        if (stillUndecidedIds.length === 0) {
          void saveCircleBatch(userId, key, []);
          void markRowExhausted(key);
          setBatch([]);
          return [];
        }

        const fromPool = new Map(pool.map((p) => [p.id, p]));
        const missingIds = stillUndecidedIds.filter((id) => !fromPool.has(id));
        const fetched = missingIds.length > 0 ? await fetchCircleProfilesByIds(missingIds) : [];
        if (cancelled) return [];
        const fetchedById = new Map(fetched.map((p) => [p.id, p]));

        const reconciled = stillUndecidedIds
          .map((id) => fromPool.get(id) ?? fetchedById.get(id))
          .filter((p): p is CircleProfile => !!p);

        if (reconciled.length !== storedIds.length) {
          void saveCircleBatch(userId, key, reconciled.map((p) => p.id));
        }
        setBatch(reconciled);
        return reconciled;
      }

      // No stored batch (first time, or the previous cycle's cooldown just
      // cleared) - build a fresh one: ranked, tier-filtered, then persisted
      // so it becomes the new stable snapshot going forward. Anyone with
      // zero shared categories never qualifies for either tier.
      const scored = pool
        .filter((p) => !excludeFromRanking.has(p.id))
        .map((p) => ({ p, ...getCompatibility(me, p) }))
        .filter((x) => x.percent > 0);
      const rankedFull = rankByActiveThenCompatibility(scored);
      const ordered = composeCircleBatch(rankedFull).map((x) => x.p);
      setBatch(ordered);
      if (ordered.length > 0) void saveCircleBatch(userId, key, ordered.map((p) => p.id));
      return ordered;
    };

    (async () => {
      const recommendedResult = await resolveRow('recommended', recommendedBatch, setRecommendedBatch, new Set());
      if (cancelled) return;
      const shownIds = new Set(recommendedResult.map((p) => p.id));
      await resolveRow('similar', similarBatch, setSimilarBatch, shownIds);
    })();

    return () => { cancelled = true; };
  }, [rowCooldownsLoaded, loading, pool, me, rankByActiveThenCompatibility, rowCooldowns, rowCooldownMs, recommendedBatch, similarBatch, isPremium, currentUser?.id, markRowExhausted]);

  // Mirrors both batches into window.circleRowsCache on every change (however
  // they changed - freshly resolved, reconciled, or trimmed after a decision)
  // so the very next time this component mounts, the lazy useState
  // initializers above find them ready and skip the load entirely.
  useEffect(() => {
    if (!currentUser?.id) return;
    if (recommendedBatch === null && similarBatch === null) return;
    const existing = window.circleRowsCache?.get(currentUser.id);
    window.circleRowsCache?.set(currentUser.id, {
      recommended: recommendedBatch ?? existing?.recommended ?? [],
      similar: similarBatch ?? existing?.similar ?? [],
      timestamp: Date.now(),
    });
  }, [currentUser?.id, recommendedBatch, similarBatch]);

  // Free: only index 0 is ever unlocked - that's the one "lucky swipe," and
  // per composeCircleBatch it's the Medium-tier card, not the best match.
  // The other 3 (including index 1, the single best High match) are a
  // locked, non-interactive teaser so free users can see they have real
  // options, including a taste of their best one, without giving away full
  // access. Premium: nothing's locked.
  const recommendedItems = useMemo(
    () => (recommendedBatch ?? []).map((p, i) => ({ p, ...getCompatibility(me, p), locked: !isPremium && i !== 0 })),
    [recommendedBatch, me, isPremium]
  );
  const similarItems = useMemo(
    () => (similarBatch ?? []).map((p, i) => ({ p, ...getCompatibility(me, p), locked: !isPremium && i !== 0 })),
    [similarBatch, me, isPremium]
  );

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

  // Which profile the photos currently in state belong to. Without this, a
  // slow photo fetch for the card you just swiped past could land after the
  // next card opened and paint the wrong person's gallery.
  const imagesOwnerRef = useRef<string | null>(null);
  const applyProfileImages = useCallback(async (profile: CircleProfile) => {
    imagesOwnerRef.current = profile.id;
    const fallback = profile.firstImage ? [profile.firstImage] : [];
    setSelectedImages(fallback);
    const urls = await loadImagesForProfile(profile.id);
    if (imagesOwnerRef.current !== profile.id) return;
    setSelectedImages(urls.length ? urls : fallback);
  }, [loadImagesForProfile]);

  const openProfile = useCallback(async (profile: CircleProfile) => {
    setSelectedProfile(profile);
    await applyProfileImages(profile);
  }, [applyProfileImages]);

  const closeProfileView = useCallback(() => {
    imagesOwnerRef.current = null;
    setSelectedProfile(null);
    setCategoryBrowse(null);
    setCategoryBrowseIndex(0);
    setSelectedImages([]);
    setActiveRowKey(null);
  }, []);

  // Opening from Recommended/Similar tags which row's batch this profile
  // came from, so a like/pass below shrinks the right snapshot. Category
  // tiles and any other entry point leave activeRowKey null, so they never
  // touch these batches at all.
  const openCircleRowProfile = useCallback((rowKey: CircleRowKey, profile: CircleProfile) => {
    setActiveRowKey(rowKey);
    void openProfile(profile);
  }, [openProfile]);

  // Deep link from a re-engagement push notification
  // (/?tab=circle&circleUserId=<id>, see resolveNotificationRoute in
  // pushNotifications.ts) - opens that one profile directly, same as tapping
  // their Recommended card, without waiting on or depending on whatever pool
  // happens to be loaded. Independent of the pool/batch fetch above so it
  // works even before that's finished (or if it's a stale/decided batch by
  // the time the push is actually tapped).
  // deepLinkProfileId covers the app-already-running tap (handed down by
  // MainApp, no reload/URL involved); the URL param covers a cold start.
  useEffect(() => {
    if (!currentUser?.id) return;
    const params = new URLSearchParams(window.location.search);
    const circleUserId = deepLinkProfileId || params.get('circleUserId');
    if (!circleUserId) return;

    if (params.get('circleUserId')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    onDeepLinkConsumed?.();
    void (async () => {
      const [profile] = await fetchCircleProfilesByIds([circleUserId]);
      if (profile && await isCircleProfileEligible(currentUser, profile, isPremium)) {
        openCircleRowProfile('recommended', profile);
      } else {
        toast({ title: 'Profile unavailable', description: 'This profile is no longer available in your Circle.' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, deepLinkProfileId]);

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
    if (direction === 'like' && circleLikesLoaded && circleLikesUsed >= circleDailyLimit) {
      setShowCircleOutOfLikes(true);
      return;
    }
    setIsSwipeActionPending(true);

    let madeMatch = false;
    try {
      if (direction === 'like') {
        const result = await recordCircleLike(currentUser.id, profile.id, isPremium);
        setCircleLikesUsed(result.currentUsage);
        if (result.limitReached || !result.success) {
          setShowCircleOutOfLikes(true);
          return;
        }
        madeMatch = result.match;
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
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
      setIsSwipeActionPending(false);
      return;
    }

    setPool((prev) => prev.filter((p) => p.id !== profile.id));

    // Shrink the exact Recommended/Similar snapshot this profile came from
    // (not just the general pool) - once it hits empty, that row goes on
    // cooldown instead of quietly pulling in the next-best pool candidate.
    // Free users can only ever reach this for index 0 (the one unlocked
    // "lucky swipe" - the other 3 route to the upsell, never here), and
    // that single swipe uses up the whole row, not just that one card, so
    // the remaining locked teasers disappear along with it.
    if (activeRowKey === 'recommended' || activeRowKey === 'similar') {
      const setBatch = activeRowKey === 'recommended' ? setRecommendedBatch : setSimilarBatch;
      setBatch((prev) => {
        const hadItems = !!prev && prev.length > 0;
        const next = isPremium ? (prev ?? []).filter((p) => p.id !== profile.id) : [];
        if (hadItems && next.length === 0) {
          void markRowExhausted(activeRowKey);
        }
        // Keep the persisted snapshot in sync immediately, rather than
        // waiting for the next mount's reconciliation to notice this swipe.
        if (currentUser?.id) void saveCircleBatch(currentUser.id, activeRowKey, next.map((p) => p.id));
        return next;
      });
    }

    if (categoryBrowse) {
      const nextIndex = categoryBrowseIndex + 1;
      if (nextIndex < categoryBrowse.profiles.length) {
        const nextProfile = categoryBrowse.profiles[nextIndex];
        setCategoryBrowseIndex(nextIndex);
        void applyProfileImages(nextProfile);
      } else {
        toast({ title: "That's everyone", description: `You've seen everyone in "${categoryBrowse.label}" for now.` });
        closeProfileView();
      }
    } else {
      closeProfileView();
    }

    try {
      publishSwipeDecision(currentUser.id, profile.id, direction);
      if (direction === 'like') {
        // Same notifications a Discover swipe sends, so the person on the
        // other end hears about a Circle like/match identically.
        try {
          const { count } = await supabase
            .from('likes')
            .select('id', { count: 'exact', head: true })
            .eq('liked_id', profile.id);
          await sendMultipleLikesNotification(profile.id, typeof count === 'number' ? count : 1, currentUser.id);
        } catch {
          // notification failures never block the swipe
        }

        if (madeMatch) {
          toast({ title: "It's a match! 🎉", description: `You and ${profile.first_name} liked each other.` });
          try {
            await sendMatchNotification(
              `${currentUser.first_name || ''}`.trim() || 'Someone',
              profile.id
            );
          } catch {
            // ignore notification errors
          }
          if (typeof window !== 'undefined') {
            const win = window as Window & { chatMatchesCache?: Map<string, unknown> };
            win.chatMatchesCache?.delete(currentUser.id);
            window.dispatchEvent(new CustomEvent('newMatch', { detail: { userId: currentUser.id } }));
          }
        }
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
  }, [isSwipeActionPending, currentUser?.id, isPremium, toast, categoryBrowse, categoryBrowseIndex, applyProfileImages, closeProfileView, activeRowKey, markRowExhausted, circleLikesLoaded, circleLikesUsed, circleDailyLimit, sendMatchNotification, sendMultipleLikesNotification]);

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
    if (!isPremium && PREMIUM_ONLY_CATEGORY_KEYS.has(tile.key)) {
      setLockedTileLabel(tile.label);
      return;
    }
    if (!currentUser?.id || loadingCategoryKey) return;
    setLoadingCategoryKey(tile.key);
    try {
      const userId = currentUser.id;
      const baseCountryCode = normalizeCountryCode(currentUser.country_code || '');
      const allowedGenders = getGenderFilter(currentUser.preference || 'everyone');

      const split = getCircleCountrySplit(currentUser, isPremium);
      let homeCountryCodes = split.homeCountryCodes;
      const unlockedCountryCodes = split.unlockedCountryCodes;
      if (homeCountryCodes.length === 0) {
        const { data: countryRows } = await supabase
          .from('profiles')
          .select('country_code')
          .eq('account_status', 'active')
          .not('country_code', 'is', null);
        homeCountryCodes = Array.from(new Set((countryRows || []).map((r) => normalizeCountryCode(r.country_code || '')).filter(Boolean)));
      }
      if (homeCountryCodes.length === 0 && unlockedCountryCodes.length === 0) {
        setEmptyCategoryLabel(tile.label);
        return;
      }
      const homeSet = new Set(homeCountryCodes);

      // Same exclusion set Discover and the main Circle pool use - your own
      // like/pass/match/block/cooldown, never someone else's incoming like on
      // you (see circlePoolFetch.ts's comment - Discover shows those too;
      // Liked Me is what surfaces the other side of it).
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
      // Anyone held by the Recommended/Similar rows belongs only to those
      // rows - never also in a category deck, where swiping them would
      // silently gut the row the user is still looking at.
      (recommendedBatch || []).forEach((p) => excluded.add(p.id));
      (similarBatch || []).forEach((p) => excluded.add(p.id));

      // Same distance/archived rules Discover and Circle's own
      // Recommended/Similar rows already enforce - this RPC used to have
      // neither, so category browsing could surface people hundreds of km
      // away, or archived accounts, that Discover would never show.
      const { userLat, userLon, hasCoords, maxDistanceKm, radiusDegrees } = getCircleDistanceParams(currentUser, isPremium);

      type ProfileRow = Omit<CircleProfile, 'firstImage'>;
      const fetchCategoryRows = async (codes: string[], applyRadius: boolean, limit: number): Promise<ProfileRow[]> => {
        if (codes.length === 0 || limit <= 0) return [];
        const useBox = applyRadius && hasCoords;
        const { data, error } = await supabase.rpc('get_circle_category_profiles', {
          p_country_codes: codes,
          p_allowed_genders: allowedGenders,
          p_viewer_gender: currentUser.gender || '',
          p_excluded_ids: Array.from(excluded),
          p_limit: limit,
          p_relationship_intent: tile.filter?.relationshipIntent ?? null,
          p_family_plans: tile.filter?.familyPlans ?? null,
          p_is_verified: typeof tile.filter?.isVerified === 'boolean' ? tile.filter.isVerified : null,
          p_interest: tile.filter?.interest ?? null,
          p_has_music: typeof tile.filter?.hasMusic === 'boolean' ? tile.filter.hasMusic : null,
          p_has_social_media: typeof tile.filter?.hasSocialMedia === 'boolean' ? tile.filter.hasSocialMedia : null,
          p_has_pets: typeof tile.filter?.hasPets === 'boolean' ? tile.filter.hasPets : null,
          p_archived: false,
          p_lat: useBox ? userLat : null,
          p_lon: useBox ? userLon : null,
          p_radius_degrees: applyRadius ? radiusDegrees : null,
        });
        if (error) throw error;
        return Array.isArray(data) ? (data as unknown as ProfileRow[]) : [];
      };

      const homeLimit = unlockedCountryCodes.length > 0 ? 30 : 60;
      const [homeRows, unlockedRows] = await Promise.all([
        fetchCategoryRows(homeCountryCodes, true, homeLimit),
        fetchCategoryRows(unlockedCountryCodes, false, unlockedCountryCodes.length > 0 ? 60 - homeLimit : 0),
      ]);
      const rows = [...homeRows, ...unlockedRows];
      if (rows.length === 0) {
        setEmptyCategoryLabel(tile.label);
        return;
      }

      const eligible = rows
        .filter((p) => {
          if (!p.date_of_birth) return false;
          const age = calculateAge(p.date_of_birth);
          return age >= (currentUser.min_age || 18) && age <= (currentUser.max_age || 99);
        })
        // The RPC's radius is a rough lat/lon bounding box - narrow to the
        // real distance. Only for the viewer's own country; unlocked
        // countries are intentionally not distance-bound.
        .filter((p) => {
          if (!hasCoords || !p.latitude || !p.longitude) return true;
          if (!homeSet.has(normalizeCountryCode(p.country_code || ''))) return true;
          return calculateDistance(userLat as number, userLon as number, p.latitude, p.longitude) <= maxDistanceKm;
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
        setEmptyCategoryLabel(tile.label);
        return;
      }

      setCategoryBrowse({ label: tile.label, profiles: withPhotos });
      setCategoryBrowseIndex(0);
      void applyProfileImages(withPhotos[0]);
    } catch (err) {
      console.error('Error loading category browse:', err);
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setLoadingCategoryKey(null);
    }
  }, [currentUser, isPremium, toast, loadingCategoryKey, navigate, applyProfileImages, recommendedBatch, similarBatch]);

  // Both tiers see the same 4-card batch. Free: only index 0 is unlocked -
  // the other 3 are a locked, tap-opens-upsell teaser (see recommendedItems/
  // similarItems) - swiping that one card uses up the whole row. Premium:
  // all 4 are real; a blurred "Refilling" card only joins the row once at
  // least one has actually been swiped (not from the very first render),
  // as a preview that more is coming. Once a row is fully exhausted - free's
  // one card used, or premium's batch fully swiped - that same RefillCard
  // stands alone as the whole row, paired with a short status line, instead
  // of the row just going blank.
  const renderCircleRow = (
    key: CircleRowKey,
    title: string,
    items: { p: CircleProfile; interestIcons: SharedTrait[]; percent: number; locked?: boolean }[],
    batch: CircleProfile[] | null,
    showIcons: boolean
  ) => {
    // A row's "exhausted" messaging is tied to an actual recorded cooldown -
    // never just "the batch happens to be empty." A genuinely empty batch
    // (nobody matched this row's criteria at all) shouldn't claim a swipe
    // was used when none was.
    const exhaustedAt = rowCooldowns[key];
    const inCooldown = exhaustedAt !== null && Date.now() - exhaustedAt < rowCooldownMs;
    const remainingMs = exhaustedAt !== null ? rowCooldownMs - (Date.now() - exhaustedAt) : 0;

    if (!isPremium) {
      if (items.length > 0) {
        return (
          <PeopleRow
            title={title}
            items={items}
            onSelect={(p) => openCircleRowProfile(key, p)}
            showIcons={showIcons}
            onLockedTap={() => setLockedTileLabel(title)}
          />
        );
      }
      if (loading) return null; // still loading - not a real empty state yet
      if (inCooldown) {
        return (
          <div className="mb-7">
            <h2 className="text-white font-semibold text-base px-6 mb-0.5">{title}</h2>
            <p className="text-pink-300 text-xs font-medium px-6 mb-2">You used your lucky swipe!</p>
            <div className="px-6">
              <RefillCard
                label="Refilling"
                sublabel={eligibleForTrial ? 'Free trial for instant access' : 'Upgrade for instant access'}
                onClick={() => setLockedTileLabel(title)}
              />
            </div>
          </div>
        );
      }
      // Genuinely nobody matched this row's criteria at all (not a used-up
      // swipe waiting on cooldown) - this used to just render nothing, a
      // dead end with no path forward. Premium genuinely does grow the pool
      // here - it unlocks browsing additional countries (see
      // unlocked_countries / fetchCirclePool's countryCodes logic), not just
      // the viewer's home one - so this is a real, honest reason to upgrade
      // when the local pool has run dry, not just a generic pitch.
      return (
        <div className="mb-7">
          <h2 className="text-white font-semibold text-base px-6 mb-0.5">{title}</h2>
          <p className="text-white/40 text-xs px-6 mb-2">Nobody new to show right now.</p>
          <div className="px-6">
            <RefillCard
              label="Go Premium"
              sublabel="Unlock more countries to find more people"
              onClick={() => setLockedTileLabel(title)}
            />
          </div>
        </div>
      );
    }

    if (items.length > 0) {
      return (
        <PeopleRow
          title={title}
          items={items}
          onSelect={(p) => openCircleRowProfile(key, p)}
          showIcons={showIcons}
          trailingCard={items.length < ROW_BATCH_SIZE ? <RefillCard label="Refilling" sublabel="More coming" /> : undefined}
        />
      );
    }
    if (inCooldown) {
      return (
        <div className="mb-7">
          <h2 className="text-white font-semibold text-base px-6 mb-0.5">{title}</h2>
          <p className="text-white/40 text-xs px-6 mb-2">You've seen everyone for now.</p>
          <div className="px-6">
            <RefillCard label="Refilling" countdown={{ remainingMs, totalMs: rowCooldownMs }} />
          </div>
        </div>
      );
    }
    return null; // still loading, or the pool genuinely had nobody for this row
  };

  const activeProfile = categoryBrowse ? categoryBrowse.profiles[categoryBrowseIndex] : selectedProfile;
  const nextBrowseProfile = categoryBrowse ? categoryBrowse.profiles[categoryBrowseIndex + 1] : undefined;

  // Users who've used today's tier allowance. Same shape as
  // Discover's own out-of-swipes card, with the CTA wording following
  // whether this viewer currently qualifies for a free trial.
  if (showCircleOutOfLikes) {
    return (
      <div className="h-full w-full flex items-center justify-center overflow-y-auto p-4">
        <Card className="max-w-md w-full bg-black border border-pink-500/25 text-white shadow-2xl">
          <CardContent className="p-6 text-center flex flex-col items-center">
            <Heart className="w-12 h-12 mb-3 text-pink-500/80" />
            <h2 className="text-lg font-semibold mb-1.5 text-white">Out of swipes for today</h2>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">
              You&apos;ve used all {circleDailyLimit} of your Circle likes for today. They refill tomorrow
              {!isPremium ? ' — or upgrade for 100 Circle likes each day.' : '.'}
            </p>
            <div className="w-full flex flex-col items-center gap-3">
              <Button
                onClick={() => { setShowCircleOutOfLikes(false); setShowCirclePremiumUpgrade(true); }}
                className="w-auto h-9 !rounded-full px-4 text-xs bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
              >
                <Crown className="w-3.5 h-3.5 mr-1.5" />
                {eligibleForTrial ? 'Try now for free' : 'Upgrade to Premium'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCircleOutOfLikes(false)}
                className="w-auto h-8 !rounded-full px-3.5 text-xs border-pink-500/30 text-white hover:bg-pink-500/10 bg-transparent"
              >
                Back to Circle
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Same empty-state pattern DiscoverPage uses when its own deck runs dry:
  // a real banner (not a toast that's easy to miss), an honest "adjust your
  // preferences" path that costs nothing, and - only if there's actually a
  // real reason to upgrade (more countries unlocked) - a premium CTA whose
  // wording matches whether this viewer currently qualifies for a free
  // trial, exactly like every other upgrade prompt in the app.
  if (emptyCategoryLabel) {
    return (
      <div className="h-full w-full flex items-center justify-center overflow-y-auto p-4">
        <Card className="max-w-md w-full bg-black border border-pink-500/25 text-white shadow-2xl">
          <CardContent className="p-6 text-center flex flex-col items-center">
            <Heart className="w-12 h-12 mb-3 text-pink-500/80" />
            <h2 className="text-lg font-semibold mb-1.5 text-white">No one matches yet</h2>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">
              No one new matches &quot;{emptyCategoryLabel}&quot; right now. Check back soon, or adjust your preferences in Profile.
            </p>
            {!isPremium && (
              <div className="mb-3">
                <p className="text-yellow-400 text-sm mb-3 max-w-xs mx-auto">
                  Upgrade to Premium to unlock more countries and see more people.
                </p>
                <Button
                  onClick={() => { setEmptyCategoryLabel(null); setShowCirclePremiumUpgrade(true); }}
                  className="w-auto h-8 !rounded-full px-3.5 text-xs bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
                >
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  {eligibleForTrial ? 'Try now for free' : 'Unlock More Countries'}
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setEmptyCategoryLabel(null)}
              className="w-auto h-8 !rounded-full px-3.5 text-xs border-pink-500/30 text-white hover:bg-pink-500/10"
            >
              Back to Circle
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showCirclePremiumUpgrade) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <PremiumUpgrade currentUser={currentUser} onClose={() => setShowCirclePremiumUpgrade(false)} preselectedPlan="premium" />
      </div>
    );
  }

  if (activeProfile) {
    return (
      <ProfilePreviewModal
        // Remount per person: the preview keeps its own slide index, expanded
        // state and swipe-exit transform, so reusing the instance left the
        // next card stuck mid-swipe with stale info until a full refresh.
        key={activeProfile.id}
        profile={toPotentialMatch(activeProfile)}
        images={selectedImages.length ? selectedImages : (activeProfile.firstImage ? [activeProfile.firstImage] : [])}
        onClose={closeProfileView}
        onBack={closeProfileView}
        simpleBackButton
        onLike={() => handleCircleLike(activeProfile)}
        onPass={() => handleCirclePass(activeProfile)}
        topLabel={categoryBrowse ? categoryBrowse.label : undefined}
        nextPreviewImageUrl={nextBrowseProfile?.firstImage || undefined}
        dailyLikeCounter={circleLikesLoaded ? { remaining: circleLikesLeft, limit: circleDailyLimit } : undefined}
        readOnly
      />
    );
  }

  return (
    <div className="h-full w-full bg-black overflow-y-auto scrollbar-hide">
      <div className="sticky top-0 z-10 bg-black pt-2 pb-2">
        <div className="flex items-start justify-between px-6 gap-3 mb-1">
          <h2 className="text-white font-semibold text-base">Circle Up</h2>
          {circleLikesLoaded && (
            <span
              className={`flex items-center gap-1 flex-shrink-0 text-[11px] font-medium rounded-full border px-2.5 py-1 ${
                circleLikesLeft === 0
                  ? 'text-white/70 border-white/15 bg-white/[0.04]'
                  : 'text-pink-300 border-pink-500/30 bg-pink-500/10'
              }`}
              aria-label={`${circleLikesLeft} of ${circleDailyLimit} Circle likes left today`}
            >
              <Heart className="w-3 h-3" />
              {circleLikesLeft}/{circleDailyLimit}
            </span>
          )}
        </div>
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
            {renderCircleRow('recommended', 'Recommended for you', recommendedItems, recommendedBatch, false)}
            {renderCircleRow('similar', 'Similar interests', similarItems, similarBatch, true)}
          </>
        )}

        <div className="grid grid-cols-2 gap-3 pb-4" style={{ paddingLeft: 24, paddingRight: 24 }}>
          {categories.map((tile) => {
            const { key, label, icon: Icon, count, isGameLink } = tile;
            const isLoadingThis = loadingCategoryKey === key;
            const isLockedForFree = !isPremium && PREMIUM_ONLY_CATEGORY_KEYS.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCategoryClick(tile)}
                disabled={!isGameLink && !isLockedForFree && loadingCategoryKey !== null}
                className={`relative text-left rounded-2xl border px-4 py-5 flex flex-col items-center gap-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  isGameLink
                    ? 'bg-gradient-to-br from-pink-600/20 to-purple-600/20 border-pink-500/30 active:from-pink-600/30 active:to-purple-600/30'
                    : 'bg-white/[0.04] border-white/10 active:bg-white/[0.08]'
                }`}
              >
                {isLockedForFree && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/80 border border-pink-500/40 flex items-center justify-center">
                    <Lock className="w-3 h-3 text-pink-300" />
                  </div>
                )}
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

      {lockedTileLabel && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLockedTileLabel(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-pink-500/30 bg-gradient-to-br from-pink-950 via-purple-950 to-black p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-pink-500/15 border border-pink-500/40 flex items-center justify-center">
              <Lock className="w-5 h-5 text-pink-300" />
            </div>
            <p className="text-white text-sm leading-relaxed mb-5">
              You could see a lot of <span className="font-semibold text-pink-300">{lockedTileLabel}</span> matches waiting for you - but you'll need to upgrade to enjoy this.
            </p>
            <button
              type="button"
              onClick={() => {
                setLockedTileLabel(null);
                setShowCirclePremiumUpgrade(true);
              }}
              className="w-full py-3 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black text-sm font-semibold shadow-md transition-colors flex items-center justify-center gap-2"
            >
              <Crown className="w-4 h-4" />
              {eligibleForTrial ? 'Start Free Trial' : 'Upgrade'}
            </button>
            <button
              type="button"
              onClick={() => setLockedTileLabel(null)}
              className="mt-3 text-white/40 text-xs"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CirclePage;

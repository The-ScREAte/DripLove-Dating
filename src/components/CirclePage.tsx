import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { placeShort } from '@/utils/countryShort';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PotentialMatch, CurrentUser } from '@/types';
import { calculateAge } from '@/utils/dateUtils';
import { useBackClose } from '@/utils/backStack';
import { normalizeCountryCode } from '@/utils/countryCode';
import { parseFavorites, displayFavorites } from '@/constants/favorites';
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
  CIRCLE_CACHE_TTL_MS,
  readCirclePoolCache,
  writeCirclePoolCache,
  readCircleRowsCache,
  writeCircleRowsCache,
} from '@/utils/circlePoolFetch';
import { calculateDistance } from '@/constants/locationData';
import { openPremiumUpgrade } from '@/popups';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { getCircleDailyLikeLimit, getCircleLikesUsedToday, recordCircleLike } from '@/utils/circleSwipeLimit';
import { buildCircleCountScope, dobBoundsForAgeRange, EXACT_RADIUS_REFINE_MAX, formatCountCompact, hueFromString, prefetchWindow, removeFromDeck, rollbackInsertIndex, teaserDisplay, teaserHues } from '@/utils/circleCounts';
import { publishSwipeDecision } from '@/utils/swipeSync';
import { getDetailImageUrl } from '@/utils/imageOptimizer';

// Recommended for you / Similar interests only ever show a handful at a
// time, then go on cooldown instead of silently backfilling from the pool.
// Both tiers see the same 4-card batch (free sees it has real options, not
// just one) - the difference is what's actually interactive: premium can
// swipe all 4, free only ever gets ONE real "lucky swipe" (the top-ranked
// card, index 0) with the other 3 shown locked purely as a teaser (tapping
// any of those three opens the premium upsell, never a profile). Swiping
// the one available free card - or, for premium, working through all 4 -
// exhausts the whole row and starts its cooldown.
// Entry point to Circle Up Live (video matching) at the top of this page.
// Switched off until the feature is ready to launch.
const SHOW_CIRCLE_UP_LIVE = false;

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

// Category tile counts run 12 separate count queries - cheap individually but
// slow in aggregate, and identical on every remount within a short window.
// Module-level (survives remounts, not just this component instance) so
// flipping tabs and back doesn't re-run all 12 every time.
const CATEGORY_COUNTS_CACHE_TTL_MS = 2 * 60 * 1000;
let categoryCountsCache: { key: string; categories: CategoryTile[]; timestamp: number } | null = null;
import ProfilePreviewModal from './profile/ProfilePreviewModal';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { TeaserAvatars } from './circle/TeaserAvatars';
import { applyCircleCountFilters, countCircleProfilesRpc, fetchCircleTotals, fetchViewerExclusions, MAX_EXCLUDED_IN_URL, type CategoryFilter } from '@/utils/circleCountQuery';
import { fetchCircleTeaserPhotos } from '@/utils/circleTeaserPhotos';
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
  Video,
  ChevronLeft,
  Globe,
  Users,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isRecentlyOnline, SWIPE_ONLINE_WINDOW_MS } from '@/utils/onlineStatus';
import ThumbnailImage from '@/components/common/ThumbnailImage';
import { getGenderFilter } from '@/utils/genderPreference';

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
  const myFavoriteCategories = new Set(displayFavorites(me.favorites).map((f) => f.category));
  if (displayFavorites(other.favorites).some((f) => myFavoriteCategories.has(f.category))) matchedCategories += 1;

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
  // Opens a Profile section (e.g. 'location', where the country picker lives).
  onNavigateToProfileSection?: (section: string) => void;
}

// CircleProfile + the pool fetch itself now live in '@/utils/circlePoolFetch'
// so MainApp's background preloader can call the exact same fetch (see
// preloadCircleData there) instead of a second, drifting copy of this logic.

// The filter a tile browses by, when tapped - matches
// get_circle_category_profiles' own optional params 1:1 (exactly one of
// these is ever set per tile). Omitted entirely for the Games tile, which
// doesn't filter/browse people at all.
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
// People per deck page; the deck progress label reads "n/60+" while more can still load.
const CIRCLE_PAGE_SIZE = 60;

const PREMIUM_ONLY_CATEGORY_KEYS = new Set(['serious', 'casual', 'open', 'verified', 'music', 'social', 'travel']);

// Each tile gets its own pair of hues (a tint family, deep and dark so white text stays at
// >= 7:1 contrast) so the grid reads as a colourful, curated set instead of 13 identical boxes.
const CATEGORY_THEME: Record<string, [number, number]> = {
  games: [330, 275],
  serious: [345, 300],
  casual: [18, 340],
  open: [270, 225],
  verified: [205, 180],
  wants_kids: [38, 12],
  child_free: [190, 230],
  travel: [195, 160],
  sporty: [150, 175],
  creative: [290, 330],
  music: [260, 310],
  social: [320, 20],
  pet: [28, 55],
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
  // Archived members (inactive 30+ days) are the deck's top-up after the active ones; flagged the
  // same way Discover flags its own archived mix-ins.
  is_archived: p.__isArchivedMixin || undefined,
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

// Shown the instant a category tile is tapped (and in the rare moment a deck runs out of loaded
// people) - same chrome as the real deck card (rounded border, back chevron, category pill, name
// bars) so there is no layout jump when the first card arrives. Opacity/transform-only shimmer.
const CircleDeckSkeleton = ({ label, onBack }: { label?: string | null; onBack: () => void }) => (
  <div className="h-full w-full bg-black" role="status" aria-busy="true" aria-live="polite">
    <div
      className="relative overflow-hidden rounded-[28px] border border-pink-500/30 bg-neutral-950"
      style={{ height: 'calc(100% - 8px)', animation: 'dl-fade var(--dl-dur) var(--dl-ease-out) backwards' }}
    >
      <div className="dl-skeleton absolute inset-0" />
      <div className="absolute left-1/2 top-[34%] h-32 w-32 -translate-x-1/2 rounded-full bg-white/[0.05]" aria-hidden="true" />
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="dl-hit absolute left-2 top-4 z-10 flex items-center justify-center text-white active:opacity-60"
        style={{ background: 'none', border: 'none', padding: 0 }}
      >
        <ChevronLeft className="w-8 h-8" strokeWidth={3} />
      </button>
      {label && (
        <div className="absolute left-1/2 top-3 z-10 max-w-[55%] -translate-x-1/2 truncate rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[11px] font-semibold text-white">
          {label}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 space-y-2.5 bg-gradient-to-t from-black via-black/70 to-transparent p-5 pt-16">
        <div className="h-6 w-48 rounded-md bg-white/15" />
        <div className="h-4 w-32 rounded-md bg-white/10" />
        <div className="flex gap-2 pt-1">
          <div className="h-7 w-16 rounded-full bg-white/10" />
          <div className="h-7 w-20 rounded-full bg-white/10" />
          <div className="h-7 w-14 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  </div>
);

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
      <div className="absolute inset-0 bg-white/5" />
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
    <span className="dl-soft-badge absolute top-2 left-2 text-pink-50 text-xs font-semibold py-0.5 pl-2 pr-2 rounded-full flex items-center">
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
            className="dl-soft-card flex-shrink-0 w-40 text-left rounded-2xl overflow-hidden p-0"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="relative w-40 h-48 bg-white/5">
              {locked ? (
                // Locked = a generic blurred silhouette. The real photo URL and name never enter the
                // DOM for locked content (a CSS blur alone still ships the full-size image).
                <div
                  className="ci-locked-photo absolute inset-0"
                  style={{ ['--h' as string]: hueFromString(p.id), ['--h2' as string]: (hueFromString(p.id) + 40) % 360 }}
                  aria-hidden="true"
                >
                  <span className="ci-av" style={{ ['--h' as string]: hueFromString(p.id), ['--h2' as string]: (hueFromString(p.id) + 40) % 360 }} />
                </div>
              ) : (
                p.firstImage && (
                  <ThumbnailImage src={p.firstImage} alt={p.first_name} className="w-full h-full object-cover" loading="lazy" decoding="async" draggable={false} />
                )
              )}
              {locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="dl-soft-badge rounded-full p-2.5">
                    <Lock className="w-5 h-5 text-pink-100" />
                  </div>
                </div>
              )}
              {percent > 0 && <CompatibilityBadge percent={percent} showHint={index === 0} />}
              {showIcons && interestIcons.length > 0 && (
                <div className="absolute bottom-2 right-2 flex gap-1">
                  {interestIcons.slice(0, 3).map(({ icon: Icon, label }, i) => (
                    <span
                      key={`${label}-${i}`}
                      className="dl-soft-badge w-7 h-7 rounded-full flex items-center justify-center"
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
              <p className="flex items-center gap-1.5 text-white text-sm font-medium truncate">
                <span className="truncate">{locked ? `••••, ${calculateAge(p.date_of_birth)}` : `${p.first_name}, ${calculateAge(p.date_of_birth)}`}</span>
                {isRecentlyOnline(p.last_login_at, SWIPE_ONLINE_WINDOW_MS) && (
                  <span
                    className="w-2 h-2 rounded-full bg-green-500 shrink-0"
                    aria-label="Active now"
                  />
                )}
              </p>
              {(p.city || p.country) && (
                <p className="text-white/50 text-xs truncate">
                  {placeShort(p.city, p.country)}
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

const CirclePage = ({ currentUser, isPremium, deepLinkProfileId, onDeepLinkConsumed, onNavigateToProfileSection }: CirclePageProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { sendMatchNotification, sendMultipleLikesNotification } = usePushNotifications(currentUser?.id);
  const navigate = useNavigate();
  // Same eligibility signal PremiumUpgrade.tsx's own "Start Free Trial"
  // buttons use - already correctly platform-aware: web/PWA has no native
  // store to ask, so this stays false there (falls back to "Subscribe");
  // iOS/Android only read true once the actual store confirms a trial
  // offer is available for this account.
  const { eligibleForTrial } = useFreeTrialOffer(currentUser?.id);
  // Hydrated straight from localStorage (survives a real app restart, unlike
  // window.circleCache below which is wiped the moment the JS process
  // restarts) so reopening the app - not just switching back to this tab
  // within the same session - can also show the same pool instantly instead
  // of a blank loading state.
  const [pool, setPool] = useState<CircleProfile[]>(
    () => (readCirclePoolCache(currentUser?.id || '') as CircleProfile[] | null) ?? []
  );
  const [loading, setLoading] = useState(() => pool.length === 0);
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
  // Keeps a category deck loading as it's swiped: the open category's page
  // loader (built in handleCategoryClick with that category's filters and
  // exclusions), whether a fresh load found nobody new, and any load in flight.
  const categoryMoreRef = useRef<{
    loadPage: (skipIds: string[]) => Promise<CircleProfile[]>;
    exhausted: boolean;
    inFlight: Promise<CircleProfile[] | null> | null;
  } | null>(null);
  const categoryBrowseRef = useRef<{ label: string; profiles: CircleProfile[] } | null>(null);
  // Ids this Circle session itself just swiped (set right before the decision is published) so the
  // 'profileDecided' listener can tell its own swipes from ones made in Discover / Liked Me.
  const ownSwipedIdsRef = useRef<Set<string>>(new Set());
  const categoryBrowseIndexRef = useRef(0);
  useEffect(() => {
    categoryBrowseRef.current = categoryBrowse;
  }, [categoryBrowse]);
  const [loadingCategoryKey, setLoadingCategoryKey] = useState<string | null>(null);
  // The tapped tile's label while its deck is still loading: shows the deck skeleton INSTANTLY
  // (so a tap always feels answered) instead of leaving the grid sitting there for the whole
  // multi-query load. openTokenRef lets Back cancel a load that is still in flight.
  const [openingCategory, setOpeningCategory] = useState<string | null>(null);
  // Why the empty screen is showing: nobody matches this circle at all, vs the deck was swiped through.
  const [emptyCategoryKind, setEmptyCategoryKind] = useState<'none' | 'seen' | 'error'>('none');
  const openTokenRef = useRef(0);

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
  // Falls back to the localStorage cache (survives a real app restart) when
  // the in-memory window.circleRowsCache is empty, e.g. right after the app
  // was actually closed and reopened rather than just switching tabs.
  const [recommendedBatch, setRecommendedBatch] = useState<CircleProfile[] | null>(() => {
    const fromMemory = window.circleRowsCache?.get(currentUser?.id || '')?.recommended as CircleProfile[] | undefined;
    if (fromMemory) return fromMemory;
    return (readCircleRowsCache(currentUser?.id || '')?.recommended as CircleProfile[] | undefined) ?? null;
  });
  const [similarBatch, setSimilarBatch] = useState<CircleProfile[] | null>(() => {
    const fromMemory = window.circleRowsCache?.get(currentUser?.id || '')?.similar as CircleProfile[] | undefined;
    if (fromMemory) return fromMemory;
    return (readCircleRowsCache(currentUser?.id || '')?.similar as CircleProfile[] | undefined) ?? null;
  });
  // Which row a currently-open profile preview came from, so a like/pass
  // removes it from the right batch instead of just the general pool.
  const [activeRowKey, setActiveRowKey] = useState<CircleRowKey | null>(null);
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

  // The count is keyed by (UTC) date: if the app stays open across midnight, or the user is
  // blocked at the limit, re-read it so the likes come back without a reload.
  const circleDayRef = useRef(new Date().toISOString().slice(0, 10));
  const circleLikesSyncedAtRef = useRef(Date.now());
  const circleAtLimitRef = useRef(false);
  circleAtLimitRef.current = circleLikesLoaded && circleLikesUsed >= circleDailyLimit;
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return undefined;
    const check = () => {
      if (document.hidden) return;
      const day = new Date().toISOString().slice(0, 10);
      const dayChanged = day !== circleDayRef.current;
      if (!dayChanged && !(circleAtLimitRef.current && Date.now() - circleLikesSyncedAtRef.current > 60_000)) return;
      circleDayRef.current = day;
      circleLikesSyncedAtRef.current = Date.now();
      void getCircleLikesUsedToday(userId).then((used) => setCircleLikesUsed(used));
    };
    const id = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [currentUser?.id]);

  // A decision made in Discover must disappear from every Circle surface
  // immediately, without waiting for cache expiry or a remount.
  useEffect(() => {
    if (!currentUser?.id) return;
    const onProfileDecided = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; profileId?: string }>).detail;
      if (detail?.userId !== currentUser.id || !detail.profileId) return;
      const profileId = detail.profileId;
      setPool((prev) => prev.filter((profile) => profile.id !== profileId));
      // Recommended/Similar are a PERSISTED snapshot, so a decision made
      // elsewhere (Discover, Liked Me) has to shrink the stored row too -
      // otherwise the person reappears in that row on the next mount. When
      // the row empties this way it goes on cooldown exactly as it would
      // have if the last card had been swiped from inside Circle.
      const shrinkRow = (key: CircleRowKey, setBatch: typeof setRecommendedBatch) => {
        setBatch((prev) => {
          if (!prev || !prev.some((profile) => profile.id === profileId)) return prev;
          const next = prev.filter((profile) => profile.id !== profileId);
          void saveCircleBatch(currentUser.id, key, next.map((p) => p.id));
          if (next.length === 0) {
            const now = Date.now();
            setRowCooldowns((cd) => ({ ...cd, [key]: now }));
            void supabase.from('circle_row_cooldowns').upsert(
              { user_id: currentUser.id, row_key: key, exhausted_at: new Date(now).toISOString() },
              { onConflict: 'user_id,row_key' }
            );
          }
          return next;
        });
      };
      shrinkRow('recommended', setRecommendedBatch);
      shrinkRow('similar', setSimilarBatch);
      // The deck's own swipes already advanced past this person (see performSwipeAction), so
      // removing them here as well shifted the list left while the index had moved right: every
      // swipe silently SKIPPED the next profile. Only decisions made ELSEWHERE (Discover, Liked
      // Me) remove from the deck, and they keep the index pointing at the same person.
      const ownSwipe = ownSwipedIdsRef.current.delete(profileId);
      const deck = categoryBrowseRef.current;
      if (!ownSwipe && deck) {
        const removal = removeFromDeck(deck.profiles.map((profile) => profile.id), categoryBrowseIndexRef.current, profileId);
        if (removal.removed) {
          if (removal.index !== categoryBrowseIndexRef.current) {
            categoryBrowseIndexRef.current = removal.index;
            setCategoryBrowseIndex(removal.index);
          }
          setCategoryBrowse((prev) => prev ? { ...prev, profiles: prev.profiles.filter((profile) => profile.id !== profileId) } : prev);
        }
      }
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
  //
  // Depending on the whole `currentUser` object (below) was the actual bug
  // behind "it refreshes every time I come back to Circle": MainApp hands
  // down a fresh `profile` object reference on every fetchUserProfile()
  // call even when nothing about it actually changed, and Circle stays
  // mounted (display:none) rather than unmounting between tab switches - so
  // this effect re-ran, re-fetched, and briefly clobbered the cached pool
  // on every one of those unrelated re-renders, not just on real changes.
  // Keying on the specific fields fetchCirclePool actually reads (same
  // approach as the category-counts cache key below) makes the effect
  // stable across reference-only changes while still refetching for any
  // change that could really affect the results.
  const poolFetchKey = useMemo(() => [
    currentUser?.id || '',
    currentUser?.country_code || '',
    (currentUser?.unlocked_countries || []).join(','),
    currentUser?.preference || '',
    currentUser?.gender || '',
    currentUser?.min_age ?? '',
    currentUser?.max_age ?? '',
    currentUser?.max_distance ?? currentUser?.distance_preference ?? '',
    currentUser?.latitude ?? '',
    currentUser?.longitude ?? '',
  ].join('|'), [currentUser]);

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

    // A list restored from the device is already on screen: refresh it quietly
    // (no spinner), and keep it if the refresh fails.
    const showingSaved = pool.length > 0;
    const load = async () => {
      if (!cached && !showingSaved) setLoading(true);
      try {
        const withPhotos = await fetchCirclePool(currentUser, isPremium);
        if (!cancelled) {
          setPool(withPhotos);
          setLoading(false);
          window.circleCache?.set(userId, { pool: withPhotos, timestamp: Date.now() });
          writeCirclePoolCache(userId, withPhotos);
        }
      } catch {
        if (!cancelled && !cached && !showingSaved) setPool([]);
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolFetchKey, isPremium]);

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

    const cacheKey = `${currentUser.id}:${currentUser.country_code || ''}:${currentUser.preference || ''}:${currentUser.gender || ''}:${isPremium ? '1' : '0'}:${getCircleCountrySplit(currentUser, isPremium).unlockedCountryCodes.join(',')}`;
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

      // Counts run in the DATABASE now: the age window becomes a date-of-birth range and the
      // distance box stays a lat/lon box, and only a head count comes back. This used to download
      // every matching profile row (id, coordinates, dob) x 12 categories x home/unlocked on every
      // open of the page and filter in JS - megabytes of JSON parsed right as the user starts
      // swiping. The exact circle (haversine) is only applied for small results, where the rows are
      // cheap; for big ones the box count is scaled by pi/4 (circle/box area), which errs LOW so a
      // number shown to the user is never an overstatement.
      const dobBounds = dobBoundsForAgeRange(currentUser.min_age || 18, currentUser.max_age || 99);
      const countForCountries = async (
        codes: string[],
        applyRadius: boolean,
        filter?: CategoryFilter
      ): Promise<number> => {
        if (codes.length === 0) return 0;
        const useBox = applyRadius && hasCoords && radiusDegrees !== null;
        const withFilters = (q: unknown) => applyCircleCountFilters(q, {
          codes,
          allowedGenders,
          dob: dobBounds,
          excluded,
          box: useBox ? { lat: userLat as number, lon: userLon as number, degrees: radiusDegrees as number } : null,
          viewerGender: currentUser.gender || undefined,
          filter,
        });
        // A big exclusion list (likes/passes/matches/blocks) cannot go in the URL: count through the RPC instead.
        const bigExclusions = excluded.size > MAX_EXCLUDED_IN_URL;
        let headCount: number | null = null;
        if (bigExclusions) {
          headCount = await countCircleProfilesRpc({
            codes, allowedGenders, dob: dobBounds, excluded,
            box: useBox ? { lat: userLat as number, lon: userLon as number, degrees: radiusDegrees as number } : null,
            viewerGender: currentUser.gender || undefined, filter,
          });
        }
        if (headCount === null) {
          const head = await withFilters(supabase.from('profiles').select('id', { count: 'exact', head: true }));
          if (head.error || typeof head.count !== 'number') return 0;
          headCount = head.count;
        }
        const needsCircle = applyRadius && hasCoords;
        if (!needsCircle) return headCount;
        if (headCount === 0) return 0;
        if (headCount > EXACT_RADIUS_REFINE_MAX) return Math.floor(headCount * (Math.PI / 4));
        const { data, error } = await withFilters(supabase.from('profiles').select('id, latitude, longitude'));
        if (error || !data) return Math.floor(headCount * (Math.PI / 4));
        return (data as { id: string; latitude: number | null; longitude: number | null }[]).filter((profile) => {
          // exclusions too big for the URL were not applied by the query: apply them here
          if (bigExclusions && excluded.has(profile.id)) return false;
          if (typeof profile.latitude !== 'number' || typeof profile.longitude !== 'number') return true;
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

  // Which pool the tile counts describe: the ENTIRE APP for a free viewer's locked tiles (and for a
  // premium viewer who has not picked any countries yet, with a hint to pick some), or - once
  // countries are picked - only where this premium viewer has access (what they will see in the
  // deck). Recomputed whenever premium status or the selected countries change.
  const countScope = useMemo(() => {
    const split = getCircleCountrySplit(currentUser, isPremium);
    return buildCircleCountScope({
      isPremium,
      homeCountry: split.baseCountryCode,
      selectedCountries: split.unlockedCountryCodes,
      prefs: { minAge: currentUser?.min_age, maxAge: currentUser?.max_age },
    });
  }, [currentUser, isPremium]);

  // ENTIRE-APP total per circle (head counts, no country/gender/age/distance filter, cached per
  // session). null = could not be fetched -> the tile says "Many" (never an invented number).
  const [appTotals, setAppTotals] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (isPremium === undefined || !currentUser?.id || countScope.mode !== 'worldwide') return undefined;
    let cancelled = false;
    // free: only the locked circles need it; premium with no countries yet: every tile shows it
    const defs = CATEGORY_DEFS
      .filter((d) => !d.isGameLink && (isPremium ? true : PREMIUM_ONLY_CATEGORY_KEYS.has(d.key)))
      .map((d) => ({ key: d.key, filter: d.filter }));
    void fetchCircleTotals({ id: currentUser.id }, defs)
      .then((totals) => { if (!cancelled) setAppTotals(totals); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isPremium, currentUser?.id, countScope.mode]);

  // Real (moderated, blurred) member photos for the tiny avatar clusters on LOCKED tiles. Loaded
  // after the totals, in the background: until they arrive (or if anything fails) the tiles keep
  // their silhouettes, so this can never block or break the page.
  const [teaserPhotos, setTeaserPhotos] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (isPremium !== false || !currentUser?.id || Object.keys(appTotals).length === 0) return undefined;
    let cancelled = false;
    const defs = CATEGORY_DEFS.filter((d) => PREMIUM_ONLY_CATEGORY_KEYS.has(d.key)).map((d) => ({ key: d.key, filter: d.filter }));
    void (async () => {
      const excluded = await fetchViewerExclusions(currentUser.id);
      const photos = await fetchCircleTeaserPhotos(currentUser.id, defs, appTotals, excluded);
      if (!cancelled) setTeaserPhotos(photos);
    })();
    return () => { cancelled = true; };
  }, [isPremium, currentUser?.id, appTotals]);

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

  // Rows restored from a saved copy show straight away. Once per visit, check
  // them in the background: anyone decided since (liked/passed/matched/
  // blocked - in Circle, Discover, Liked Me, anywhere) is removed, the stored
  // batch is updated to match, and a row left empty starts its cooldown, the
  // same as deciding the last person in it.
  const savedRowsCheckedRef = useRef(false);
  useEffect(() => {
    if (!currentUser?.id || savedRowsCheckedRef.current) return;
    if (recommendedBatch === null && similarBatch === null) return;
    savedRowsCheckedRef.current = true;
    const userId = currentUser.id;
    const shown = { recommended: recommendedBatch, similar: similarBatch };
    // Runs once and always finishes - a swipe while it's in flight must not
    // cancel it (it never runs again this visit).
    void (async () => {
      try {
        const decided = await fetchCircleExclusionIds(userId);
        const pruneRow = (key: CircleRowKey, setBatch: typeof setRecommendedBatch) => {
          const current = shown[key];
          if (!current) return;
          const next = current.filter((p) => !decided.has(p.id));
          if (next.length === current.length) return;
          setBatch((prev) => (prev ? prev.filter((p) => !decided.has(p.id)) : prev));
          void saveCircleBatch(userId, key, next.map((p) => p.id));
          if (next.length === 0) void markRowExhausted(key);
        };
        pruneRow('recommended', setRecommendedBatch);
        pruneRow('similar', setSimilarBatch);
      } catch {
        // Best-effort - the next decision trims the row anyway.
      }
    })();
  }, [currentUser?.id, recommendedBatch, similarBatch, markRowExhausted]);

  // Mirrors both batches into window.circleRowsCache on every change (however
  // they changed - freshly resolved, reconciled, or trimmed after a decision)
  // so the very next time this component mounts, the lazy useState
  // initializers above find them ready and skip the load entirely. Also
  // mirrored to localStorage so that still holds after a real app restart,
  // not just a same-session remount.
  useEffect(() => {
    if (!currentUser?.id) return;
    if (recommendedBatch === null && similarBatch === null) return;
    const existing = window.circleRowsCache?.get(currentUser.id);
    const nextRecommended = recommendedBatch ?? existing?.recommended ?? [];
    const nextSimilar = similarBatch ?? existing?.similar ?? [];
    window.circleRowsCache?.set(currentUser.id, {
      recommended: nextRecommended,
      similar: nextSimilar,
      timestamp: Date.now(),
    });
    writeCircleRowsCache(currentUser.id, nextRecommended, nextSimilar);
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
  // Photo URLs already fetched this session, keyed by profile id. Swiping
  // through a deck used to re-query user_images for every single card, so
  // each swipe waited on a round trip before anything but the thumbnail
  // showed; now the next cards are fetched and warmed in the background
  // while the current one is on screen.
  const imageUrlCacheRef = useRef<Map<string, string[]>>(new Map());

  const fetchAndCacheImages = useCallback(async (profile: CircleProfile): Promise<string[]> => {
    const cached = imageUrlCacheRef.current.get(profile.id);
    if (cached) return cached;
    const urls = await loadImagesForProfile(profile.id);
    const resolved = urls.length ? urls : (profile.firstImage ? [profile.firstImage] : []);
    imageUrlCacheRef.current.set(profile.id, resolved);
    // Keep the map from growing without bound across a long session.
    if (imageUrlCacheRef.current.size > 120) {
      const firstKey = imageUrlCacheRef.current.keys().next().value as string | undefined;
      if (firstKey) imageUrlCacheRef.current.delete(firstKey);
    }
    return resolved;
  }, [loadImagesForProfile]);

  // Warms the browser cache for the exact URLs the card will render, so the
  // next card paints instantly instead of decoding on arrival. The first
  // photo is also decoded ahead; `allPhotos` warms the whole set (the very
  // next person, so swiping through their photos doesn't wait either).
  const prefetchProfileImages = useCallback(async (profile: CircleProfile | undefined, allPhotos = false) => {
    if (!profile) return;
    try {
      const urls = await fetchAndCacheImages(profile);
      urls.slice(0, allPhotos ? urls.length : 1).forEach((url, i) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = getDetailImageUrl(url);
        if (i === 0 && typeof img.decode === 'function') img.decode().catch(() => undefined);
      });
    } catch {
      // Prefetch is best-effort - a failure just means the normal load runs.
    }
  }, [fetchAndCacheImages]);

  // The person shown at `index` and the next three: every photo of the
  // current and next person, the first photo of the two after.
  const prefetchUpcoming = useCallback((profiles: CircleProfile[], index: number) => {
    const { full, first } = prefetchWindow(index, profiles.length);
    full.forEach((i) => { void prefetchProfileImages(profiles[i], true); });
    first.forEach((i) => { void prefetchProfileImages(profiles[i]); });
  }, [prefetchProfileImages]);

  // Loads the open category's next page (people not already in the deck) and
  // appends it. Returns who was added; nobody new means the category really
  // is used up for now. Concurrent calls share the same load.
  const loadMoreCategory = useCallback(async (): Promise<CircleProfile[] | null> => {
    const more = categoryMoreRef.current;
    if (!more || more.exhausted) return [];
    if (more.inFlight) return more.inFlight;
    const loaded = (categoryBrowseRef.current?.profiles || []).map((p) => p.id);
    more.inFlight = (async () => {
      try {
        // One quiet retry: a network blip must never read as "that's everyone".
        let page: CircleProfile[];
        try {
          page = await more.loadPage(loaded);
        } catch {
          await new Promise((r) => setTimeout(r, 1200));
          page = await more.loadPage(loaded);
        }
        const have = new Set(loaded);
        const fresh = page.filter((p) => !have.has(p.id));
        if (categoryMoreRef.current !== more) return [];
        if (fresh.length === 0) {
          more.exhausted = true;
          return [];
        }
        setCategoryBrowse((prev) => (prev ? { ...prev, profiles: [...prev.profiles, ...fresh] } : prev));
        return fresh;
      } catch {
        return null; // the load FAILED - different from "nobody new"
      } finally {
        more.inFlight = null;
      }
    })();
    return more.inFlight;
  }, []);

  const applyProfileImages = useCallback(async (profile: CircleProfile) => {
    imagesOwnerRef.current = profile.id;
    const fallback = profile.firstImage ? [profile.firstImage] : [];
    const cached = imageUrlCacheRef.current.get(profile.id);
    setSelectedImages(cached && cached.length ? cached : fallback);
    if (cached && cached.length) return;
    const urls = await fetchAndCacheImages(profile);
    if (imagesOwnerRef.current !== profile.id) return;
    setSelectedImages(urls.length ? urls : fallback);
  }, [fetchAndCacheImages]);

  const openProfile = useCallback(async (profile: CircleProfile) => {
    setSelectedProfile(profile);
    await applyProfileImages(profile);
  }, [applyProfileImages]);

  const closeProfileView = useCallback(() => {
    imagesOwnerRef.current = null;
    categoryMoreRef.current = null;
    setSelectedProfile(null);
    setCategoryBrowse(null);
    setCategoryBrowseIndex(0);
    setSelectedImages([]);
    setActiveRowKey(null);
  }, []);

  // Android hardware back closes the top overlay first (profile view, upgrade/out-of-likes
  // sheets) instead of leaving the app.
  useBackClose(!!selectedProfile || !!categoryBrowse, closeProfileView, { escape: false });
  useBackClose(showCircleOutOfLikes, () => setShowCircleOutOfLikes(false), { escape: false });
  useBackClose(!!emptyCategoryLabel, () => setEmptyCategoryLabel(null), { escape: false });

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
    // Wait for premium status to resolve before evaluating eligibility.
    // isPremium starts undefined while the subscription RPC is still in
    // flight (see MainApp's fetchUserProfile), and isCircleProfileEligible's
    // country check only unlocks a premium user's extra countries once it's
    // true - evaluating with it still undefined on a cold start could reject
    // a legitimately-unlocked cross-border profile. This effect always calls
    // onDeepLinkConsumed() by the end, so there was no second chance: the
    // deep link was silently burned on a "Profile unavailable" toast that
    // had nothing to do with the actual profile. Was previously missing from
    // the dependency array below too, so even if isPremium resolved a moment
    // later, this effect had no reason to run again.
    if (isPremium === undefined) return;
    const params = new URLSearchParams(window.location.search);
    const circleUserId = deepLinkProfileId || params.get('circleUserId');
    if (!circleUserId) return;

    if (params.get('circleUserId')) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    let cancelled = false;
    void (async () => {
      // Up to 2 attempts with a short backoff before giving up - this used
      // to call onDeepLinkConsumed() and fetch in one shot with no
      // try/catch, so a thrown error (a plain network blip - most likely
      // right when the app resumes from background, exactly when a
      // notification tap wakes it) was an unhandled rejection that silently
      // dropped the deep link with no retry and no feedback at all.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const [profile] = await fetchCircleProfilesByIds([circleUserId]);
          if (cancelled) return;
          if (profile && await isCircleProfileEligible(currentUser, profile, isPremium, { fromNotification: true })) {
            openCircleRowProfile('recommended', profile);
          } else {
            toast({ title: 'Profile unavailable', description: 'This profile is no longer available in your Circle.' });
          }
          break;
        } catch (err) {
          console.error('[CirclePage] Deep-link profile fetch failed:', err);
          if (attempt === 2) {
            if (!cancelled) {
              toast({ title: 'Could not open profile', description: 'Check your connection and try tapping the notification again.' });
            }
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
      if (!cancelled) onDeepLinkConsumed?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, deepLinkProfileId, isPremium]);

  // Per-profile in-flight guard against a double-fire from the swipe gesture's own exit-animation
  // timeout. This used to be ONE boolean held until the like/pass round trip AND the follow-up
  // likes-count query + notification call had all finished, so any swipe made in that window was
  // silently ignored (on a slow link that is most quick swipes) and the card flew off then came back.
  const swipeInFlightRef = useRef<Set<string>>(new Set());
  // Always-current copies for rollback (a background failure can land after the deck moved on).
  useEffect(() => { categoryBrowseIndexRef.current = categoryBrowseIndex; }, [categoryBrowseIndex]);
  // Set while the deck is out of preloaded people and waiting on the next page (rare: the next
  // page is fetched when 5 are left). Shows the deck skeleton instead of the already-thrown card.
  const [deckLoadingMore, setDeckLoadingMore] = useState(false);

  // Same RPCs Discover/Liked Me use for a real like/pass - usage-limit enforcement and
  // mutual-match detection happen server-side in these, so swiping from Circle behaves
  // identically to swiping anywhere else rather than being a second, divergent code path.
  //
  // OPTIMISTIC: the deck advances the moment the swipe commits (the fly-away has already played),
  // and the like/pass is sent in the background. A server rejection (daily limit raced from
  // another device, network error) rolls the person back into the deck as the next card and says
  // so - it never blocks the next swipe. Shared by the single-profile preview (Recommended/
  // Similar) and the category deck; the only difference is close-to-grid vs advance.
  const performSwipeAction = useCallback((profile: CircleProfile, direction: 'like' | 'pass') => {
    const userId = currentUser?.id;
    if (!userId || swipeInFlightRef.current.has(profile.id)) return;
    if (direction === 'like' && circleLikesLoaded && circleLikesUsed >= circleDailyLimit) {
      setShowCircleOutOfLikes(true);
      return;
    }
    swipeInFlightRef.current.add(profile.id);
    const wasLike = direction === 'like';
    const rowKey = activeRowKey === 'recommended' || activeRowKey === 'similar' ? activeRowKey : null;

    // ---------- 1) optimistic local state (synchronous, no network) ----------
    if (wasLike) setCircleLikesUsed((n) => n + 1);
    setPool((prev) => prev.filter((p) => p.id !== profile.id));

    // Shrink the exact Recommended/Similar snapshot this profile came from (not just the general
    // pool) - once it hits empty, that row goes on cooldown instead of quietly pulling in the
    // next-best pool candidate. Free users can only ever reach this for index 0 (the one
    // unlocked "lucky swipe" - the other 3 route to the upsell, never here), and that single swipe
    // uses up the whole row, so the remaining locked teasers disappear along with it.
    let prevBatchSnapshot: CircleProfile[] | null = null;
    if (rowKey) {
      const setBatch = rowKey === 'recommended' ? setRecommendedBatch : setSimilarBatch;
      setBatch((prev) => {
        prevBatchSnapshot = prev;
        const hadItems = !!prev && prev.length > 0;
        const next = isPremium ? (prev ?? []).filter((p) => p.id !== profile.id) : [];
        if (hadItems && next.length === 0) void markRowExhausted(rowKey);
        // Keep the persisted snapshot in sync immediately, rather than waiting for the next
        // mount's reconciliation to notice this swipe.
        void saveCircleBatch(userId, rowKey, next.map((p) => p.id));
        return next;
      });
    }

    if (categoryBrowse) {
      const nextIndex = categoryBrowseIndex + 1;
      // Keep the deck loading: with 5 or fewer people left, quietly fetch the next page of this
      // category so swiping never runs dry.
      if (categoryBrowse.profiles.length - nextIndex <= 5) void loadMoreCategory();
      if (nextIndex < categoryBrowse.profiles.length) {
        setCategoryBrowseIndex(nextIndex);
        void applyProfileImages(categoryBrowse.profiles[nextIndex]);
        // Stay ahead so the deck never stalls on a photo fetch.
        prefetchUpcoming(categoryBrowse.profiles, nextIndex);
      } else {
        // End of what's loaded: wait (behind a skeleton) for a fresh page - "That's everyone"
        // only when it finds nobody new.
        setDeckLoadingMore(true);
        void loadMoreCategory().then((more) => {
          setDeckLoadingMore(false);
          if (more === null) {
            setEmptyCategoryKind('error');
            setEmptyCategoryLabel(categoryBrowse.label);
            closeProfileView();
          } else if (more.length > 0) {
            setCategoryBrowseIndex(nextIndex);
            void applyProfileImages(more[0]);
            prefetchUpcoming(more, 0);
          } else {
            setEmptyCategoryKind('seen');
            setEmptyCategoryLabel(categoryBrowse.label);
            closeProfileView();
          }
        });
      }
    } else {
      closeProfileView();
    }

    // Puts the person back (as the NEXT card in a deck, or back in their row) after a failed save.
    const rollback = (opts: { keepUsage?: boolean } = {}) => {
      if (wasLike && !opts.keepUsage) setCircleLikesUsed((n) => Math.max(0, n - 1));
      setPool((prev) => (prev.some((p) => p.id === profile.id) ? prev : [profile, ...prev]));
      if (rowKey) {
        const setBatch = rowKey === 'recommended' ? setRecommendedBatch : setSimilarBatch;
        setBatch((prev) => {
          const restored = prevBatchSnapshot ?? [profile, ...(prev ?? [])];
          void saveCircleBatch(userId, rowKey, restored.map((p) => p.id));
          return restored;
        });
      } else if (categoryBrowseRef.current) {
        setCategoryBrowse((prev) => {
          if (!prev || prev.profiles.some((p) => p.id === profile.id)) return prev;
          const profiles = [...prev.profiles];
          profiles.splice(rollbackInsertIndex(categoryBrowseIndexRef.current, profiles.length), 0, profile);
          return { ...prev, profiles };
        });
      }
    };

    // ---------- 2) the actual like/pass, in the background ----------
    const persist = async () => {
      let madeMatch = false;
      try {
        if (wasLike) {
          const result = await recordCircleLike(userId, profile.id, isPremium);
          // never let an older response move the counter backwards while newer likes are in flight
          setCircleLikesUsed((n) => (result.limitReached ? result.currentUsage : Math.max(n, result.currentUsage)));
          if (result.limitReached || !result.success) {
            rollback({ keepUsage: true });
            setShowCircleOutOfLikes(true);
            return;
          }
          madeMatch = result.match;
        } else {
          const { error } = await supabase.rpc('pass_and_usage_batched', {
            passer_id_param: userId,
            passed_id_param: profile.id,
            premium_param: !!isPremium,
          });
          if (error) throw error;
        }
      } catch (error) {
        console.error(`Error ${wasLike ? 'liking' : 'passing'} from Circle:`, error);
        rollback();
        toast({ title: "Couldn't save that", description: `Your ${wasLike ? 'like' : 'pass'} for ${profile.first_name} didn't go through, so they're back in your deck.`, variant: 'destructive' });
        return;
      }

      ownSwipedIdsRef.current.add(profile.id);
      publishSwipeDecision(userId, profile.id, direction);
      if (!wasLike) return;
      // Everything below is best-effort follow-up (a persisted like never fails because a
      // notification did) and it never holds up the next swipe.
      if (madeMatch) {
        toast({ title: "It's a match! 🎉", description: `You and ${profile.first_name} liked each other.` });
        try {
          await sendMatchNotification(`${currentUser?.first_name || ''}`.trim() || 'Someone', profile.id);
        } catch {
          // ignore notification errors
        }
        if (typeof window !== 'undefined') {
          const win = window as Window & { chatMatchesCache?: Map<string, unknown> };
          win.chatMatchesCache?.delete(userId);
          window.dispatchEvent(new CustomEvent('newMatch', { detail: { userId } }));
        }
      } else {
        // A one-way Circle like belongs on Liked Me. Once it is mutual, send only the match
        // notification so the recipient is not shown contradictory like and match alerts.
        try {
          const { count } = await supabase
            .from('likes')
            .select('id', { count: 'exact', head: true })
            .eq('liked_id', profile.id);
          await sendMultipleLikesNotification(profile.id, typeof count === 'number' ? count : 1, userId);
        } catch {
          // Notification failures never block a persisted swipe.
        }
      }
    };
    void persist().finally(() => { swipeInFlightRef.current.delete(profile.id); });
  }, [currentUser?.id, currentUser?.first_name, isPremium, toast, categoryBrowse, categoryBrowseIndex, applyProfileImages, prefetchUpcoming, loadMoreCategory, closeProfileView, activeRowKey, markRowExhausted, circleLikesLoaded, circleLikesUsed, circleDailyLimit, sendMatchNotification, sendMultipleLikesNotification]);

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
    const openToken = ++openTokenRef.current;
    setLoadingCategoryKey(tile.key);
    setOpeningCategory(tile.label);
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
        setEmptyCategoryKind('none');
        setEmptyCategoryLabel(tile.label);
        return;
      }
      const homeSet = new Set(homeCountryCodes);

      // Same exclusion set Discover and the main Circle pool use - your own
      // like/pass/match/block/cooldown, never someone else's incoming like on
      // you (see circlePoolFetch.ts's comment - Discover shows those too;
      // Liked Me is what surfaces the other side of it).
      // The shared exclusion set (the exact five queries this block used to repeat inline) plus the
      // PERSISTED Recommended/Similar reservations, all in ONE round trip.
      const [excluded, storedRecommended, storedSimilar] = await Promise.all([
        fetchCircleExclusionIds(userId),
        fetchStoredCircleBatch(userId, 'recommended'),
        fetchStoredCircleBatch(userId, 'similar'),
      ]);
      // Anyone held by the Recommended/Similar rows belongs only to those
      // rows - never also in a category deck, where swiping them would
      // silently gut the row the user is still looking at.
      (recommendedBatch || []).forEach((p) => excluded.add(p.id));
      (similarBatch || []).forEach((p) => excluded.add(p.id));
      // Also honour the PERSISTED reservation, not just what's in memory -
      // a row that hasn't finished loading (or is on cooldown with a stored
      // batch) must still keep its people out of every category deck.
      (storedRecommended || []).forEach((id) => excluded.add(id));
      (storedSimilar || []).forEach((id) => excluded.add(id));

      // Same distance rule Discover and Circle's own Recommended/Similar rows enforce. Archived
      // members (inactive 30+ days) ARE included, but only as a top-up after the active ones
      // (see loadPage), exactly how Discover mixes them in.
      const { userLat, userLon, hasCoords, maxDistanceKm, radiusDegrees } = getCircleDistanceParams(currentUser, isPremium);

      type ProfileRow = Omit<CircleProfile, 'firstImage'>;
      const fetchCategoryRows = async (
        codes: string[], applyRadius: boolean, limit: number, skip: Set<string>, archived = false
      ): Promise<ProfileRow[]> => {
        if (codes.length === 0 || limit <= 0) return [];
        const useBox = applyRadius && hasCoords;
        const { data, error } = await supabase.rpc('get_circle_category_profiles', {
          p_country_codes: codes,
          p_allowed_genders: allowedGenders,
          p_viewer_gender: currentUser.gender || '',
          p_excluded_ids: Array.from(skip),
          p_limit: limit,
          p_relationship_intent: tile.filter?.relationshipIntent ?? null,
          p_family_plans: tile.filter?.familyPlans ?? null,
          p_is_verified: typeof tile.filter?.isVerified === 'boolean' ? tile.filter.isVerified : null,
          p_interest: tile.filter?.interest ?? null,
          p_has_music: typeof tile.filter?.hasMusic === 'boolean' ? tile.filter.hasMusic : null,
          p_has_social_media: typeof tile.filter?.hasSocialMedia === 'boolean' ? tile.filter.hasSocialMedia : null,
          p_has_pets: typeof tile.filter?.hasPets === 'boolean' ? tile.filter.hasPets : null,
          p_archived: archived,
          p_lat: useBox ? userLat : null,
          p_lon: useBox ? userLon : null,
          p_radius_degrees: applyRadius ? radiusDegrees : null,
        });
        if (error) throw error;
        return Array.isArray(data) ? (data as unknown as ProfileRow[]) : [];
      };

      // One page of this category - everyone in it except the exclusions
      // above and `skipIds` (people already loaded into the deck). Used for
      // the first page here and, through categoryMoreRef, to keep the deck
      // loading while it's swiped.
      // People a page returned but who can't be shown (age range, distance, no approved photo): remembered
      // so the next page moves past them instead of returning the same rows and ending the deck early.
      const rejectedIds = new Set<string>();
      const loadPage = async (skipIds: string[], attempt = 0): Promise<CircleProfile[]> => {
      const skip = new Set(excluded);
      skipIds.forEach((id) => skip.add(id));
      rejectedIds.forEach((id) => skip.add(id));
      // Two phases, like Discover: ACTIVE members first; ARCHIVED members (inactive 30+ days) only
      // top the page up when the active supply for this circle is short. Later pages repeat the
      // same order, so the deck flows active -> archived with no visible seam (the prefetch window
      // is just "the next cards in the list").
      const fetchPhase = async (archived: boolean, want: number): Promise<ProfileRow[]> => {
        const homeLimit = unlockedCountryCodes.length > 0 ? Math.ceil(want / 2) : want;
        const [homeRows, unlockedRows] = await Promise.all([
          fetchCategoryRows(homeCountryCodes, true, homeLimit, skip, archived),
          fetchCategoryRows(unlockedCountryCodes, false, unlockedCountryCodes.length > 0 ? want - homeLimit : 0, skip, archived),
        ]);
        return [...homeRows, ...unlockedRows];
      };
      const activeRows = await fetchPhase(false, CIRCLE_PAGE_SIZE);
      const archivedRows = activeRows.length < CIRCLE_PAGE_SIZE
        ? (await fetchPhase(true, CIRCLE_PAGE_SIZE - activeRows.length)).map((r) => ({ ...r, __isArchivedMixin: true }))
        : [];
      const seenIds = new Set<string>();
      const rows = [...activeRows, ...archivedRows].filter((r) => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true)));
      if (rows.length === 0) return [];

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
      const allImagesByUser: Record<string, string[]> = {};
      (imageRows || []).forEach((row) => {
        if (!firstImageByUser[row.user_id]) firstImageByUser[row.user_id] = row.image_url;
        (allImagesByUser[row.user_id] ||= []).push(row.image_url);
      });
      // Every person's FULL photo list came back in this one query, so seed the per-session
      // cache with it: swiping no longer fires a user_images request per upcoming card (the
      // prefetch window used to cost ~3 extra round trips on every single swipe).
      Object.entries(allImagesByUser).forEach(([uid, urls]) => { imageUrlCacheRef.current.set(uid, urls); });

      const shown = eligible
        .filter((p) => firstImageByUser[p.id])
        .map((p) => ({ ...p, favorites: parseFavorites(p.favorites), firstImage: firstImageByUser[p.id] }));
      const shownIds = new Set(shown.map((p) => p.id));
      rows.forEach((r) => { if (!shownIds.has(r.id)) rejectedIds.add(r.id); });
      // A full page of people who can't be shown is NOT the end of the circle - look at the next page.
      if (shown.length === 0 && attempt < 4) return loadPage(skipIds, attempt + 1);
      return shown;
      };

      const withPhotos = await loadPage([]);
      if (openToken !== openTokenRef.current) return; // Back was pressed while loading
      if (withPhotos.length === 0) {
        setEmptyCategoryKind('none');
        setEmptyCategoryLabel(tile.label);
        return;
      }

      categoryMoreRef.current = { loadPage, exhausted: false, inFlight: null };
      setCategoryBrowse({ label: tile.label, profiles: withPhotos });
      setCategoryBrowseIndex(0);
      void applyProfileImages(withPhotos[0]);
      prefetchUpcoming(withPhotos, 0);
    } catch (err) {
      console.error('Error loading category browse:', err);
      if (openToken === openTokenRef.current) toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      if (openToken === openTokenRef.current) {
        setLoadingCategoryKey(null);
        setOpeningCategory(null);
      }
    }
  }, [currentUser, isPremium, toast, loadingCategoryKey, navigate, applyProfileImages, prefetchUpcoming, recommendedBatch, similarBatch]);

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

    // The row's people are still being worked out (the pool arrived but this row's saved snapshot / ranking hasn't
    // resolved yet): show the row's shape instead of a false "Nobody new to show right now" that then flips to cards.
    if ((loading || batch === null) && !inCooldown && items.length === 0) {
      return (
        <div className="mb-7" aria-busy="true">
          <h2 className="text-white font-semibold text-base px-6 mb-3">{title}</h2>
          <div className="flex gap-3 overflow-hidden px-6">
            {[0, 1].map((i) => (
              <div key={i} className="dl-skeleton h-[248px] w-[164px] shrink-0 rounded-3xl" />
            ))}
          </div>
        </div>
      );
    }

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
  // Stable props for the deck card: building these inline handed the preview a brand-new profile
  // object (and a new images array) on every CirclePage render, i.e. on every state tick of the
  // like counter, row batches, cooldown clock, etc.
  const activeMatch = useMemo(() => (activeProfile ? toPotentialMatch(activeProfile) : null), [activeProfile]);
  const activeImages = useMemo(
    () => (selectedImages.length ? selectedImages : (activeProfile?.firstImage ? [activeProfile.firstImage] : [])),
    [selectedImages, activeProfile?.firstImage]
  );
  const cancelOpening = useCallback(() => {
    openTokenRef.current += 1;
    setOpeningCategory(null);
    setLoadingCategoryKey(null);
    setDeckLoadingMore(false);
    closeProfileView();
  }, [closeProfileView]);
  useBackClose(!!openingCategory && !activeProfile, cancelOpening, { escape: false });

  // Users who've used today's tier allowance. Same shape as
  // Discover's own out-of-swipes card, with the CTA wording following
  // whether this viewer currently qualifies for a free trial.
  if (showCircleOutOfLikes) {
    return (
      <div className="h-full w-full flex items-center justify-center overflow-y-auto p-4">
        <Card variant="surface" className="max-w-md w-full">
          <CardContent className="p-6 text-center flex flex-col items-center">
            <Heart className="w-12 h-12 mb-3 text-pink-500/80" />
            <h2 className="text-lg font-semibold mb-1.5 text-white">Out of swipes for today</h2>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">
              You&apos;ve used all {circleDailyLimit} of your Circle likes for today. They refill tomorrow
              {!isPremium ? ' — or upgrade for 100 Circle likes each day.' : '.'}
            </p>
            <div className="w-full flex flex-col items-center gap-3">
              <Button variant="premium" size="sm"
                onClick={() => { setShowCircleOutOfLikes(false); openPremiumUpgrade(); }}
              >
                <Crown className="w-3.5 h-3.5 mr-1.5" />
                {eligibleForTrial ? 'Try now for free' : 'Upgrade to Premium'}
              </Button>
              <Button variant="line" size="sm" className="text-white"
                onClick={() => setShowCircleOutOfLikes(false)}
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
        <Card variant="surface" className="max-w-md w-full">
          <CardContent className="p-6 text-center flex flex-col items-center">
            <Heart className="w-12 h-12 mb-3 text-pink-500/80" />
            <h2 className="text-lg font-semibold mb-1.5 text-white">
              {emptyCategoryKind === 'seen' ? t('circle.endTitle', "You've seen everyone here") : emptyCategoryKind === 'error' ? "Couldn't load more people" : 'No one matches yet'}
            </h2>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">
              {emptyCategoryKind === 'error'
                ? 'Check your connection, then open this circle again.'
                : emptyCategoryKind === 'seen'
                ? t('circle.endBody', { circle: emptyCategoryLabel, defaultValue: 'You\'ve seen everyone in "{{circle}}". Check back soon.' })
                : <>No one new matches &quot;{emptyCategoryLabel}&quot; right now. Check back soon, or adjust your preferences in Profile.</>}
            </p>
            {!isPremium && emptyCategoryKind !== 'error' && (
              <div className="mb-3">
                <p className="text-yellow-400 text-sm mb-3 max-w-xs mx-auto">
                  Upgrade to Premium to unlock more countries and see more people.
                </p>
                <Button variant="premium" size="sm"
                  onClick={() => { setEmptyCategoryLabel(null); openPremiumUpgrade(); }}
                >
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  {eligibleForTrial ? 'Try now for free' : 'Unlock More Countries'}
                </Button>
              </div>
            )}
            <Button variant="line" size="sm" className="text-white"
              onClick={() => setEmptyCategoryLabel(null)}
            >
              {emptyCategoryKind === 'seen' ? t('circle.endCta', 'Explore other circles') : 'Back to Circle'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Landing-page derived values (plain reads of state, no hooks, so they are safe below the
  // hooks block and above the early returns).
  const verifiedNearYou = categories.find((c) => c.key === 'verified')?.count ?? 0;
  const lockedTile = lockedTileLabel ? categories.find((c) => c.label === lockedTileLabel) ?? null : null;
  const lockedTeaser = lockedTile ? teaserDisplay(appTotals[lockedTile.key] ?? null) : null;

  if (deckLoadingMore || (openingCategory && !activeProfile)) {
    return <CircleDeckSkeleton label={categoryBrowse?.label ?? openingCategory} onBack={cancelOpening} />;
  }

  if (activeProfile && activeMatch) {
    return (
      // Opacity-only fade (a transform here would trap the preview's fixed children). Keyed to
      // the opened deck, NOT the person, so it plays once on open and never between swipes.
      <div
        key={categoryBrowse ? `browse:${categoryBrowse.label}` : 'single'}
        className="h-full w-full"
        style={{ animation: 'dl-fade var(--dl-dur) var(--dl-ease-out) backwards' }}
      >
      <ProfilePreviewModal
        // Remount per person: the preview keeps its own slide index, expanded
        // state and swipe-exit transform, so reusing the instance left the
        // next card stuck mid-swipe with stale info until a full refresh.
        key={activeProfile.id}
        profile={activeMatch}
        images={activeImages}
        onClose={closeProfileView}
        onBack={closeProfileView}
        simpleBackButton
        onLike={() => handleCircleLike(activeProfile)}
        onPass={() => handleCirclePass(activeProfile)}
        topLabel={categoryBrowse
          ? `${categoryBrowse.label} · ${categoryBrowseIndex + 1}/${categoryBrowse.profiles.length}${categoryMoreRef.current && !categoryMoreRef.current.exhausted ? '+' : ''}`
          : undefined}
        nextPreviewImageUrl={nextBrowseProfile?.firstImage || undefined}
        dailyLikeCounter={circleLikesLoaded ? { remaining: circleLikesLeft, limit: circleDailyLimit } : undefined}
        readOnly
      />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black overflow-y-auto scrollbar-hide">
      <div className="sticky top-0 z-10 bg-black pt-1.5 pb-1.5">
        <div className="flex items-center justify-between px-6 gap-3 pt-1 mb-3">
          <div className="min-w-0">
            <h2 className="ci-title">
              <span className="ci-title-accent">{t('circle.title', 'Circle Up')}</span>
            </h2>
          </div>
          {circleLikesLoaded && (
            <span
              className={`flex items-center gap-1 flex-shrink-0 text-[11px] font-medium rounded-full px-2.5 py-1 ${
                circleLikesLeft === 0 ? 'bg-white/[0.06] text-white/50' : 'bg-pink-400/10 text-pink-100 shadow-[inset_0_0_0_1px_rgba(244,114,182,0.3)]'
              }`}
              aria-label={`${circleLikesLeft} of ${circleDailyLimit} Circle likes left today`}
            >
              <Heart className="w-3 h-3" />
              {circleLikesLeft}/{circleDailyLimit}
            </span>
          )}
        </div>
        {/* Hidden for now - flip SHOW_CIRCLE_UP_LIVE to bring the entry back. */}
        {SHOW_CIRCLE_UP_LIVE && (
          <button
            type="button"
            onClick={() => navigate('/circle-up')}
            className="mx-6 mt-3 w-[calc(100%-3rem)] flex items-center gap-3 rounded-2xl border border-pink-500/30 bg-gradient-to-r from-pink-500/15 via-purple-500/10 to-transparent px-4 py-3 text-left transition-colors hover:border-pink-500/50"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600">
              <Video className="h-5 w-5 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">Circle Up Live</span>
              <span className="block truncate text-xs text-white/50">Go live and meet someone new, right now</span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/40" />
          </button>
        )}
      </div>
      <div>
        {isPremium === true && countScope.showCountryHint && (
          <div className="px-6 pt-1 pb-2">
            <button
              type="button"
              className="ci-hint"
              onClick={() => onNavigateToProfileSection?.('location')}
            >
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('circle.worldwideHint', 'Showing app-wide totals')}</span>
              <span className="ci-hint-cta">{t('circle.pickCountries', 'Choose your countries')}</span>
            </button>
          </div>
        )}
        {verifiedNearYou > 0 && (
          <div className="px-6 pt-1 pb-2">
            <span className="ci-live" style={{ marginTop: 0 }}>
              <span className="ci-live-dot" aria-hidden="true" />
              {t('circle.verifiedNearYou', { count: formatCountCompact(verifiedNearYou), defaultValue: '{{count}} verified members near you' })}
            </span>
          </div>
        )}
        {loading ? (
          <div className="space-y-6 px-6 py-4" role="status" aria-busy="true">
            {[0, 1].map((row) => (
              <div key={row}>
                <div className="dl-skeleton mb-3 h-5 w-40" />
                <div className="flex gap-3 overflow-hidden">
                  {[0, 1, 2].map((card) => (
                    <div key={card} className="dl-skeleton h-[250px] w-40 shrink-0 rounded-2xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : pool.length === 0 ? (
          <div className="px-6 pb-2">
            <p className="text-white/40 text-sm">No new people to show right now. Check back soon.</p>
          </div>
        ) : (
          <>
            <div className="dl-stagger">
              <div style={{ '--i': 0 } as React.CSSProperties}>
                {renderCircleRow('recommended', 'Recommended for you', recommendedItems, recommendedBatch, false)}
              </div>
              <div style={{ '--i': 1 } as React.CSSProperties}>
                {renderCircleRow('similar', 'Similar interests', similarItems, similarBatch, true)}
              </div>
            </div>
          </>
        )}

        <div className="ci-grid dl-stagger pb-4" style={{ paddingLeft: 24, paddingRight: 24 }}>
          {categories.map((tile, tileIndex) => {
            const { key, label, icon: Icon, count, isGameLink } = tile;
            const isLoadingThis = loadingCategoryKey === key;
            const isLockedForFree = !isPremium && PREMIUM_ONLY_CATEGORY_KEYS.has(key);
            const [h1, h2] = CATEGORY_THEME[key] ?? [330, 280];
            // Locked tiles advertise the circle instead of showing a bare number: blurred round
            // avatars + an honest bucket of the REAL count rounded DOWN ("1k+"). When the count is
            // not known we say "Many" rather than invent a figure.
            const teaser = isLockedForFree ? teaserDisplay(appTotals[key] ?? null) : null;
            // a premium viewer who has not picked countries yet sees the entire-app total on every
            // tile (falling back to their local count if that total could not be fetched)
            const appWide = !isLockedForFree && !isGameLink && isPremium === true && countScope.mode === 'worldwide'
              ? teaserDisplay(appTotals[key] ?? null)
              : null;
            const unlockedPill = appWide?.label ?? (count !== null ? formatCountCompact(count) : null);
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCategoryClick(tile)}
                disabled={!isGameLink && !isLockedForFree && loadingCategoryKey !== null}
                className="ci-tile"
                data-locked={isLockedForFree ? 'true' : undefined}
                data-games={isGameLink ? 'true' : undefined}
                style={{ ['--h1' as string]: h1, ['--h2' as string]: h2, ['--i' as string]: tileIndex }}
              >
                <div className="ci-tile-top">
                  {isLockedForFree ? (
                    <>
                      <span className="ci-tile-icon">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="ci-lock" aria-label={t('circle.premiumTag', 'Premium')}>
                        <Lock className="w-3 h-3" />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="ci-tile-icon">
                        {isLoadingThis ? (
                          <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </span>
                      {!isGameLink && unlockedPill !== null && (
                        <span className="ci-pill" aria-label={`${unlockedPill} ${t('circle.members', 'members')}`}>
                          <Users className="w-3 h-3" aria-hidden="true" />
                          {unlockedPill}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="ci-tile-foot">
                  <span className="ci-tile-label">{label}</span>
                  {isLockedForFree && (
                    <div className="ci-tile-meta">
                      {(teaser?.label || teaser?.vague) && (
                        <span
                          className="ci-pill ci-pill-hot ci-pill-sm"
                          aria-label={teaser?.label ? `${teaser.label} ${t('circle.members', 'members')}` : t('circle.many', 'Many')}
                        >
                          <Users className="w-3 h-3" aria-hidden="true" />
                          {teaser?.label ?? t('circle.many', 'Many')}
                        </span>
                      )}
                      <TeaserAvatars hues={teaserHues(key, 4)} size={14} photos={teaserPhotos[key]} more={(appTotals[key] ?? 0) > 4} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {lockedTile && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-6"
          style={{ WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)' }}
          onClick={() => setLockedTileLabel(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="ci-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center">
              <TeaserAvatars hues={teaserHues(lockedTile.key, 4)} size={22} photos={teaserPhotos[lockedTile.key]} more={(appTotals[lockedTile.key] ?? 0) > 4} />
            </div>
            {lockedTeaser?.label && <div className="ci-sheet-count">{lockedTeaser.label}</div>}
            <h3 className="ci-sheet-title">
              {lockedTeaser?.label
                ? t('circle.unlockTitle', { circle: lockedTile.label, defaultValue: 'members in {{circle}}' })
                : lockedTeaser?.vague
                  ? t('circle.unlockTitleMany', { circle: lockedTile.label, defaultValue: 'Join lots of members in {{circle}}' })
                  : lockedTile.label}
            </h3>
            <p className="ci-sheet-body">
              {t('circle.unlockBody', "Unlock this circle to meet its members.")}
            </p>
            <Button variant="premium" size="lg" className="w-full"
              type="button"
              onClick={() => {
                setLockedTileLabel(null);
                openPremiumUpgrade();
              }}
            >
              <Crown className="w-4 h-4" />
              {eligibleForTrial ? t('circle.unlockCtaTrial', 'Start free trial') : t('circle.unlockCta', 'Unlock with Premium')}
            </Button>
            <button
              type="button"
              onClick={() => setLockedTileLabel(null)}
              className="dl-hit mt-3 text-white/45 text-xs"
            >
              {t('circle.maybeLater', 'Maybe later')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CirclePage;

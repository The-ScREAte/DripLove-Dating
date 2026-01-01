/**
 * DiscoverPage - Main profile discovery and swiping interface
 * 
 * PERFORMANCE OPTIMIZATIONS (Dec 2025):
 * - Fast Android loading: Deferred heavy operations, instant cache display
 * - Swipe persistence: localStorage-based tracking survives app restarts
 * - Profile position persistence: Resumes from exact profile after refresh
 * - Session hardening: Only SIGNED_OUT events log out (see main.tsx)
 * 
 * KEY FEATURES:
 * - Persistent swipe tracking: Liked/passed profiles stored in localStorage
 * - Smart position resume: Returns to next profile in queue after refresh
 * - Background refills: Profiles load silently without blocking UI
 * - Cache-first strategy: Instant display from cache, then background refresh
 */

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import { isAndroidPlatform, isIOSPlatform } from '@/utils/platformUtils';
import { preloadImageToBlob } from '@/utils/imageCache';
import { calculateAge, createDeterministicShuffle } from '@/utils/discoverCache';
import { getStratifiedBatches } from '@/utils/stratifiedSampling';
import { applyActivityWeighting, getSwipeFatigueRescueCandidates, injectRescueProfiles } from '@/utils/activityWeighting';
import { useLikeBackInjection } from '@/hooks/useLikeBackInjection';
import DominantColorImageBg from './discover/DominantColorImageBg';

const AdinkraBar = lazy(() => import('./discover/AdinkraBar'));

// Loading fallback
const AdinkraBarFallback = () => (
  <div className="w-full h-9 bg-gradient-to-r from-blue-500 via-yellow-400 to-blue-500" />
);

const LazyAdinkraBar = memo(({ userCountry }: { userCountry?: string }) => (
  <Suspense fallback={<AdinkraBarFallback />}>
    <AdinkraBar userCountry={userCountry} />
  </Suspense>
));
LazyAdinkraBar.displayName = 'LazyAdinkraBar';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSubscription } from '@/hooks/useSubscription';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { calculateDistance } from '@/constants/locationData';
import { locationService } from '@/services/locationService';
import { calculateProfileCompletion, getTodaySwipeCount } from '@/utils/profileCompletion';
import { enqueue } from '@/lib/queue';
import { getLanguageName } from '@/utils/languageNames';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import MatchCard from './discover/MatchCard';
import SwipeButtons from './discover/SwipeButtons';
import AdCard from './discover/AdCard';
import RatingDialog from './RatingDialog';
import { incrementMatchCount } from '@/utils/ratingStorage';
import { CurrentUser, PotentialMatch } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
const uniqUuids = (values: unknown[]): string[] => Array.from(new Set(values.filter(isUuid)));

const todayStr = () => new Date().toISOString().split('T')[0];

const hashStringToInt = (str: string): number => {
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

const shuffleDeterministic = <T,>(arr: T[], seed: string): T[] => {
  const rand = seededRandomFromString(seed);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const normalizeCountryCode = (c: string) => {
  const cleaned = (c || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return '';

  // Keep ISO2 codes; map ISO3/names to ISO2 when possible.
  if (cleaned.length === 2) return cleaned;

  const iso3Map: Record<string, string> = {
    USA: 'US',
    CAN: 'CA',
    GBR: 'GB',
    IRL: 'IE',
    AUS: 'AU',
    NZL: 'NZ',
    IND: 'IN',
    PAK: 'PK',
    KEN: 'KE',
    NGA: 'NG',
    GHA: 'GH',
    ZAF: 'ZA',
  };

  const nameMap: Record<string, string> = {
    UNITEDSTATES: 'US',
    UNITEDSTATESOFAMERICA: 'US',
    AMERICA: 'US',
    CANADA: 'CA',
    UNITEDKINGDOM: 'GB',
    GREATBRITAIN: 'GB',
    ENGLAND: 'GB',
    IRELAND: 'IE',
    AUSTRALIA: 'AU',
    NEWZEALAND: 'NZ',
    INDIA: 'IN',
    PAKISTAN: 'PK',
    KENYA: 'KE',
    NIGERIA: 'NG',
    GHANA: 'GH',
    SOUTHAFRICA: 'ZA',
  };

  return iso3Map[cleaned] || nameMap[cleaned] || cleaned;
};

// Round-robin across selected countries, skipping empty buckets.
const mixByCountryRoundRobin = <T extends { country_code?: string | null; id: string }>(
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

  // Deterministically shuffle within each country for variety.
  for (const c of orderedCountries) {
    const list = buckets.get(c)!;
    buckets.set(c, shuffleDeterministic(list, `${seed}_${c}`));
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

const buildFeedSignature = (baseCountryCode: string, unlockedCountries: string[], isPremium: boolean, maxDistance: number) => {
  const base = normalizeCountryCode(baseCountryCode);
  const unlockedSignature = isPremium
    ? unlockedCountries.map(normalizeCountryCode).filter(Boolean).sort().join(',')
    : '';
  // v8 feed signature
  return `v8_${hashStringToInt(`${base}|${unlockedSignature}|${maxDistance}|${isPremium ? 'premium' : 'free'}`).toString(36)}`;
};

const buildSavedOrderKey = (userId: string, feedSignature: string) =>
  `driplove_profile_order_${userId}_${todayStr()}_${feedSignature}`;

const normalizeCountryCodeList = (value: unknown, baseCountryCode?: string): string[] => {
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

    // Note: `[` does not need escaping inside a character class; `]` does.
    const cleaned = trimmed.replace(/[{}[\]"]+/g, '');
    const parts = cleaned.split(',').map((s) => normalizeCountryCode(s)).filter(Boolean);
    return normalize(parts);
  }

  return [];
};

// ⭐ ANDROID OPTIMIZATION: Global abort controller for canceling image loads on swipe
let currentImageAbortController: AbortController | null = null;

interface AdData {
  id: string;
  image_url: string;
  video_url?: string | null;
  media_type?: string | null;
  name: string;
  about: string;
  link: string | null;
  link_as: string | null;
  target_countries?: string[];
  isAd: true; // Mark this as an ad
}

// Union type for matches and ads
type MatchOrAd = PotentialMatch | AdData;

interface DiscoverPageProps {
  currentUser: CurrentUser;
  onNavigateToChat?: (userId: string) => void;
  isPremium?: boolean;
  profileCompletion?: number; // Pass from parent (Profile page calculates it)
}

interface PassedUser {
  user_id: string;
  passed_at: Date;
}

type WindowWithCdvPurchase = Window & {
  CdvPurchase?: {
    store?: {
      get?: (id: string) => unknown;
      when?: () => {
        productUpdated: (cb: () => void) => void;
      };
    };
  };
};

type CdvPurchaseProduct = {
  getOffer?: () => unknown;
  offers?: unknown[];
};

interface UserImageRow {
  image_url: string;
  is_approved: boolean | null;
  moderation_status: string | null;
}

interface AdsRow {
  id: string;
  name: string;
  about: string;
  image_url: string;
  video_url: string | null;
  link: string | null;
  link_as: string | null;
  media_type: string | null;
  target_countries: unknown;
}

type ProfileRow = Pick<
  CurrentUser,
  | 'id'
  | 'first_name'
  | 'last_name'
  | 'bio'
  | 'city'
  | 'country'
  | 'country_code'
  | 'occupation'
  | 'education_level'
  | 'date_of_birth'
  | 'interests'
  | 'gender'
  | 'is_verified'
  | 'latitude'
  | 'longitude'
  | 'fun_fact'
  | 'perfect_first_date'
  | 'last_googled'
  | 'relationship_intent'
  | 'smoking'
  | 'drinking'
  | 'exercise_level'
  | 'sleeping_schedule'
  | 'introvert_extrovert'
  | 'spontaneous_planner'
  | 'messy_organized'
  | 'adinkra_symbols'
  | 'created_at'
  | 'last_login_at'
>;

const toPotentialMatch = (
  profile: ProfileRow,
  extras?: { images?: string[]; distance?: number }
): PotentialMatch => {
  const interestsRaw = profile.interests;
  const interests = Array.isArray(interestsRaw)
    ? interestsRaw.filter((i): i is string => typeof i === 'string')
    : [];

  const adinkraRaw = profile.adinkra_symbols;
  const adinkra_symbols = Array.isArray(adinkraRaw)
    ? adinkraRaw.filter((i): i is string => typeof i === 'string')
    : undefined;

  return {
    id: profile.id,
    first_name: profile.first_name ?? '',
    last_name: profile.last_name ?? '',
    bio: profile.bio ?? '',
    city: profile.city ?? '',
    country: profile.country ?? '',
    country_code: profile.country_code ?? '',
    occupation: profile.occupation ?? '',
    education_level: profile.education_level ?? '',
    date_of_birth: profile.date_of_birth ?? '',
    interests,
    images: extras?.images ?? [],
    is_verified: profile.is_verified ?? undefined,
    gender: profile.gender ?? '',
    latitude: profile.latitude ?? undefined,
    longitude: profile.longitude ?? undefined,
    fun_fact: profile.fun_fact ?? undefined,
    perfect_first_date: profile.perfect_first_date ?? undefined,
    last_googled: profile.last_googled ?? undefined,
    relationship_intent: profile.relationship_intent ?? undefined,
    smoking: profile.smoking ?? undefined,
    drinking: profile.drinking ?? undefined,
    exercise_level: profile.exercise_level ?? undefined,
    sleeping_schedule: profile.sleeping_schedule ?? undefined,
    introvert_extrovert: profile.introvert_extrovert ?? undefined,
    spontaneous_planner: profile.spontaneous_planner ?? undefined,
    messy_organized: profile.messy_organized ?? undefined,
    adinkra_symbols,
    distance: extras?.distance,
  };
};

// Helper function to check if a match is an ad (stable module-scope type guard)
const isAd = (match: PotentialMatch | AdData): match is AdData => {
  return (match as AdData).isAd === true;
};

// Dedupe helper (prevent profile duplicates without blocking ad repeats)
// Also filters out locally swiped profiles to prevent them from reappearing
const mergeDecksWithoutProfileDupes = (prev: MatchOrAd[], incoming: MatchOrAd[], localSwipedIds?: Map<string, { action: 'like' | 'pass', timestamp: number }>) => {
  const seenProfileIds = new Set<string>();
  for (const item of prev) {
    if (!isAd(item)) seenProfileIds.add(item.id);
  }

  // Also track locally swiped profiles to exclude them
  const swipedIds = new Set<string>();
  if (localSwipedIds) {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    for (const [id, data] of localSwipedIds.entries()) {
      // Always exclude liked profiles, only exclude passed profiles if less than 30 days old
      if (data.action === 'like' || (now - data.timestamp) < thirtyDaysMs) {
        swipedIds.add(id);
      }
    }
  }

  const result: MatchOrAd[] = [...prev];
  for (const item of incoming) {
    if (isAd(item)) {
      result.push(item);
      continue;
    }
    // Skip if already in deck or if locally swiped
    if (seenProfileIds.has(item.id) || swipedIds.has(item.id)) continue;
    seenProfileIds.add(item.id);
    result.push(item);
  }

  return result;
};

type WindowWithIntervals = Window & {
  continuousLoadingInterval?: number | null;
  chatMatchesCache?: Map<string, unknown>;
};

const DiscoverPage = ({ currentUser, onNavigateToChat, isPremium, profileCompletion: parentProfileCompletion }: DiscoverPageProps) => {
  const { t } = useTranslation();

  
  // Track viewport height safely (no SSR crash)
  const [vh, setVh] = useState<number>(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  
  // IAP: Track if buy is enabled
  const [canBuy, setCanBuy] = useState(false);
  useEffect(() => {
    function onProductUpdated() {
      const win = window as WindowWithCdvPurchase;
      const p = win.CdvPurchase?.store?.get?.('com.driplove.dating.premium.monthlysub1');
      const product = (p as unknown as CdvPurchaseProduct | undefined);

      // More robust offer detection (handles plugin variations)
      const offer = (typeof product?.getOffer === 'function' ? product.getOffer() : undefined)
        ?? (Array.isArray(product?.offers) ? product.offers[0] : undefined);
      setCanBuy(!!offer);
    }
    const win = window as WindowWithCdvPurchase;
    const store = win.CdvPurchase?.store;
    if (store?.when) {
      store.when().productUpdated(onProductUpdated);
    }
    onProductUpdated();
    // No off/unsubscribe in plugin
  }, []);
  // ...existing code...

  // Example: Add Buy/Restore buttons to your UI (place where appropriate)
  const [potentialMatches, setPotentialMatches] = useState<MatchOrAd[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasCompletedInitialFetch, setHasCompletedInitialFetch] = useState(false);
  const [noMoreProfiles, setNoMoreProfiles] = useState(false); // Track when truly no more profiles available

  // Premium-only: avoid showing the empty card when the local pool ends.
  // We auto-retry once; only show the empty card if that retry also yields nothing.
  const premiumEmptyAutoRetryRef = useRef(false);
  const [premiumTrulyEmptyAfterRetry, setPremiumTrulyEmptyAfterRetry] = useState(false);

  const [passedUsers, setPassedUsers] = useState<PassedUser[]>([]);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [isOutOfSwipes, setIsOutOfSwipes] = useState(false);
  const [showMatchAnimation, setShowMatchAnimation] = useState(false);
  const [matchedUser, setMatchedUser] = useState<PotentialMatch | null>(null);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [ads, setAds] = useState<AdData[]>([]);
  const [realSwipeCount, setRealSwipeCount] = useState(0); // Track actual user swipes (excluding ads)
  // Store users who liked the current user (for "they liked you" notification)
  const [usersWhoLikedMeIds, setUsersWhoLikedMeIds] = useState<string[]>([]);
  // New: Store images by userId for instant access
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  // `preloadProfileImages` is memoized and runs off the UI thread; keep a ref so we don't
  // accidentally re-fetch images due to a stale `userImages` closure.
  const userImagesRef = useRef<{ [key: string]: string[] }>({});
  useEffect(() => {
    userImagesRef.current = userImages;
  }, [userImages]);
  // We avoid storing HTMLImageElement objects in state to prevent GC pressure
  // and rely on useImagePreloader for actual image loading status.
  const [preloadedImages, setPreloadedImages] = useState<{ [key: string]: string[] }>({});
  // Store distances from location service
  const [userDistances, setUserDistances] = useState<{ [key: string]: number }>({});
  // Store preloaded blob URLs for instant image rendering
  const [preloadedBlobImages, setPreloadedBlobImages] = useState<{ [key: string]: { [url: string]: string } }>({});
  // Store fetched language names to avoid DB calls in MatchCard
  const [userLanguages, setUserLanguages] = useState<{ [key: string]: string }>({});
  const [reverseUsageToday, setReverseUsageToday] = useState(0);
  // Local computed completion (fallback when parent/DB completion is unavailable)
  const [computedProfileCompletion, setComputedProfileCompletion] = useState(0);
  const [profileMissingFields, setProfileMissingFields] = useState<string[]>([]);
  const [userProfileImages, setUserProfileImages] = useState<UserImageRow[]>([]);
  const [showProfileCompletionModal, setShowProfileCompletionModal] = useState(false);
  const [todaySwipeCount, setTodaySwipeCount] = useState(0);
  const [isArchivedFallback, setIsArchivedFallback] = useState(false); // Two-phase: true when showing archived profiles
  
  // Track consecutive non-match swipes (used for fatigue rescue)
  const [noMatchStreak, setNoMatchStreak] = useState(0);
  const FATIGUE_RESCUE_THRESHOLD = 8; // Trigger rescue after 8 non-match swipes

  // Cooldown to avoid repeated rescues
  const lastRescueRef = useRef<number>(0);
  const RESCUE_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
  
  // Dynamic content height management
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  // PHASE 0: Required refs (must exist before any fetching logic)
  const initializedUserRef = useRef<string | null>(null);
  const lastPremiumActiveRef = useRef<boolean | null>(null);
  const fetchSequenceRef = useRef(0);
  // Suppress immediate full fetch when we have fresh cached data and the component remounts
  const suppressFetchRef = useRef(false);
  // Track optimistic/pending swipes to avoid local overshoot while background RPCs complete
  const pendingSwipesRef = useRef(0);
  // Track locally swiped profile IDs with action type and timestamp
  // Stored as: { [userId]: { action: 'like' | 'pass', timestamp } }
  // CRITICAL: Use a stable ref that gets initialized from storage on mount
  const getStoredSwipedIds = useCallback((): Map<string, { action: 'like' | 'pass', timestamp: number }> => {
    if (!currentUser?.id) return new Map();
    try {
      // Prefer durable storage so refresh/app restart doesn't resurrect swiped profiles.
      const key = `swiped_profiles_${currentUser.id}`;
      // Try localStorage first (more durable), then sessionStorage as fallback
      const stored = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!stored) return new Map();
      
      const data = JSON.parse(stored);
      // Validate and reconstruct the Map with proper types
      const map = new Map<string, { action: 'like' | 'pass', timestamp: number }>();
      for (const [id, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'action' in value && 'timestamp' in value) {
          const v = value as { action: string; timestamp: number };
          if ((v.action === 'like' || v.action === 'pass') && typeof v.timestamp === 'number') {
            map.set(id, { action: v.action, timestamp: v.timestamp });
          }
        }
      }
      return map;
    } catch {
      return new Map();
    }
  }, [currentUser?.id]);
  
  const locallySwipedProfileIds = useRef<Map<string, { action: 'like' | 'pass', timestamp: number }>>(new Map());
  
  // Initialize swiped IDs from storage on mount or when user changes
  useEffect(() => {
    if (!currentUser?.id) return;
    const stored = getStoredSwipedIds();
    locallySwipedProfileIds.current = stored;
  }, [currentUser?.id, getStoredSwipedIds]);
  
  // Persist swiped IDs to BOTH localStorage and sessionStorage whenever they change
  // This ensures swipes survive page refresh, app restart, and navigation
  const persistSwipedIds = useCallback(() => {
    if (!currentUser?.id) return;
    try {
      const obj = Object.fromEntries(locallySwipedProfileIds.current);
      const key = `swiped_profiles_${currentUser.id}`;
      // Write to both storages for redundancy
      localStorage.setItem(key, JSON.stringify(obj));
      sessionStorage.setItem(key, JSON.stringify(obj));
    } catch {
      // ignore persistence errors
    }
  }, [currentUser?.id]);

  // Debug logging (enable with: localStorage.setItem('driplove_debug_swipe','1'))
  const isSwipeDebugEnabled = () => {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem('driplove_debug_swipe') === '1';
    } catch {
      return false;
    }
  };

  const swipeDebug = (...args: unknown[]) => {
    if (!isSwipeDebugEnabled()) return;
    try {
      if (typeof window !== 'undefined') {
        const w = window as unknown as { __driplove_swipe_debug?: unknown[] };
        if (!Array.isArray(w.__driplove_swipe_debug)) w.__driplove_swipe_debug = [];
        w.__driplove_swipe_debug.push({ ts: Date.now(), args });
        if (w.__driplove_swipe_debug.length > 500) {
          w.__driplove_swipe_debug = w.__driplove_swipe_debug.slice(-500);
        }
      }
    } catch {
      // ignore
    }

    // Use warn level so it shows up even when console hides logs.
    console.warn('[DiscoverSwipe]', ...args);
  };

  useEffect(() => {
    if (!isSwipeDebugEnabled()) return;
    swipeDebug('DiscoverPage: mounted', {
      userId: currentUser?.id,
      premiumActive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summarizeDeck = (deck: MatchOrAd[], take: number = 10) => {
    const head = deck.slice(0, take).map((item) => (isAd(item) ? `ad:${item.id}` : item.id));
    return { len: deck.length, head };
  };

  const countProfileIdInDeck = (deck: MatchOrAd[], profileId: string) => {
    let count = 0;
    for (const item of deck) {
      if (!isAd(item) && item.id === profileId) count++;
    }
    return count;
  };
  
  // Centralized preload abort controller
  const preloadAbortControllerRef = useRef<AbortController | null>(null);
  
  // Store last passed profile for safe reverse-dislike reinsertion
  const lastPassedProfileRef = useRef<PotentialMatch | null>(null);
  
  // ⭐ P2: Global eligibility gate - single source of truth for profile eligibility
  const isEligibleProfile = useCallback((profile: unknown): profile is PotentialMatch => {
    if (!profile || typeof profile !== 'object') return false;
    const p = profile as Partial<PotentialMatch>;
    if (!p.id) return false;
    
    // Exclude admin profiles
    if ('is_admin' in p && p.is_admin) return false;
    
    // Exclude inactive accounts
    if ('account_status' in p && p.account_status !== 'active') return false;
    
    // Exclude archived profiles (unless in archived fallback mode)
    if ('is_archived' in p && p.is_archived && !isArchivedFallback) return false;
    
    // Exclude locally swiped profiles
    if (locallySwipedProfileIds.current.has(p.id)) {
      const swipeData = locallySwipedProfileIds.current.get(p.id);
      if (swipeData) {
        // Always exclude liked profiles
        if (swipeData.action === 'like') return false;
        // Only exclude passed profiles if less than 30 days old
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - swipeData.timestamp < thirtyDaysMs) return false;
      }
    }
    
    return true;
  }, [isArchivedFallback]);
  
  const { toast } = useToast();
  const { sendMatchNotification, sendMultipleLikesNotification, recordUserActivity } = usePushNotifications(currentUser?.id);
  const {
    subscription,
    loading: subscriptionLoading,
    isPremium: isPremiumFromSubscription,
    checkUsageLimit,
    refetchSubscription
  } = useSubscription(currentUser?.id);

  // Treat the user as premium if either:
  // - Parent explicitly says they are premium, OR
  // - Subscription hook reports an active premium plan.
  const premiumActive = Boolean(isPremium) || isPremiumFromSubscription();
  const premiumResolved = isPremium !== undefined || !subscriptionLoading;
  
  const { preloadImages, getOptimizedUrl, isImageLoaded, isImageLoading, clearCache } = useImagePreloader({
    maxConcurrent: 4, // Cap concurrency to 4
    quality: 50,
    width: 280
  });

  // Track in-flight image load requests to avoid duplicate DB calls
  const requestedImageProfileIds = useRef<Set<string>>(new Set());

  // ⭐ LIKE-BACK INJECTION: 25% injection of users who liked the current user
  // Build filter sets for the injection hook
  const blockedIdsSet = useMemo(() => new Set<string>(), []); // Will be populated from fetch
  const passedTodayIdsSet = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const passedToday = new Set<string>();
    for (const [id, data] of locallySwipedProfileIds.current.entries()) {
      if (data.action === 'pass' && (now - data.timestamp) < oneDayMs) {
        passedToday.add(id);
      }
    }
    return passedToday;
  }, []);
  
  const inQueueIdsSet = useMemo(() => {
    const inQueue = new Set<string>();
    potentialMatches.forEach(m => {
      if (!isAd(m)) inQueue.add(m.id);
    });
    return inQueue;
  }, [potentialMatches]);

  const {
    onSwipe: onLikeBackSwipe,
    isLikedMeProfile,
    candidateCount: likeBackCandidateCount,
    refreshCandidates: refreshLikeBackCandidates,
  } = useLikeBackInjection({
    userId: currentUser?.id,
    blockedIds: blockedIdsSet,
    passedTodayIds: passedTodayIdsSet,
    inQueueIds: inQueueIdsSet,
    locallySwipedIds: locallySwipedProfileIds.current,
  });

  // Fetch ads from database - load them BEFORE fetching profiles
  const [adsLoaded, setAdsLoaded] = useState(false);
  
  // Get user's country code for filtering ads
  const userCountryCode = useMemo(() => {
    // IMPORTANT: Ads are targeted by COUNTRY only.
    // Do not depend on city/lat/lng geocoding, because those can be wrong/missing.
    // We normalize either the saved ISO2 `country_code` or the human-readable `country`.
    return normalizeCountryCode(currentUser?.country_code || currentUser?.country || '');
  }, [currentUser?.country_code, currentUser?.country]);
  
  useEffect(() => {
    // ⭐ ANDROID OPTIMIZATION: Defer ad loading to prioritize profiles
    const delay = isAndroidPlatform() ? 500 : 300;
    const timer = setTimeout(async () => {
      const fetchAds = async () => {
        try {
          // Build query with server-side filtering when possible
          const query = supabase
            .from('ads')
            .select('id, name, about, image_url, video_url, link, link_as, media_type, target_countries')
            .order('created_at', { ascending: false });

          const { data, error } = await query;

          if (error) throw error;

        // Filter ads by COUNTRY only - still needed for target_countries array filtering
        // Server-side contains filter for arrays isn't reliable with empty arrays
        const rows: AdsRow[] = Array.isArray(data) ? (data as unknown as AdsRow[]) : [];

        const filteredAds = rows.filter((ad) => {
          const targetCountries = normalizeCountryCodeList(ad.target_countries);
          // If no target countries specified, show to everyone
          if (targetCountries.length === 0) return true;
          // Otherwise, only show if user's country is in the list
          return Boolean(userCountryCode) && targetCountries.includes(userCountryCode);
        });

        // Mark ads with isAd property
        const adsWithMarker: AdData[] = filteredAds.map((ad) => ({
          id: ad.id,
          name: ad.name,
          about: ad.about,
          image_url: ad.image_url,
          video_url: ad.video_url,
          media_type: ad.media_type,
          link: ad.link,
          link_as: ad.link_as,
          isAd: true as const
        }));

        setAds(adsWithMarker);
        setAdsLoaded(true);
      } catch (error) {
        // Silently handle ad fetch errors
        setAdsLoaded(true); // Still allow profiles to load
      }
    };

      await fetchAds();
    }, delay);

    return () => clearTimeout(timer);
  }, [userCountryCode]);

  // Ensure currentIndex stays valid when potentialMatches array changes
  useEffect(() => {
    if (potentialMatches.length > 0 && currentIndex >= potentialMatches.length) {
      setCurrentIndex(Math.max(0, potentialMatches.length - 1));
    }
  }, [potentialMatches.length, currentIndex]);

  // Stable ad shuffle - deterministic based on user ID and date
  const stableShuffledAds = useMemo(() => {
    if (ads.length === 0) return [];
    
    // Use deterministic shuffle for ads as well to maintain consistency
    const today = new Date().toISOString().split('T')[0]; // Use same stable date format
    const adSeed = `${currentUser?.id}_ads_${today}`;
    return createDeterministicShuffle(ads, adSeed);
  }, [ads, currentUser?.id]);

  // Helper function to inject ads into matches array
  const injectAds = useCallback((matches: PotentialMatch[]): (PotentialMatch | AdData)[] => {
    if (stableShuffledAds.length === 0) {
      return matches;
    }
    
    const result: (PotentialMatch | AdData)[] = [];
    let adIndex = 0;
    
    // Premium users see ads every 10 swipes, free users every 5 swipes
    const adFrequency = premiumActive ? 10 : 5;
    
    for (let i = 0; i < matches.length; i++) {
      result.push(matches[i]);
      
      // Insert ad at the specified frequency, ensuring we cycle through ALL ads
      if ((i + 1) % adFrequency === 0) {
        let selectedAd = stableShuffledAds[adIndex % stableShuffledAds.length];
        // Avoid back-to-back identical ads (can happen if merge boundaries align)
        const last = result[result.length - 1];
        if (last && isAd(last) && selectedAd?.id && last.id === selectedAd.id) {
          adIndex++;
          selectedAd = stableShuffledAds[adIndex % stableShuffledAds.length];
        }
        result.push(selectedAd);
        adIndex++;
      }
    }
    
    return result;
  }, [stableShuffledAds, premiumActive]);

  // If ads arrive after the initial profile fetch, inject them without changing the current card.
  useEffect(() => {
    if (!adsLoaded) return;
    if (stableShuffledAds.length === 0) return;
    if (potentialMatches.length === 0) return;
    if (potentialMatches.some((m) => isAd(m))) return;

    const current = potentialMatches[currentIndex];
    if (!current || isAd(current)) return;

    const profilesOnly = potentialMatches.filter((m): m is PotentialMatch => !isAd(m));
    const withAds = injectAds(profilesOnly);
    const nextIndex = withAds.findIndex((m) => !isAd(m) && m.id === current.id);

    if (nextIndex < 0) return;

    // Keep the current card at index 0 by trimming the deck.
    const trimmed = withAds.slice(nextIndex);
    setPotentialMatches(trimmed);
    setCurrentIndex(0);
  }, [adsLoaded, stableShuffledAds.length, potentialMatches, currentIndex, injectAds]);

  // --- BEGIN: Swipe Guide Popup State ---
  const [showSwipeGuide, setShowSwipeGuide] = useState(false);
  useEffect(() => {
    // Only show for new users (e.g., if localStorage flag not set)
    if (!currentUser?.id) return;
    const guideFlag = localStorage.getItem('driplove_swipe_guide_shown');
    if (!guideFlag) {
      setShowSwipeGuide(true);
      const timer = setTimeout(() => {
        setShowSwipeGuide(false);
        localStorage.setItem('driplove_swipe_guide_shown', 'true');
      }, 20000); // 20 seconds
      return () => clearTimeout(timer);
    }
  }, [currentUser?.id]);
  // --- END: Swipe Guide Popup State ---

  // Check for premium activation from payment success (run once on mount)
  const handledPremiumActivatedRef = useRef(false);
  useEffect(() => {
    if (handledPremiumActivatedRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('premium') === 'activated') {
      handledPremiumActivatedRef.current = true;
      refetchSubscription();
      toast({
        title: t('discover.welcomeToPremium.title'),
        description: t('discover.welcomeToPremium.description'),
        duration: 5000,
      });
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [refetchSubscription, t, toast]);

  // Fetch current reverse usage for today
  // Fetch user profile and calculate completion on mount
  useEffect(() => {
    // ⭐ ANDROID OPTIMIZATION: Defer profile completion to prioritize profile display
    const delay = isAndroidPlatform() ? 300 : 100;
    const timer = setTimeout(async () => {
      const fetchUserProfileCompletion = async () => {
        if (!currentUser?.id) return;

        try {
          // Fetch user profile - only select fields needed for profile completion calculation
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, bio, city, country, date_of_birth, gender, preference, occupation, education_level, relationship_intent, interests, adinkra_symbols, fun_fact, perfect_first_date, profile_completion')
            .eq('id', currentUser.id)
            .single();

        if (profileError) {
          return;
        }

        // Fetch user images
        const { data: images, error: imagesError } = await supabase
          .from('user_images')
          .select('image_url, is_approved, moderation_status')
          .eq('user_id', currentUser.id);

        if (imagesError) {
          // ignore image fetch error; we can still render profile
        }

        const userImages = images || [];
        setUserProfileImages(userImages);


        // Prefer DB-stored completion if present; otherwise fall back to local calculation.
        const dbCompletion = (profile as unknown as { profile_completion?: unknown })?.profile_completion;
        if (typeof dbCompletion === 'number' && Number.isFinite(dbCompletion)) {
          setComputedProfileCompletion(dbCompletion);
          // Missing fields not available from DB field; keep calculated missing fields best-effort.
          const completionResult = calculateProfileCompletion(profile, userImages);
          setProfileMissingFields(completionResult.missingFields);
        } else {
          const completionResult = calculateProfileCompletion(profile, userImages);
          setComputedProfileCompletion(completionResult.completion);
          setProfileMissingFields(completionResult.missingFields);
        }

        // Get today's swipe count
        const swipeCount = await getTodaySwipeCount(currentUser.id);
        setTodaySwipeCount(swipeCount);
      } catch (error) {
        // ignore profile completion fetch error
      }
    };

      await fetchUserProfileCompletion();
    }, delay);

    return () => clearTimeout(timer);
    // NOTE: Removed premiumActive from dependencies - profile completion doesn't depend on premium status
  }, [currentUser?.id]);

  // Single source of truth for completion checks in Discover:
  // 1) Parent-provided completion (Profile page) if present
  // 2) DB/profile computed value (from effect above)
  const effectiveProfileCompletion = useMemo(() => {
    const raw: unknown = parentProfileCompletion ?? computedProfileCompletion ?? 0;
    const n = typeof raw === 'string' ? Number(raw.replace('%', '').trim()) : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }, [parentProfileCompletion, computedProfileCompletion]);

  // Debug: log the completion value Discover uses (and where it came from)
  useEffect(() => {
    if (!isSwipeDebugEnabled()) return;
    swipeDebug('profileCompletion: snapshot', {
      parentProfileCompletion,
      computedProfileCompletion,
      effectiveProfileCompletion,
      source:
        typeof parentProfileCompletion === 'number' && Number.isFinite(parentProfileCompletion)
          ? 'parent'
          : 'computed',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentProfileCompletion, computedProfileCompletion, effectiveProfileCompletion]);

  // ⭐ BACKGROUND LOADING: Fetch reverse usage (defer to not block profile display)
  const fetchReverseUsage = useCallback(() => {
    if (!currentUser?.id) return;
    
    // Defer to background
    setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('user_usage')
          .select('reverse_dislikes_used')
          .eq('user_id', currentUser.id)
          .eq('date', new Date().toISOString().split('T')[0])
          .maybeSingle();

        if (error && error.code !== 'PGRST116') return;
        setReverseUsageToday(data?.reverse_dislikes_used || 0);
      } catch (error) {
        // ignore reverse usage fetch error
      }
    }, 200); // Defer to let profiles load first
  }, [currentUser?.id]);
  const [lastShuffleTime, setLastShuffleTime] = useState<number>(0);

  // Swipe tracking (refs avoid stale state)
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const currentYRef = useRef(0);

  const [swipeUI, setSwipeUI] = useState<{
    isDragging: boolean;
    swipeDirection: 'left' | 'right' | null;
    swipeDistance: number;
    dragOffset: number;
  }>({ isDragging: false, swipeDirection: null, swipeDistance: 0, dragOffset: 0 });

  const isDraggingRef = useRef(false);
  const [exitingCard, setExitingCard] = useState(false);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);
  const latestDeltaRef = useRef(0);
  const rafScheduledRef = useRef(false);

  const getGenderFilter = useCallback((userPreference: string) => {
    if (userPreference === 'male') {
      return ['male'];
    } else if (userPreference === 'female') {
      return ['female'];
    } else if (userPreference === 'everyone' || userPreference === 'both') {
      return ['male', 'female', 'other'];
    }
    return ['male', 'female', 'other']; // default to all
  }, []);

  const allowedGenders = useMemo(() => 
    getGenderFilter(currentUser?.preference || 'everyone'), 
    [currentUser?.preference, getGenderFilter]
  );

  // Load all approved image URLs for one profile
  const loadAllImagesForProfile = useCallback(async (profileId: string) => {
    if (currentImageAbortController) {
      currentImageAbortController.abort();
      currentImageAbortController = null;
    }

    const controller = new AbortController();
    currentImageAbortController = controller;

    try {
      const { data: images } = await supabase
        .from('user_images')
        .select('image_url, image_order')
        .eq('user_id', profileId)
        .eq('is_approved', true)
        .order('image_order', { ascending: true });

      if (controller.signal.aborted) return null;

      return images?.map(img => img.image_url) || [];
    } catch {
      return [];
    }
  }, []);

  // Fetch users who liked the current user (for priority blending in feed)
  const fetchLikedMeProfiles = useCallback(async (
    userId: string,
    excludedIds: string[],
    allowedGenders: string[]
  ): Promise<ProfileRow[]> => {
    try {
      // Get users who liked the current user
      const { data: likes } = await supabase
        .from('likes')
        .select('liker_id, created_at')
        .eq('liked_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!likes || likes.length === 0) return [];

      // Get users the current user already liked back (exclude from candidates)
      const { data: myLikes } = await supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', userId);

      const alreadyLikedBack = new Set(myLikes?.map(l => l.liked_id) || []);
      const excludedSet = new Set(excludedIds);

      // Filter to get unseen candidates
      const candidateIds = likes
        .map(l => l.liker_id)
        .filter(id => !alreadyLikedBack.has(id) && !excludedSet.has(id));

      if (candidateIds.length === 0) return [];

      // Fetch profiles with quality filter (active, not admin, not archived)
      const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at';
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .in('id', candidateIds)
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('is_archived', false);

      if (!profiles || profiles.length === 0) return [];

      // Get image counts for quality filter (require 2+ photos)
      const { data: imageCounts } = await supabase
        .from('user_images')
        .select('user_id')
        .in('user_id', profiles.map(p => p.id))
        .eq('is_approved', true);

      const imageCountMap = new Map<string, number>();
      (imageCounts || []).forEach(row => {
        imageCountMap.set(row.user_id, (imageCountMap.get(row.user_id) || 0) + 1);
      });

      // Filter by quality: require 2+ photos
      const qualifiedProfiles = profiles.filter(p => (imageCountMap.get(p.id) || 0) >= 2);

      return qualifiedProfiles as unknown as ProfileRow[];
    } catch (error) {
      console.error('[DiscoverPage] Error fetching liked-me profiles:', error);
      return [];
    }
  }, []);

  // Blend profiles: inject liked-you profiles at strategic positions
  // Strategy: Every 3-4 regular profiles → 1 liked-you profile (if available)
  const blendLikedMeProfiles = useCallback((
    regularProfiles: PotentialMatch[],
    likedMeProfiles: PotentialMatch[],
    userId: string
  ): PotentialMatch[] => {
    if (likedMeProfiles.length === 0) return regularProfiles;
    if (regularProfiles.length === 0) return likedMeProfiles;

    const blended: PotentialMatch[] = [];
    let likedMeIndex = 0;
    const BLEND_RATIO = 3; // Inject 1 liked-me every 3 regular profiles

    // Deterministic positioning based on user + date
    const seed = `${userId}_${todayStr()}_likedme`;
    const hash = hashStringToInt(seed);
    const firstInjection = 2 + (hash % 3); // First injection at position 2-4

    for (let i = 0; i < regularProfiles.length; i++) {
      // Check if we should inject a liked-me profile at this position
      if (
        likedMeIndex < likedMeProfiles.length &&
        i >= firstInjection &&
        (i - firstInjection) % BLEND_RATIO === 0
      ) {
        blended.push(likedMeProfiles[likedMeIndex]);
        likedMeIndex++;
      }
      
      blended.push(regularProfiles[i]);
    }

    // Append any remaining liked-me profiles at the end
    while (likedMeIndex < likedMeProfiles.length) {
      blended.push(likedMeProfiles[likedMeIndex]);
      likedMeIndex++;
    }

    return blended;
  }, []);

  // Fetch profiles from unlocked countries (premium)
  const fetchUnlockedCountryProfiles = useCallback(async ({
    unlockedCountries,
    excludedIds,
    allowedGenders,
    distanceMap,
    limit = 100
  }: {
    unlockedCountries: string[],
    excludedIds: string[],
    allowedGenders: string[],
    distanceMap: { [key: string]: number },
    limit?: number
  }) => {
    const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at';

    const countryCodes = Array.from(new Set(unlockedCountries.map(normalizeCountryCode).filter(Boolean)));
    if (countryCodes.length === 0) return [];

    const perCountryLimit = Math.max(40, Math.ceil(limit / Math.max(1, countryCodes.length)));

    const results = await Promise.all(
      countryCodes.map(async (countryCode) => {
        let query = supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('country_code', countryCode)
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .eq('is_archived', false)
          .limit(perCountryLimit);

        if (excludedIds.length > 0) {
          query = query.not('id', 'in', `(${excludedIds.join(',')})`);
        }

        const { data, error } = await query;
        if (error) {
          return [];
        }
        const rows: ProfileRow[] = Array.isArray(data) ? (data as unknown as ProfileRow[]) : [];
        return rows;
      })
    );

    const flat: ProfileRow[] = results.flat();
    const unique: ProfileRow[] = Array.from(new Map(flat.map((p) => [p.id, p])).values());

    unique.forEach((p) => {
      p.country_code = normalizeCountryCode(String(p.country_code || ''));
    });

    unique.forEach((p) => (distanceMap[p.id] ??= 999));

    return unique.slice(0, Math.max(limit, perCountryLimit * countryCodes.length));
  }, []);

  // Shared data fetching logic - optimized for speed
  const fetchPotentialMatchesData = useCallback(async (userId: string, allowedGenders: string[]) => {
    const [
      { data: currentUserData },
      { data: likedUsers },
      { data: blockedUsers },
      { data: recentPasses },
      { data: usersWhoLikedMe }
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('max_distance, distance_preference, country, country_code, min_age, max_age, preference, unlocked_countries, profile_completion, latitude, longitude')
        .eq('id', userId)
        .single(),
      supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', userId),
      supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
      supabase
        .from('passes')
        .select('passed_id, passed_at')
        .match({ passer_id: userId })
        .gte('passed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()), // 30 days
      supabase
        .from('likes')
        .select('liker_id, created_at')
        .eq('liked_id', userId)
        .order('created_at', { ascending: false })
        .limit(50) // Get up to 50 recent likers
    ]);

    const likedUserIds = uniqUuids(likedUsers?.map(like => like.liked_id) || []);
    const blockedUserIds = uniqUuids(blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || []);
    const passedUserIds = uniqUuids(recentPasses?.map(p => p.passed_id) || []);
    
    const usersWhoLikedMeIds = uniqUuids((usersWhoLikedMe || [])
      .map(like => like.liker_id)
      .filter(id => !likedUserIds.includes(id) && !blockedUserIds.includes(id) && !passedUserIds.includes(id)));

    setUsersWhoLikedMeIds(prev => {
      if (prev.length === usersWhoLikedMeIds.length) {
        const nextSet = new Set(usersWhoLikedMeIds);
        let same = true;
        for (const id of prev) {
          if (!nextSet.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return usersWhoLikedMeIds;
    });
    
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const locallySwipedIds = uniqUuids(Array.from(locallySwipedProfileIds.current.entries())
      .filter(([_, data]) => {
        // Always exclude liked profiles
        if (data.action === 'like') return true;
        // Only exclude passed profiles if less than 30 days old
        return (now - data.timestamp) < thirtyDaysMs;
      })
      .map(([id, _]) => id));
    const excludedIds = uniqUuids([...likedUserIds, ...blockedUserIds, ...passedUserIds, ...locallySwipedIds, userId]);
    
    const priorityLikerIds = usersWhoLikedMeIds.filter(id => !locallySwipedIds.includes(id));
    
    const userMaxDistanceRaw = currentUserData?.max_distance ?? currentUserData?.distance_preference ?? 50;
    const userMaxDistance = Number(userMaxDistanceRaw);
    const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;

    const baseCountryCode = normalizeCountryCode(currentUserData?.country_code || '');

    const premiumForFeed = premiumActive;

    const unlockedCountriesRaw = currentUserData?.unlocked_countries ?? currentUser.unlocked_countries;
    const unlockedCountries: string[] = premiumForFeed
      ? normalizeCountryCodeList(unlockedCountriesRaw, baseCountryCode)
      : [];


    const locationMatches = await locationService.getLocationBasedMatches(userId, safeUserMaxDistance);

    const distanceMap: { [key: string]: number } = {};
    const locationProfileIds = uniqUuids(locationMatches
      .filter((m) => !baseCountryCode || normalizeCountryCode((m.country_code || '') as string) === baseCountryCode)
      .map((match) => {
        distanceMap[match.profile_id] = match.distance_km;
        return match.profile_id;
      }));

    const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at';

    const hasUnlockedCountries = premiumForFeed && unlockedCountries.length > 0;


    let filteredProfiles: ProfileRow[] = [];
    let usingArchivedFallback = false; // Track if we're showing archived profiles

    let localProfiles: ProfileRow[] = [];
    let intlProfiles: ProfileRow[] = [];

    // Phase 1: active users only
    
    if (premiumForFeed) {
      // STEP 1: fetch local distance-based profiles (local country only)
      localProfiles = locationProfileIds.length
        ? await (async () => {
            let query = supabase
              .from('profiles')
              .select(PROFILE_SELECT)
              .in('id', locationProfileIds);

            if (baseCountryCode) {
              query = query.eq('country_code', baseCountryCode);
            }

            if (excludedIds.length > 0) {
              query = query.not('id', 'in', `(${excludedIds.join(',')})`);
            }

            const { data: profiles, error } = await query
              .in('gender', allowedGenders)
              .eq('account_status', 'active')
              .eq('is_admin', false)
              .eq('is_archived', false)
              .limit(100);

            if (error) throw error;
            return Array.isArray(profiles) ? (profiles as unknown as ProfileRow[]) : [];
          })()
        : [];

      // Premium fallback: if distance-local is empty, still fetch local country.
      if (baseCountryCode && localProfiles.length === 0) {
        try {
          let fallbackQuery = supabase
            .from('profiles')
            .select(PROFILE_SELECT)
            .eq('country_code', baseCountryCode)
            .eq('account_status', 'active')
            .eq('is_admin', false)
            .eq('is_archived', false)
            .in('gender', allowedGenders)
            .limit(80);

          if (excludedIds.length > 0) {
            fallbackQuery = fallbackQuery.not('id', 'in', `(${excludedIds.join(',')})`);
          }

          const { data: fallbackLocal, error: fallbackError } = await fallbackQuery;
          const fallbackRows: ProfileRow[] = Array.isArray(fallbackLocal)
            ? (fallbackLocal as unknown as ProfileRow[])
            : [];
          if (!fallbackError && fallbackRows.length > 0) {
            fallbackRows.forEach((p) => (distanceMap[p.id] ??= 999));
            localProfiles = fallbackRows;
          }
        } catch (e) {
          // ignore fallback errors; premium can still show intl
        }
      }

      // STEP 2: fetch unlocked country profiles (premium only, no distance filter)

      intlProfiles = hasUnlockedCountries
        ? await fetchUnlockedCountryProfiles({
            unlockedCountries,
            excludedIds: uniqUuids([...excludedIds, ...localProfiles.map(p => p.id)]),
            allowedGenders,
            distanceMap,
            limit: 100
          })
        : [];


      // STEP 3: Apply age filtering to EACH group separately
      const userMinAge = currentUserData?.min_age || 18;
      const userMaxAge = currentUserData?.max_age || 99;
      
      const filterAge = (profiles: ProfileRow[]) => profiles.filter((profile) => {
        // Premium: keep profiles even if DOB is missing; only enforce range when DOB is present.
        if (!profile.date_of_birth) return true;
        const age = calculateAge(profile.date_of_birth);
        if (!Number.isFinite(age)) return true;
        return age >= userMinAge && age <= userMaxAge;
      });
      
      const localFiltered = filterAge(localProfiles).filter(p => p.id !== userId);
      const intlFiltered = filterAge(intlProfiles).filter(p => p.id !== userId);
      
      
      // STEP 4: Define allowed countries for Premium mixing
      const dailySeed = todayStr();
      // Ensure base country is ALWAYS first for proper rotation
      const allowedCountryCodes = [
        ...(baseCountryCode ? [normalizeCountryCode(baseCountryCode)] : []),
        ...unlockedCountries
          .map(normalizeCountryCode)
          .filter((c) => c && c !== normalizeCountryCode(baseCountryCode || '')),
      ].filter(Boolean);


      // STEP 5: Merge local + intl, then do ONE clean round-robin mix across ALL countries
      // This ensures profiles truly alternate: 1 from country A, 1 from country B, etc.
      const allActive = [...localFiltered, ...intlFiltered]
        .filter((p) => p?.id && p.id !== userId)
        .filter((p) => {
          const cc = normalizeCountryCode(p.country_code || '');
          return !cc ? false : allowedCountryCodes.includes(cc);
        });

      // Apply round-robin mixing directly first (defines eligible country distribution)
      // This produces a truly interleaved feed: A, B, C, A, B, C...
      const mixedProfiles = mixByCountryRoundRobin(
        allActive,
        allowedCountryCodes,
        `${userId}_${dailySeed}_countries`
      );

      // ⭐ ACTIVITY WEIGHTING (Premium): Bias toward recently active users AFTER country mix
      // Soft reorder only: no users removed, premium rules preserved
      // ⭐ ANDROID OPTIMIZATION: Skip on Android for faster processing
      const activityWeightedMixed = isAndroidPlatform() 
        ? mixedProfiles
        : applyActivityWeighting(
            mixedProfiles,
            `${userId}_${dailySeed}_activity`
          );


      // STEP 6: For Premium multi-country, preserve the country rotation
      // Stratified sampling would re-group by account age and destroy the alternation
      // Premium users pay for the best experience → keep pure round-robin mixing
      filteredProfiles = activityWeightedMixed.slice(0, 60);


      // (dev-only logging removed)
      
      // Reset archived fallback flag if we found active profiles
      if (filteredProfiles.length > 0) {
        usingArchivedFallback = false;
      }
    } else {
      // Free users: local country only
      if (locationProfileIds.length > 0) {
        let query = supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .in('id', locationProfileIds);

        if (baseCountryCode) {
          query = query.eq('country_code', baseCountryCode);
        }

        if (excludedIds.length > 0) {
          query = query.not('id', 'in', `(${excludedIds.join(',')})`);
        }

        const { data: profiles, error } = await query
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .eq('is_archived', false)
          .limit(100);

        if (error) throw error;
        filteredProfiles = Array.isArray(profiles) ? (profiles as unknown as ProfileRow[]) : [];
      } else if (baseCountryCode) {
        let query = supabase.from('profiles').select(PROFILE_SELECT);

        if (excludedIds.length > 0) {
          query = query.not('id', 'in', `(${excludedIds.join(',')})`);
        }

        const { data: profiles, error } = await query
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .eq('is_archived', false)
          .eq('country_code', baseCountryCode)
          .limit(100);

        if (error) throw error;
        filteredProfiles = Array.isArray(profiles) ? (profiles as unknown as ProfileRow[]) : [];
        
        // Reset archived fallback flag if we found active profiles
        if (filteredProfiles.length > 0) {
          usingArchivedFallback = false;
        }
      }
    }

    // =====================================================
    // PHASE 2: ARCHIVED FALLBACK (only if Phase 1 returns 0)
    // =====================================================
    if (filteredProfiles.length === 0) {
      // Phase 1 returned 0 active profiles, trying archived fallback
      // Define allowed countries for archived query
      const allowedCountryCodes = Array.from(
        new Set([
          ...(baseCountryCode ? [baseCountryCode] : []),
          ...(premiumForFeed ? unlockedCountries : []),
        ])
      ).map((c) => normalizeCountryCode(String(c || ''))).filter(Boolean);
      
      let archivedQuery = supabase.from('profiles').select(PROFILE_SELECT);
      
      if (excludedIds.length > 0) {
        archivedQuery = archivedQuery.not('id', 'in', `(${excludedIds.join(',')})`);
      }
      
      // Build country filter based on user type
      if (premiumForFeed && allowedCountryCodes.length > 0) {
        archivedQuery = archivedQuery.in('country_code', allowedCountryCodes);
      } else if (baseCountryCode) {
        archivedQuery = archivedQuery.eq('country_code', baseCountryCode);
      }

      // Apply age filtering to archived profiles
      const userMinAge = currentUserData?.min_age || 18;
      const userMaxAge = currentUserData?.max_age || 99;
      archivedQuery = archivedQuery
        .gte('age', userMinAge)
        .lte('age', userMaxAge);

      // Apply distance filtering for local country (use currentUserData for location)
      const userLat = currentUserData?.latitude;
      const userLon = currentUserData?.longitude;
      if (baseCountryCode && userLat && userLon) {
        const maxDistanceKm = currentUserData?.max_distance || 50;
        const radiusInDegrees = maxDistanceKm / 111.32;

        archivedQuery = archivedQuery
          .gte('latitude', userLat - radiusInDegrees)
          .lte('latitude', userLat + radiusInDegrees)
          .gte('longitude', userLon - radiusInDegrees)
          .lte('longitude', userLon + radiusInDegrees);
      }

      const { data: archivedProfiles, error: archivedError } = await archivedQuery
        .eq('is_archived', true) // PHASE 2: Archived users
        .eq('account_status', 'active') // Still respect account status
        .eq('is_admin', false)
        .in('gender', allowedGenders)
        .limit(50);

      if (!archivedError && archivedProfiles && archivedProfiles.length > 0) {
        filteredProfiles = Array.isArray(archivedProfiles) ? (archivedProfiles as unknown as ProfileRow[]) : [];
        usingArchivedFallback = true;
        
        // Mix archived profiles the same way (explicit country rotation).
        if (premiumForFeed && allowedCountryCodes.length > 1) {
          const mixSeed = `${userId}_${todayStr()}_archived`;
          filteredProfiles = mixByCountryRoundRobin(
            filteredProfiles.filter((p) => allowedCountryCodes.includes(normalizeCountryCode(p.country_code || ''))),
            allowedCountryCodes,
            mixSeed
          );
        }
      }
    }
    
    // Update the fallback state
    setIsArchivedFallback(usingArchivedFallback);

    // ✅ FINAL EMPTY RULE
    // Free users: empty when local is empty
    // Premium users: empty ONLY when local + intl are empty
    const hasLocal = localProfiles.length > 0;
    const hasIntl = intlProfiles.length > 0;

    if (!premiumForFeed && filteredProfiles.length === 0) {
      setNoMoreProfiles(true);
      return { matches: [], images: {}, distances: distanceMap, index: 0 };
    }

    if (premiumForFeed && !hasLocal && !hasIntl) {
      setNoMoreProfiles(true);
      return { matches: [], images: {}, distances: distanceMap, index: 0 };
    }
 
    // For FREE users: Apply age filtering, activity weighting, and stratification here
    // (Premium users already did this per-group before mixing)
    if (!premiumForFeed) {
      const userMinAge = currentUserData?.min_age || 18;
      const userMaxAge = currentUserData?.max_age || 99;
      
      filteredProfiles = filteredProfiles.filter(profile => {
        if (!profile.date_of_birth) return false;
        const age = calculateAge(profile.date_of_birth);
        return age >= userMinAge && age <= userMaxAge;
      });
      
      filteredProfiles = filteredProfiles.filter(profile => profile.id !== userId);
      
      const dailySeed = todayStr();
      // Apply stratified sampling for free users
      filteredProfiles = getStratifiedBatches(filteredProfiles, 15, 4, `${userId}_${dailySeed}`);

      // ⭐ ACTIVITY WEIGHTING (Free): Apply AFTER stratification so active users rise to the top
      // Soft reorder only: no filters/premium rules touched
      // ⭐ ANDROID OPTIMIZATION: Skip on Android for faster processing
      filteredProfiles = isAndroidPlatform()
        ? filteredProfiles
        : applyActivityWeighting(filteredProfiles, `${userId}_${dailySeed}_activity`);
    }

    // Add empty images array and precomputed distance
    const profilesWithImages: PotentialMatch[] = filteredProfiles.map((profile) =>
      toPotentialMatch(profile, {
        images: [],
        distance: distanceMap[profile.id], // Precomputed distance from locationService
      })
    );

    // ⭐ DEDUPLICATION: Remove any duplicate profiles by ID
    const uniqueProfiles: PotentialMatch[] = Array.from(
      new Map(profilesWithImages.map(p => [p.id, p])).values()
    );

    // ⭐ STRATIFIED SAMPLING: Fair distribution by account age
    // Bucket A (≤7 days): 3/15 (20%), Bucket B (8-30 days): 4/15 (27%)
    // Bucket C (1-6 months): 4/15 (27%), Bucket D (>6 months): 4/15 (26%)
    // This ensures new users get visibility (47%) while established users stay visible (53%)
    const today = todayStr();
    const shuffleSeed = `${userId}_${today}`;
    
    // ⭐ Check if we have a saved profile order for today
    // IMPORTANT: include the “feed signature” so unlocking countries regenerates a mixed order
    const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, premiumForFeed, safeUserMaxDistance);
    const savedOrderKey = buildSavedOrderKey(userId, feedSignature);
    const allowedCountryCodesForFeed = Array.from(
      new Set([
        ...(baseCountryCode ? [baseCountryCode] : []),
        ...(premiumForFeed ? unlockedCountries : []),
      ])
    ).map((c) => normalizeCountryCode(String(c || ''))).filter(Boolean);
    const savedOrderRaw = localStorage.getItem(savedOrderKey);

    const normCountry = (c: unknown) => (typeof c === 'string' ? normalizeCountryCode(c) : '');
    const validateRotationCoverage = (profiles: Array<{ country_code?: string | null }>) => {
      if (!premiumForFeed) return true;

      // Only require countries that actually exist in today's fetched pool.
      const availableCountries = new Set(profiles.map((p) => normCountry(p.country_code)).filter(Boolean));
      const requiredCountries = allowedCountryCodesForFeed.filter((c) => availableCountries.has(normCountry(c)));
      if (requiredCountries.length <= 1) return true;

      // Check the first chunk; if we're missing countries here, the saved order is likely stale/bad.
      const chunkSize = Math.min(profiles.length, Math.max(24, requiredCountries.length * 8));
      const firstChunk = profiles.slice(0, chunkSize);
      const seen = new Set(firstChunk.map((p) => normCountry(p.country_code)).filter(Boolean));
      return requiredCountries.every((c) => seen.has(normCountry(c)));
    };
    
    let savedOrderValid = false;
    let savedOrderIds: string[] = [];

    // (debug logs removed to keep console clean)
    
    let shuffled: typeof uniqueProfiles;
    
    if (savedOrderRaw) {
      try {
        const parsed: unknown = JSON.parse(savedOrderRaw);
        const obj = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : null;

        const savedPremium = obj?.premium === true;
        const savedCountries = Array.isArray(obj?.countries)
          ? obj!.countries.filter((c): c is string => typeof c === 'string')
          : [];
        const savedIds = Array.isArray(obj?.order)
          ? obj!.order.filter((id): id is string => typeof id === 'string')
          : [];


        const samePremium = savedPremium === premiumForFeed;
        const sameCountries =
          savedCountries.length === allowedCountryCodesForFeed.length &&
          savedCountries.every((c: string) => allowedCountryCodesForFeed.includes(normalizeCountryCode(c || '')));


        if (samePremium && sameCountries && savedIds.length > 0) {
          savedOrderValid = true;
          savedOrderIds = savedIds;
        }
      } catch {
        // ignore corrupt saved order
      }
    }

    if (savedOrderValid) {
      const orderMap = new Map(uniqueProfiles.map(p => [p.id, p]));

      const orderedProfiles = savedOrderIds
        .map(id => orderMap.get(id))
        .filter((p): p is typeof uniqueProfiles[0] => !!p);

      const seen = new Set(orderedProfiles.map(p => p.id));
      const newProfiles = uniqueProfiles.filter(p => !seen.has(p.id));

      shuffled = [...orderedProfiles, ...newProfiles];

      // ⭐ SAFETY: If saved order doesn't actually include all selected countries, rebuild.
      // This fixes cases where a stale/buggy saved order locks Premium into 1-2 countries.
      if (!validateRotationCoverage(shuffled)) {
        shuffled = premiumForFeed
          ? uniqueProfiles
          : getStratifiedBatches(uniqueProfiles, 15, 4, shuffleSeed);
        savedOrderValid = false;
      }

    } else {
      // Premium activated or countries changed → force rebuild
      shuffled = premiumForFeed
        ? uniqueProfiles
        : getStratifiedBatches(uniqueProfiles, 15, 4, shuffleSeed);

    }

    // Save profile order to localStorage (post-mix)
    try {
      const profileIds = shuffled.map(p => p.id);

      localStorage.setItem(
        savedOrderKey,
        JSON.stringify({
          premium: premiumForFeed,
          countries: allowedCountryCodesForFeed,
          order: profileIds
        })
      );
    } catch (error) {
      // Ignore localStorage errors
    }

    // ⭐ PROACTIVE LIKED-ME BLENDING: Fetch users who liked the current user and blend into feed
    // Strategy: Inject 1 liked-me profile every 3-4 regular profiles (Tinder-style priority)
    // This happens DURING feed build (not reactively on swipe) for guaranteed priority
    const likedMeRows = await fetchLikedMeProfiles(userId, excludedIds, allowedGenders);
    
    if (likedMeRows.length > 0) {
      // Convert to PotentialMatch format
      const likedMeProfiles: PotentialMatch[] = likedMeRows.map(profile =>
        toPotentialMatch(profile, {
          images: [],
          distance: distanceMap[profile.id],
        })
      );

      // Filter out any that are already in shuffled deck (shouldn't happen, but safety check)
      const shuffledIds = new Set(shuffled.map(p => p.id));
      const uniqueLikedMe = likedMeProfiles.filter(p => !shuffledIds.has(p.id));

      // Apply age filtering to liked-me profiles
      const userMinAge = currentUserData?.min_age || 18;
      const userMaxAge = currentUserData?.max_age || 99;
      const ageFilteredLikedMe = uniqueLikedMe.filter(profile => {
        if (!profile.date_of_birth) return true; // Keep if DOB missing
        const age = calculateAge(profile.date_of_birth);
        if (!Number.isFinite(age)) return true;
        return age >= userMinAge && age <= userMaxAge;
      });

      // ⭐ P2: Apply global eligibility gate to liked-me profiles
      const eligibleLikedMe = ageFilteredLikedMe.filter(isEligibleProfile);

      // Blend liked-me profiles into the feed (every 3-4 profiles)
      if (eligibleLikedMe.length > 0) {
        shuffled = blendLikedMeProfiles(shuffled, eligibleLikedMe, userId);
      }
    }

    // ⭐ PROFILE POSITION PERSISTENCE: Resume from last viewed profile
    // Load last profile ID and time from localStorage
    const savedId = localStorage.getItem(`driplove_last_profile_${userId}`);
    const savedTime = parseInt(localStorage.getItem(`driplove_last_profile_time_${userId}`) || '0');
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const isSavedValid = savedId && Date.now() - savedTime < twentyFourHours;

    // Find starting index based on saved profile - this ensures continuity after refresh
    let startIndex = 0;
    if (isSavedValid && savedId) {
      const foundIndex = shuffled.findIndex(p => p.id === savedId);
      if (foundIndex !== -1) {
        // Resume from the NEXT profile after the last viewed one
        startIndex = Math.min(foundIndex + 1, shuffled.length - 1);
      }
    }

    const imageMap: { [key: string]: string[] } = {};
    if (shuffled.length > 0) {
      // Take first 6 profiles (or fewer if less exist)
      const firstSix = shuffled.slice(0, 6);
      const firstSixIds = firstSix.map(p => p.id);

      // Get ALL approved images for the first 6 profiles
      const { data: imageRows, error: imgError } = await supabase
        .from('user_images')
        .select('user_id, image_url, image_order')
        .in('user_id', firstSixIds)
        .eq('is_approved', true)
        .order('user_id', { ascending: true })
        .order('image_order', { ascending: true });

      if (!imgError && imageRows) {
        // Group by user_id
        const byUser: Record<string, string[]> = {};
        for (const row of imageRows) {
          if (!byUser[row.user_id]) byUser[row.user_id] = [];
          byUser[row.user_id].push(row.image_url);
        }

        // Apply limits:
        // 1st profile: 3 images
        // 2nd profile: 2 images
        // 3rd–6th: 1 image each
        firstSix.forEach((profile, index) => {
          const imgs = byUser[profile.id] || [];
          if (imgs.length === 0) return;

          let maxCount = 1;
          if (index === 0) maxCount = 3;
          else if (index === 1) maxCount = 2;

          imageMap[profile.id] = imgs.slice(0, maxCount);

          // For the first two, start loading the FULL set in background
          if (index <= 1) {
            loadAllImagesForProfile(profile.id).then(fullImgs => {
              if (fullImgs && fullImgs.length > 0) {
                setUserImages(prev => ({ ...prev, [profile.id]: fullImgs }));
              }
            });
          }
        });
      }

      // If there were fewer than 6 profiles or any without images, it's fine.
      // The centralized preloader + loadAllImagesForProfile will keep loading the rest as user swipes.
    }

    return {
      matches: shuffled,
      images: imageMap,
      distances: distanceMap,
      index: startIndex
    };
  }, [loadAllImagesForProfile, premiumActive, currentUser, fetchUnlockedCountryProfiles, fetchLikedMeProfiles, blendLikedMeProfiles, isEligibleProfile]);

  // Batch language fetch (avoid per-card calls)
  const batchFetchLanguages = useCallback(async (profileIds: string[]) => {
    if (profileIds.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, preferred_language')
        .in('id', profileIds);
      
      if (!error && data) {
        const languageMap = data.reduce((acc, profile) => {
          if (profile.preferred_language) {
            acc[profile.id] = getLanguageName(profile.preferred_language);
          }
          return acc;
        }, {} as { [key: string]: string });
        setUserLanguages(prev => ({ ...prev, ...languageMap }));
      }
    } catch (error) {
      // Silently handle language fetch errors
    }
  }, []);

  const DISCOVER_DECK_CACHE_TTL_MS = useMemo(() => 60 * 60 * 1000, []); // 1 hour
  const buildDeckCacheKey = useCallback((cacheKey: string) => `driplove_discover_deck_${cacheKey}`, []);

  const readDeckCache = useCallback((cacheKey: string): MatchOrAd[] | null => {
    try {
      const raw = localStorage.getItem(buildDeckCacheKey(cacheKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; deck: MatchOrAd[] };
      if (!parsed?.ts || !Array.isArray(parsed?.deck)) return null;
      if (Date.now() - parsed.ts > DISCOVER_DECK_CACHE_TTL_MS) return null;
      return parsed.deck;
    } catch {
      return null;
    }
  }, [buildDeckCacheKey, DISCOVER_DECK_CACHE_TTL_MS]);

  const writeDeckCache = useCallback((cacheKey: string, deck: MatchOrAd[]) => {
    try {
      if (!Array.isArray(deck) || deck.length === 0) return;
      const key = `driplove_discover_deck_${cacheKey}`;
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), deck }));
    } catch {
      // ignore
    }
  }, []);

  const fetchPotentialMatches = useCallback(async (opts?: { background?: boolean; cacheKey?: string }) => {

    if (!currentUser?.id) return;

    // Swipe cache is now hydrated early via useEffect - no need to check here
    suppressFetchRef.current = false;

    // Latest-wins: if multiple fetches overlap (e.g., free -> premium flip),
    // only apply results from the most recent invocation.
    const fetchSeq = ++fetchSequenceRef.current;
  
    try {
      // Background loading - don't block UI
      setIsLoading(true);
      setNoMoreProfiles(false); // Reset when fetching new profiles

      const result = await fetchPotentialMatchesData(currentUser.id, allowedGenders);
      
      if (result) {
        if (fetchSeq !== fetchSequenceRef.current) {
          // Discard stale fetch results
          return;
        }
        const { matches, images, distances, index } = result;
        
        const matchesWithAds = injectAds(matches);

        // IMPORTANT: Maintain the invariant that the current card is always at index 0.
        // If we restore a resume index, trim the deck so we don't keep earlier cards around
        // (otherwise moveToNext() resetting currentIndex to 0 makes old profiles "come back").
        const safeIndex = Number.isFinite(index) ? Math.max(0, Math.min(index, matchesWithAds.length)) : 0;
        const initialDeck = safeIndex > 0 ? matchesWithAds.slice(safeIndex) : matchesWithAds;

        setPotentialMatches(prev => {
          // ⭐ CRITICAL: Always filter against locally swiped profiles to prevent repetition
          const swipedIds = locallySwipedProfileIds.current;
          const now = Date.now();
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          
          const filterSwiped = (deck: MatchOrAd[]): MatchOrAd[] => {
            return deck.filter(item => {
              if (isAd(item)) return true;
              const swipeData = swipedIds.get(item.id);
              if (!swipeData) return true;
              // Always exclude liked profiles, exclude passed if < 30 days old
              if (swipeData.action === 'like') return false;
              return (now - swipeData.timestamp) >= thirtyDaysMs;
            });
          };
          
          if (prev.length === 0) {
            return filterSwiped(initialDeck);
          }
          return mergeDecksWithoutProfileDupes(prev, matchesWithAds, swipedIds);
        });
        setUserImages(images);
        setUserDistances(distances);
        setCurrentIndex(0);
        setLastShuffleTime(Date.now());

        const cacheKeyForWrite = opts?.cacheKey;
        if (cacheKeyForWrite) {
          writeDeckCache(cacheKeyForWrite, initialDeck);
        }

        // Mark as complete immediately
        console.log('[DiscoverPage] Fetch complete, setting', initialDeck.length, 'profiles');
        setIsLoading(false);
        setHasCompletedInitialFetch(true);

        // ⭐ FAST LOADING: Defer language fetching to not block UI
        // Profiles render with missing language names, then update when languages load
        const profileIds = matches.map(m => m.id).filter(Boolean);
        if (profileIds.length > 0) {
          setTimeout(() => batchFetchLanguages(profileIds), 0);
        }
      }
    } catch (error) {
      // Silent fail: keep UX quiet and allow UI to fall back to empty/retry states.
      console.error('[DiscoverPage] Fetch error:', error);
      setPotentialMatches([]);
      setNoMoreProfiles(true);
      setIsLoading(false);
      setHasCompletedInitialFetch(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allowedGenders, toast, fetchPotentialMatchesData, injectAds, batchFetchLanguages]);

  // Premium: attempt ONE auto-refill if deck becomes empty (don't loop infinitely)
  useEffect(() => {
    if (!premiumActive) return;
    if (!hasCompletedInitialFetch) return;
    if (potentialMatches.length > 0) {
      // We have profiles - clear empty state
      if (premiumTrulyEmptyAfterRetry) setPremiumTrulyEmptyAfterRetry(false);
      premiumEmptyAutoRetryRef.current = false;
      return;
    }
    
    // Don't auto-retry if already attempted or if actively loading
    if (premiumEmptyAutoRetryRef.current) return;
    if (isLoading || isLoadingMore) return;
    if (!noMoreProfiles) return; // Wait for noMoreProfiles flag
    
    // Try ONE refill for premium users
    premiumEmptyAutoRetryRef.current = true;
    setNoMoreProfiles(false);
    fetchPotentialMatches();
  }, [premiumActive, hasCompletedInitialFetch, potentialMatches.length, noMoreProfiles, isLoading, isLoadingMore, premiumTrulyEmptyAfterRetry, fetchPotentialMatches]);

  // Mark truly empty after retry completes (separate effect to avoid loops)
  useEffect(() => {
    if (!premiumActive) return;
    if (potentialMatches.length > 0) return;
    if (!noMoreProfiles) return;
    if (!premiumEmptyAutoRetryRef.current) return;
    
    // Only mark as truly empty after the retry completed and still found nothing
    setPremiumTrulyEmptyAfterRetry(true);
    premiumEmptyAutoRetryRef.current = false;
  }, [premiumActive, potentialMatches.length, noMoreProfiles]);

  const preloadProfileImages = useCallback((profiles: PotentialMatch[], startIndex: number = 0) => {
    const isAndroid = isAndroidPlatform();
    // ⭐ ANDROID OPTIMIZATION: Load only current profile for instant display
    const batchSize = isAndroid ? 1 : 6;
    const profilesToLoad = profiles.slice(startIndex, startIndex + batchSize);
    
    // Filter out profiles that are already loaded or currently loading
    const profilesNeedingImages = profilesToLoad.filter((user) => {
      if (!user?.id) return false;
      if (userImagesRef.current[user.id]?.length > 0) return false; // Already loaded
      if (requestedImageProfileIds.current.has(user.id)) return false; // Already loading
      return true;
    });

    if (profilesNeedingImages.length === 0) return;

    const idsToLoad = profilesNeedingImages.map((u) => u.id);
    idsToLoad.forEach((id) => requestedImageProfileIds.current.add(id));

    // Load in background - don't await
    (async () => {
      try {
        type UserImageRow = { user_id: string; image_url: string; image_order: number | null };

        const { data: imageRows } = await supabase
          .from('user_images')
          .select('user_id, image_url, image_order')
          .in('user_id', idsToLoad)
          .eq('is_approved', true)
          .order('user_id', { ascending: true })
          .order('image_order', { ascending: true })
          .returns<UserImageRow[]>();

        const byUser: Record<string, string[]> = {};
        const allowedUserIds = new Set(idsToLoad);
        for (const row of imageRows || []) {
          if (!row?.user_id || !row?.image_url) continue;
          if (!allowedUserIds.has(row.user_id)) continue;
          if (!byUser[row.user_id]) byUser[row.user_id] = [];
          byUser[row.user_id].push(row.image_url);
        }

        const userImageUpdates: Record<string, string[]> = {};
        const usersWithImages: PotentialMatch[] = [];

        // Build updates first, then apply in one state update to reduce re-renders.
        for (const user of profilesNeedingImages) {
          const imageUrls = byUser[user.id] || [];
          if (imageUrls.length === 0) {
            requestedImageProfileIds.current.delete(user.id);
            continue;
          }
          userImageUpdates[user.id] = imageUrls;
          usersWithImages.push(user);
        }

        if (Object.keys(userImageUpdates).length > 0) {
          setUserImages((prev) => ({ ...prev, ...userImageUpdates }));
        }

        // iOS/Web: blob preloading for instant render; Android WebView: skip blobs (too expensive)
        if (!isAndroid) {
          for (const user of usersWithImages) {
            const imageUrls = userImageUpdates[user.id] || [];
            const blobMap: { [url: string]: string } = {};
            await Promise.all(
              imageUrls.map(async (originalUrl) => {
                try {
                  const blobUrl = await preloadImageToBlob(originalUrl);
                  blobMap[originalUrl] = blobUrl;
                } catch {
                  blobMap[originalUrl] = originalUrl;
                }
              })
            );
            setPreloadedBlobImages((prev) => ({ ...prev, [user.id]: blobMap }));
            requestedImageProfileIds.current.delete(user.id);
          }
        } else {
          // Android: no blob preloading; clear loading flags immediately after setting URLs.
          for (const user of usersWithImages) {
            requestedImageProfileIds.current.delete(user.id);
          }
        }
      } catch {
        // ignore preload errors; fallback to original URLs
      } finally {
        // Ensure we don't leak "loading" state
        idsToLoad.forEach((id) => requestedImageProfileIds.current.delete(id));
      }
    })();
  }, []);

  // Legacy compatibility
  const loadFullImages = useCallback((profileId: string) => {
    const profile = potentialMatches.find(p => p.id === profileId);
    if (profile && 'first_name' in profile) {
      preloadProfileImages([profile], 0);
    }
  }, [potentialMatches, preloadProfileImages]);

  const preloadNextProfileImages = useCallback((matches: PotentialMatch[], alreadyLoaded: { [key: string]: string[] }, startIdx: number) => {
    preloadProfileImages(matches, startIdx);
  }, [preloadProfileImages]);

  // Main effect to fetch data - optimized for fast loading
  useEffect(() => {
    if (!currentUser?.id) return;

    // Reset deck when premium context changes so we don't keep a stale single-country deck.
    if (lastPremiumActiveRef.current !== null && lastPremiumActiveRef.current !== premiumActive) {
      // Invalidate any in-flight fetch results so they cannot overwrite the new deck.
      fetchSequenceRef.current += 1;

      setPotentialMatches([]);
      setCurrentIndex(0);
      setImageIndex(0);
      setNoMoreProfiles(false);
      setHasCompletedInitialFetch(false);
      setIsArchivedFallback(false);
      setPremiumTrulyEmptyAfterRetry(false);
      premiumEmptyAutoRetryRef.current = false;
    }
    lastPremiumActiveRef.current = premiumActive;


    // Create cache key that includes date AND premium status
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${currentUser.id}_${today}_${premiumActive ? 'premium' : 'free'}`;

    if (initializedUserRef.current === cacheKey) {
      return; // Already initialized for this user today
    }

    // locallySwipedProfileIds.current.clear(); // REMOVED

    // ⭐ EARLY CLEANUP: Remove old passed profiles (30+ days) to keep storage lean
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    let needsUpdate = false;
    
    for (const [id, data] of locallySwipedProfileIds.current.entries()) {
      if (data.action === 'pass' && (now - data.timestamp) > thirtyDaysMs) {
        locallySwipedProfileIds.current.delete(id);
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      persistSwipedIds();
    }
    
    // ⭐ BACKGROUND CLEANUP: Remove old profile orders (non-blocking)
    setTimeout(() => {
      try {
        const today = todayStr();
        const prefix = `driplove_profile_order_${currentUser.id}_`;

        // Remove old profile orders (not today's)
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith(prefix) && !key.includes(`_${today}_`)) {
            localStorage.removeItem(key);
          }
        });
      } catch (error) {
        // Ignore localStorage errors
      }
    }, 1000); // Defer cleanup to not block initialization

    // Start loading immediately - always fetch fresh to exclude swiped profiles
    const initializeProfiles = async () => {
      initializedUserRef.current = cacheKey;

      const cachedDeck = readDeckCache(cacheKey);
      if (cachedDeck && cachedDeck.length > 0) {
        // ⭐ CRITICAL: Filter cached deck against locally swiped profiles to prevent repetition
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const swipedToExclude = new Set<string>();
        
        for (const [id, data] of locallySwipedProfileIds.current.entries()) {
          // Always exclude liked profiles, exclude passed profiles if less than 30 days old
          if (data.action === 'like' || (now - data.timestamp) < thirtyDaysMs) {
            swipedToExclude.add(id);
          }
        }
        
        const filteredCachedDeck = cachedDeck.filter(item => {
          if (isAd(item)) return true; // Keep ads
          return !swipedToExclude.has(item.id);
        });
        
        if (filteredCachedDeck.length > 0) {
          // ⭐ INSTANT LOAD: Use filtered cached deck for immediate display
          setPotentialMatches(filteredCachedDeck);
          setCurrentIndex(0);
          setImageIndex(0);
          setIsLoading(false);
          setHasCompletedInitialFetch(true);

          // Refresh silently in background to apply new swipes / new users
          void fetchPotentialMatches({ background: true, cacheKey });
          return;
        }
        // If filtered cache is empty, fall through to fresh fetch
      }

      // Cold start - fetch fresh profiles
      await fetchPotentialMatches({ background: false, cacheKey });
    };

    // Start immediately without setTimeout
    initializeProfiles();
    fetchReverseUsage();
  }, [
    currentUser?.id,
    premiumActive,
    fetchPotentialMatches,
    fetchReverseUsage,
    persistSwipedIds,
    readDeckCache,
  ]); // Removed premiumResolved and subscriptionLoading - don't block on subscription state


  // Cleanup on unmount (minimal now that continuous loader is removed)
  useEffect(() => {
    return () => {
      // Cleanup any remaining global references
      try {
        if (typeof window !== 'undefined') {
          const win = window as WindowWithIntervals;
          if (win.continuousLoadingInterval) {
            clearInterval(win.continuousLoadingInterval);
            win.continuousLoadingInterval = null;
          }
        }
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, []);

  useEffect(() => {
    setImageIndex(0);
  }, [currentIndex, potentialMatches]);

  // Dynamic content height measurement
  useEffect(() => {
    const measureContentHeight = () => {
      if (contentRef.current && showMoreInfo) {
        // Wait a bit for content to render, then measure
        setTimeout(() => {
          if (contentRef.current) {
            const scrollHeight = contentRef.current.scrollHeight;
            const clientHeight = contentRef.current.clientHeight;
            
            // Calculate padding needed to make all content scrollable
            // If content is longer than container, add padding to ensure scroll access
            const paddingNeeded = scrollHeight > clientHeight 
              ? Math.max(60, scrollHeight - clientHeight + 40) // Extra padding for long content
              : 60; // Minimal padding for short content
            
            setContentHeight(paddingNeeded);
          }
        }, 100);
      } else {
        // Reset when collapsed
        setContentHeight(60);
      }
    };

    measureContentHeight();
    
    // Also measure when window resizes
    window.addEventListener('resize', measureContentHeight);
    return () => window.removeEventListener('resize', measureContentHeight);
  }, [showMoreInfo, currentIndex, potentialMatches]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    currentXRef.current = touch.clientX;
    currentYRef.current = touch.clientY;
    isDraggingRef.current = true;
    setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0 }));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const touch = e.touches[0];
    currentXRef.current = touch.clientX;
    currentYRef.current = touch.clientY;

    const deltaX = currentXRef.current - startXRef.current;
    const deltaY = Math.abs(currentYRef.current - startYRef.current);

    // Only show swipe feedback if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > deltaY) {
      // write latest delta and schedule an rAF update
      latestDeltaRef.current = deltaX;
      if (!rafScheduledRef.current) {
        rafScheduledRef.current = true;
        requestAnimationFrame(() => {
          const d = latestDeltaRef.current;
          setSwipeUI(prev => ({ ...prev, dragOffset: d, swipeDistance: Math.abs(d), swipeDirection: d > 0 ? 'right' : 'left' }));
          rafScheduledRef.current = false;
        });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setSwipeUI(prev => ({ ...prev, isDragging: false }));

    const changedTouch = e.changedTouches && e.changedTouches[0];
    const endX = changedTouch ? changedTouch.clientX : currentXRef.current;
    const endY = changedTouch ? changedTouch.clientY : currentYRef.current;

    const deltaX = endX - startXRef.current;
    const deltaY = Math.abs(endY - startYRef.current);
    const screenWidth = window.innerWidth;

    // Swipe threshold
    const SWIPE_RATIO = 0.35;
    const minSwipeDistance = screenWidth * SWIPE_RATIO;

    // Reset visual smear (flush any pending rAF)
    latestDeltaRef.current = 0;
    if (rafScheduledRef.current) rafScheduledRef.current = false;
    setSwipeUI(prev => ({ ...prev, dragOffset: 0, swipeDistance: 0 }));

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      // Trigger exit animation
      setExitDirection(deltaX > 0 ? 'right' : 'left');
      setExitingCard(true);
      setSwipeUI(prev => ({ ...prev, swipeDirection: null }));
      
      // Wait for animation to complete before executing action
      setTimeout(() => {
        if (deltaX > 0) {
          handleLike();
        } else {
          handlePass();
        }
        setExitingCard(false);
        setExitDirection(null);
      }, 400); // Animation duration
    } else {
      setSwipeUI(prev => ({ ...prev, swipeDirection: null }));
    }
  };

  // Mouse event handlers for swipe on desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    currentXRef.current = e.clientX;
    currentYRef.current = e.clientY;
    isDraggingRef.current = true;
    setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0 }));

    // Attach global mouse listeners to ensure we capture mouseup/move even if pointer leaves the element
    const onWindowMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      currentXRef.current = ev.clientX;
      currentYRef.current = ev.clientY;
      const deltaX = currentXRef.current - startXRef.current;
      const deltaY = Math.abs(currentYRef.current - startYRef.current);
      if (Math.abs(deltaX) > deltaY) {
        // rAF throttle visual updates
        latestDeltaRef.current = deltaX;
        if (!rafScheduledRef.current) {
          rafScheduledRef.current = true;
          requestAnimationFrame(() => {
            const d = latestDeltaRef.current;
            setSwipeUI(prev => ({ ...prev, dragOffset: d, swipeDistance: Math.abs(d), swipeDirection: d > 0 ? 'right' : 'left' }));
            rafScheduledRef.current = false;
          });
        }
        // Prevent default to avoid text selection during dragging
        ev.preventDefault();
      }
    };

    const onWindowMouseUp = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setSwipeUI(prev => ({ ...prev, isDragging: false }));
      // compute final deltas
      const deltaX = ev.clientX - startXRef.current;
      const deltaY = Math.abs(ev.clientY - startYRef.current);

      // Swipe threshold
      const SWIPE_MIN_DESKTOP = 80;
      const minSwipeDistance = SWIPE_MIN_DESKTOP;
      // Reset visual smear (flush any pending rAF)
      latestDeltaRef.current = 0;
      if (rafScheduledRef.current) rafScheduledRef.current = false;
      setSwipeUI(prev => ({ ...prev, dragOffset: 0, swipeDistance: 0, swipeDirection: null }));
      if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
        // Trigger exit animation
        setExitDirection(deltaX > 0 ? 'right' : 'left');
        setExitingCard(true);
        
        // Wait for animation to complete before executing action
        setTimeout(() => {
          if (deltaX > 0) handleLike(); else handlePass();
          setExitingCard(false);
          setExitDirection(null);
        }, 400); // Animation duration
      }
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  };
  
  // Note: mousemove/mouseup handling is wired globally from mouseDown to ensure robust behavior

  const handleImageAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent swipe action if dragging occurred
    if (Math.abs(swipeUI.dragOffset) > 10) return;

    if (currentImageAbortController) {
      currentImageAbortController.abort();
      currentImageAbortController = null;
    }

    // This function is mainly a compatibility shim - slide navigation lives inside MatchCard
  };

  // Function to load more matches when running low - optimized for 5 at a time
  const loadMoreMatches = useCallback(async () => {
    if (!currentUser?.id || isLoadingMore) return;
    
    try {
      setIsLoadingMore(true);
      
      // Get additional profiles (exclude current ones AND ones we've already seen)
      const currentIds = potentialMatches.map(match => match.id);
      // CRITICAL: Include locally swiped profiles, filtering out passed profiles older than 30 days
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const locallySwipedIds = uniqUuids(Array.from(locallySwipedProfileIds.current.entries())
        .filter(([_, data]) => {
          if (data.action === 'like') return true;
          return (now - data.timestamp) < thirtyDaysMs;
        })
        .map(([id, _]) => id));
      const excludedIds = uniqUuids([...currentIds, ...locallySwipedIds, currentUser.id]);
      
      // Get recently interacted users to exclude (likes, blocks, passes)
      const [
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses }
      ] = await Promise.all([
        supabase
          .from('likes')
          .select('liked_id')
          .eq('liker_id', currentUser.id),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`),
        supabase
          .from('passes')
          .select('passed_id, passed_at')
          .match({ passer_id: currentUser.id })
          .gte('passed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // 30 days - same as main fetch
      ]);

      const likedUserIds = uniqUuids(likedUsers?.map(like => like.liked_id) || []);
      const blockedUserIds = uniqUuids(blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || []);
      const hiddenPassedIds = uniqUuids(recentPasses?.map(p => p.passed_id) || []);
      const allExcludedIds = uniqUuids([...excludedIds, ...likedUserIds, ...blockedUserIds, ...hiddenPassedIds]);

      // IMPORTANT: Pull latest user prefs from DB so refills reflect premium country selections
      // even if `currentUser` props are stale.
      const { data: currentUserData } = await supabase
        .from('profiles')
        .select('max_distance, distance_preference, country_code, min_age, max_age, unlocked_countries, latitude, longitude')
        .eq('id', currentUser.id)
        .single();

      const currentUserSettings = currentUserData as unknown as Partial<CurrentUser> | null;

      const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at';

      // Enforce country rules early for speed + correctness
      const baseCountryCode = normalizeCountryCode(String(currentUserData?.country_code ?? currentUser.country_code ?? ''));

      // Use a single, reliable premium flag for refills.
      const premiumForFeed = premiumActive;
      
      // Get unlocked countries for premium users (robust to array/JSON/string shapes)
      const unlockedCountriesRaw = currentUserData?.unlocked_countries ?? currentUser.unlocked_countries;
      const unlockedCountries: string[] = premiumForFeed
        ? normalizeCountryCodeList(unlockedCountriesRaw, baseCountryCode)
        : [];
      
      const allowedCountryCodes = Array.from(
        new Set([
          ...(baseCountryCode ? [baseCountryCode] : []),
          ...unlockedCountries,
        ])
      ).map((c) => normalizeCountryCode(String(c || ''))).filter(Boolean);

      const hasUnlockedCountries = premiumForFeed && unlockedCountries.length > 0;

      // Build a unified pool: local(distance-filtered, local country only) + unlocked countries (no distance)
      const distanceMap: { [key: string]: number } = {};

      const userMaxDistanceRaw =
        currentUserData?.max_distance ??
        currentUserData?.distance_preference ??
        currentUser.max_distance ??
        currentUser.distance_preference ??
        50;
      const userMaxDistance = Number(userMaxDistanceRaw);
      const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;

      const locationMatches = await locationService.getLocationBasedMatches(currentUser.id, safeUserMaxDistance * 2);
      const locationProfileIds = uniqUuids(locationMatches
        .filter((m) => !baseCountryCode || normalizeCountryCode((m.country_code || '') as string) === baseCountryCode)
        .map((match) => {
          distanceMap[match.profile_id] = match.distance_km;
          return match.profile_id;
        }));

      const localProfiles = locationProfileIds.length
        ? await (async () => {
            let localQuery = supabase
              .from('profiles')
              .select(PROFILE_SELECT)
              .in('id', locationProfileIds);

            if (baseCountryCode) {
              localQuery = localQuery.eq('country_code', baseCountryCode);
            }

            if (allExcludedIds.length > 0) {
              localQuery = localQuery.not('id', 'in', `(${allExcludedIds.join(',')})`);
            }

            const { data: localData, error: localError } = await localQuery
              .in('gender', allowedGenders)
              .eq('account_status', 'active')
              .eq('is_admin', false)
              .eq('is_archived', false)
              .limit(100);

            if (localError) throw localError;
            return Array.isArray(localData) ? (localData as unknown as ProfileRow[]) : [];
          })()
        : [];

      // ⭐ PREMIUM FALLBACK: If distance-local is empty, fetch local country without distance constraint.
      let effectiveLocalProfiles: ProfileRow[] = localProfiles;
      if (premiumForFeed && baseCountryCode && effectiveLocalProfiles.length === 0) {
        try {
          let fallbackQuery = supabase
            .from('profiles')
            .select(PROFILE_SELECT)
            .eq('country_code', baseCountryCode)
            .eq('account_status', 'active')
            .eq('is_admin', false)
            .eq('is_archived', false)
            .in('gender', allowedGenders)
            .limit(80);

          if (allExcludedIds.length > 0) {
            fallbackQuery = fallbackQuery.not('id', 'in', `(${allExcludedIds.join(',')})`);
          }

          const { data: fallbackLocal, error: fallbackError } = await fallbackQuery;
          const fallbackRows: ProfileRow[] = Array.isArray(fallbackLocal)
            ? (fallbackLocal as unknown as ProfileRow[])
            : [];
          if (!fallbackError && fallbackRows.length > 0) {
            fallbackRows.forEach((p) => (distanceMap[p.id] ??= 999));
            effectiveLocalProfiles = fallbackRows;
          }
        } catch {
          // ignore
        }
      }

      const intlProfiles = hasUnlockedCountries
        ? await fetchUnlockedCountryProfiles({
            unlockedCountries,
            excludedIds: uniqUuids([...allExcludedIds, ...effectiveLocalProfiles.map(p => p.id)]),
            allowedGenders,
            distanceMap,
            limit: 100
          })
        : [];

      let activeProfiles: ProfileRow[] = [...effectiveLocalProfiles, ...intlProfiles];
      let usingArchivedFallback = false;

      // Reset archived fallback flag if we found active profiles
      if (activeProfiles.length > 0 && isArchivedFallback) {
        setIsArchivedFallback(false);
      }

      if (activeProfiles.length === 0) {
        let archivedQuery = supabase.from('profiles').select(PROFILE_SELECT);

        if (allExcludedIds.length > 0) {
          archivedQuery = archivedQuery.not('id', 'in', `(${allExcludedIds.join(',')})`);
        }

        if (premiumForFeed && allowedCountryCodes.length > 0) {
          archivedQuery = archivedQuery.in('country_code', allowedCountryCodes);
        } else if (baseCountryCode) {
          archivedQuery = archivedQuery.eq('country_code', baseCountryCode);
        }

        // Apply age filtering to archived profiles
        const userMinAge = currentUserData?.min_age ?? currentUser.min_age ?? 18;
        const userMaxAge = currentUserData?.max_age ?? currentUser.max_age ?? 99;
        archivedQuery = archivedQuery
          .gte('age', userMinAge)
          .lte('age', userMaxAge);

        // Apply distance filtering for local country (use currentUserData for location)
        const userLat = currentUserSettings?.latitude ?? currentUser.latitude;
        const userLon = currentUserSettings?.longitude ?? currentUser.longitude;
        if (baseCountryCode && userLat && userLon) {
          const maxDistanceKm = currentUserData?.max_distance ?? currentUser.max_distance ?? 50;
          const radiusInDegrees = maxDistanceKm / 111.32;

          archivedQuery = archivedQuery
            .gte('latitude', userLat - radiusInDegrees)
            .lte('latitude', userLat + radiusInDegrees)
            .gte('longitude', userLon - radiusInDegrees)
            .lte('longitude', userLon + radiusInDegrees);
        }

        const { data: archivedProfiles, error: archivedError } = await archivedQuery
          .eq('is_archived', true)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .in('gender', allowedGenders)
          .limit(50);

        if (!archivedError && archivedProfiles && archivedProfiles.length > 0) {
          activeProfiles = Array.isArray(archivedProfiles)
            ? (archivedProfiles as unknown as ProfileRow[])
            : [];
          usingArchivedFallback = true;
          if (!isArchivedFallback) {
            setIsArchivedFallback(true);
          }
        }
      }

      if (!premiumForFeed && activeProfiles.length === 0) {
        setNoMoreProfiles(true);
        return;
      }

      // Premium: only exhausted when BOTH local + intl are empty (after archived fallback attempt).
      if (premiumForFeed && effectiveLocalProfiles.length === 0 && intlProfiles.length === 0 && activeProfiles.length === 0) {
        setNoMoreProfiles(true);
        return;
      }

      let filteredProfiles: ProfileRow[] = activeProfiles;

      // Apply age filtering
      const userMinAge = currentUserData?.min_age ?? currentUser.min_age ?? 18;
      const userMaxAge = currentUserData?.max_age ?? currentUser.max_age ?? 99;
      filteredProfiles = filteredProfiles.filter(profile => {
        // Premium: keep profiles even if DOB is missing; only enforce range when DOB is present.
        if (!profile.date_of_birth) return true;
        const age = calculateAge(profile.date_of_birth);
        if (!Number.isFinite(age)) return true;
        return age >= userMinAge && age <= userMaxAge;
      });

      const profilesWithImages: PotentialMatch[] = filteredProfiles.map((profile) =>
        toPotentialMatch(profile, {
          images: [],
          distance: typeof distanceMap[profile.id] === 'number' ? distanceMap[profile.id] : 999,
        })
      );

      // Keep refill mixed across the selected countries too (prevents drift back to “mostly local”).
      const today = new Date().toISOString().split('T')[0];
      const refillSeed = `${currentUser.id}_refill_${today}_${Date.now()}`;

      const mixedRefill = mixByCountryRoundRobin(
        profilesWithImages.filter((p) => {
          const cc = normalizeCountryCode(p.country_code || '');
          return allowedCountryCodes.length === 0 ? true : allowedCountryCodes.includes(cc);
        }),
        allowedCountryCodes,
        refillSeed
      );

      // Keep the refill chunk small like before.
      const stratifiedProfiles = mixedRefill.slice(0, 15);
      
      // ⭐ DEDUPLICATION: Filter out profiles that are already in potentialMatches
      const existingProfileIds = new Set(potentialMatches.map(p => !isAd(p) ? p.id : null).filter(Boolean));
      const uniqueProfiles = stratifiedProfiles.filter(profile => !existingProfileIds.has(profile.id));

      // ⭐ PROACTIVE LIKED-ME BLENDING: Fetch and blend liked-me profiles during refill
      let profilesWithLikedMe = uniqueProfiles;
      const likedMeRows = await fetchLikedMeProfiles(
        currentUser.id,
        allExcludedIds,
        allowedGenders
      );
      
      if (likedMeRows.length > 0) {
        // Convert to PotentialMatch format
        const likedMeProfiles: PotentialMatch[] = likedMeRows.map(profile =>
          toPotentialMatch(profile, {
            images: [],
            distance: typeof distanceMap[profile.id] === 'number' ? distanceMap[profile.id] : 999,
          })
        );

        // Filter out any that are already in uniqueProfiles or potentialMatches
        const allExistingIds = new Set([...uniqueProfiles.map(p => p.id), ...existingProfileIds]);
        const uniqueLikedMe = likedMeProfiles.filter(p => !allExistingIds.has(p.id));

        // Apply age filtering to liked-me profiles
        const userMinAge = currentUserData?.min_age ?? currentUser.min_age ?? 18;
        const userMaxAge = currentUserData?.max_age ?? currentUser.max_age ?? 99;
        const ageFilteredLikedMe = uniqueLikedMe.filter(profile => {
          if (!profile.date_of_birth) return true;
          const age = calculateAge(profile.date_of_birth);
          if (!Number.isFinite(age)) return true;
          return age >= userMinAge && age <= userMaxAge;
        });

        // ⭐ P2: Apply global eligibility gate to liked-me profiles
        const eligibleLikedMe = ageFilteredLikedMe.filter(isEligibleProfile);

        // Blend liked-me profiles (every 3-4 profiles)
        if (eligibleLikedMe.length > 0) {
          profilesWithLikedMe = blendLikedMeProfiles(uniqueProfiles, eligibleLikedMe, currentUser.id);
        }
      }

      if (profilesWithLikedMe.length > 0) {
        setNoMoreProfiles(false);
        if (premiumTrulyEmptyAfterRetry) setPremiumTrulyEmptyAfterRetry(false);
      }
      
      // Add new UNIQUE profiles to the END of the array (with ads injected)
      const newProfilesWithAds = injectAds(profilesWithLikedMe);
      setPotentialMatches(prev => mergeDecksWithoutProfileDupes(prev, newProfilesWithAds, locallySwipedProfileIds.current));
      
      // ⭐ PRELOADING: Handled by centralized useEffect watching head profile ID
      // Batch fetch languages for new profiles
      const newProfileIds = profilesWithImages.map(p => p.id).filter(Boolean);
      if (newProfileIds.length > 0) {
        batchFetchLanguages(newProfileIds);
      }
    } catch (error) {
      // ignore load more errors; UI will retry via refill effect
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    currentUser,
    allowedGenders,
    potentialMatches,
    isLoadingMore,
    injectAds,
    fetchUnlockedCountryProfiles,
    batchFetchLanguages,
    premiumActive,
    isArchivedFallback,
    premiumTrulyEmptyAfterRetry,
    fetchLikedMeProfiles,
    blendLikedMeProfiles,
    isEligibleProfile,
  ]);

  // ⭐ AUTO-REFILL ON SWIPE - Load more profiles as user swipes
  // Triggers when 15 REAL profiles remaining (excludes ads) - SINGLE SOURCE OF TRUTH for reloads
  useEffect(() => {
    // Count only real profiles (exclude ads) for accurate reload timing
    const remainingReal = potentialMatches
      .slice(currentIndex)
      .filter(m => !isAd(m))
      .length;

    const REFILL_THRESHOLD = 15; // Aggressive refill - starts early to keep buffer full

    // Only load more if we haven't exhausted all profiles
    // NOTE: Must allow remainingReal === 0, otherwise premium can appear “stuck” once the local pool is exhausted.
    if (!noMoreProfiles && !isLoadingMore && hasCompletedInitialFetch && remainingReal <= REFILL_THRESHOLD) {
      loadMoreMatches();
    }
  }, [potentialMatches, currentIndex, noMoreProfiles, isLoadingMore, hasCompletedInitialFetch, loadMoreMatches]);

  // ⭐ SWIPE FATIGUE RESCUE: Inject active profiles after long no-match streaks
  // This prevents user fatigue and increases retention (Tinder-style behavior)
  useEffect(() => {
    if (noMatchStreak < FATIGUE_RESCUE_THRESHOLD) return;
    if (potentialMatches.length === 0) return;
    if (isArchivedFallback) return;

    const now = Date.now();
    if (now - lastRescueRef.current < RESCUE_COOLDOWN_MS) return;
    
    // Get rescue candidates from remaining profiles
    const remainingProfiles = potentialMatches
      .slice(currentIndex)
      .filter((p): p is PotentialMatch => !isAd(p));
    
    if (remainingProfiles.length < 5) return; // Not enough profiles to rescue from
    
    // Get active rescue candidates
    const todaySeed = todayStr();
    const likedMeSet = new Set(usersWhoLikedMeIds);
    const rescueCandidates = getSwipeFatigueRescueCandidates(
      remainingProfiles,
      3, // Inject up to 3 rescue profiles
      `${currentUser?.id || 'anon'}_${todaySeed}_rescue`,
      likedMeSet
    );
    
    if (rescueCandidates.length === 0) return;
    
    // ⭐ P2: Apply eligibility gate to rescue candidates
    const eligibleRescueCandidates = rescueCandidates.filter(isEligibleProfile);
    if (eligibleRescueCandidates.length === 0) return;
    
    // ⭐ ANDROID OPTIMIZATION: Skip rescue profile injection on Android for faster performance
    if (isAndroidPlatform()) return;
    
    // Inject rescue profiles near the front of the queue (positions 2-5)
    setPotentialMatches(prev => {
      const currentProfiles = prev.slice(currentIndex);
      const rescueIds = new Set(eligibleRescueCandidates.map(p => p.id));
      
      // Remove rescue profiles from their current positions
      const withoutRescue = currentProfiles.filter(p => !isAd(p) ? !rescueIds.has(p.id) : true);
      
      // Inject at positions 2, 4, 6 (skip first profile which is current)
      const injected = injectRescueProfiles(withoutRescue, eligibleRescueCandidates, {
        maxPercent: 0.15,
        spacing: [2, 4],
        startPosition: 1,
        seed: `${currentUser?.id || 'anon'}_${todaySeed}_rescue_spacing`
      });
      
      return [...prev.slice(0, currentIndex), ...injected];
    });
    
    lastRescueRef.current = now;
    // Reset streak after rescue
    setNoMatchStreak(0);
  }, [noMatchStreak, potentialMatches, currentIndex, currentUser?.id, usersWhoLikedMeIds, RESCUE_COOLDOWN_MS, isArchivedFallback, isEligibleProfile]);
  
  // ⭐ CENTRALIZED PRELOAD SYSTEM (Single Source of Truth)
  // Watches head profile ID and preloads head + next 1-2 profiles when it changes
  // Cancels previous preload operations to avoid duplicate work
  useEffect(() => {
    if (!hasCompletedInitialFetch || potentialMatches.length === 0) return;

    // Get head profile (skip ads)
    const realMatches = potentialMatches.filter(m => !isAd(m)) as PotentialMatch[];
    const headProfile = realMatches[0];
    if (!headProfile?.id) return;

    // Extract head ID for dependency array (avoid complex expression)
    const headProfileId = headProfile.id;

    // Abort any in-flight preload from previous head
    if (preloadAbortControllerRef.current) {
      preloadAbortControllerRef.current.abort();
      preloadAbortControllerRef.current = null;
    }

    // Create new abort controller for this batch
    const abortController = new AbortController();
    preloadAbortControllerRef.current = abortController;

    // Preload head + next 1-2 profiles (3 total max)
    const profilesToPreload = realMatches.slice(0, 3);
    
    // Filter out already loaded profiles
    const needsPreload = profilesToPreload.filter(
      p => !userImagesRef.current[p.id]?.length && !requestedImageProfileIds.current.has(p.id)
    );

    if (needsPreload.length === 0) return;

    const idsToLoad = needsPreload.map(p => p.id);
    idsToLoad.forEach(id => requestedImageProfileIds.current.add(id));

    // Load images in background
    (async () => {
      try {
        if (abortController.signal.aborted) return;

        type UserImageRow = { user_id: string; image_url: string; image_order: number | null };
        const { data: imageRows } = await supabase
          .from('user_images')
          .select('user_id, image_url, image_order')
          .in('user_id', idsToLoad)
          .eq('is_approved', true)
          .order('user_id', { ascending: true })
          .order('image_order', { ascending: true })
          .returns<UserImageRow[]>();

        if (abortController.signal.aborted) return;

        const byUser: Record<string, string[]> = {};
        const allowedUserIds = new Set(idsToLoad);
        for (const row of imageRows || []) {
          if (!row?.user_id || !row?.image_url) continue;
          if (!allowedUserIds.has(row.user_id)) continue;
          if (!byUser[row.user_id]) byUser[row.user_id] = [];
          byUser[row.user_id].push(row.image_url);
        }

        const userImageUpdates: Record<string, string[]> = {};
        const usersWithImages: PotentialMatch[] = [];

        for (const user of needsPreload) {
          const imageUrls = byUser[user.id] || [];
          if (imageUrls.length === 0) {
            requestedImageProfileIds.current.delete(user.id);
            continue;
          }
          userImageUpdates[user.id] = imageUrls;
          usersWithImages.push(user);
        }

        if (abortController.signal.aborted) return;

        if (Object.keys(userImageUpdates).length > 0) {
          setUserImages(prev => ({ ...prev, ...userImageUpdates }));
        }

        // iOS/Web: blob preloading; Android: skip
        const isAndroid = isAndroidPlatform();
        if (!isAndroid) {
          for (const user of usersWithImages) {
            if (abortController.signal.aborted) break;
            
            const imageUrls = userImageUpdates[user.id] || [];
            const blobMap: { [url: string]: string } = {};
            await Promise.all(
              imageUrls.map(async (originalUrl) => {
                try {
                  if (abortController.signal.aborted) return;
                  const blobUrl = await preloadImageToBlob(originalUrl);
                  blobMap[originalUrl] = blobUrl;
                } catch {
                  blobMap[originalUrl] = originalUrl;
                }
              })
            );
            
            if (!abortController.signal.aborted) {
              setPreloadedBlobImages(prev => ({ ...prev, [user.id]: blobMap }));
            }
            requestedImageProfileIds.current.delete(user.id);
          }
        } else {
          usersWithImages.forEach(user => {
            requestedImageProfileIds.current.delete(user.id);
          });
        }
      } catch (error) {
        // Ignore preload errors
      } finally {
        idsToLoad.forEach(id => requestedImageProfileIds.current.delete(id));
      }
    })();

    // Cleanup on unmount or when head changes
    return () => {
      abortController.abort();
    };
  }, [potentialMatches, hasCompletedInitialFetch]);

  // Optimistic UI: move to next card instantly, then process like in background
  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    swipeDebug('handleLike: start', {
      currentIndex,
      deck: summarizeDeck(potentialMatches, 8),
      current: isAd(currentMatch) ? `ad:${currentMatch.id}` : currentMatch.id,
      pending: pendingSwipesRef.current,
      todaySwipeCount,
      swipeLimit: premiumActive ? 200 : 16,
      parentProfileCompletion,
      computedProfileCompletion,
      effectiveProfileCompletion,
    });

    // Skip likes on ads - just move to next
    if (isAd(currentMatch)) {
      swipeDebug('handleLike: current is ad -> moveToNext', { adId: currentMatch.id });
      moveToNext(currentMatch);
      return;
    }


    // Check profile completion restriction (70% after 5 swipes)
    if (effectiveProfileCompletion < 70 && todaySwipeCount >= 5) {
      swipeDebug('handleLike: blocked by profile completion', {
        parentProfileCompletion,
        computedProfileCompletion,
        effectiveProfileCompletion,
        todaySwipeCount,
      });
      toast({
        title: t('discover.errors.profileCompletionRequired'),
        description: t('discover.errors.profileCompletionMessage', { percentage: 70 - effectiveProfileCompletion }),
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: 16 swipes, Premium users: 200 swipes
    const swipeLimit = premiumActive ? 200 : 16;
    
    
    if (todaySwipeCount >= swipeLimit) {
      setIsOutOfSwipes(true);
      toast({
        title: t('discover.errors.dailyLimitReached'),
        description: isPremium 
          ? t('discover.errors.premiumDailyLimitMessage')
          : t('discover.errors.dailyLimitMessage'),
        variant: 'destructive'
      });
      return;
    }

    // Optimistic path: advance UI immediately, then persist the action in background.
    const prevMatch = currentMatch;

    // CRITICAL: Add to local exclusion list immediately with 'like' action (permanent)
    locallySwipedProfileIds.current.set(prevMatch.id, { action: 'like', timestamp: Date.now() });
    persistSwipedIds(); // ⭐ Persist to sessionStorage

    // Remove from cache to prevent re-showing
    setUserImages(prev => {
      const updated = { ...prev };
      delete updated[prevMatch.id];
      return updated;
    });
    setPreloadedBlobImages(prev => {
      const updated = { ...prev };
      delete updated[prevMatch.id];
      return updated;
    });

    // Increment local/pending counters immediately for a snappy feel
    pendingSwipesRef.current += 1;
    setTodaySwipeCount(prev => prev + 1);

    // Immediately advance the UI
    moveToNext(prevMatch);

    // Background job: persist usage and like, then show match animation if appropriate.
    enqueue(async () => {
      try {
        // First, increment usage on server (guard against limits)
        const usageResult = await checkUsageLimit('swipe');
        if (!usageResult.success) {
          // Do NOT rollback the deck. If server denies, user likely hit the real limit on another device
          // (or the RPC is temporarily inconsistent). Rolling back causes the "snap back" bug.
          setIsOutOfSwipes(true);
          
          toast({ 
            title: t('discover.errors.dailyLimitReached'), 
            description: usageResult.message || t('discover.errors.dailyLimitMessage'), 
            variant: 'destructive' 
          });
          return;
        }

        // Then attempt the batched RPC to record the like and detect mutual
        const rpcName = 'like_and_usage_batched';
        const rpc = (supabase as unknown as {
          rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc;
        const { data: rpcData, error: rpcError } = await rpc(rpcName, {
          liker_id_param: currentUser.id,
          liked_id_param: prevMatch.id,
          premium_param: !!isPremium,
        });

        if (rpcError) {
          // Fallback: attempt to insert like and check mutual
          try {
            const { data: existingLike } = await supabase
              .from('likes')
              .select('id')
              .match({ liker_id: currentUser.id, liked_id: prevMatch.id })
              .maybeSingle();

            if (!existingLike) {
              await supabase.from('likes').insert({ liker_id: currentUser.id, liked_id: prevMatch.id });
              
              // Check how many likes the target user has received and send notification
              try {
                const { count, error: countError } = await supabase
                  .from('likes')
                  .select('id', { count: 'exact', head: true })
                  .eq('liked_id', prevMatch.id);
                
                if (!countError) {
                  const likeCount = typeof count === 'number' ? count : 0;
                  
                  // Send notification on every like
                  await sendMultipleLikesNotification(prevMatch.id, likeCount);
                }
              } catch (countError) {
                // ignore like count errors
              }
            }

            const { data: mutualLike } = await supabase
              .from('likes')
              .select('id')
              .match({ liker_id: prevMatch.id, liked_id: currentUser.id })
              .maybeSingle();

            if (mutualLike) {
              setMatchedUser(prevMatch);
              setShowMatchAnimation(true);
              
              // Check if rating dialog should be shown (on 2nd match)
              if (incrementMatchCount()) {
                setTimeout(() => setShowRatingDialog(true), 2000); // Show after match animation
              }
              
              // Clear chat cache to force refresh when user opens ChatPage
              if (typeof window !== 'undefined') {
                const win = window as WindowWithIntervals;
                win.chatMatchesCache?.delete(currentUser.id);
              }
              
              // Trigger global event to notify ChatPage of new match
              if (typeof window !== 'undefined') {
                const event = new CustomEvent('newMatch', { detail: { userId: currentUser.id } });
                window.dispatchEvent(event);
              }
              
              // Send match notification to the other user
              try {
                const matchedUserName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
                await sendMatchNotification(matchedUserName, prevMatch.id);
              } catch (notificationError) {
                // ignore notification errors
              }
            }
          } catch (fallbackErr) {
            // ✅ DO NOT rollback on network/RPC failures.
            // Keep UX moving; we'll retry sync later.
            swipeDebug('handleLike: persist failed (fallback), not rolling back', { err: fallbackErr });
            return;
          }
        } else {
          // RPC succeeded — if server reports a match, show animation
          const hasMatch =
            !!rpcData &&
            typeof rpcData === 'object' &&
            Boolean((rpcData as Record<string, unknown>).match);
          if (hasMatch) {
            // ⭐ SWIPE FATIGUE RESCUE: Reset streak on match
            setNoMatchStreak(0);
            
            setMatchedUser(prevMatch);
            setShowMatchAnimation(true);
            
            // Check if rating dialog should be shown (on 2nd match)
            if (incrementMatchCount()) {
              setTimeout(() => setShowRatingDialog(true), 2000); // Show after match animation
            }
            
            // Clear chat cache to force refresh when user opens ChatPage
            if (typeof window !== 'undefined') {
              const win = window as WindowWithIntervals;
              win.chatMatchesCache?.delete(currentUser.id);
            }
            
            // Trigger global event to notify ChatPage of new match
            if (typeof window !== 'undefined') {
              const event = new CustomEvent('newMatch', { detail: { userId: currentUser.id } });
              window.dispatchEvent(event);
            }
            
            // Send match notification to the other user
            try {
              const matchedUserName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
              await sendMatchNotification(matchedUserName, prevMatch.id);
            } catch (notificationError) {
              // ignore notification errors
            }
          } else {
            // ⭐ SWIPE FATIGUE RESCUE: Increment streak on no-match like
            setNoMatchStreak(prev => prev + 1);
            
            // Like was recorded but no match - send like notification
            try {
              const { count, error: countError } = await supabase
                .from('likes')
                .select('id', { count: 'exact', head: true })
                .eq('liked_id', prevMatch.id);
              
              if (!countError) {
                const likeCount = typeof count === 'number' ? count : 0;
                
                // Send notification on every like
                await sendMultipleLikesNotification(prevMatch.id, likeCount);
              }
            } catch (countError) {
              // ignore like count errors
            }
          }
        }
      } catch (jobErr) {
        // ✅ DO NOT rollback on unexpected network/RPC failures.
        // Keep UX moving; we'll retry sync later.
        swipeDebug('handleLike: persist failed (job), not rolling back', { err: jobErr });
      } finally {
        pendingSwipesRef.current = Math.max(0, pendingSwipesRef.current - 1);
      }
    });
  };

  // Optimistic UI: move to next card instantly, then process pass in background
  // Function to execute pass after user confirms (used when "they liked you" popup is shown)
  const executePassLogic = async (matchToPass: PotentialMatch) => {
    swipeDebug('executePassLogic: start', {
      currentIndex,
      deck: summarizeDeck(potentialMatches, 8),
      matchToPassId: matchToPass?.id,
      pending: pendingSwipesRef.current,
      todaySwipeCount,
      swipeLimit: premiumActive ? 200 : 16,
      parentProfileCompletion,
      computedProfileCompletion,
      effectiveProfileCompletion,
    });

    // Check profile completion restriction (70% after 5 swipes)
    if (effectiveProfileCompletion < 70 && todaySwipeCount >= 5) {
      swipeDebug('executePassLogic: blocked by profile completion', {
        parentProfileCompletion,
        computedProfileCompletion,
        effectiveProfileCompletion,
        todaySwipeCount,
      });
      toast({
        title: t('discover.errors.profileCompletionRequired'),
        description: t('discover.errors.profileCompletionMessage', { percentage: 70 - effectiveProfileCompletion }),
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: 16 swipes, Premium users: 200 swipes
    const swipeLimit = premiumActive ? 200 : 16;
    
    
    if (todaySwipeCount >= swipeLimit) {
      setIsOutOfSwipes(true);
      toast({
        title: t('discover.errors.dailyLimitReached'),
        description: isPremium 
          ? t('discover.errors.premiumDailyLimitMessage')
          : t('discover.errors.dailyLimitMessage'),
        variant: 'destructive'
      });
      return;
    }

    // Optimistic path for pass: add to passed list locally, advance UI, persist in background and rollback on error
    // ✅ Use the passed parameter, not undefined currentMatch
    const prevMatch = matchToPass;

    // CRITICAL: Add to local exclusion list immediately with 'pass' action (expires after 30 days)
    locallySwipedProfileIds.current.set(prevMatch.id, { action: 'pass', timestamp: Date.now() });
    persistSwipedIds(); // ⭐ Persist to sessionStorage

    // Remove from cache to prevent re-showing
    setUserImages(prev => {
      const updated = { ...prev };
      delete updated[prevMatch.id];
      return updated;
    });
    setPreloadedBlobImages(prev => {
      const updated = { ...prev };
      delete updated[prevMatch.id];
      return updated;
    });

    // Optimistically add to passed list and increment counters
    setPassedUsers(prev => [{ user_id: prevMatch.id, passed_at: new Date() }, ...prev.slice(0, 9)]);
    pendingSwipesRef.current += 1;
    setTodaySwipeCount(prev => prev + 1);

    // Immediately advance UI
    moveToNext(prevMatch);

    // Background job to persist the pass and usage increment
    enqueue(async () => {
      try {
        const usageResult = await checkUsageLimit('swipe');
        if (!usageResult.success) {
          // Do NOT rollback the deck; mark out-of-swipes and stop.
          setIsOutOfSwipes(true);
          
          toast({ 
            title: t('discover.errors.dailyLimitReached'), 
            description: usageResult.message || t('discover.errors.dailyLimitMessage'), 
            variant: 'destructive' 
          });
          return;
        }

        const rpcName = 'pass_and_usage_batched';
        const rpc = (supabase as unknown as {
          rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc;
        const { error: rpcError } = await rpc(rpcName, {
          passer_id_param: currentUser.id,
          passed_id_param: prevMatch.id,
          premium_param: !!isPremium,
        });

        if (rpcError) {
          // Fallback: insert pass directly
          try {
            const { data: existingPass } = await supabase
              .from('passes')
              .select('id')
              .match({ passer_id: currentUser.id, passed_id: prevMatch.id })
              .maybeSingle();

            if (!existingPass) {
              await supabase.from('passes').insert({ passer_id: currentUser.id, passed_id: prevMatch.id });
            }
          } catch (fallbackErr) {
            // ✅ DO NOT rollback on network/RPC failures.
            // Keep UX moving; we'll retry sync later.
            swipeDebug('executePassLogic: persist failed (fallback), not rolling back', { err: fallbackErr });
            return;
          }
        }
      } catch (jobErr) {
        // ✅ DO NOT rollback on unexpected network/RPC failures.
        // Keep UX moving; we'll retry sync later.
        swipeDebug('executePassLogic: persist failed (job), not rolling back', { err: jobErr });
      } finally {
        pendingSwipesRef.current = Math.max(0, pendingSwipesRef.current - 1);
      }
    });
  };

  const handlePass = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Skip passes on ads - just move to next
    if (isAd(currentMatch)) {
      moveToNext(currentMatch);
      return;
    }

    // ⭐ Store snapshot for safe reverse-dislike reinsertion
    if (!isAd(currentMatch)) {
      lastPassedProfileRef.current = currentMatch;
    }
    
    // ⭐ NEW: Show notification if this user already liked you (but still allow the pass)
    if (usersWhoLikedMeIds.includes(currentMatch.id)) {
      toast({
        title: `💕 ${currentMatch.first_name} likes you!`,
        description: "They've already liked your profile",
        duration: 3000,
      });
    }

    // ⭐ SWIPE FATIGUE RESCUE: Increment streak on pass (passes never result in matches)
    // Ads should never affect fatigue.
    setNoMatchStreak(prev => prev + 1);
    
    // Execute pass normally
    await executePassLogic(currentMatch);
  };

  const handleReverse = async () => {
    if (passedUsers.length === 0) return;

    // Check reverse dislike limit for free users
    if (!isPremium) {
      const usageResult = await checkUsageLimit('reverse_dislike');
      if (!usageResult.success) {
        toast({
          title: 'Daily Limit Reached',
          description: usageResult.message + ' Upgrade to Premium for unlimited reverse dislikes.',
          variant: 'destructive'
        });
        return;
      }
    }

    const lastPassedUser = passedUsers[0];
    
    try {
      // Actually delete the pass record from the database
      const { error: deleteError } = await supabase
        .from('passes')
        .delete()
        .match({ 
          passer_id: currentUser.id, 
          passed_id: lastPassedUser.user_id 
        });

      if (deleteError) {
        toast({
          title: t('common.error'),
          description: t('discover.errors.reverseFailed'),
          variant: 'destructive'
        });
        return;
      }

      // ⭐ P2 FIX: Use snapshot for safe reinsertion with eligibility check
      let profileToReinsert: PotentialMatch | null = null;
      
      // First, try to use the stored snapshot
      if (lastPassedProfileRef.current && lastPassedProfileRef.current.id === lastPassedUser.user_id) {
        profileToReinsert = lastPassedProfileRef.current;
      } else {
        // Fallback: check if still in current deck
        const inDeck = potentialMatches.find(match => !isAd(match) && match.id === lastPassedUser.user_id) as PotentialMatch | undefined;
        if (inDeck) {
          profileToReinsert = inDeck;
        } else {
          // Last resort: fetch from database
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, is_verified')
            .eq('id', lastPassedUser.user_id)
            .eq('account_status', 'active')
            .eq('is_admin', false)
            .eq('is_archived', false)
            .single();

          if (!profileError && profileData) {
            profileToReinsert = toPotentialMatch(profileData as unknown as ProfileRow, { images: [] });
          }
        }
      }
      
      // Reinsert with deduplication and eligibility check
      if (profileToReinsert && isEligibleProfile(profileToReinsert)) {
        setPotentialMatches(prev => {
          // Deduplicate: remove if already present
          const filtered = prev.filter(p => isAd(p) || p.id !== profileToReinsert!.id);
          // Insert at current index
          const newMatches = [...filtered];
          newMatches.splice(currentIndex, 0, profileToReinsert!);
          return newMatches;
        });
      }

      // Remove from passed users list
      setPassedUsers(prev => prev.slice(1));
      
      // ⭐ CRITICAL: Remove from locally swiped IDs so profile can reappear
      locallySwipedProfileIds.current.delete(lastPassedUser.user_id);
      persistSwipedIds(); // Persist to sessionStorage

      // Restore deterministic daily order so this profile doesn't get appended/reordered on reload.
      try {
        const baseCountryCode = normalizeCountryCode(String(currentUser?.country_code ?? ''));
        const unlockedCountries = normalizeCountryCodeList(currentUser?.unlocked_countries, baseCountryCode);
        const userMaxDistanceRaw = currentUser?.max_distance ?? currentUser?.distance_preference ?? 50;
        const userMaxDistance = Number(userMaxDistanceRaw);
        const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
        const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
        const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
        const savedOrder = localStorage.getItem(savedOrderKey);
        if (savedOrder) {
          const parsed: unknown = JSON.parse(savedOrder);
          const obj = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : null;
          const orderIds = Array.isArray(obj?.order)
            ? obj!.order.filter((id): id is string => typeof id === 'string')
            : (Array.isArray(parsed)
                ? parsed.filter((id): id is string => typeof id === 'string')
                : []);
          if (!orderIds.includes(lastPassedUser.user_id)) {
            const next = { premium: !!isPremium, countries: unlockedCountries, order: [lastPassedUser.user_id, ...orderIds] };
            localStorage.setItem(savedOrderKey, JSON.stringify(next));
          }
        }
      } catch {
        // ignore localStorage errors
      }

      // Update reverse usage count if not premium
      if (!isPremium) {
        setReverseUsageToday(prev => prev + 1);
      }

    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('discover.errors.reverseFailed'),
        variant: 'destructive'
      });
    }
  };

  // Advance the deck after a swipe.
  // Accept the exact swiped item so we can remove by ID (not by a potentially-stale index).
  const moveToNext = (swiped?: MatchOrAd) => {
    swipeDebug('moveToNext: called', {
      currentIndex,
      swiped: swiped ? (isAd(swiped) ? `ad:${swiped.id}` : swiped.id) : null,
      deck: summarizeDeck(potentialMatches, 8),
    });
    
    // ⭐ ANDROID OPTIMIZATION: Abort any pending image loads for previous profile
    if (currentImageAbortController) {
      currentImageAbortController.abort();
      currentImageAbortController = null;
    }

    // ⭐ CRITICAL: Remove by ID (profiles) / matching ad ID (ads)
    setPotentialMatches(prev => {
      if (prev.length === 0) return prev;

      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      const fallback = prev[0];
      const swipedItem = swiped ?? fallback;
      if (!swipedItem) return prev;

      // Ads: remove the first matching ad by id (fallback to removing the head)
      if (isAd(swipedItem)) {
        const idx = prev.findIndex((p) => isAd(p) && p.id === swipedItem.id);
        swipeDebug('moveToNext: removing ad', { adId: swipedItem.id, idx });
        const newMatches = idx >= 0 ? prev.filter((_, i) => i !== idx) : prev.slice(1);
        // ⭐ Persist where the user is in the feed so refresh can resume from exact position
        try {
          const nextProfile = newMatches.find((m) => !isAd(m)) as PotentialMatch | undefined;
          if (nextProfile?.id && currentUser?.id) {
            localStorage.setItem(`driplove_last_profile_${currentUser.id}`, nextProfile.id);
            localStorage.setItem(`driplove_last_profile_time_${currentUser.id}`, String(Date.now()));
          }
        } catch {
          // ignore localStorage errors
        }
        return newMatches;
      }

      const swipedProfileId = swipedItem.id;
      const newMatches = prev.filter((item) => {
        if (isAd(item)) return true;

        // Remove ALL instances of the swiped profile
        if (item.id === swipedProfileId) return false;

        // Also remove anything already locally swiped (likes always; passes for 30 days)
        const swipedData = locallySwipedProfileIds.current.get(item.id);
        if (swipedData) {
          if (swipedData.action === 'like' || (now - swipedData.timestamp) < thirtyDaysMs) {
            return false;
          }
        }
        return true;
      });

      swipeDebug('moveToNext: deck mutated', {
        removedProfileId: swipedProfileId,
        occurrencesBefore: countProfileIdInDeck(prev, swipedProfileId),
        occurrencesAfter: countProfileIdInDeck(newMatches, swipedProfileId),
        before: summarizeDeck(prev, 10),
        after: summarizeDeck(newMatches, 10),
        locallySwipedSize: locallySwipedProfileIds.current.size,
      });

      // ⭐ Persist where the user is in the feed so refresh can resume from exact position
      // Store the next *profile* id (not an ad id) since restore logic keys off profile IDs.
      try {
        const nextProfile = newMatches.find((m) => !isAd(m)) as PotentialMatch | undefined;
        if (nextProfile?.id && currentUser?.id) {
          localStorage.setItem(`driplove_last_profile_${currentUser.id}`, nextProfile.id);
          localStorage.setItem(`driplove_last_profile_time_${currentUser.id}`, String(Date.now()));
        }
      } catch {
        // ignore localStorage errors
      }
      
      // ⭐ Update saved profile order in localStorage (remove swiped profile)
      try {
        const baseCountryCode = normalizeCountryCode(String(currentUser?.country_code ?? ''));
        const unlockedCountries = normalizeCountryCodeList(currentUser?.unlocked_countries, baseCountryCode);
        const userMaxDistanceRaw = currentUser?.max_distance ?? currentUser?.distance_preference ?? 50;
        const userMaxDistance = Number(userMaxDistanceRaw);
        const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
        const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
        const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
        
        const savedOrder = localStorage.getItem(savedOrderKey);
        if (savedOrder) {
          const parsed: unknown = JSON.parse(savedOrder);
          const obj = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : null;
          const orderIds = Array.isArray(obj?.order)
            ? obj!.order.filter((id): id is string => typeof id === 'string')
            : (Array.isArray(parsed)
                ? parsed.filter((id): id is string => typeof id === 'string')
                : []);
          const updatedOrder = orderIds.filter((id) => id !== swipedProfileId);
          const next = { premium: !!isPremium, countries: unlockedCountries, order: updatedOrder };
          localStorage.setItem(savedOrderKey, JSON.stringify(next));
        }
      } catch (error) {
        // Ignore localStorage errors
      }
      
      // ⭐ REMOVED: Auto-reload logic moved to useEffect (single source of truth)
      // The useEffect will detect when remainingReal <= 10 and trigger loadMoreMatches
      // No need for duplicate reload logic here - keeps it simple and predictable
      
      // ⭐ PRELOADING: Removed - handled by centralized useEffect watching head profile ID
      // This eliminates duplicate fetches and race conditions
      
      // ⭐ REACTIVE LIKE-BACK INJECTION (Minimal Fallback - Pure Function):
      // Handles real-time likes that arrive AFTER feed was built
      // Reduced rate (10%) since proactive blending already handles most cases
      // This is atomic (inside same transaction) to avoid stale closure issues
      let finalMatches = newMatches;
      
      // Get injection candidate from hook (if available)
      const injectionCandidate = onLikeBackSwipe(newMatches);
      if (injectionCandidate) {
        const { profile: injectedProfile, position } = injectionCandidate;
        
        // Don't inject if profile is already in queue or ineligible
        const existingIds = new Set(finalMatches.filter(p => !isAd(p)).map(p => p.id));
        if (!existingIds.has(injectedProfile.id) && isEligibleProfile(injectedProfile)) {
          // Insert at calculated position (clamped to valid range)
          const insertPos = Math.min(position, finalMatches.length);
          const updated = [...finalMatches];
          updated.splice(insertPos, 0, injectedProfile);
          finalMatches = updated;
          
          swipeDebug('likeBackInjection: reactive fallback injected', {
            profileId: injectedProfile.id,
            name: `${injectedProfile.first_name} ${injectedProfile.last_name}`,
            position: insertPos,
            newDeckLen: updated.length,
          });
        }
      }
      
      return finalMatches;
    });
    
    // ⭐ RULE 5: Hard-cut instant card removal - always stay at index 0
    setCurrentIndex(0);
    
    // ⭐ REFILL: Handled by centralized useEffect (single source of truth)
    // No manual trigger needed - effect watches remainingReal and auto-triggers
  };

  // Debug: log whenever the “current” card identity changes after a deck update
  useEffect(() => {
    if (!isSwipeDebugEnabled()) return;
    const m = potentialMatches[currentIndex];
    swipeDebug('render: current card snapshot', {
      currentIndex,
      deckLen: potentialMatches.length,
      current: m ? (isAd(m) ? `ad:${m.id}` : m.id) : null,
      head: summarizeDeck(potentialMatches, 6).head,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, potentialMatches.length]);

  const handleStartChat = (userId: string) => {
    setShowMatchAnimation(false);
    if (onNavigateToChat) {
      onNavigateToChat(userId);
    }
  };

  const handleCloseMatch = () => {
    setShowMatchAnimation(false);
    setMatchedUser(null);
    // Profile already moved when like was processed
  };

  if (showMatchAnimation && matchedUser) {
    return (
      <MatchAnimation
        currentUserName={currentUser?.first_name || 'You'}
        matchedUserName={`${matchedUser.first_name} ${matchedUser.last_name}`}
        matchedUserImage={matchedUser.images?.[0]}
        matchedUserId={matchedUser.id}
        onClose={handleCloseMatch}
        onStartChat={handleStartChat}
      />
    );
  }

  if (showPremiumUpgrade) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} preselectedPlan="premium" />
      </div>
    );
  }

  // Removed loading indicator - everything loads in background

  if (isOutOfSwipes) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">{t('discover.outOfSwipes.title')}</h2>
            <p className="text-gray-600 mb-4">
              {isPremium 
                ? t('discover.outOfSwipes.premiumUserMessage')
                : t('discover.outOfSwipes.freeUserMessage')
              }
            </p>
            <div className="space-y-3">
            {!isPremium && (
              <Button 
                onClick={() => setShowPremiumUpgrade(true)} 
                className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
              >
                <Crown className="w-4 h-4 mr-2" />
                {t('discover.outOfSwipes.upgradeButton')}
              </Button>
            )}
              <Button 
                onClick={() => {
                  // Just close the modal - don't fetch new profiles
                  // This keeps the user on the same profile they tried to swipe
                  setIsOutOfSwipes(false);
                }} 
                variant="outline" 
                className="w-full"
              >
                {t('discover.outOfSwipes.okButton')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentMatch = potentialMatches[currentIndex];
  const nextMatch = potentialMatches[currentIndex + 1];
  
  // Use preloaded images for current and next card
  const currentMatchImages = currentMatch && !isAd(currentMatch) ? (userImages[currentMatch.id] || []) : [];
  const nextMatchImages = nextMatch && !isAd(nextMatch) ? (userImages[nextMatch.id] || []) : [];

  // Handle ads separately
  if (currentMatch && isAd(currentMatch)) {
    const getAdCardTransform = () => {
      if (exitingCard && exitDirection) {
        const screenWidth = window.innerWidth;
        const exitX = exitDirection === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5;
        const exitY = window.innerHeight * 0.3; // Fall down effect
        const rotation = exitDirection === 'right' ? 30 : -30;
        return `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg)`;
      }
      if (swipeUI.isDragging) {
        return `translate3d(${swipeUI.dragOffset}px, 0, 0) rotate(${swipeUI.dragOffset * 0.08}deg)`;
      }
      return '';
    };
    
    const adCardTransform = getAdCardTransform();
    
    return (
      <div className="h-full w-full fixed left-0 overflow-hidden"
           style={{ 
             top: '70px', // Align with header end (matches pt-[50px] in MainApp)
             bottom: '70px', // Reserve space for bottom navigation (approximately 70px)
             height: 'auto', // Let top and bottom constraints define the height
             touchAction: 'pan-y',
             overscrollBehavior: 'contain',
             userSelect: 'none',
             WebkitUserSelect: 'none',
             WebkitTouchCallout: 'none'
           }}>
        <div className="h-full w-full relative z-10 flex flex-col"
             style={{
               transform: adCardTransform,
               transition: exitingCard 
                 ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' // Smooth exit with slight bounce
                 : swipeUI.isDragging 
                   ? 'none' 
                   : 'transform 0.2s ease-out',
               willChange: 'transform',
               boxShadow: swipeUI.isDragging ? '0 6px 18px rgba(0,0,0,0.18)' : '0 2px 8px rgba(0,0,0,0.08)'
             }}
             onTouchStart={handleTouchStart}
             onTouchMove={handleTouchMove}
             onTouchEnd={handleTouchEnd}
             onMouseDown={handleMouseDown}>
          <AdCard ad={currentMatch} onSwipe={moveToNext} />
          <LazyAdinkraBar userCountry={currentUser?.country} />
          <SwipeButtons
            onReverse={handleReverse}
            canReverse={false}
            isPremium={isPremium}
          />
        </div>
      </div>
    );
  }

  // Show loading state ONLY while initial fetch is in progress AND we have no profiles
  if (!hasCompletedInitialFetch && potentialMatches.length === 0 && isLoading) {
    return (
      <>
        <style>
          {`
            @keyframes float {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(-12px);
              }
            }
            .float-animation {
              animation: float 1.8s ease-in-out infinite;
            }
          `}
        </style>
        <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
          <div className="flex flex-col items-center">
            <div className="mb-4 float-animation">
              <img
                src="/driplove-logo.webp"
                loading="lazy"
                decoding="async" 
                alt="DripLove" 
                className="w-20 h-20"
              />
            </div>
            <p className="text-gray-600">{t('discover.findingMatches')}</p>
          </div>
        </div>
      </>
    );
  }

  // When the deck is empty after initial fetch completed
  if (potentialMatches.length === 0 && hasCompletedInitialFetch) {
    // Still fetching more - show loading
    if ((isLoading || isLoadingMore) && !noMoreProfiles) {
      return (
        <>
          <style>
            {`
              @keyframes float {
                0%, 100% {
                  transform: translateY(0px);
                }
                50% {
                  transform: translateY(-12px);
                }
              }
              .float-animation {
                animation: float 1.8s ease-in-out infinite;
              }
            `}
          </style>
          <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
            <div className="flex flex-col items-center">
              <div className="mb-4 float-animation">
                <img
                  src="/driplove-logo.webp"
                  loading="lazy"
                  decoding="async"
                  alt="DripLove"
                  className="w-20 h-20"
                />
              </div>
              <p className="text-gray-600">{t('discover.findingMatches')}</p>
            </div>
          </div>
        </>
      );
    }

    // Truly out of profiles - show empty state
    if (noMoreProfiles) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-8 text-center">
              <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold mb-2">{t('discover.noMoreProfiles')}</h2>
              <p className="text-gray-600 mb-4">{t('discover.noProfilesDescription')}</p>
              <Button
                onClick={() => {
                  setNoMoreProfiles(false);
                  fetchPotentialMatches();
                }}
                className="w-full"
              >
                {t('discover.refresh')}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  // Calculate swipe overlay opacity and transform
  const swipeOpacity = Math.min(swipeUI.swipeDistance / 100, 0.8);

  // Simple card transform for smooth dragging - use translate3d for GPU acceleration
  const cardTransform = (() => {
    if (exitingCard && exitDirection) {
      const screenWidth = window.innerWidth;
      const exitX = exitDirection === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5;
      const exitY = window.innerHeight * 0.3;
      const rotation = exitDirection === 'right' ? 30 : -30;
      return `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg)`;
    }
    if (swipeUI.isDragging) {
      return `translate3d(${swipeUI.dragOffset}px, 0, 0) rotate(${swipeUI.dragOffset * 0.08}deg)`;
    }
    return '';
  })();



  return (
    <>
      {/* Mobile browser viewport fix styles */}
      <style>{`
        /* Fix for mobile browser viewport height issues - only on actual mobile devices */
        @media screen and (max-width: 768px) and (hover: none) and (pointer: coarse) {
          .discover-container {
            /* Use dynamic viewport height for mobile browsers */
            height: 100dvh !important;
            min-height: 100svh !important;
            max-height: 100lvh !important;
          }
          
          .discover-image-area {
            /* Ensure image area doesn't get stuck at fixed heights on mobile */
            min-height: 45vh !important;
            max-height: 65vh !important;
          }
          
          .discover-info-area {
            /* Ensure info area is always visible but don't override expansion behavior */
            min-height: 25vh !important;
          }
          
          /* Specifically target mobile Safari - but preserve expansion functionality */
          .discover-info-area:not(.expanded) {
            max-height: 45vh !important;
          }
        }
        
        /* Additional mobile Safari specific fix */
        @media screen and (max-width: 768px) and (hover: none) and (pointer: coarse) {
          @supports (-webkit-touch-callout: none) {
            .discover-container {
              height: -webkit-fill-available !important;
            }
          }
        }
      `}</style>
      
      <div className="discover-container h-full w-full fixed left-0 overflow-hidden"
           style={{ 
             top: '60px', // Reduced from 65px to eliminate gap
             height: 'calc(100vh - 110px)', // Adjusted to match new top value
             // Mobile browser viewport fix
             minHeight: 'calc(100vh - 110px)',
             touchAction: 'pan-y', // allow vertical scrolling, prevent horizontal scroll-from-browser during horizontal swipes
             overscrollBehavior: 'contain',
             userSelect: 'none',
             WebkitUserSelect: 'none',
             WebkitTouchCallout: 'none'
           }}>
      {/* --- Swipe Guide Popup for New Users --- */}
      {showSwipeGuide && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.12)', cursor: 'pointer' }}
          onClick={() => {
            setShowSwipeGuide(false);
            localStorage.setItem('driplove_swipe_guide_shown', 'true');
          }}
        >
          <style>{`
            @keyframes fingerSwipeLeft {
              0% { transform: translateX(0) scale(1); opacity: 1; }
              25% { transform: translateX(-40px) scale(1.1); opacity: 0.9; }
              50% { transform: translateX(-20px) scale(1); opacity: 1; }
              75% { transform: translateX(0) scale(0.95); opacity: 0.8; }
              100% { transform: translateX(0) scale(1); opacity: 1; }
            }
            @keyframes fingerSwipeRight {
              0% { transform: translateX(0) scale(1); opacity: 1; }
              25% { transform: translateX(40px) scale(1.1); opacity: 0.9; }
              50% { transform: translateX(20px) scale(1); opacity: 1; }
              75% { transform: translateX(0) scale(0.95); opacity: 0.8; }
              100% { transform: translateX(0) scale(1); opacity: 1; }
            }
            @keyframes pulseGlow {
              0% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.4); }
              70% { box-shadow: 0 0 0 10px rgba(236, 72, 153, 0); }
              100% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
            }
            .finger-left {
              animation: fingerSwipeLeft 2s ease-in-out infinite;
              font-size: 2.5rem;
              display: block;
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            }
            .finger-right {
              animation: fingerSwipeRight 2s ease-in-out infinite;
              font-size: 2.5rem;
              display: block;
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            }
            .swipe-card {
              animation: pulseGlow 2s infinite;
            }
          `}</style>
          <div className="swipe-card bg-gradient-to-br from-white to-pink-50 rounded-3xl px-8 py-8 flex flex-col items-center shadow-2xl border border-pink-100" style={{ maxWidth: 360, opacity: 0.97 }}>
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">{t('discover.swipeGuide.title')}</h3>
            <div className="flex flex-row gap-12 mb-4">
              {/* Swipe Left */}
              <div className="flex flex-col items-center">
                <div className="bg-red-50 rounded-full p-3 mb-2 border-2 border-red-200">
                  <span className="finger-left" role="img" aria-label="finger left">👆</span>
                </div>
                <div className="text-xl mb-1" style={{ color: '#ef4444' }}>← ← ←</div>
                <span className="text-sm font-semibold text-red-600">{t('discover.swipeGuide.nope')}</span>
                <span className="text-xs text-gray-500 mt-1">{t('discover.swipeGuide.swipeLeft')}</span>
              </div>
              {/* Swipe Right */}
              <div className="flex flex-col items-center">
                <div className="bg-green-50 rounded-full p-3 mb-2 border-2 border-green-200">
                  <span className="finger-right" role="img" aria-label="finger right">👆</span>
                </div>
                <div className="text-xl mb-1" style={{ color: '#10b981' }}>→ → →</div>
                <span className="text-sm font-semibold text-green-600">{t('discover.swipeGuide.like')}</span>
                <span className="text-xs text-gray-500 mt-1">{t('discover.swipeGuide.swipeRight')}</span>
              </div>
            </div>
            <p className="text-xs text-gray-600 text-center mt-2">{t('discover.swipeGuide.tapToClose')}</p>
          </div>
        </div>
      )}
      
  <div className="flex-1 relative overflow-hidden" style={{ 
    height: '100%', 
    minHeight: 'calc(100vh - 100px)', 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'flex-end', 
    paddingBottom: 0 
  }}>
        {/* ...existing code... */}
        {nextMatch && (
          <DominantColorImageBg
            imageUrl={nextMatchImages[0] ? getOptimizedUrl(nextMatchImages[0]) : undefined}
          >
            {/* ...existing code for overlays, etc... */}
            {nextMatchImages.length > 0 && !isAd(nextMatch) ? (
              <img
                src={(() => {
                  // ⭐ Use blob URL for instant loading if available
                  const originalUrl = nextMatchImages[0];
                  const blobUrl = preloadedBlobImages[nextMatch.id]?.[originalUrl];
                  return (blobUrl && blobUrl.startsWith('blob:')) ? blobUrl : getOptimizedUrl(originalUrl);
                })()}
                alt={`${nextMatch.first_name}'s photo`}
                className="w-full h-full object-contain rounded-2xl md:rounded-3xl"
                style={{ borderRadius: '1.25rem', position: 'relative', zIndex: 1 }}
                draggable={false}
                loading="eager"
              />
            ) : nextMatch && !isAd(nextMatch) ? (
              <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
                <span className="text-6xl font-bold text-gray-700">
                  {nextMatch.first_name?.[0]}{nextMatch.last_name?.[0]}
                </span>
              </div>
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
          </DominantColorImageBg>
        )}

        {/* ...existing code... */}
        <div
          className="h-full w-full relative z-10 flex flex-col"
          style={{
            transform: cardTransform,
            transition: exitingCard 
              ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' // Smooth exit with slight bounce
              : swipeUI.isDragging 
                ? 'none' 
                : 'transform 0.2s ease-out', // Faster snap-back
            willChange: 'transform',
            boxShadow: swipeUI.isDragging ? '0 6px 18px rgba(0,0,0,0.18)' : '0 2px 8px rgba(0,0,0,0.08)'
          }}
        >
          {/* Image area - flexible height that fills remaining space */}
          <div
            className="discover-image-area flex-1 cursor-pointer select-none relative transition-all duration-300 overflow-hidden"
            style={{
              // Use flexible height calculation that works better on mobile browsers
              minHeight: showMoreInfo ? 'max(40vh, 300px)' : 'max(50vh, 350px)',
              maxHeight: showMoreInfo ? '60vh' : '70vh'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onClick={handleImageAreaClick}
          >
            {/* ...existing code... */}
            {swipeUI.isDragging && swipeUI.swipeDirection && (
              <>
                {/* Like Overlay - Right Swipe */}
                {swipeUI.swipeDirection === 'right' && (
                  <div 
                    className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                    style={{ 
                      background: `linear-gradient(135deg, rgba(34, 197, 94, ${swipeOpacity * 0.7}), rgba(74, 222, 128, ${swipeOpacity * 0.5}))`,
                      transition: 'none'
                    }}
                  >
                    <div 
                      className="bg-green-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl transform"
                      style={{ 
                        scale: Math.min(0.8 + (swipeOpacity * 0.4), 1.2),
                        transition: 'none'
                      }}
                    >
                      <Heart 
                        className="w-12 h-12 text-white fill-current" 
                        style={{ 
                          filter: `drop-shadow(0 4px 8px rgba(0,0,0,0.3))`,
                          transform: `rotate(${swipeUI.swipeDistance * 0.1}deg)`
                        }}
                      />
                    </div>
                    <div 
                      className="absolute bottom-32 bg-green-500/95 backdrop-blur-sm px-8 py-3 rounded-full shadow-xl"
                      style={{ 
                        opacity: Math.min(swipeOpacity + 0.2, 1),
                        transform: `translateY(${-swipeUI.swipeDistance * 0.1}px)`,
                        transition: 'none'
                      }}
                    >
                      <span className="text-white font-bold text-2xl tracking-wider">{t('discover.likeOverlay')}</span>
                    </div>
                  </div>
                )}

                {/* Pass Overlay - Left Swipe */}
                {swipeUI.swipeDirection === 'left' && (
                  <div 
                    className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                    style={{ 
                      background: `linear-gradient(135deg, rgba(239, 68, 68, ${swipeOpacity * 0.7}), rgba(248, 113, 113, ${swipeOpacity * 0.5}))`,
                      transition: 'none'
                    }}
                  >
                    <div 
                      className="bg-red-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl transform"
                      style={{ 
                        scale: Math.min(0.8 + (swipeOpacity * 0.4), 1.2),
                        transition: 'none'
                      }}
                    >
                      <X 
                        className="w-12 h-12 text-white" 
                        style={{ 
                          filter: `drop-shadow(0 4px 8px rgba(0,0,0,0.3))`,
                          transform: `rotate(${-swipeUI.swipeDistance * 0.1}deg)`
                        }}
                      />
                    </div>
                    <div 
                      className="absolute bottom-32 bg-red-500/95 backdrop-blur-sm px-8 py-3 rounded-full shadow-xl"
                      style={{ 
                        opacity: Math.min(swipeOpacity + 0.2, 1),
                        transform: `translateY(${-swipeUI.swipeDistance * 0.1}px)`,
                        transition: 'none'
                      }}
                    >
                      <span className="text-white font-bold text-2xl tracking-wider">{t('discover.nopeOverlay')}</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* Render MatchCard for image/swipe area */}
            {currentMatch && !isAd(currentMatch) && (
              <MatchCard
                match={currentMatch}
                imageIndex={imageIndex}
                showMoreInfo={showMoreInfo}
                isPremium={isPremium}
                userImages={currentMatchImages}
                preloadedBlobImages={preloadedBlobImages[currentMatch.id]} // ⭐ Instant image rendering
                preferredLanguageName={userLanguages[currentMatch.id]} // ⭐ No DB call needed
                currentUserLatitude={currentUser.latitude}
                currentUserLongitude={currentUser.longitude}
                onImageClick={() => handleImageAreaClick({} as React.MouseEvent<HTMLDivElement>)}
                onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
                onImageIndexChange={() => {
                  // ⭐ ANDROID OPTIMIZATION: Abort pending loads when user flips through images
                  if (currentImageAbortController) {
                    currentImageAbortController.abort();
                    currentImageAbortController = null;
                  }
                }}
                calculateAge={calculateAge}
                calculateDistance={calculateDistance}
                swipeDirection={swipeUI.swipeDirection}
                swipeDistance={swipeUI.swipeDistance}
                isVerified={!!currentMatch.is_verified}
                isSwipeAreaOnly={true} // Render only swipeable image area
                isDetailsAreaOnly={false}
                getOptimizedUrl={getOptimizedUrl}
                preCalculatedDistance={userDistances[currentMatch.id]}
              />
            )}
          </div>
          
          {/* AdinkraBar - between image and info sections */}
          <LazyAdinkraBar userCountry={currentUser?.country} />

          {/* Info section - dynamic height that fits content exactly */}
          <div className={`discover-info-area bg-white transition-all duration-300 flex-shrink-0 -mt-0.1 ${
            showMoreInfo ? 'expanded' : 'overflow-hidden'
          }`}>
            <div 
              ref={contentRef}
              className={`w-full ${showMoreInfo ? 'overflow-y-scroll px-1' : 'overflow-hidden'}`} 
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                scrollBehavior: 'smooth',
                // Restore fixed heights for collapsed/expanded states
                maxHeight: showMoreInfo ? 'min(45vh, 400px)' : '230px', // Fixed max height when collapsed
                minHeight: showMoreInfo ? 'min(20vh, 200px)' : 'auto',
                paddingBottom: showMoreInfo 
                  ? `calc(${
                      isIOSPlatform() 
                        ? (vh < 700 ? '190px' : '180px')
                        : (vh < 700 ? '190px' : '180px')
                    } + env(safe-area-inset-bottom, 0px))` 
                  : '0px'
              }}
            >
            {/* Render MatchCard details area */}
            {currentMatch && !isAd(currentMatch) && (
              <MatchCard
                match={currentMatch}
                imageIndex={imageIndex}
                showMoreInfo={showMoreInfo}
                isPremium={isPremium}
                userImages={currentMatchImages}
                preloadedBlobImages={preloadedBlobImages[currentMatch.id]}
                preferredLanguageName={userLanguages[currentMatch.id]}
                currentUserLatitude={currentUser.latitude}
                currentUserLongitude={currentUser.longitude}
                onImageClick={() => handleImageAreaClick({} as React.MouseEvent<HTMLDivElement>)}
                onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
                calculateAge={calculateAge}
                calculateDistance={calculateDistance}
                swipeDirection={swipeUI.swipeDirection}
                swipeDistance={swipeUI.swipeDistance}
                isVerified={!!currentMatch.is_verified}
                isSwipeAreaOnly={false}
                isDetailsAreaOnly={true} // Render only details/info area
                getOptimizedUrl={getOptimizedUrl}
                preCalculatedDistance={userDistances[currentMatch.id]}
              />
            )}
            </div>
          </div>
        </div>
        {/* Loading more indicator */}
  {/* Loading more indicator removed for professional background loading */}
        {/* ...existing code... */}
        <SwipeButtons
          onReverse={handleReverse}
          canReverse={isPremium ? true : passedUsers.length > 0}
          reversesLeft={isPremium ? undefined : Math.max(0, 2 - reverseUsageToday)}
          isPremium={isPremium}
        />
      </div>
      </div>
      
      {/* Rating Dialog - Shows on 2nd match, then every 3 weeks */}
      <RatingDialog 
        show={showRatingDialog}
        onClose={() => setShowRatingDialog(false)}
        onRatingComplete={() => setShowRatingDialog(false)}
      />
    </>
  );
}

export default React.memo(DiscoverPage);

// Use shared IAP actions
import { buyMonthly, restorePurchases } from '../iap';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';

// ⭐ Import platform utilities from shared module
import { getPlatformSafe, getPlatformSync, isAndroidPlatform, isIOSPlatform } from '@/utils/platformUtils';

// ⭐ Import image cache utilities from shared module
import { preloadImageToBlob, globalImageCache, failedImages, cleanupOldBlobUrls } from '@/utils/imageCache';

// ⭐ Import discover cache utilities from shared module
import { discoverCache, DISCOVER_CACHE_DURATION, DISCOVER_CACHE_MAX_ENTRIES, trimDiscoverCacheIfNeeded, calculateAge, createDeterministicShuffle } from '@/utils/discoverCache';

// ⭐ Import stratified sampling for fair profile distribution
import { stratifiedSample, getStratifiedBatches } from '@/utils/stratifiedSampling';

// ⭐ Import activity-based visibility weighting (Tinder-style)
import { applyActivityWeighting, getSwipeFatigueRescueCandidates, injectRescueProfiles } from '@/utils/activityWeighting';

// ⭐ Import background component
import DominantColorImageBg from './discover/DominantColorImageBg';

// ⭐ Lazy load AdinkraBar for performance
const AdinkraBar = lazy(() => import('./discover/AdinkraBar'));

// Fallback for AdinkraBar while loading
const AdinkraBarFallback = () => (
  <div className="w-full h-9 bg-gradient-to-r from-blue-500 via-yellow-400 to-blue-500" />
);

// ⭐ Wrapped lazy AdinkraBar with suspense
const LazyAdinkraBar = memo(({ userCountry }: { userCountry?: string }) => (
  <Suspense fallback={<AdinkraBarFallback />}>
    <AdinkraBar userCountry={userCountry} />
  </Suspense>
));
LazyAdinkraBar.displayName = 'LazyAdinkraBar';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Crown, Calendar, MapPin, ChevronDown, ChevronUp, Briefcase, GraduationCap, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSubscription } from '@/hooks/useSubscription';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { calculateDistance } from '@/constants/locationData';
import { checkAndTriggerRefill } from '@/utils/performanceOptimizer';
import { debounce, createPagination, userDataCache } from '@/utils/performanceOptimizer';
import { locationService } from '@/services/locationService';
import { calculateProfileCompletion, getTodaySwipeCount, checkSwipeRestrictions } from '@/utils/profileCompletion';
import { enqueue } from '@/lib/queue';
import { getLanguageName } from '@/utils/languageNames';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import MatchCard from './discover/MatchCard';
import SwipeButtons from './discover/SwipeButtons';
import ProfileCompletionModal from './ProfileCompletionModal';
import SwipeCounter from './SwipeCounter';
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

  // PRESERVE 2-letter ISO codes already used in DB (NG, GH, US, ZA, KE, etc.)
  // Only map ISO3 and full names to ISO2 for compatibility.
  if (cleaned.length === 2) return cleaned;

  // ISO3 → ISO2 mapping
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

  // Country names → ISO2 (best-effort)
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

// Round-robin across an explicit set of countries (e.g. GH, NG, KE, US), skipping empty buckets.
// Guarantees exposure across *selected* countries rather than “local vs intl”.
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

    // Rotate through countries
    const currentCountry = orderedCountries[countryIndex % orderedCountries.length];
    const list = buckets.get(currentCountry);
    
    if (list && list.length > 0) {
      // Decide chunk size: 1, 2, or 3 profiles (weighted toward 1-2)
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
  // Bump version when feed ordering logic changes so old saved orders don't lock users into bad mixing
  // v7: Fixed Premium mixing - removed stratified sampling that was destroying country rotation
  // v8: Invalidate stale saved orders that could preserve single-country sequences
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

    const cleaned = trimmed.replace(/[{}\[\]"]+/g, '');
    const parts = cleaned.split(',').map((s) => normalizeCountryCode(s)).filter(Boolean);
    return normalize(parts);
  }

  return [];
};

// Seeded random for deterministic mixing
const seededRandom = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  let state = Math.abs(hash);
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

// ⭐ ANDROID OPTIMIZATION: Global abort controller for canceling image loads on swipe
let currentImageAbortController: AbortController | null = null;

interface AdData {
  id: string;
  image_url: string;
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

const DiscoverPage = ({ currentUser, onNavigateToChat, isPremium, profileCompletion: parentProfileCompletion }: DiscoverPageProps) => {
  const { t } = useTranslation();
  
  // 🔍 DEBUG: Log premium status on mount
  useEffect(() => {
  }, [isPremium, currentUser?.id]);
  
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
      // @ts-ignore
      const p = window.CdvPurchase?.store?.get('com.driplove.dating.premium.monthlysub1');
      // More robust offer detection (handles plugin variations)
      const offer = (p as any)?.getOffer?.() ?? (p as any)?.offers?.[0];
      setCanBuy(!!offer);
    }
    // @ts-ignore
    const store = window.CdvPurchase?.store;
    if (store && store.when) {
      store.when().productUpdated(onProductUpdated);
    }
    onProductUpdated();
    // No off/unsubscribe in plugin
  }, []);
  // ...existing code...

  // Example: Add Buy/Restore buttons to your UI (place where appropriate)
  // <button onClick={buyMonthly} disabled={!canBuy}>Buy Premium</button>
  // <button onClick={restorePurchases}>Restore Purchases</button>
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
  const [profileCompletion, setProfileCompletion] = useState(0);
  const [profileMissingFields, setProfileMissingFields] = useState<string[]>([]);
  const [userProfileImages, setUserProfileImages] = useState<any[]>([]);
  const [showProfileCompletionModal, setShowProfileCompletionModal] = useState(false);
  const [todaySwipeCount, setTodaySwipeCount] = useState(0);
  const [isArchivedFallback, setIsArchivedFallback] = useState(false); // Two-phase: true when showing archived profiles
  
  // ⭐ SWIPE FATIGUE RESCUE: Track consecutive non-match swipes (Tinder-style)
  // After 8+ non-match swipes, inject active profiles to prevent user fatigue
  const [noMatchStreak, setNoMatchStreak] = useState(0);
  const FATIGUE_RESCUE_THRESHOLD = 8; // Trigger rescue after 8 non-match swipes

  // ⭐ RESCUE COOLDOWN: Prevent rescue spam in edge cases (fast swipes, ads, refills)
  const lastRescueRef = useRef<number>(0);
  const RESCUE_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
  
  // Dynamic content height management
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  // PHASE 0: Required refs (must exist before any fetching logic)
  const initializedUserRef = useRef<string | null>(null);
  const lastPremiumActiveRef = useRef<boolean | null>(null);
  const fetchSequenceRef = useRef(0);
  const backgroundFetchingRef = useRef(false);
  // Suppress immediate full fetch when we have fresh cached data and the component remounts
  const suppressFetchRef = useRef(false);
  // Track optimistic/pending swipes to avoid local overshoot while background RPCs complete
  const pendingSwipesRef = useRef(0);
  // Track locally swiped profile IDs with action type and timestamp
  // ⭐ Structure: { userId: { action: 'like' | 'pass', timestamp: number } }
  // ⭐ Only 'pass' actions can reappear after 6 days, 'like' actions are permanent
  const getStoredSwipedIds = (): Map<string, { action: 'like' | 'pass', timestamp: number }> => {
    try {
      const stored = sessionStorage.getItem(`swiped_profiles_${currentUser?.id}`);
      if (!stored) return new Map();
      
      const data = JSON.parse(stored);
      return new Map(Object.entries(data));
    } catch {
      return new Map();
    }
  };
  const locallySwipedProfileIds = useRef<Map<string, { action: 'like' | 'pass', timestamp: number }>>(getStoredSwipedIds());
  
  // Persist swiped IDs to sessionStorage whenever they change
  const persistSwipedIds = useCallback(() => {
    try {
      const obj = Object.fromEntries(locallySwipedProfileIds.current);
      sessionStorage.setItem(`swiped_profiles_${currentUser?.id}`, JSON.stringify(obj));
    } catch (error) {
      // ignore sessionStorage persistence errors
    }
  }, [currentUser?.id]);
  
  const { toast } = useToast();
  const { sendMatchNotification, sendMultipleLikesNotification } = usePushNotifications(currentUser?.id);
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
    const fetchAds = async () => {
      try {
        const { data, error } = await supabase
          .from('ads')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter ads by COUNTRY only.
        // Show ad if target_countries is empty OR includes user's country.
        const filteredAds = (data || []).filter((ad: any) => {
          const targetCountries = normalizeCountryCodeList(ad.target_countries);
          // If no target countries specified, show to everyone
          if (targetCountries.length === 0) return true;
          // Otherwise, only show if user's country is in the list
          return Boolean(userCountryCode) && targetCountries.includes(userCountryCode);
        });

        // Mark ads with isAd property
        const adsWithMarker: AdData[] = filteredAds.map((ad: any) => ({
          ...ad,
          isAd: true as const
        }));

        setAds(adsWithMarker);
        setAdsLoaded(true);
      } catch (error) {
        // Silently handle ad fetch errors
        setAdsLoaded(true); // Still allow profiles to load
      }
    };

    fetchAds();
  }, [userCountryCode]);

  // Ensure currentIndex stays valid when potentialMatches array changes
  useEffect(() => {
    if (potentialMatches.length > 0 && currentIndex >= potentialMatches.length) {
      setCurrentIndex(Math.max(0, potentialMatches.length - 1));
    }
  }, [potentialMatches.length, currentIndex]);

  // Helper function to check if current match is an ad
  const isAd = (match: PotentialMatch | AdData): match is AdData => {
    return (match as AdData).isAd === true;
  };

  // Dedupe helpers (prevent profile duplicates without blocking ad repeats)
  const dedupeById = <T extends { id: string }>(arr: T[]) => {
    const map = new Map<string, T>();
    for (const x of arr) map.set(x.id, x);
    return Array.from(map.values());
  };

  const mergeDecksWithoutProfileDupes = (prev: MatchOrAd[], incoming: MatchOrAd[]) => {
    const seenProfileIds = new Set<string>();
    for (const item of prev) {
      if (!isAd(item)) seenProfileIds.add(item.id);
    }

    const result: MatchOrAd[] = [...prev];
    for (const item of incoming) {
      if (isAd(item)) {
        result.push(item);
        continue;
      }
      if (seenProfileIds.has(item.id)) continue;
      seenProfileIds.add(item.id);
      result.push(item);
    }

    return result;
  };

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
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('premium') === 'activated') {
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
  }, []); // Empty dependency array - only run once on mount

  // Fetch current reverse usage for today
  // Fetch user profile and calculate completion on mount
  useEffect(() => {
    const fetchUserProfileCompletion = async () => {
      if (!currentUser?.id) return;

      try {
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
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


        // Calculate profile completion
        const completionResult = calculateProfileCompletion(profile, userImages);
        
        
        setProfileCompletion(completionResult.completion);
        setProfileMissingFields(completionResult.missingFields);

        // Get today's swipe count
        const swipeCount = await getTodaySwipeCount(currentUser.id);
        setTodaySwipeCount(swipeCount);


        // ❌ REMOVED: Don't block on mount - only check when user actually swipes
        // The swipe handlers (handleLike/handlePass) will check limits when needed
      } catch (error) {
        // ignore profile completion fetch error
      }
    };

    fetchUserProfileCompletion();
  }, [currentUser?.id, premiumActive]);

  const fetchReverseUsage = useCallback(async () => {
    if (!currentUser?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('user_usage')
        .select('reverse_dislikes_used')
        .eq('user_id', currentUser.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        return;
      }

      setReverseUsageToday(data?.reverse_dislikes_used || 0);
    } catch (error) {
      // ignore reverse usage fetch error
    }
  }, [currentUser?.id]);
  const [lastShuffleTime, setLastShuffleTime] = useState<number>(0);
  // Use refs for raw pointer coordinates to avoid async state race conditions
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const currentYRef = useRef(0);
  // Batch swipe-related UI into one object to reduce re-renders
  const [swipeUI, setSwipeUI] = useState<{
    isDragging: boolean;
    swipeDirection: 'left' | 'right' | null;
    swipeDistance: number;
    dragOffset: number;
  }>({ isDragging: false, swipeDirection: null, swipeDistance: 0, dragOffset: 0 });

  // Use refs for dragging state to avoid stale closures in window listeners
  const isDraggingRef = useRef(false);
  const [exitingCard, setExitingCard] = useState(false);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);
  // RAF throttling refs: store latest delta and whether an rAF is scheduled
  const latestDeltaRef = useRef(0);
  const rafScheduledRef = useRef(false);

  // Memoize expensive calculations
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

  const shouldReshuffle = useCallback(() => {
    const now = Date.now(); 
    const tenMinutes = 10 * 60 * 1000; // 10 minutes in milliseconds
    return now - lastShuffleTime > tenMinutes;
  }, [lastShuffleTime]);

  // Verification is precomputed in DB: profiles.is_verified

  // ⭐ ANDROID OPTIMIZATION: Load ALL images for ONE profile with abort support
  // ⭐ TINDER-STYLE: Load all images for ONE profile with instant abort support
  const loadAllImagesForProfile = useCallback(async (profileId: string) => {
    // ⭐ RULE 3: Cancel previous load if user swiped
    // NOTE: Supabase queries can't be aborted; this only prevents stale state updates
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

  // Background fetching function
  const fetchPotentialMatchesInBackground = useCallback(async () => {
    if (!currentUser?.id || backgroundFetchingRef.current) return;
    backgroundFetchingRef.current = true;

    try {
      // Phase 9: Background fetch is read-only (must not set React state)
      await fetchPotentialMatchesData(currentUser.id, allowedGenders);
    } catch (error) {
      // Silently handle background fetch errors
    } finally {
      backgroundFetchingRef.current = false;
      // Allow full fetches again after background refresh completes
      suppressFetchRef.current = false;
    }
  }, [currentUser?.id, allowedGenders]);

  // ⭐ HELPER: Fetch unlocked country profiles (consolidated to avoid duplication)
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
    const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at';

    // IMPORTANT: Fetch per-country to avoid a single country dominating the SQL LIMIT
    // (which can make the feed look like only US+one country even though others are unlocked).
    const countryCodes = Array.from(new Set(unlockedCountries.map(normalizeCountryCode).filter(Boolean)));
    if (countryCodes.length === 0) return [];

    // Premium only unlocks up to ~3 countries; keep it small and fair per country.
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
        return data || [];
      })
    );

    // Flatten + dedupe
    const flat = results.flat();
    const unique = Array.from(new Map(flat.map((p: any) => [p.id, p])).values());

    // Normalize fetched profile country codes to avoid mismatches (e.g. NGA→NG, KEN→KE).
    unique.forEach((p: any) => {
      p.country_code = normalizeCountryCode(p.country_code || '');
    });

    // Mark all unlocked country profiles with distance = 999 (only if not already set)
    unique.forEach((p: any) => (distanceMap[p.id] ??= 999));

    // Hard cap to avoid unbounded growth
    return unique.slice(0, Math.max(limit, perCountryLimit * countryCodes.length));
  }, []);

  // Shared data fetching logic - optimized for speed
  const fetchPotentialMatchesData = useCallback(async (userId: string, allowedGenders: string[]) => {
    // Parallel queries for better performance - fetch user data first for early filtering
    const [
      { data: currentUserData },
      { data: likedUsers },
      { data: blockedUsers },
      { data: recentPasses },
      { data: usersWhoLikedMe } // ⭐ NEW: Fetch users who have liked the current user
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('max_distance, distance_preference, country, country_code, min_age, max_age, preference, unlocked_countries, profile_completion')
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
        .gte('passed_at', new Date(Date.now() - 192 * 60 * 60 * 1000).toISOString()), // 8 days
      // ⭐ Fetch users who liked the current user (for priority placement)
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
    
    // ⭐ NEW: Get IDs of users who liked me (excluding those I've already interacted with)
    const usersWhoLikedMeIds = uniqUuids((usersWhoLikedMe || [])
      .map(like => like.liker_id)
      .filter(id => !likedUserIds.includes(id) && !blockedUserIds.includes(id) && !passedUserIds.includes(id)));
    
    // Store in state for "they liked you" popup feature (avoid pointless rerenders)
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
    
    // ⭐ CRITICAL: Exclude locally swiped IDs, filtering out passed profiles older than 8 days
    const now = Date.now();
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    const locallySwipedIds = uniqUuids(Array.from(locallySwipedProfileIds.current.entries())
      .filter(([_, data]) => {
        // Always exclude liked profiles
        if (data.action === 'like') return true;
        // Only exclude passed profiles if less than 8 days old
        return (now - data.timestamp) < eightDaysMs;
      })
      .map(([id, _]) => id));
    const excludedIds = uniqUuids([...likedUserIds, ...blockedUserIds, ...passedUserIds, ...locallySwipedIds, userId]);
    
    // ⭐ Filter priority likers to only those not already swiped on locally
    const priorityLikerIds = usersWhoLikedMeIds.filter(id => !locallySwipedIds.includes(id));
    
    const userMaxDistanceRaw = currentUserData?.max_distance ?? currentUserData?.distance_preference ?? 50;
    const userMaxDistance = Number(userMaxDistanceRaw);
    const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;

    const baseCountryCode = normalizeCountryCode(currentUserData?.country_code || '');

    // Use a single, reliable premium flag for feed building.
    // The isPremium prop can be undefined/incorrect while subscription loads.
    const premiumForFeed = premiumActive;

    // Get unlocked countries for premium users (robust to array/JSON/string shapes)
    const unlockedCountries: string[] = premiumForFeed
      ? normalizeCountryCodeList(
          (currentUserData as any)?.unlocked_countries ?? (currentUser as any)?.unlocked_countries,
          baseCountryCode
        )
      : [];


    // Get location-based matches (distance filter)
    const locationMatches = await locationService.getLocationBasedMatches(userId, safeUserMaxDistance);

    // ⭐ OPTIMIZED: Single pass to build both distanceMap and locationProfileIds (50ms saved)
    const distanceMap: { [key: string]: number } = {};
    // Distance ONLY applies to the local country.
    const locationProfileIds = uniqUuids(locationMatches
      .filter((m) => !baseCountryCode || normalizeCountryCode((m.country_code || '') as string) === baseCountryCode)
      .map((match) => {
        distanceMap[match.profile_id] = match.distance_km;
        return match.profile_id;
      }));

    // ⭐ STRATIFIED SAMPLING: Fetch all profiles then apply fair distribution
    // Common profile select fields (includes created_at for stratified sampling and last_login_at for activity weighting)
    const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at';

    // ⭐ PREMIUM FIX: Detect if premium user has unlocked countries
    const hasUnlockedCountries = premiumForFeed && unlockedCountries.length > 0;


    let filteredProfiles: any[] = [];
    let usingArchivedFallback = false; // Track if we're showing archived profiles

    // Keep these in outer scope so our final empty-state logic can distinguish
    // “local distance exhausted” vs “truly no profiles” for Premium.
    let localProfiles: any[] = [];
    let intlProfiles: any[] = [];
    
    // =====================================================
    // PHASE 1: ACTIVE USERS ONLY (is_archived = false)
    // =====================================================
    
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
            return profiles || [];
          })()
        : [];

      // ⭐ PREMIUM FALLBACK: If distance-local returns 0, fetch local country without distance constraint.
      // This preserves the intended local↔intl rotation even when location-based matching is empty.
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
          if (!fallbackError && fallbackLocal && fallbackLocal.length > 0) {
            fallbackLocal.forEach((p: any) => (distanceMap[p.id] ??= 999));
            localProfiles = fallbackLocal;
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
      
      const filterAge = (profiles: any[]) => profiles.filter(profile => {
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
      const activityWeightedMixed = applyActivityWeighting(
        mixedProfiles,
        `${userId}_${dailySeed}_activity`
      );


      // STEP 6: For Premium multi-country, preserve the country rotation
      // Stratified sampling would re-group by account age and destroy the alternation
      // Premium users pay for the best experience → keep pure round-robin mixing
      filteredProfiles = activityWeightedMixed.slice(0, 60);


      if (import.meta.env.DEV) {
      }
      
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
        filteredProfiles = profiles || [];
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
        filteredProfiles = profiles || [];
        
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
      const userLat = (currentUserData as any)?.latitude;
      const userLon = (currentUserData as any)?.longitude;
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
        filteredProfiles = archivedProfiles;
        usingArchivedFallback = true;
        
        // Mix archived profiles the same way (explicit country rotation).
        if (premiumForFeed && allowedCountryCodes.length > 1) {
          const mixSeed = `${userId}_${todayStr()}_archived`;
          filteredProfiles = mixByCountryRoundRobin(
            (filteredProfiles as any[]).filter((p) => allowedCountryCodes.includes(normalizeCountryCode(p.country_code || ''))),
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
      filteredProfiles = applyActivityWeighting(filteredProfiles, `${userId}_${dailySeed}_activity`);
    }

    // Add empty images array and precomputed distance
    const profilesWithImages = filteredProfiles.map(profile => ({
      ...profile,
      images: [],
      distance: distanceMap[profile.id] // Precomputed distance from locationService
    }));


    // ⭐ DEDUPLICATION: Remove any duplicate profiles by ID
    const uniqueProfiles = Array.from(
      new Map(profilesWithImages.map(p => [p.id, p])).values()
    );


    // ⭐ STRATIFIED SAMPLING: Fair distribution by account age
    // Bucket A (≤7 days): 3/15 (20%), Bucket B (8-30 days): 4/15 (27%)
    // Bucket C (1-6 months): 4/15 (27%), Bucket D (>6 months): 4/15 (26%)
    // This ensures new users get visibility (47%) while established users stay visible (53%)
    const today = todayStr();
    const shuffleSeed = `${userId}_${today}`;

    // Premium users: keep local + unlocked profiles mixed (avoid big “local first” blocks)
    // Deterministic per user/day feed signature, not a simple repeating pattern.
    const mixLocalAndInternational = <T extends { country_code?: string | null }>(
      profiles: T[],
      localCountryCode: string,
      seed: string
    ): T[] => {
      const locals: T[] = [];
      const internationals: T[] = [];

      for (const p of profiles) {
        if ((p.country_code || '').trim() === localCountryCode) {
          locals.push(p);
        } else {
          internationals.push(p);
        }
      }

      if (locals.length === 0 || internationals.length === 0) {
        return profiles;
      }

      const rand = seededRandomFromString(seed);
      const result: T[] = [];

      let l = 0;
      let i = 0;
      let sinceIntl = 0;

      const MIN_GAP = 1; // don’t spam intl
      const MAX_GAP = 4; // don’t starve intl

      while (l < locals.length || i < internationals.length) {
        const canLocal = l < locals.length;
        const canIntl = i < internationals.length;

        if (!canLocal && canIntl) {
          result.push(internationals[i++]);
          sinceIntl = 0;
          continue;
        }

        if (canLocal && !canIntl) {
          result.push(locals[l++]);
          sinceIntl++;
          continue;
        }

        let pickIntl = false;

        if (sinceIntl >= MAX_GAP) {
          pickIntl = true;
        } else if (sinceIntl <= MIN_GAP) {
          pickIntl = false;
        } else {
          const remainingLocal = locals.length - l;
          const remainingIntl = internationals.length - i;
          const remainingTotal = Math.max(1, remainingLocal + remainingIntl);
          const ratio = remainingIntl / remainingTotal;
          pickIntl = rand() < (0.25 + ratio * 0.4);
        }

        if (pickIntl) {
          result.push(internationals[i++]);
          sinceIntl = 0;
        } else {
          result.push(locals[l++]);
          sinceIntl++;
        }
      }

      return result;
    };
    
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
        const parsed = JSON.parse(savedOrderRaw);

        const savedPremium = !!(parsed as any)?.premium;
        const savedCountries = Array.isArray((parsed as any)?.countries) ? (parsed as any).countries : [];
        const savedIds = Array.isArray((parsed as any)?.order) ? (parsed as any).order : [];


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

    // ⭐ PRIORITY LIKERS: Inject users who liked the current user at natural, sparse positions
    // Uses variable intervals (25-40 profiles) with random positioning for organic discovery
    if (priorityLikerIds.length > 0) {
      // Get profile data for priority likers that are in our shuffled list
      const priorityProfiles = shuffled.filter(p => priorityLikerIds.includes(p.id));
      
      // Remove priority profiles from their current positions
      const nonPriorityProfiles = shuffled.filter(p => !priorityLikerIds.includes(p.id));
      
      // Cap priority likers at 15% of total feed to keep it natural
      const maxPriorityCount = Math.min(
        priorityProfiles.length,
        Math.ceil(nonPriorityProfiles.length * 0.15)
      );
      const limitedPriorityProfiles = priorityProfiles.slice(0, maxPriorityCount);
      
      // Create deterministic but seemingly random injection points
      const seedUserId = currentUser?.id || userId;
      const dateSeed = new Date().toISOString().split('T')[0];
      const injectionSeed = `${seedUserId}_priority_${dateSeed}`;
      
      // Simple hash function for deterministic "randomness"
      const simpleHash = (str: string, index: number) => {
        let hash = 0;
        const combined = str + index;
        for (let i = 0; i < combined.length; i++) {
          hash = ((hash << 5) - hash) + combined.charCodeAt(i);
          hash = hash & hash;
        }
        return Math.abs(hash);
      };
      
      // Calculate injection positions with variable intervals
      const injectionPositions: number[] = [];
      let currentPos = 0;
      let injectionIndex = 0;
      
      while (injectionIndex < limitedPriorityProfiles.length && currentPos < nonPriorityProfiles.length) {
        // Variable interval: 25-40 profiles for most injections
        // First injection happens earlier (8-15 profiles) for early engagement
        let minInterval = injectionIndex === 0 ? 8 : 25;
        let maxInterval = injectionIndex === 0 ? 15 : 40;
        
        // Use deterministic hash to pick interval and offset
        const intervalRange = maxInterval - minInterval;
        const interval = minInterval + (simpleHash(injectionSeed, injectionIndex) % intervalRange);
        const offset = simpleHash(injectionSeed, injectionIndex + 1000) % Math.min(8, interval);
        
        currentPos += interval + offset;
        
        if (currentPos < nonPriorityProfiles.length) {
          injectionPositions.push(currentPos);
          injectionIndex++;
        }
      }

      const injectionSet = new Set(injectionPositions);
      
      // Build final array with injections at calculated positions
      const finalProfiles: typeof shuffled = [];
      let priorityIdx = 0;
      
      for (let i = 0; i < nonPriorityProfiles.length; i++) {
        // Check if we should inject at this position
        if (injectionSet.has(i) && priorityIdx < limitedPriorityProfiles.length) {
          finalProfiles.push(limitedPriorityProfiles[priorityIdx]);
          priorityIdx++;
        }
        
        finalProfiles.push(nonPriorityProfiles[i]);
      }
      
      shuffled = finalProfiles;
    }

    // Load last profile ID and time from localStorage
    const savedId = localStorage.getItem('driplove_last_profile_id');
    const savedTime = parseInt(localStorage.getItem('driplove_last_profile_time') || '0');
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const isSavedValid = savedId && Date.now() - savedTime < twentyFourHours;

    // Find starting index based on saved profile
    let startIndex = 0;
    if (isSavedValid && savedId) {
      const foundIndex = shuffled.findIndex(p => p.id === savedId);
      if (foundIndex !== -1) {
        startIndex = foundIndex;
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
  }, [loadAllImagesForProfile, premiumActive, currentUser, fetchUnlockedCountryProfiles]);

  // ⭐ BATCH LANGUAGE FETCHING - Load all languages at once to avoid per-card DB calls
  const batchFetchLanguages = useCallback(async (profileIds: string[]) => {
    if (profileIds.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, preferred_language')
        .in('id', profileIds);
      
      if (!error && data) {
        // ⭐ OPTIMIZED: Single-pass language map building (5-10ms saved)
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

  const fetchPotentialMatches = useCallback(async () => {
    if (!currentUser?.id) return;
    // Allow manual fetches to override suppress flag - user explicitly wants fresh data
    // Reset suppress flag when user manually refreshes
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
          return;
        }
        const { matches, images, distances, index } = result;
        
        const matchesWithAds = injectAds(matches);
        
        
        // ⭐ Cache REMOVED - was causing already-swiped profiles to reappear

        // ⭐ DE-DUPE: If deck already has items, only add unseen items (prevents dupes)
        setPotentialMatches(prev => {
          if (prev.length === 0) return matchesWithAds;
          return mergeDecksWithoutProfileDupes(prev, matchesWithAds);
        });
        setUserImages(images);
        setUserDistances(distances);
        setCurrentIndex(index);
        setLastShuffleTime(Date.now());
        
        // Use setTimeout to ensure state updates are processed before marking complete
        setTimeout(() => {
          setIsLoading(false);
          setHasCompletedInitialFetch(true);
        }, 0);

        // ⭐ OPTIMIZED: Batch fetch languages (avoid per-card DB calls)
        const profileIds = matches.map(m => m.id).filter(Boolean);

        // ⭐ BATCH FETCH LANGUAGES - Get all at once to avoid per-card DB calls
        if (profileIds.length > 0) {
          batchFetchLanguages(profileIds);
        }

        // ⭐ REMOVED: Manual preload calls - centralized useEffect (3B) handles all preloading
        // The new useEffect automatically preloads based on currentIndex changes

        // ⭐ OPTIMIZED: Removed 45s continuous loader AND initial loadMoreMatches call
        // The useEffect auto-reload is the SINGLE SOURCE OF TRUTH - it will trigger when needed
        // No need for extra calls here - keeps logic simple and centralized
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('discover.errors.loadFailed'),
        variant: 'destructive'
      });
      setIsLoading(false);
      setHasCompletedInitialFetch(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allowedGenders, toast, fetchPotentialMatchesData, injectAds, batchFetchLanguages]);

  // ⭐ PREMIUM AUTO-RECOVERY: If Premium hits an empty deck, auto-refresh once.
  // This prevents the "No more profiles" card from appearing just because the local
  // distance-based pool ended, while there are still unlocked countries to show.
  useEffect(() => {
    if (!premiumActive) return;
    if (!hasCompletedInitialFetch) return;

    // If we have profiles again, clear any prior "truly empty" state.
    if (potentialMatches.length > 0) {
      if (premiumTrulyEmptyAfterRetry) setPremiumTrulyEmptyAfterRetry(false);
      premiumEmptyAutoRetryRef.current = false;
      return;
    }

    // Only run when we're idle and would otherwise show an empty state.
    if (!noMoreProfiles) return;
    if (isLoading || isLoadingMore) return;
    if (premiumTrulyEmptyAfterRetry) return;

    premiumEmptyAutoRetryRef.current = true;
    setNoMoreProfiles(false);
    fetchPotentialMatches();
  }, [
    premiumActive,
    hasCompletedInitialFetch,
    potentialMatches.length,
    noMoreProfiles,
    isLoading,
    isLoadingMore,
    premiumTrulyEmptyAfterRetry,
    fetchPotentialMatches,
  ]);

  // If the auto-retry ran and we still end up empty, allow the empty-state UI for Premium.
  useEffect(() => {
    if (!premiumActive) return;
    if (potentialMatches.length > 0) return;
    if (!noMoreProfiles) return;

    if (premiumEmptyAutoRetryRef.current) {
      premiumEmptyAutoRetryRef.current = false;
      setPremiumTrulyEmptyAfterRetry(true);
    }
  }, [isPremium, potentialMatches.length, noMoreProfiles]);

  // ⭐ PARALLEL IMAGE PRELOADING - Load images in background without blocking
  // ⭐ ANDROID OPTIMIZATION: Reduced batch size for Android (2 vs 10 for iOS)
  const preloadProfileImages = useCallback((profiles: PotentialMatch[], startIndex: number = 0) => {
    // Android: Load only 2 profiles ahead, iOS: Load 6 profiles ahead
    const isAndroid = isAndroidPlatform();
    const batchSize = isAndroid ? 2 : 6;
    const profilesToLoad = profiles.slice(startIndex, startIndex + batchSize);
    
    profilesToLoad.forEach((user, profileIndex) => {
      if (!user?.id) return;
      if (userImages[user.id]?.length > 0) return; // Already loaded
      if (requestedImageProfileIds.current.has(user.id)) return; // Already loading
      
      // ⭐ ANDROID OPTIMIZATION: Stop loading next images if user moved away from this index
      const indexOfProfileBeingLoaded = startIndex + profileIndex;
      
      requestedImageProfileIds.current.add(user.id);
      
      // Load in background - don't await
      (async () => {
        try {
          const { data: images } = await supabase
            .from('user_images')
            .select('image_url, is_approved')
            .eq('user_id', user.id)
            .eq('is_approved', true)
            .order('image_order', { ascending: true });

          if (!images || images.length === 0) {
            requestedImageProfileIds.current.delete(user.id);
            return;
          }

          const imageUrls = images.map(img => img.image_url);

          // Update state immediately
          setUserImages(prev => ({ ...prev, [user.id]: imageUrls }));

          // iOS/Web: blob preloading for instant render; Android WebView: skip blobs (too expensive)
          if (!isAndroid) {
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

            setPreloadedBlobImages(prev => ({ ...prev, [user.id]: blobMap }));
          }
        } catch (error) {
          // ignore preload errors; fallback to original URLs
        } finally {
          requestedImageProfileIds.current.delete(user.id);
        }
      })();
    });
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
    
    // ⭐ WAIT for premium status to be determined before fetching
    if (!premiumResolved) {
      return;
    }

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

    // ⭐ CRITICAL FIX: Check if we've already initialized to prevent double-loading
    // This prevents the effect from running multiple times and creating duplicates
    if (initializedUserRef.current === cacheKey) {
      return; // Already initialized for this user today
    }

    // ⭐ CRITICAL: DO NOT clear locallySwipedProfileIds - we need to remember swiped profiles
    // to prevent them from reappearing in new fetches
    // locallySwipedProfileIds.current.clear(); // REMOVED
    
    // ⭐ Clean up sessionStorage: Remove passed profiles older than 8 days
    // Keep liked profiles permanently (they won't show until unmatched)
    const now = Date.now();
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    
    let needsUpdate = false;
    for (const [id, data] of locallySwipedProfileIds.current.entries()) {
      // Remove passed profiles older than 8 days
      if (data.action === 'pass' && (now - data.timestamp) > eightDaysMs) {
        locallySwipedProfileIds.current.delete(id);
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      persistSwipedIds();
    }
    
    // ⭐ Clean up old profile order from previous days
    try {
      const today = todayStr();
      const prefix = `driplove_profile_order_${currentUser.id}_`;

      // Remove old profile orders (not today's) using a snapshot of keys
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(prefix) && !key.includes(`_${today}_`)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      // Ignore localStorage errors
    }

    // Start loading immediately - always fetch fresh to exclude swiped profiles
    const initializeProfiles = async () => {
      // ⭐ Mark as initialized BEFORE fetching to prevent race conditions
      // This ensures the effect won't run again even if state updates trigger re-renders
      initializedUserRef.current = cacheKey;
      
      // Fetch fresh profiles excluding already swiped ones
      await fetchPotentialMatches();
    };

    // Start immediately without setTimeout
    initializeProfiles();
    fetchReverseUsage();
  }, [currentUser?.id, premiumActive, premiumResolved, subscriptionLoading, isPremium]); // Refetch when premium resolves/changes


  // Cleanup on unmount (minimal now that continuous loader is removed)
  useEffect(() => {
    return () => {
      // Cleanup any remaining global references
      try {
        if (typeof window !== 'undefined' && (window as any).continuousLoadingInterval) {
          clearInterval((window as any).continuousLoadingInterval);
          (window as any).continuousLoadingInterval = null;
        }
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, []);

  useEffect(() => {
    setImageIndex(0);
    
    // ⭐ REMOVED: Manual image loading - centralized preload useEffect (3B) handles everything
    // No need to manually call loadFullImages here - the centralized effect preloads upcoming profiles
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
    
    // ⭐ 4A: Symmetrical swipe thresholds for mobile
    // 35% of screen width feels natural and consistent
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
      
      // ⭐ 4A: Symmetrical swipe thresholds for desktop
      // Minimum 80px feels intentional without being too sensitive
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

    // ⭐ ANDROID OPTIMIZATION: Abort pending image loads when user taps image
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
      // CRITICAL: Include locally swiped profiles, filtering out passed profiles older than 8 days
      const now = Date.now();
      const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
      const locallySwipedIds = uniqUuids(Array.from(locallySwipedProfileIds.current.entries())
        .filter(([_, data]) => {
          if (data.action === 'like') return true;
          return (now - data.timestamp) < eightDaysMs;
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
          .gte('passed_at', new Date(Date.now() - 192 * 60 * 60 * 1000).toISOString()) // 8 days - same as main fetch
      ]);

      const likedUserIds = uniqUuids(likedUsers?.map(like => like.liked_id) || []);
      const blockedUserIds = uniqUuids(blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || []);
      const hiddenPassedIds = uniqUuids(recentPasses?.map(p => p.passed_id) || []);
      const allExcludedIds = uniqUuids([...excludedIds, ...likedUserIds, ...blockedUserIds, ...hiddenPassedIds]);

      // IMPORTANT: Pull latest user prefs from DB so refills reflect premium country selections
      // even if `currentUser` props are stale.
      const { data: currentUserData } = await supabase
        .from('profiles')
        .select('max_distance, distance_preference, country_code, min_age, max_age, unlocked_countries')
        .eq('id', currentUser.id)
        .single();
      
      // ⭐ STRATIFIED REFILL: Include created_at for stratified sampling
      const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at';

      // Enforce country rules early for speed + correctness
      const baseCountryCode = normalizeCountryCode(String((currentUserData as any)?.country_code ?? currentUser.country_code ?? ''));

      // Use a single, reliable premium flag for refills.
      const premiumForFeed = premiumActive;
      
      // Get unlocked countries for premium users (robust to array/JSON/string shapes)
      const unlockedCountries: string[] = premiumForFeed
        ? normalizeCountryCodeList(
            (currentUserData as any)?.unlocked_countries ?? (currentUser as any).unlocked_countries,
            baseCountryCode
          )
        : [];
      
      const allowedCountryCodes = Array.from(
        new Set([
          ...(baseCountryCode ? [baseCountryCode] : []),
          ...unlockedCountries,
        ])
      ).map((c) => normalizeCountryCode(String(c || ''))).filter(Boolean);

      // ⭐ PREMIUM FIX: Check if we have unlocked countries
      const hasUnlockedCountries = premiumForFeed && unlockedCountries.length > 0;

      // Build a unified pool: local(distance-filtered, local country only) + unlocked countries (no distance)
      const distanceMap: { [key: string]: number } = {};

      const userMaxDistanceRaw = (currentUserData as any)?.max_distance ?? (currentUserData as any)?.distance_preference ?? (currentUser as any).max_distance ?? (currentUser as any).distance_preference ?? 50;
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
            return localData || [];
          })()
        : [];

      // ⭐ PREMIUM FALLBACK: If distance-local is empty, fetch local country without distance constraint.
      let effectiveLocalProfiles = localProfiles;
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
          if (!fallbackError && fallbackLocal && fallbackLocal.length > 0) {
            fallbackLocal.forEach((p: any) => (distanceMap[p.id] ??= 999));
            effectiveLocalProfiles = fallbackLocal;
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

      let activeProfiles = [...effectiveLocalProfiles, ...intlProfiles];
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
        const userMinAge = (currentUserData as any)?.min_age || currentUser.min_age || 18;
        const userMaxAge = (currentUserData as any)?.max_age || currentUser.max_age || 99;
        archivedQuery = archivedQuery
          .gte('age', userMinAge)
          .lte('age', userMaxAge);

        // Apply distance filtering for local country (use currentUserData for location)
        const userLat = (currentUserData as any)?.latitude || currentUser.latitude;
        const userLon = (currentUserData as any)?.longitude || currentUser.longitude;
        if (baseCountryCode && userLat && userLon) {
          const maxDistanceKm = (currentUserData as any)?.max_distance || currentUser.max_distance || 50;
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
          activeProfiles = archivedProfiles;
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

      let filteredProfiles = activeProfiles;

      // Apply age filtering
      const userMinAge = (currentUserData as any)?.min_age || currentUser.min_age || 18;
      const userMaxAge = (currentUserData as any)?.max_age || currentUser.max_age || 99;
      filteredProfiles = filteredProfiles.filter(profile => {
        // Premium: keep profiles even if DOB is missing; only enforce range when DOB is present.
        if (!profile.date_of_birth) return true;
        const age = calculateAge(profile.date_of_birth);
        if (!Number.isFinite(age)) return true;
        return age >= userMinAge && age <= userMaxAge;
      });

      const profilesWithImages = filteredProfiles.map(profile => ({
        ...profile,
        images: [],
        distance: typeof distanceMap[profile.id] === 'number' ? distanceMap[profile.id] : 999
      }));

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

      if (uniqueProfiles.length > 0) {
        setNoMoreProfiles(false);
        if (premiumTrulyEmptyAfterRetry) setPremiumTrulyEmptyAfterRetry(false);
      }
      
      // Add new UNIQUE profiles to the END of the array (with ads injected)
      const newProfilesWithAds = injectAds(uniqueProfiles);
      setPotentialMatches(prev => mergeDecksWithoutProfileDupes(prev, newProfilesWithAds));
      
      // ⭐ FIX #5: Preload IMMEDIATELY (no delay) for instant swipe
      if (profilesWithImages.length > 0) {
        preloadNextProfileImages(profilesWithImages, userImages, 0);
        
        // Batch fetch languages for new profiles
        const newProfileIds = profilesWithImages.map(p => p.id).filter(Boolean);
        if (newProfileIds.length > 0) {
          batchFetchLanguages(newProfileIds);
        }
      }
    } catch (error) {
      // ignore load more errors; UI will retry via refill effect
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentUser, allowedGenders, potentialMatches, isLoadingMore, userImages, preloadNextProfileImages, injectAds, fetchUnlockedCountryProfiles, batchFetchLanguages, premiumActive]);

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
    
    // Inject rescue profiles near the front of the queue (positions 2-5)
    setPotentialMatches(prev => {
      const currentProfiles = prev.slice(currentIndex);
      const rescueIds = new Set(rescueCandidates.map(p => p.id));
      
      // Remove rescue profiles from their current positions
      const withoutRescue = currentProfiles.filter(p => !isAd(p) ? !rescueIds.has(p.id) : true);
      
      // Inject at positions 2, 4, 6 (skip first profile which is current)
      const injected = injectRescueProfiles(withoutRescue, rescueCandidates, {
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
  }, [noMatchStreak, potentialMatches, currentIndex, currentUser?.id, usersWhoLikedMeIds]);
  // Automatically preloads upcoming profiles based on current position
  useEffect(() => {
    if (!hasCompletedInitialFetch || potentialMatches.length === 0) return;

    // Filter out ads - only preload real profiles
    const realMatches = potentialMatches.filter(m => !isAd(m));
    
    // Preload images for upcoming profiles (pass full array and current position)
    if (realMatches.length > 0) {
      preloadProfileImages(realMatches as PotentialMatch[], currentIndex);
    }
  }, [potentialMatches, currentIndex, hasCompletedInitialFetch, preloadProfileImages]);

  // Optimistic UI: move to next card instantly, then process like in background
  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Skip likes on ads - just move to next
    if (isAd(currentMatch)) {
      moveToNext();
      return;
    }

    // Prevent double-swipes: max 2 pending swipes at once
    if (pendingSwipesRef.current > 2) {
      return;
    }


    // Check profile completion restriction (70% after 8 swipes)
    if (profileCompletion < 70 && todaySwipeCount >= 8) {
      toast({
        title: t('discover.errors.profileCompletionRequired'),
        description: t('discover.errors.profileCompletionMessage', { percentage: 70 - profileCompletion }),
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: 16 swipes, Premium users: 100 swipes
    const swipeLimit = premiumActive ? 100 : 16;
    
    
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
    const prevIndex = currentIndex;
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
    moveToNext();

    // Background job: persist usage and like, then show match animation if appropriate.
    enqueue(async () => {
      try {
        // First, increment usage on server (guard against limits)
        const usageResult = await checkUsageLimit('swipe');
        if (!usageResult.success) {
          // rollback: restore the card at front and remove from exclusion list
          // Also restore deterministic daily order so reloads don't reshuffle.
          try {
            const baseCountryCode = (currentUser?.country_code || '').trim();
            const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
              ? (currentUser as any).unlocked_countries
                  .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
                  .map((c: string) => c.trim())
              : [];
            const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
            const userMaxDistance = Number(userMaxDistanceRaw);
            const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
            const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
            const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
            const savedOrder = localStorage.getItem(savedOrderKey);
            if (savedOrder) {
              const orderIds: string[] = JSON.parse(savedOrder);
              if (!orderIds.includes(prevMatch.id)) {
                localStorage.setItem(savedOrderKey, JSON.stringify([prevMatch.id, ...orderIds]));
              }
            }
          } catch {
            // ignore localStorage errors
          }
          locallySwipedProfileIds.current.delete(prevMatch.id);
          persistSwipedIds(); // Keep sessionStorage in sync
          setPotentialMatches(prev => mergeDecksWithoutProfileDupes([prevMatch], prev));
          setCurrentIndex(0);
          setTodaySwipeCount(prev => Math.max(0, prev - 1));
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
        const { data: rpcData, error: rpcError } = await supabase.rpc((rpcName as any), {
          liker_id_param: currentUser.id,
          liked_id_param: prevMatch.id,
          premium_param: !!isPremium
        } as any);

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
                const { data: likeCountData, error: countError } = await supabase
                  .from('likes')
                  .select('id', { count: 'exact', head: true })
                  .eq('liked_id', prevMatch.id);
                
                if (!countError) {
                  const likeCount = (likeCountData as any) || 0;
                  
                  // Send notification on every like
                  await sendMultipleLikesNotification(prevMatch.id, likeCount);
                }
              } catch (countError) {
                // ignore like count errors
              }
            }

            const { data: mutualLike } = await supabase
              .from('likes')
              .select('*')
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
              if (typeof window !== 'undefined' && (window as any).chatMatchesCache) {
                (window as any).chatMatchesCache.delete(currentUser.id);
              }
              
              // Trigger global event to notify ChatPage of new match
              if (typeof window !== 'undefined') {
                const event = new CustomEvent('newMatch', { detail: { userId: currentUser.id } });
                window.dispatchEvent(event);
              }
              
              // Send match notification to the other user
              try {
                const matchedUserName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
                const result = await sendMatchNotification(matchedUserName, prevMatch.id);
              } catch (notificationError) {
                // ignore notification errors
              }
            }
          } catch (fallbackErr) {
            // If even fallback fails, rollback to keep UI consistent
            try {
              const baseCountryCode = (currentUser?.country_code || '').trim();
              const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
                ? (currentUser as any).unlocked_countries
                    .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
                    .map((c: string) => c.trim())
                : [];
              const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
              const userMaxDistance = Number(userMaxDistanceRaw);
              const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
              const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
              const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
              const savedOrder = localStorage.getItem(savedOrderKey);
              if (savedOrder) {
                const orderIds: string[] = JSON.parse(savedOrder);
                if (!orderIds.includes(prevMatch.id)) {
                  localStorage.setItem(savedOrderKey, JSON.stringify([prevMatch.id, ...orderIds]));
                }
              }
            } catch {
              // ignore localStorage errors
            }
            locallySwipedProfileIds.current.delete(prevMatch.id);
            persistSwipedIds(); // Keep sessionStorage in sync
            setPotentialMatches(prev => mergeDecksWithoutProfileDupes([prevMatch], prev));
            setCurrentIndex(0);
            setTodaySwipeCount(prev => Math.max(0, prev - 1));
            toast({ 
              title: t('common.error'), 
              description: t('discover.errors.likeFailed'), 
              variant: 'destructive' 
            });
            return;
          }
        } else {
          // RPC succeeded — if server reports a match, show animation
          if ((rpcData as any)?.match) {
            // ⭐ SWIPE FATIGUE RESCUE: Reset streak on match
            setNoMatchStreak(0);
            
            setMatchedUser(prevMatch);
            setShowMatchAnimation(true);
            
            // Check if rating dialog should be shown (on 2nd match)
            if (incrementMatchCount()) {
              setTimeout(() => setShowRatingDialog(true), 2000); // Show after match animation
            }
            
            // Clear chat cache to force refresh when user opens ChatPage
            if (typeof window !== 'undefined' && (window as any).chatMatchesCache) {
              (window as any).chatMatchesCache.delete(currentUser.id);
            }
            
            // Trigger global event to notify ChatPage of new match
            if (typeof window !== 'undefined') {
              const event = new CustomEvent('newMatch', { detail: { userId: currentUser.id } });
              window.dispatchEvent(event);
            }
            
            // Send match notification to the other user
            try {
              const matchedUserName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
              const result = await sendMatchNotification(matchedUserName, prevMatch.id);
            } catch (notificationError) {
              // ignore notification errors
            }
          } else {
            // ⭐ SWIPE FATIGUE RESCUE: Increment streak on no-match like
            setNoMatchStreak(prev => prev + 1);
            
            // Like was recorded but no match - send like notification
            try {
              const { data: likeCountData, error: countError } = await supabase
                .from('likes')
                .select('id', { count: 'exact', head: true })
                .eq('liked_id', prevMatch.id);
              
              if (!countError) {
                const likeCount = (likeCountData as any) || 0;
                
                // Send notification on every like
                await sendMultipleLikesNotification(prevMatch.id, likeCount);
              }
            } catch (countError) {
              // ignore like count errors
            }
          }
        }
      } catch (jobErr) {
        // On unexpected errors, attempt a rollback to keep UX consistent
        try {
          const baseCountryCode = (currentUser?.country_code || '').trim();
          const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
            ? (currentUser as any).unlocked_countries
                .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
                .map((c: string) => c.trim())
            : [];
          const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
          const userMaxDistance = Number(userMaxDistanceRaw);
          const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
          const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
          const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
          const savedOrder = localStorage.getItem(savedOrderKey);
          if (savedOrder) {
            const orderIds: string[] = JSON.parse(savedOrder);
            if (!orderIds.includes(prevMatch.id)) {
              localStorage.setItem(savedOrderKey, JSON.stringify([prevMatch.id, ...orderIds]));
            }
          }
        } catch {
          // ignore localStorage errors
        }
        locallySwipedProfileIds.current.delete(prevMatch.id);
        persistSwipedIds(); // Keep sessionStorage in sync
        setPotentialMatches(prev => mergeDecksWithoutProfileDupes([prevMatch], prev));
        setCurrentIndex(0);
        setTodaySwipeCount(prev => Math.max(0, prev - 1));
      } finally {
        pendingSwipesRef.current = Math.max(0, pendingSwipesRef.current - 1);
      }
    });
  };

  // Optimistic UI: move to next card instantly, then process pass in background
  // Function to execute pass after user confirms (used when "they liked you" popup is shown)
  const executePassLogic = async (matchToPass: PotentialMatch) => {
    // Prevent double-swipes: max 2 pending swipes at once
    if (pendingSwipesRef.current > 2) {
      return;
    }

    // Check profile completion restriction (70% after 8 swipes)
    if (profileCompletion < 70 && todaySwipeCount >= 8) {
      toast({
        title: t('discover.errors.profileCompletionRequired'),
        description: t('discover.errors.profileCompletionMessage', { percentage: 70 - profileCompletion }),
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: 16 swipes, Premium users: 100 swipes
    const swipeLimit = premiumActive ? 100 : 16;
    
    
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
    const prevIndex = currentIndex;

    // CRITICAL: Add to local exclusion list immediately with 'pass' action (expires after 6 days)
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
    moveToNext();

    // Background job to persist the pass and usage increment
    enqueue(async () => {
      try {
        const usageResult = await checkUsageLimit('swipe');
        if (!usageResult.success) {
          // rollback: restore the card at front and remove from exclusion lists
          // Also restore deterministic daily order so reloads don't reshuffle.
          try {
            const baseCountryCode = (currentUser?.country_code || '').trim();
            const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
              ? (currentUser as any).unlocked_countries
                  .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
                  .map((c: string) => c.trim())
              : [];
            const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
            const userMaxDistance = Number(userMaxDistanceRaw);
            const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
            const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
            const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
            const savedOrder = localStorage.getItem(savedOrderKey);
            if (savedOrder) {
              const orderIds: string[] = JSON.parse(savedOrder);
              if (!orderIds.includes(prevMatch.id)) {
                localStorage.setItem(savedOrderKey, JSON.stringify([prevMatch.id, ...orderIds]));
              }
            }
          } catch {
            // ignore localStorage errors
          }
          locallySwipedProfileIds.current.delete(prevMatch.id);
          persistSwipedIds(); // Keep sessionStorage in sync
          setPotentialMatches(prev => mergeDecksWithoutProfileDupes([prevMatch], prev));
          setCurrentIndex(0);
          setPassedUsers(prev => prev.filter(p => p.user_id !== prevMatch.id));
          setTodaySwipeCount(prev => Math.max(0, prev - 1));
          setIsOutOfSwipes(true);
          
          toast({ 
            title: t('discover.errors.dailyLimitReached'), 
            description: usageResult.message || t('discover.errors.dailyLimitMessage'), 
            variant: 'destructive' 
          });
          return;
        }

        const rpcName = 'pass_and_usage_batched';
        const { data: rpcData, error: rpcError } = await supabase.rpc((rpcName as any), {
          passer_id_param: currentUser.id,
          passed_id_param: prevMatch.id,
          premium_param: !!isPremium
        } as any);

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
            // On fallback failure, rollback
            try {
              const baseCountryCode = (currentUser?.country_code || '').trim();
              const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
                ? (currentUser as any).unlocked_countries
                    .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
                    .map((c: string) => c.trim())
                : [];
              const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
              const userMaxDistance = Number(userMaxDistanceRaw);
              const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
              const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
              const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
              const savedOrder = localStorage.getItem(savedOrderKey);
              if (savedOrder) {
                const orderIds: string[] = JSON.parse(savedOrder);
                if (!orderIds.includes(prevMatch.id)) {
                  localStorage.setItem(savedOrderKey, JSON.stringify([prevMatch.id, ...orderIds]));
                }
              }
            } catch {
              // ignore localStorage errors
            }
            locallySwipedProfileIds.current.delete(prevMatch.id);
            persistSwipedIds(); // Keep sessionStorage in sync
            setPotentialMatches(prev => mergeDecksWithoutProfileDupes([prevMatch], prev));
            setCurrentIndex(0);
            setPassedUsers(prev => prev.filter(p => p.user_id !== prevMatch.id));
            setTodaySwipeCount(prev => Math.max(0, prev - 1));
            toast({ title: 'Error', description: 'Could not skip this profile.', variant: 'destructive' });
            return;
          }
        }
      } catch (jobErr) {
        // Unexpected error: rollback
        try {
          const baseCountryCode = (currentUser?.country_code || '').trim();
          const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
            ? (currentUser as any).unlocked_countries
                .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
                .map((c: string) => c.trim())
            : [];
          const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
          const userMaxDistance = Number(userMaxDistanceRaw);
          const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
          const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
          const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
          const savedOrder = localStorage.getItem(savedOrderKey);
          if (savedOrder) {
            const orderIds: string[] = JSON.parse(savedOrder);
            if (!orderIds.includes(prevMatch.id)) {
              localStorage.setItem(savedOrderKey, JSON.stringify([prevMatch.id, ...orderIds]));
            }
          }
        } catch {
          // ignore localStorage errors
        }
        locallySwipedProfileIds.current.delete(prevMatch.id);
        persistSwipedIds(); // Keep sessionStorage in sync
        setPotentialMatches(prev => mergeDecksWithoutProfileDupes([prevMatch], prev));
        setCurrentIndex(0);
        setPassedUsers(prev => prev.filter(p => p.user_id !== prevMatch.id));
        setTodaySwipeCount(prev => Math.max(0, prev - 1));
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
      moveToNext();
      return;
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
    if (!isAd(currentMatch)) {
      setNoMatchStreak(prev => prev + 1);
    }
    
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

      // Find the passed user data and bring them back to the front
      const passedUserData = potentialMatches.find(match => match.id === lastPassedUser.user_id);
      
      if (passedUserData) {
        // Insert the user at the current index so they appear as the next card
        const newMatches = [...potentialMatches];
        newMatches.splice(currentIndex, 0, passedUserData);
        setPotentialMatches(newMatches);
      } else {
        // If not in current matches, try to fetch their profile data
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, is_verified')
          .eq('id', lastPassedUser.user_id)
          .eq('account_status', 'active')
          .single();

        if (!profileError && profileData) {
          // Add the user back with empty images array (will be loaded when needed)
          const userWithImages = { ...(profileData as any), images: [] };
          const newMatches = [...potentialMatches];
          newMatches.splice(currentIndex, 0, userWithImages);
          setPotentialMatches(newMatches);
        }
      }

      // Remove from passed users list
      setPassedUsers(prev => prev.slice(1));
      
      // ⭐ CRITICAL: Remove from locally swiped IDs so profile can reappear
      locallySwipedProfileIds.current.delete(lastPassedUser.user_id);
      persistSwipedIds(); // Persist to sessionStorage

      // Restore deterministic daily order so this profile doesn't get appended/reordered on reload.
      try {
        const baseCountryCode = (currentUser?.country_code || '').trim();
        const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
          ? (currentUser as any).unlocked_countries
              .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
              .map((c: string) => c.trim())
          : [];
        const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
        const userMaxDistance = Number(userMaxDistanceRaw);
        const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
        const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
        const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
        const savedOrder = localStorage.getItem(savedOrderKey);
        if (savedOrder) {
          const orderIds: string[] = JSON.parse(savedOrder);
          if (!orderIds.includes(lastPassedUser.user_id)) {
            localStorage.setItem(savedOrderKey, JSON.stringify([lastPassedUser.user_id, ...orderIds]));
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

  // Helper to update cache after rollback
  const moveToNext = () => {
    // ⭐ Capture currentIndex locally to prevent stale closure bugs
    const indexToRemove = currentIndex;
    
    // ⭐ ANDROID OPTIMIZATION: Abort any pending image loads for previous profile
    if (currentImageAbortController) {
      currentImageAbortController.abort();
      currentImageAbortController = null;
    }

    // ⭐ CRITICAL FIX: Remove the swiped profile from array to prevent duplicates
    // Use callback to get accurate remaining count AFTER removal
    setPotentialMatches(prev => {
      const currentProfile = prev[indexToRemove];
      const newMatches = prev.filter((_, i) => i !== indexToRemove);
      const remainingProfiles = newMatches.length;
      
      // ⭐ Update saved profile order in localStorage (remove swiped profile)
      try {
        const baseCountryCode = (currentUser?.country_code || '').trim();
        const unlockedCountries: string[] = (isPremium && Array.isArray((currentUser as any)?.unlocked_countries))
          ? (currentUser as any).unlocked_countries
              .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
              .map((c: string) => c.trim())
          : [];
        const userMaxDistanceRaw = (currentUser as any)?.max_distance ?? (currentUser as any)?.distance_preference ?? 50;
        const userMaxDistance = Number(userMaxDistanceRaw);
        const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
        const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, !!isPremium, safeUserMaxDistance);
        const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
        
        if (currentProfile && 'id' in currentProfile) {
          const savedOrder = localStorage.getItem(savedOrderKey);
          if (savedOrder) {
            const orderIds: string[] = JSON.parse(savedOrder);
            const updatedOrder = orderIds.filter(id => id !== currentProfile.id);
            localStorage.setItem(savedOrderKey, JSON.stringify(updatedOrder));
          }
        }
      } catch (error) {
        // Ignore localStorage errors
      }
      
      // ⭐ REMOVED: Auto-reload logic moved to useEffect (single source of truth)
      // The useEffect will detect when remainingReal <= 10 and trigger loadMoreMatches
      // No need for duplicate reload logic here - keeps it simple and predictable
      
      // ⭐ FIX 3A: Preload NEXT profile using NEW array (after removal)
      // This ensures we preload the correct profile from the updated deck
      const nextProfile = newMatches[0]; // After removal, the next card is index 0
      if (nextProfile && !isAd(nextProfile)) {
        loadAllImagesForProfile(nextProfile.id).then(imgs => {
          if (imgs) {
            setUserImages(prevImgs => ({ ...prevImgs, [nextProfile.id]: imgs }));
          }
        });
      }
      
      return newMatches;
    });
    
    // ⭐ RULE 5: Hard-cut instant card removal - always stay at index 0
    setCurrentIndex(0);
    
    // ⭐ REMOVED: Old preload logic that used stale potentialMatches array
    // Now handled inside setPotentialMatches callback with correct newMatches array (3A)
    
    // Progressive Refill System Integration - load more profiles in background when running low
    checkAndTriggerRefill(currentUser.id, 0);
  };

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
            onPass={handlePass}
            onReverse={handleReverse}
            onLike={handleLike}
            canReverse={false}
            isPremium={isPremium}
          />
        </div>
      </div>
    );
  }

  // Show loading state while initial fetch hasn't completed yet
  if (!hasCompletedInitialFetch) {
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

  // When the deck is empty, we may be refilling in the background.
  // Never show the "No more profiles" card while a refill is in-flight.
  // For Premium, also avoid flashing the empty state unless we've conclusively exhausted ALL pools.
  if (hasCompletedInitialFetch && potentialMatches.length === 0) {
    const premiumCanShowEmpty = premiumActive ? (noMoreProfiles && premiumTrulyEmptyAfterRetry) : noMoreProfiles;
    const shouldShowLoadingInsteadOfEmpty =
      isLoading ||
      isLoadingMore ||
      (premiumActive && !premiumCanShowEmpty);

    if (shouldShowLoadingInsteadOfEmpty) {
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

    // Only show no profiles if we've exhausted all available profiles.
    // (For non-premium, this state is still used when initial fetch finds none.)
    if (premiumCanShowEmpty || (!premiumActive && !isLoading && !isLoadingMore)) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-8 text-center">
              <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold mb-2">{t('discover.noMoreProfiles')}</h2>
              <p className="text-gray-600 mb-4">{t('discover.noProfilesDescription')}</p>
              <Button
                onClick={() => {
                  setNoMoreProfiles(false); // Reset the state
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
                isVerified={!!(currentMatch as any)?.is_verified}
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
                isVerified={!!(currentMatch as any)?.is_verified}
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
          onPass={handlePass}
          onReverse={handleReverse}
          onLike={handleLike}
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

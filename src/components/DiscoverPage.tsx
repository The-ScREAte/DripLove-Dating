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
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAndroidPlatform } from '@/utils/platformUtils';
import { preloadImageToBlob } from '@/utils/imageCache';
import { calculateAge } from '@/utils/discoverCache';
import { normalizeCountryCode } from '@/utils/countryCode';
import { getStratifiedBatches } from '@/utils/stratifiedSampling';
import { applyActivityWeighting, getSwipeFatigueRescueCandidates, injectRescueProfiles } from '@/utils/activityWeighting';
import DominantColorImageBg from './discover/DominantColorImageBg';
import { useDiscoverAds } from './discover/useDiscoverAds';
import { AdData, MatchOrAd } from './discover/discoverTypes';
import { useDiscoverLikeBack } from './discover/useDiscoverLikeBack';
import {
  isUuid,
  uniqUuids,
  todayStr,
  applyLightActivityWeighting,
  getUserFeedSeed,
  readCachedSwipeCount,
  writeCachedSwipeCount,
  formatUuidInFilter,
  hashStringToInt,
  getTrustedBaseCountryCode,
  isLocalCountryForFreeUser,
  mixByCountryRoundRobin,
  buildFeedSignature,
  buildSavedOrderKey,
  readPersistentItem,
  writePersistentItem,
  normalizeCountryCodeList,
} from './discover/discoverFeedUtils';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Crown, Gamepad2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSubscription } from '@/hooks/useSubscription';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { calculateDistance } from '@/constants/locationData';
import { checkAndTriggerRefill } from '@/utils/performanceOptimizer';
import { locationService } from '@/services/locationService';
import { calculateProfileCompletion, getTodaySwipeCount } from '@/utils/profileCompletion';
import { getLanguageName } from '@/utils/languageNames';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import MatchCard from './discover/MatchCard';
import SwipeButtons from './discover/SwipeButtons';
import AdCard from './discover/AdCard';
import RatingFunnel from './RatingFunnel';
import HoppingLogo from '@/components/HoppingLogo';
import { registerMatchAndCheckIsFirst, isRatingFunnelEligible, markRatingFunnelTriggered } from '@/utils/ratingFunnelStorage';
import { CurrentUser, PotentialMatch } from '@/types';

// Paginated fetch for tables that can exceed Supabase's 1000-row default limit.
// Returns all matching rows by fetching in pages of `pageSize`.
const fetchAllRows = async <T,>(
  queryBuilder: () => ReturnType<ReturnType<typeof supabase.from>['select']>,
  pageSize = 1000
): Promise<T[]> => {
  const allRows: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryBuilder().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    allRows.push(...rows);
    if (rows.length < pageSize) break; // last page
    offset += pageSize;
  }
  return allRows;
};

interface DiscoverPageProps {
  currentUser: CurrentUser;
  onNavigateToChat?: (userId: string) => void;
  onNavigateToProfile?: () => void;
  isPremium?: boolean;
  profileCompletion?: number; // Pass from parent (Profile page calculates it)
  isActiveTab?: boolean; // Whether this tab is currently the visible one (parent keeps it mounted via display:none)
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

interface UserImageRow {
  image_url: string;
  is_approved: boolean | null;
  moderation_status: string | null;
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

const DiscoverPage = ({ currentUser, onNavigateToChat, onNavigateToProfile, isPremium, profileCompletion: parentProfileCompletion, isActiveTab = true }: DiscoverPageProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  
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
      const product = p as { getOffer?: () => unknown; offers?: unknown[] } | undefined;

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
  const hasCompletedInitialFetchRef = useRef(false);
  useEffect(() => {
    hasCompletedInitialFetchRef.current = hasCompletedInitialFetch;
  }, [hasCompletedInitialFetch]);
  const potentialMatchesRef = useRef<MatchOrAd[]>([]);
  useEffect(() => {
    potentialMatchesRef.current = potentialMatches;
  }, [potentialMatches]);
  const [noMoreProfiles, setNoMoreProfiles] = useState(false); // Track when truly no more profiles available
  const [emptyStateMode, setEmptyStateMode] = useState<'exhausted' | 'transient-error' | 'no-new'>('exhausted');

  // Premium-only: avoid showing the empty card when the local pool ends.
  // We auto-retry once; only show the empty card if that retry also yields nothing.
  const premiumEmptyAutoRetryRef = useRef(false);
  const [premiumTrulyEmptyAfterRetry, setPremiumTrulyEmptyAfterRetry] = useState(false);

  const [passedUsers, setPassedUsers] = useState<PassedUser[]>([]);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);

  // Navigating away from this tab always drops the premium-upgrade screen, so
  // coming back to Discover never lands on a stale upgrade screen instead of
  // the actual swipe deck.
  useEffect(() => {
    if (!isActiveTab) {
      setShowPremiumUpgrade(false);
    }
  }, [isActiveTab]);
  const [isOutOfSwipes, setIsOutOfSwipes] = useState(false);
  const [showMatchAnimation, setShowMatchAnimation] = useState(false);
  const [matchedUser, setMatchedUser] = useState<PotentialMatch | null>(null);
  const [showRatingFunnel, setShowRatingFunnel] = useState(false);
  const isFirstEverMatchRef = useRef(false);
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
  // DB is the source of truth; keep a local cache for refresh/app restarts.
  // Do NOT default to 0; unknown count must block swiping until DB fetch completes.
  const [todaySwipeCount, setTodaySwipeCount] = useState<number | null>(null);
  const [hasLoadedSwipeCountFromDb, setHasLoadedSwipeCountFromDb] = useState(false);
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
    // Merge both localStorage and sessionStorage to avoid one stale store hiding valid profiles.
    const key = `swiped_profiles_${currentUser.id}`;
    const parseStore = (raw: string | null) => {
      const parsed = new Map<string, { action: 'like' | 'pass'; timestamp: number }>();
      if (!raw) return parsed;
      try {
        const data = JSON.parse(raw);
        for (const [id, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'action' in value && 'timestamp' in value) {
            const v = value as { action: string; timestamp: number };
            if ((v.action === 'like' || v.action === 'pass') && typeof v.timestamp === 'number' && Number.isFinite(v.timestamp)) {
              parsed.set(id, { action: v.action, timestamp: v.timestamp });
            }
          }
        }
      } catch {
        // ignore malformed store payload
      }
      return parsed;
    };

    let localRaw: string | null = null;
    let sessionRaw: string | null = null;
    try {
      localRaw = localStorage.getItem(key);
    } catch {
      // ignore
    }
    try {
      sessionRaw = sessionStorage.getItem(key);
    } catch {
      // ignore
    }

    const localMap = parseStore(localRaw);
    const sessionMap = parseStore(sessionRaw);
    const merged = new Map<string, { action: 'like' | 'pass'; timestamp: number }>();

    const upsert = (id: string, incoming: { action: 'like' | 'pass'; timestamp: number }) => {
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, incoming);
        return;
      }
      // Never downgrade a like to pass. Otherwise keep the newest timestamp.
      if (existing.action === 'like' && incoming.action === 'pass') return;
      if (existing.action === 'pass' && incoming.action === 'like') {
        merged.set(id, incoming);
        return;
      }
      if (incoming.timestamp > existing.timestamp) {
        merged.set(id, incoming);
      }
    };

    for (const [id, value] of localMap.entries()) upsert(id, value);
    for (const [id, value] of sessionMap.entries()) upsert(id, value);
    return merged;
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
    const obj = Object.fromEntries(locallySwipedProfileIds.current);
    const key = `swiped_profiles_${currentUser.id}`;
    const payload = JSON.stringify(obj);
    try {
      localStorage.setItem(key, payload);
    } catch {
      // ignore
    }
    try {
      sessionStorage.setItem(key, payload);
    } catch {
      // ignore
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

  // Helper to revoke blob URLs for a profile to free memory
  const revokeBlobUrlsForProfile = useCallback((profileId: string, imageUrls: string[]) => {
    setPreloadedBlobImages(prev => {
      const profileBlobs = prev[profileId];
      if (profileBlobs) {
        // Revoke all blob URLs for this profile
        for (const blobUrl of Object.values(profileBlobs)) {
          try {
            if (blobUrl.startsWith('blob:')) {
              URL.revokeObjectURL(blobUrl);
            }
          } catch {
            // ignore revoke errors
          }
        }
      }
      const updated = { ...prev };
      delete updated[profileId];
      return updated;
    });
  }, []);
  
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
  
  const { preloadImages, cancelImages, getOptimizedUrl, isImageLoaded, isImageLoading, clearCache } = useImagePreloader({
    maxConcurrent: 6, // Slightly higher concurrency for faster swipe experience
    quality: 60,
    width: 500
  });

  // Track in-flight image load requests to avoid duplicate DB calls
  const requestedImageProfileIds = useRef<Set<string>>(new Set());

  // ⭐ LIKE-BACK INJECTION: 25% injection of users who liked the current user
  // ⭐ FIX: Store blocked IDs in state (populated from fetchPotentialMatchesData)
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const {
    onLikeBackSwipe,
    isLikedMeProfile,
    likeBackCandidateCount,
    refreshLikeBackCandidates,
  } = useDiscoverLikeBack({
    currentUser,
    premiumActive,
    potentialMatches,
    blockedUserIds,
    locallySwipedProfileIds,
    isAd,
  });

  const { adsLoaded, injectAds } = useDiscoverAds({
    currentUser,
    premiumActive,
    potentialMatches,
    currentIndex,
    setPotentialMatches,
    setCurrentIndex,
  });

  // Ensure currentIndex stays valid when potentialMatches array changes
  useEffect(() => {
    if (potentialMatches.length > 0 && currentIndex >= potentialMatches.length) {
      setCurrentIndex(Math.max(0, potentialMatches.length - 1));
    }
  }, [potentialMatches.length, currentIndex]);

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

  // Swipe count bootstrap: cache-first for instant state, then DB in parallel.
  // Swiping is blocked until the DB count has been fetched (prevents refresh from “resetting” swipes).
  useEffect(() => {
    if (!currentUser?.id) return;

    let cancelled = false;
    setHasLoadedSwipeCountFromDb(false);

    const cached = readCachedSwipeCount(currentUser.id);
    setTodaySwipeCount(typeof cached === 'number' ? cached : null);

    (async () => {
      let loadedFromDb = false;
      try {
        const swipeCount = await getTodaySwipeCount(currentUser.id);
        if (cancelled) return;
        setTodaySwipeCount(prev => {
          const next = Math.max(prev ?? 0, swipeCount);
          writeCachedSwipeCount(currentUser.id, next);
          return next;
        });
        loadedFromDb = true;
      } catch {
        // If DB fetch fails, keep cached value (if any). If none, user stays blocked.
      } finally {
        if (!cancelled) setHasLoadedSwipeCountFromDb(loadedFromDb);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

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

        // Swipe count is fetched in a dedicated effect (cache-first + DB in parallel).
      } catch (error) {
        // ignore profile completion fetch error
      }
    };

      await fetchUserProfileCompletion();
    }, delay);

    return () => clearTimeout(timer);
    // NOTE: Removed premiumActive from dependencies - profile completion doesn't depend on premium status
  }, [currentUser?.id, premiumActive]);

  // Check swipe limit when premium status is resolved (may load after initial swipe count)
  useEffect(() => {
    if (!premiumResolved) return;
    if (todaySwipeCount === null) return;
    
    // Determine the correct swipe limit based on premium status
    const swipeLimit = premiumActive ? 200 : 29;
    
    // Always check and update the out of swipes state based on current premium status
    if (todaySwipeCount >= swipeLimit) {
      setIsOutOfSwipes(true);
    } else {
      setIsOutOfSwipes(false);
    }
  }, [premiumResolved, premiumActive, todaySwipeCount]);

  const bumpLocalSwipeCount = useCallback((delta: number) => {
    if (!currentUser?.id) return;
    // Track optimistic swipes via ref so ultra-fast swipes are enforced immediately,
    // then transfer the count into state+cache (and remove from ref) when React flushes.
    pendingSwipesRef.current += delta;
    setTodaySwipeCount(prev => {
      const next = (prev ?? 0) + delta;
      writeCachedSwipeCount(currentUser.id, next);
      pendingSwipesRef.current = Math.max(0, pendingSwipesRef.current - delta);
      return next;
    });
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
    dragOffsetY: number;
  }>({ isDragging: false, swipeDirection: null, swipeDistance: 0, dragOffset: 0, dragOffsetY: 0 });

  const isDraggingRef = useRef(false);
  // Blocks the swipe/drag gesture start handlers while the report modal (opened from inside
  // MatchCard) is up — otherwise a touch/drag on the card behind the modal both moves the card
  // and drags the modal along with it, since the modal previously inherited the card's transform.
  const isReportModalOpenRef = useRef(false);
  const [exitingCard, setExitingCard] = useState(false);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);
  const latestDeltaRef = useRef(0);
  const latestDeltaYRef = useRef(0);
  const rafScheduledRef = useRef(false);
  // ⭐ ANDROID ONLY: the Android WebView repaints the whole card tree on every React state
  // update, which makes the drag flicker/blink. On Android we drive the card transform
  // imperatively on the DOM node during the gesture and only sync React state in coarse steps.
  const isAndroidDevice = useRef(typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)).current;
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedBucketRef = useRef(0);


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

  const inFlightProfileImageFetchesRef = useRef<Map<string, Promise<string[]>>>(new Map());

  // Load all approved image URLs for one profile
  const loadAllImagesForProfile = useCallback(async (profileId: string) => {
    if (!profileId) return [];

    const cached = userImagesRef.current[profileId];
    if (Array.isArray(cached) && cached.length > 0) return cached;

    const inFlight = inFlightProfileImageFetchesRef.current.get(profileId);
    if (inFlight) return inFlight;

    const fetchPromise = (async () => {
      try {
        const { data: images } = await supabase
          .from('user_images')
          .select('image_url, image_order')
          .eq('user_id', profileId)
          .eq('is_approved', true)
          .order('image_order', { ascending: true });

        return images?.map(img => img.image_url) || [];
      } catch {
        return [];
      } finally {
        inFlightProfileImageFetchesRef.current.delete(profileId);
      }
    })();

    inFlightProfileImageFetchesRef.current.set(profileId, fetchPromise);

    return fetchPromise;
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
          .limit(perCountryLimit);

        if (excludedIds.length > 0) {
          query = query.not('id', 'in', formatUuidInFilter(excludedIds));
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
    // Create timeout wrapper for all database queries (15 second timeout)
    const queryTimeout = <T,>(promise: Promise<T>, timeoutMs = 15000): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeoutMs)
        )
      ]);
    };

    const [
      { data: currentUserData },
      likedUsers,
      { data: matches },
      { data: blockedUsers },
      { data: recentPasses },
      { data: usersWhoLikedMe }
    ] = await queryTimeout(Promise.all([
      supabase
        .from('profiles')
        .select('max_distance, distance_preference, country, country_code, min_age, max_age, preference, unlocked_countries, profile_completion, latitude, longitude')
        .eq('id', userId)
        .single(),
      fetchAllRows<{ liked_id: string }>(() =>
        supabase.from('likes').select('liked_id').eq('liker_id', userId)
      ),
      supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id),
          user2:profiles!matches_user2_id_fkey(id)
        `)
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
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
    ]));

    const likedUserIds = uniqUuids((likedUsers || []).map(like => like.liked_id));
    const matchedUserIds = uniqUuids((matches || [])
      .map((m) => (m.user1_id === userId ? m.user2_id : m.user1_id))
      .filter(Boolean));
    const blockedUserIds = uniqUuids(blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || []);
    const passedUserIds = uniqUuids(recentPasses?.map(p => p.passed_id) || []);
    
    const usersWhoLikedMeIds = uniqUuids((usersWhoLikedMe || [])
      .map(like => like.liker_id)
      .filter(id => !likedUserIds.includes(id) && !blockedUserIds.includes(id) && !passedUserIds.includes(id) && !matchedUserIds.includes(id)));

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
    const excludedIds = uniqUuids([...likedUserIds, ...matchedUserIds, ...blockedUserIds, ...passedUserIds, ...locallySwipedIds, userId]);
    
    const priorityLikerIds = usersWhoLikedMeIds.filter(id => !locallySwipedIds.includes(id));
    
    const userMaxDistanceRaw = currentUserData?.max_distance ?? currentUserData?.distance_preference ?? 50;
    const userMaxDistance = Number(userMaxDistanceRaw);
    // CRITICAL: Free users capped at 500km max, premium users can use their full setting
    const safeUserMaxDistanceUncapped = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;

    // CRITICAL: Use BOTH country_code AND country name as fallback for free user country filtering
    // If they disagree, trust the country name (what the user sees/sets) and fail-closed on missing.
    const baseCountryCode = getTrustedBaseCountryCode(currentUserData?.country_code, currentUserData?.country);

    const premiumForFeed = premiumActive;

    // For FREE users: enforce 500km max distance cap
    const FREE_USER_MAX_DISTANCE = 500;
    const safeUserMaxDistance = premiumForFeed 
      ? safeUserMaxDistanceUncapped 
      : Math.min(safeUserMaxDistanceUncapped, FREE_USER_MAX_DISTANCE);

    const unlockedCountriesRaw = currentUserData?.unlocked_countries ?? currentUser.unlocked_countries;
    const unlockedCountries: string[] = premiumForFeed
      ? normalizeCountryCodeList(unlockedCountriesRaw, baseCountryCode)
      : [];


    const locationMatches = await locationService.getLocationBasedMatches(userId, safeUserMaxDistance);

    const distanceMap: { [key: string]: number } = {};
    // CRITICAL: For free users, ALWAYS filter by country (fail closed if no country)
    // Premium users can see all countries in their unlocked list
    const excludedIdsSet = new Set(excludedIds);
    const locationProfileIds = uniqUuids(locationMatches
      .filter((m) => {
        // CRITICAL: Pre-filter excluded IDs (liked/matched/blocked/passed) from location results
        if (excludedIdsSet.has(m.profile_id)) return false;
        if (!baseCountryCode) {
          // Free user with no country set - return empty (fail closed)
          return premiumForFeed;
        }
        return normalizeCountryCode((m.country_code || '') as string) === baseCountryCode;
      })
      .map((match) => {
        distanceMap[match.profile_id] = match.distance_km;
        return match.profile_id;
      }));

    // Keep PostgREST URLs safe: large `in.(...)` lists can trigger 400s.
    // We only ever fetch a small page (`limit(100)`), so we don't need thousands of IDs here.
    const MAX_LOCATION_IDS_FOR_QUERY = 500;
    const locationProfileIdsForQuery = locationProfileIds.slice(0, MAX_LOCATION_IDS_FOR_QUERY);

    const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at';

    const hasUnlockedCountries = premiumForFeed && unlockedCountries.length > 0;


    let filteredProfiles: ProfileRow[] = [];
    let asyncActivityWeighted: ProfileRow[] | null = null;
    let usingArchivedFallback = false; // Track if we're showing archived profiles

    let localProfiles: ProfileRow[] = [];
    let intlProfiles: ProfileRow[] = [];

    // Phase 1: active users only
    
    if (premiumForFeed) {
      // STEP 1: fetch local distance-based profiles (local country only)
      localProfiles = locationProfileIdsForQuery.length
        ? await (async () => {
            let query = supabase
              .from('profiles')
              .select(PROFILE_SELECT)
              .in('id', locationProfileIdsForQuery);

            if (baseCountryCode) {
              query = query.eq('country_code', baseCountryCode);
            }
            const useDbExclusionPremium = excludedIds.length <= 90;
            if (useDbExclusionPremium && excludedIds.length > 0) {
              query = query.not('id', 'in', formatUuidInFilter(excludedIds));
            }

            const { data: profiles, error } = await query
              .in('gender', allowedGenders)
              .eq('account_status', 'active')
              .eq('is_admin', false)
              .limit(useDbExclusionPremium ? 100 : 500);

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
            .in('gender', allowedGenders)
            .limit(excludedIds.length <= 90 ? 80 : 400);

          if (excludedIds.length > 0 && excludedIds.length <= 90) {
            fallbackQuery = fallbackQuery.not('id', 'in', formatUuidInFilter(excludedIds));
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
      // ⭐ PER-USER RANDOMIZATION: Use user-specific seed so different users see different profiles
      // This ensures fair visibility: everyone gets seen, not just the same few profiles
      const userSeed = getUserFeedSeed(userId);
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
      // ⭐ PER-USER RANDOMIZATION: Each user gets a unique shuffle order
      const mixedProfiles = mixByCountryRoundRobin(
        allActive,
        allowedCountryCodes,
        `${userSeed}_countries`
      );

      const activitySeed = `${userSeed}_activity`;
      let activityWeightedMixed: ProfileRow[] = mixedProfiles;

      // ⭐ ACTIVITY WEIGHTING (Premium): bias to active users without slowing first paint
      // Android: show unweighted first, then light head-only weighting async.
      // iOS/web: light head weighting sync for quality, full weighting async for parity.
      const isAndroid = isAndroidPlatform();
      if (isAndroid) {
        activityWeightedMixed = mixedProfiles;
        asyncActivityWeighted = applyLightActivityWeighting(mixedProfiles, activitySeed) as ProfileRow[];
      } else {
        const lightHead = applyLightActivityWeighting(mixedProfiles, activitySeed, 48) as ProfileRow[];
        activityWeightedMixed = lightHead;
        asyncActivityWeighted = applyActivityWeighting(mixedProfiles, activitySeed) as ProfileRow[];
      }


      // STEP 6: For Premium multi-country, preserve the country rotation
      // Stratified sampling would re-group by account age and destroy the alternation
      // Premium users pay for the best experience → keep pure round-robin mixing
      const premiumInitialCap = isAndroid ? 30 : 60;
      filteredProfiles = activityWeightedMixed.slice(0, premiumInitialCap);


      // (dev-only logging removed)
      
      // Reset archived fallback flag if we found active profiles
      if (filteredProfiles.length > 0) {
        usingArchivedFallback = false;
      }
    } else {
      // Free users: local country only - MUST have a country set
      if (!baseCountryCode) {
        // Free user with no country set - return empty feed (fail closed)
        filteredProfiles = [];
      } else if (locationProfileIdsForQuery.length > 0) {
        let query = supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .in('id', locationProfileIdsForQuery)
          .eq('country_code', baseCountryCode); // Always filter by country for free users

        // PERF: Only apply not.in() when exclusion list is small enough to be reliable.
        // With 2000+ likes, formatUuidInFilter truncates to ~94 UUIDs, making the filter
        // ineffective. Instead, fetch a larger batch and rely on client-side excludedIdsSet.
        const useDbExclusion = excludedIds.length <= 90;
        if (useDbExclusion && excludedIds.length > 0) {
          query = query.not('id', 'in', formatUuidInFilter(excludedIds));
        }

        // Fetch more profiles when DB exclusion is unreliable to compensate for client-side filtering
        const fetchLimit = useDbExclusion ? 100 : 500;
        const { data: profiles, error } = await query
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .limit(fetchLimit);

        if (error) throw error;
        filteredProfiles = Array.isArray(profiles) ? (profiles as unknown as ProfileRow[]) : [];
      } else {
        // Free users fallback: no location IDs from locationService
        // Apply bounding box distance filter if user has coordinates
        const userLat = currentUserData?.latitude;
        const userLon = currentUserData?.longitude;
        
        let query = supabase.from('profiles').select(PROFILE_SELECT)
          .eq('country_code', baseCountryCode); // Always filter by country for free users

        // Apply distance bounding box for free users (CRITICAL for location enforcement)
        if (userLat && userLon) {
          const radiusInDegrees = safeUserMaxDistance / 111.32;
          query = query
            .gte('latitude', userLat - radiusInDegrees)
            .lte('latitude', userLat + radiusInDegrees)
            .gte('longitude', userLon - radiusInDegrees)
            .lte('longitude', userLon + radiusInDegrees);
        }

        // Same logic: skip DB exclusion when list is too large for PostgREST URL
        const useDbExclusionFallback = excludedIds.length <= 90;
        if (useDbExclusionFallback && excludedIds.length > 0) {
          query = query.not('id', 'in', formatUuidInFilter(excludedIds));
        }

        const fallbackFetchLimit = useDbExclusionFallback ? 100 : 500;
        const { data: profiles, error } = await query
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .limit(fallbackFetchLimit);

        if (error) throw error;
        filteredProfiles = Array.isArray(profiles) ? (profiles as unknown as ProfileRow[]) : [];
        
        // Reset archived fallback flag if we found active profiles
        if (filteredProfiles.length > 0) {
          usingArchivedFallback = false;
        }
      }

      // Final enforcement for free users: filter by normalized country using both fields.
      if (baseCountryCode) {
        filteredProfiles = filteredProfiles.filter((p) => isLocalCountryForFreeUser(p, baseCountryCode));
      }

      // CRITICAL: Client-side distance enforcement for free users
      // Even if profiles passed DB filters, re-check distance using precise calculation
      const userLat = currentUserData?.latitude;
      const userLon = currentUserData?.longitude;
      if (userLat && userLon) {
        filteredProfiles = filteredProfiles.filter((p) => {
          if (!p.latitude || !p.longitude) return true; // Allow profiles without coords (they passed country filter)
          const dist = calculateDistance(userLat, userLon, p.latitude, p.longitude);
          // Store distance for later use
          distanceMap[p.id] = dist;
          return dist <= safeUserMaxDistance;
        });
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
      
      const useDbExclusionArchived = excludedIds.length <= 90;
      if (useDbExclusionArchived && excludedIds.length > 0) {
        archivedQuery = archivedQuery.not('id', 'in', formatUuidInFilter(excludedIds));
      }
      
      // Build country filter based on user type
      if (premiumForFeed && allowedCountryCodes.length > 0) {
        archivedQuery = archivedQuery.in('country_code', allowedCountryCodes);
      } else if (baseCountryCode) {
        archivedQuery = archivedQuery.eq('country_code', baseCountryCode);
      }

      // Age filtering is done client-side using date_of_birth (profiles.age column doesn't exist)
      // We'll filter after fetching based on calculated age

      // Apply distance filtering for local country (use currentUserData for location)
      // CRITICAL: For free users, use safeUserMaxDistance (capped at 500km)
      const userLat = currentUserData?.latitude;
      const userLon = currentUserData?.longitude;
      if (baseCountryCode && userLat && userLon) {
        const radiusInDegrees = safeUserMaxDistance / 111.32;

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
        .limit(useDbExclusionArchived ? 50 : 300);

      if (!archivedError && archivedProfiles && archivedProfiles.length > 0) {
        filteredProfiles = Array.isArray(archivedProfiles) ? (archivedProfiles as unknown as ProfileRow[]) : [];
        usingArchivedFallback = true;

        // Non-premium must never show other countries, even in archived fallback.
        if (!premiumForFeed && baseCountryCode) {
          filteredProfiles = filteredProfiles.filter((p) => isLocalCountryForFreeUser(p, baseCountryCode));
          
          // CRITICAL: Client-side distance enforcement for free users in archived fallback
          if (userLat && userLon) {
            filteredProfiles = filteredProfiles.filter((p) => {
              if (!p.latitude || !p.longitude) return true; // Allow profiles without coords
              const dist = calculateDistance(userLat, userLon, p.latitude, p.longitude);
              distanceMap[p.id] = dist;
              return dist <= safeUserMaxDistance;
            });
          }
        }
        
        // Mix archived profiles the same way (explicit country rotation).
        // ⭐ PER-USER RANDOMIZATION: Use user-specific seed for archived profiles too
        if (premiumForFeed && allowedCountryCodes.length > 1) {
          const archivedSeed = getUserFeedSeed(userId) + '_archived';
          filteredProfiles = mixByCountryRoundRobin(
            filteredProfiles.filter((p) => allowedCountryCodes.includes(normalizeCountryCode(p.country_code || ''))),
            allowedCountryCodes,
            archivedSeed
          );
        }
      }
    }
    
    // Update the fallback state
    setIsArchivedFallback(usingArchivedFallback);

    // CRITICAL: Always enforce full exclusion client-side as a final safety net.
    // `not.in(...)` is length-limited for PostgREST URLs and can only include a prefix
    // of very large exclusion lists (e.g., users with thousands of prior likes).
    // Without this pass, already-liked profiles can leak back into the deck.
    // Reuse excludedIdsSet built earlier (before location query)
    filteredProfiles = filteredProfiles.filter((p) => !excludedIdsSet.has(p.id));
    localProfiles = localProfiles.filter((p) => !excludedIdsSet.has(p.id));
    intlProfiles = intlProfiles.filter((p) => !excludedIdsSet.has(p.id));

    // ✅ FINAL EMPTY RULE
    // Free users: empty when local is empty
    // Premium users: empty ONLY when local + intl are empty
    const hasLocal = localProfiles.length > 0;
    const hasIntl = intlProfiles.length > 0;

    if (!premiumForFeed && filteredProfiles.length === 0) {
      setNoMoreProfiles(true);
      setEmptyStateMode('exhausted');
      return { matches: [], images: {}, distances: distanceMap, index: 0 };
    }

    if (premiumForFeed && !hasLocal && !hasIntl && filteredProfiles.length === 0) {
      setNoMoreProfiles(true);
      setEmptyStateMode('exhausted');
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
      
      // ⭐ PER-USER RANDOMIZATION: Use user-specific seed for free users too
      const freeUserSeed = getUserFeedSeed(userId);
      // Apply stratified sampling for free users
      filteredProfiles = getStratifiedBatches(filteredProfiles, 15, 4, freeUserSeed);

      // ⭐ ACTIVITY WEIGHTING (Free): keep first paint fast, then boost actives
      // Android: show unweighted first, apply light head weighting async.
      // iOS/web: light head weighting sync, full weighting async for parity.
      const freeActivitySeed = `${freeUserSeed}_activity`;
      const isAndroid = isAndroidPlatform();
      if (isAndroid) {
        asyncActivityWeighted = applyLightActivityWeighting(filteredProfiles, freeActivitySeed) as ProfileRow[];
      } else {
        const lightHead = applyLightActivityWeighting(filteredProfiles, freeActivitySeed, 48) as ProfileRow[];
        filteredProfiles = lightHead;
        asyncActivityWeighted = applyActivityWeighting(filteredProfiles, freeActivitySeed) as ProfileRow[];
      }
    }

    // If active pool existed but became empty after post-filters/suppression,
    // run one more archived fallback pass before showing true exhaustion.
    if (filteredProfiles.length === 0 && !usingArchivedFallback) {
      const allowedCountryCodes = Array.from(
        new Set([
          ...(baseCountryCode ? [baseCountryCode] : []),
          ...(premiumForFeed ? unlockedCountries : []),
        ])
      ).map((c) => normalizeCountryCode(String(c || ''))).filter(Boolean);

      let archivedRetryQuery = supabase.from('profiles').select(PROFILE_SELECT);

      if (excludedIds.length > 0) {
        archivedRetryQuery = archivedRetryQuery.not('id', 'in', formatUuidInFilter(excludedIds));
      }

      if (premiumForFeed && allowedCountryCodes.length > 0) {
        archivedRetryQuery = archivedRetryQuery.in('country_code', allowedCountryCodes);
      } else if (baseCountryCode) {
        archivedRetryQuery = archivedRetryQuery.eq('country_code', baseCountryCode);
      }

      const userLat = currentUserData?.latitude;
      const userLon = currentUserData?.longitude;
      if (baseCountryCode && userLat && userLon) {
        const radiusInDegrees = safeUserMaxDistance / 111.32;
        archivedRetryQuery = archivedRetryQuery
          .gte('latitude', userLat - radiusInDegrees)
          .lte('latitude', userLat + radiusInDegrees)
          .gte('longitude', userLon - radiusInDegrees)
          .lte('longitude', userLon + radiusInDegrees);
      }

      const { data: archivedRetryRows, error: archivedRetryError } = await archivedRetryQuery
        .eq('is_archived', true)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .in('gender', allowedGenders)
        .limit(50);

      if (!archivedRetryError && archivedRetryRows && archivedRetryRows.length > 0) {
        filteredProfiles = Array.isArray(archivedRetryRows) ? (archivedRetryRows as unknown as ProfileRow[]) : [];
        usingArchivedFallback = true;

        if (!premiumForFeed && baseCountryCode) {
          filteredProfiles = filteredProfiles.filter((p) => isLocalCountryForFreeUser(p, baseCountryCode));
          if (userLat && userLon) {
            filteredProfiles = filteredProfiles.filter((p) => {
              if (!p.latitude || !p.longitude) return true;
              const dist = calculateDistance(userLat, userLon, p.latitude, p.longitude);
              distanceMap[p.id] = dist;
              return dist <= safeUserMaxDistance;
            });
          }
        }
      }
    }

    // Final empty decision after all active filters + archived retry pass.
    if (filteredProfiles.length === 0) {
      setNoMoreProfiles(true);
      setEmptyStateMode('exhausted');
      return { matches: [], images: {}, distances: distanceMap, index: 0 };
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
    // ⭐ PER-USER RANDOMIZATION: Each user gets a unique shuffle order
    const shuffleSeed = getUserFeedSeed(userId);
    
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
    const savedOrderRaw = readPersistentItem(savedOrderKey);

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

    // ⭐ ANDROID FIRST BATCH: Keep the initial visible batch small, refill later
    if (isAndroidPlatform()) {
      const androidInitialCap = 30;
      shuffled = shuffled.slice(0, androidInitialCap);
    }

    // Save profile order to localStorage (post-mix)
    try {
      const profileIds = shuffled.map(p => p.id);

      writePersistentItem(
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
        const minInterval = injectionIndex === 0 ? 8 : 25;
        const maxInterval = injectionIndex === 0 ? 15 : 40;
        
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

    // ⭐ PROFILE POSITION PERSISTENCE: Resume from last viewed profile
    // Load last profile ID and time from localStorage
    const savedId = readPersistentItem(`driplove_last_profile_${userId}`);
    const savedTime = parseInt(readPersistentItem(`driplove_last_profile_time_${userId}`) || '0');
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
      // Take first 4 profiles for the instant-paint batch (or fewer if less exist).
      // Only the top 1-2 cards are ever visible in the stack at once, and the
      // per-swipe preloader (preloadProfileImages, triggered on currentIndex change)
      // keeps loading further ahead as the user actually swipes - so this initial
      // batch only needs to cover first paint, not the whole session.
      const firstEight = shuffled.slice(0, 4);
      const firstEightIds = firstEight.map(p => p.id);

      // Get ALL approved images for the first 8 profiles
      const { data: imageRows, error: imgError } = await supabase
        .from('user_images')
        .select('user_id, image_url, image_order')
        .in('user_id', firstEightIds)
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
        // 3rd–8th: 1 image each
        firstEight.forEach((profile, index) => {
          const imgs = byUser[profile.id] || [];
          if (imgs.length === 0) return;

          let maxCount = 1;
          if (index === 0) maxCount = 3;
          else if (index === 1) maxCount = 2;

          imageMap[profile.id] = imgs.slice(0, maxCount);
        });
      }

      // If there were fewer than 8 profiles or any without images, it's fine.
      // The centralized preloader + loadAllImagesForProfile will keep loading the rest as user swipes.
    }

    const asyncActivityDeck = asyncActivityWeighted
      ? asyncActivityWeighted
          .slice(0, shuffled.length)
          .map((profile) =>
            toPotentialMatch(profile, {
              images: [],
              distance: distanceMap[profile.id],
            })
          )
      : null;

    return {
      matches: shuffled,
      images: imageMap,
      distances: distanceMap,
      index: startIndex,
      asyncActivityDeck,
    };
  }, [premiumActive, currentUser, fetchUnlockedCountryProfiles]);

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
  const deckMemoryCacheRef = useRef<Map<string, { ts: number; deck: MatchOrAd[] }>>(new Map());

  const readDeckCache = useCallback((cacheKey: string): MatchOrAd[] | null => {
    const key = buildDeckCacheKey(cacheKey);
    const readFromStorage = (store?: Storage) => {
      if (!store) return null;
      const raw = store.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; deck: MatchOrAd[] };
      if (!parsed?.ts || !Array.isArray(parsed?.deck)) return null;
      if (Date.now() - parsed.ts > DISCOVER_DECK_CACHE_TTL_MS) return null;
      return parsed.deck;
    };

    try {
      const local = readFromStorage(localStorage);
      if (local) return local;
    } catch {
      // ignore
    }

    try {
      const session = readFromStorage(sessionStorage);
      if (session) return session;
    } catch {
      // ignore
    }

    const mem = deckMemoryCacheRef.current.get(key);
    if (mem && Date.now() - mem.ts <= DISCOVER_DECK_CACHE_TTL_MS) {
      return mem.deck;
    }

    return null;
  }, [buildDeckCacheKey, DISCOVER_DECK_CACHE_TTL_MS]);

  const writeDeckCache = useCallback((cacheKey: string, deck: MatchOrAd[]) => {
    if (!Array.isArray(deck) || deck.length === 0) return;
    const key = `driplove_discover_deck_${cacheKey}`;
    const payload = JSON.stringify({ ts: Date.now(), deck });

    try {
      localStorage.setItem(key, payload);
    } catch {
      // ignore
    }

    try {
      sessionStorage.setItem(key, payload);
    } catch {
      // ignore
    }

    deckMemoryCacheRef.current.set(key, { ts: Date.now(), deck });
  }, []);

  // Reorder an existing deck using a weighted profile list while keeping ad positions stable.
  const reorderDeckWithWeightedProfiles = useCallback(
    (deck: MatchOrAd[], weightedProfiles: PotentialMatch[], preserveRealHead = 5): MatchOrAd[] => {
      if (!deck.length || !weightedProfiles.length) return deck;

      const deckReal = deck.filter((item): item is PotentialMatch => !isAd(item));
      if (!deckReal.length) return deck;

      const preservedIds = new Set(
        deckReal.slice(0, Math.max(0, preserveRealHead)).map((p) => p.id)
      );

      const deckRealIds = new Set(deckReal.map((p) => p.id));
      const weightedReal = weightedProfiles.filter((p) => deckRealIds.has(p.id) && !preservedIds.has(p.id));

      if (weightedReal.length === 0) return deck;

      let realIdx = 0;
      return deck.map((item) => {
        if (isAd(item)) return item;
        if (preservedIds.has(item.id)) return item;
        const nextProfile = weightedReal[realIdx] ?? item;
        if (realIdx < weightedReal.length - 1) realIdx += 1;
        return nextProfile;
      });
    },
    []
  );

  const fetchPotentialMatches = useCallback(async (opts?: { background?: boolean; cacheKey?: string }) => {

    if (!currentUser?.id) return;
    const isBackgroundFetch = opts?.background === true;

    // Swipe cache is now hydrated early via useEffect - no need to check here
    suppressFetchRef.current = false;

    // Latest-wins: if multiple fetches overlap (e.g., free -> premium flip),
    // only apply results from the most recent foreground invocation.
    // Background refreshes should not invalidate an in-flight initial foreground fetch.
    const fetchSeq = isBackgroundFetch ? fetchSequenceRef.current : ++fetchSequenceRef.current;
  
    try {
      // Only foreground fetches should drive the blocking loader.
      if (!isBackgroundFetch) {
        setIsLoading(true);
      }
      setNoMoreProfiles(false); // Reset when fetching new profiles
      setEmptyStateMode('exhausted');

      const result = await Promise.race([
        fetchPotentialMatchesData(currentUser.id, allowedGenders),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Discover fetch timed out')), 25000);
        }),
      ]);
      
      if (result) {
        if (fetchSeq !== fetchSequenceRef.current) {
          // Discard stale fetch results
          return;
        }
        const { matches, images, distances, index, asyncActivityDeck } = result;
        
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

        // ⭐ ASYNC ACTIVITY WEIGHTING: apply after first paint to keep UI snappy
        if (asyncActivityDeck) {
          setTimeout(() => {
            setPotentialMatches(prev => {
              const weightedDeck = reorderDeckWithWeightedProfiles(prev, asyncActivityDeck, 6);
              return weightedDeck;
            });
          }, 0);
        }

        // ⭐ SMART INITIAL IMAGE PRELOADING: Load images with priority
        // First 8 profiles: 1 image each (already loaded in images object)
        // Now preload them with correct priority
        Object.entries(images).forEach(([profileId, imageUrls], index) => {
          if (imageUrls.length > 0) {
            if (index === 0) {
              // Current profile: preload first 3 images with high priority
              preloadImages(imageUrls.slice(0, 3), 'high');
            } else if (index === 1) {
              // Next profile: preload first 2 images with medium priority
              preloadImages(imageUrls.slice(0, 2), 'medium');
            } else {
              // Other profiles: preload first image with low priority
              preloadImages([imageUrls[0]], 'low');
            }
          }
        });

        const cacheKeyForWrite = opts?.cacheKey;
        if (cacheKeyForWrite) {
          writeDeckCache(cacheKeyForWrite, initialDeck);
        }

        // Mark as complete immediately
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
      const err = error as {
        message?: unknown;
        details?: unknown;
        hint?: unknown;
        code?: unknown;
      };
      console.error('[DiscoverPage] Fetch error:', {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        raw: error,
      });

      // Only show message if user is offline
      if (!navigator.onLine) {
        toast({
          title: "Connection issue",
          description: "You seem offline. Please check your connection.",
          variant: "destructive",
        });
      }

      setPotentialMatches([]);
      // Fetch errors are not true feed exhaustion.
      setNoMoreProfiles(false);
      setEmptyStateMode('transient-error');
      setIsLoading(false);
      setHasCompletedInitialFetch(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allowedGenders, toast, fetchPotentialMatchesData, injectAds, batchFetchLanguages]);

  // ⭐ SMART BACKGROUND LOADING: Preload more profiles when user is idle
  // ⭐ ANDROID FIX: Limited idle loading on Android (20 profiles max) to balance UX and performance
  useEffect(() => {
    if (!hasCompletedInitialFetch) return;
    if (potentialMatches.length === 0) return;
    
    const isAndroid = isAndroidPlatform();
    
    let idleTimer: NodeJS.Timeout;
    let isIdle = false;
    
    const startIdleLoading = () => {
      isIdle = true;
      
      // ⭐ ANDROID OPTIMIZATION: Limit background loading to 20 profiles on Android
      // This caches profiles for smoother swiping when user returns, while staying memory-friendly
      const maxBackgroundProfiles = isAndroid ? 20 : 15;
      const backgroundStartOffset = isAndroid ? 3 : 2; // Start later on Android
      const backgroundEndOffset = isAndroid ? Math.min(backgroundStartOffset + maxBackgroundProfiles, potentialMatches.length) : 8;
      const staggerDelay = isAndroid ? 800 : 500; // Longer delay on Android to reduce CPU pressure
      
      // Background load remaining images for upcoming profiles (if not already loaded)
      const profilesToBackgroundLoad = potentialMatches.slice(backgroundStartOffset, backgroundEndOffset).filter(p => !isAd(p)) as PotentialMatch[];
      
      profilesToBackgroundLoad.forEach((profile, idx) => {
        const allImages = userImagesRef.current[profile.id] || [];
        const loadedCount = (userImages[profile.id] || []).length;
        
        // If this profile has more images than currently loaded, load them
        if (allImages.length > loadedCount) {
          const remainingImages = allImages.slice(loadedCount);
          // Stagger the loading to avoid network congestion
          setTimeout(() => {
            if (isIdle) {
              preloadImages(remainingImages, 'low');
            }
          }, idx * staggerDelay);
        }
      });
      
      // ⭐ PROACTIVE LOADING: Load images for far profiles in the background
      // Android: Load profiles up to the 20-profile limit; iOS/Web: Load more aggressively
      const farProfilesStart = isAndroid ? backgroundEndOffset : 8;
      const farProfilesEnd = isAndroid ? Math.min(farProfilesStart + 10, backgroundStartOffset + maxBackgroundProfiles) : 15;
      const farStartDelay = isAndroid ? 3000 : 2000; // Longer initial delay on Android
      const farStaggerDelay = isAndroid ? 1500 : 1000; // Longer stagger on Android
      
      const farProfiles = potentialMatches.slice(farProfilesStart, farProfilesEnd).filter(p => !isAd(p)) as PotentialMatch[];
      farProfiles.forEach((profile, idx) => {
        // Only load if we haven't started loading this profile yet
        if (!userImages[profile.id] && !requestedImageProfileIds.current.has(profile.id)) {
          setTimeout(() => {
            if (isIdle) {
              requestedImageProfileIds.current.add(profile.id);
              loadAllImagesForProfile(profile.id).then(imgs => {
                if (imgs && imgs.length > 0) {
                  setUserImages(prevImgs => ({ ...prevImgs, [profile.id]: imgs }));
                  // Preload first image with low priority
                  preloadImages([imgs[0]], 'low');
                }
                requestedImageProfileIds.current.delete(profile.id);
              });
            }
          }, farStartDelay + idx * farStaggerDelay);
        }
      });
    };
    
    const resetIdleTimer = () => {
      isIdle = false;
      clearTimeout(idleTimer);
      // ⭐ ANDROID FIX: Slightly longer idle delay on Android (3s vs 2s)
      const idleDelay = isAndroid ? 3000 : 2000;
      idleTimer = setTimeout(startIdleLoading, idleDelay);
    };
    
    // Listen for user activity
    window.addEventListener('touchstart', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    
    // Start initial timer
    resetIdleTimer();
    
    return () => {
      isIdle = false;
      clearTimeout(idleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
      window.removeEventListener('mousedown', resetIdleTimer);
    };
  }, [hasCompletedInitialFetch, potentialMatches, userImages, preloadImages, loadAllImagesForProfile]);

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
    // ⭐ ANDROID FIX: Increased batch size from 3 to 5 for smoother swiping
    // This ensures next profiles are ready when user swipes quickly
    const batchSize = isAndroid ? 5 : 10;
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

  // Force refresh function for preference changes
  const forceRefresh = useCallback(() => {
    if (!currentUser?.id) return;
    
    // Reset the initialized ref to force re-initialization
    initializedUserRef.current = null;
    
    // Reset deck state
    fetchSequenceRef.current += 1;
    setPotentialMatches([]);
    setCurrentIndex(0);
    setImageIndex(0);
    setNoMoreProfiles(false);
    setEmptyStateMode('exhausted');
    setHasCompletedInitialFetch(false);
    setIsArchivedFallback(false);
    setPremiumTrulyEmptyAfterRetry(false);
    premiumEmptyAutoRetryRef.current = false;
    
    // Trigger re-initialization by updating a state that's in the dependency array
    // The main useEffect will pick this up and re-run
    setIsLoading(true);
  }, [currentUser?.id]);

  // One-time self-heal when client cache gets stuck on false empty state.
  const emptyStateRecoveryAttemptedRef = useRef(false);
  useEffect(() => {
    emptyStateRecoveryAttemptedRef.current = false;
  }, [currentUser?.id, premiumActive]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!hasCompletedInitialFetch) return;
    if (!noMoreProfiles) return;
    if (potentialMatches.length > 0) return;
    if (emptyStateRecoveryAttemptedRef.current) return;

    emptyStateRecoveryAttemptedRef.current = true;
    let isCancelled = false;

    const runRecovery = async () => {
      // 1) Direct DB sanity query (bypass local cache/deck state).
      // If DB has valid candidates, immediately repopulate instead of showing empty.
      try {
        const userId = currentUser.id;
        const userPref = currentUser.preference || 'everyone';
        const allowedGendersForRecovery = getGenderFilter(userPref);

        const [{ data: currentUserData }, likesRes, matchesRes, blocksRes, passesRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('max_distance, distance_preference, country, country_code, min_age, max_age, latitude, longitude')
            .eq('id', userId)
            .single(),
          fetchAllRows<{ liked_id: string }>(() => supabase.from('likes').select('liked_id').eq('liker_id', userId)),
          supabase.from('matches').select('user1_id,user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
          supabase.from('blocks').select('blocked_id,blocker_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
          supabase
            .from('passes')
            .select('passed_id,passed_at')
            .eq('passer_id', userId)
            .gte('passed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        ]);

        if (!isCancelled && currentUserData) {
          const baseCountryCode = getTrustedBaseCountryCode(currentUserData.country_code, currentUserData.country);
          const maxDistanceRaw = Number(currentUserData.max_distance ?? currentUserData.distance_preference ?? 50);
          const maxDistance = Number.isFinite(maxDistanceRaw) && maxDistanceRaw > 0 ? Math.min(maxDistanceRaw, 500) : 50;
          const minAge = Number(currentUserData.min_age ?? 18);
          const maxAge = Number(currentUserData.max_age ?? 99);

          const excluded = new Set<string>([userId]);
          (likesRes || []).forEach((x) => x?.liked_id && excluded.add(x.liked_id));
          (matchesRes.data || []).forEach((m) => {
            const other = m.user1_id === userId ? m.user2_id : m.user1_id;
            if (other) excluded.add(other);
          });
          (blocksRes.data || []).forEach((b) => {
            if (b?.blocked_id) excluded.add(b.blocked_id);
            if (b?.blocker_id) excluded.add(b.blocker_id);
          });
          (passesRes.data || []).forEach((p) => p?.passed_id && excluded.add(p.passed_id));

          let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at')
            .in('gender', allowedGendersForRecovery)
            .eq('account_status', 'active')
            .eq('is_admin', false)
            .limit(200);

          if (baseCountryCode) {
            query = query.eq('country_code', baseCountryCode);
          }

          // Only use DB exclusion when the set is small enough for PostgREST URLs
          if (excluded.size > 0 && excluded.size <= 90) {
            query = query.not('id', 'in', formatUuidInFilter(Array.from(excluded)));
          }

          if (currentUserData.latitude && currentUserData.longitude) {
            const radiusInDegrees = maxDistance / 111.32;
            query = query
              .gte('latitude', currentUserData.latitude - radiusInDegrees)
              .lte('latitude', currentUserData.latitude + radiusInDegrees)
              .gte('longitude', currentUserData.longitude - radiusInDegrees)
              .lte('longitude', currentUserData.longitude + radiusInDegrees);
          }

          // Swipes are optimistic: the deck removes a card immediately and persists
          // the like/pass to the DB in the background afterward. This query only
          // knows about DB-persisted swipes, so without also checking this local,
          // in-memory record, a profile swiped moments ago (whose write hasn't
          // landed yet) would get pulled right back into the deck it was just
          // removed from - showing up as if the swipe never happened.
          const now = Date.now();
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          const locallyExcluded = new Set<string>();
          for (const [id, data] of locallySwipedProfileIds.current.entries()) {
            if (data.action === 'like' || (now - data.timestamp) < thirtyDaysMs) {
              locallyExcluded.add(id);
            }
          }

          const { data: rows } = await query;
          const recoveredProfiles = (Array.isArray(rows) ? (rows as ProfileRow[]) : [])
            .filter((p) => {
              // Final guard for large exclusion lists (liked/matched/passed/blocked).
              if (excluded.has(p.id)) return false;
              if (locallyExcluded.has(p.id)) return false;
              if (!baseCountryCode) return false;
              if (!isLocalCountryForFreeUser(p, baseCountryCode)) return false;
              if (!p.date_of_birth) return false;
              const age = calculateAge(p.date_of_birth);
              if (!Number.isFinite(age) || age < minAge || age > maxAge) return false;
              if (currentUserData.latitude && currentUserData.longitude && p.latitude && p.longitude) {
                const d = calculateDistance(currentUserData.latitude, currentUserData.longitude, p.latitude, p.longitude);
                if (d > maxDistance) return false;
              }
              return true;
            })
            .map((p) => toPotentialMatch(p, { images: [] }));

          if (!isCancelled && recoveredProfiles.length > 0) {
            setPotentialMatches(injectAds(recoveredProfiles));
            setCurrentIndex(0);
            setImageIndex(0);
            setNoMoreProfiles(false);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // ignore direct recovery errors and continue with cache reset path
      }

      // 2) Fallback: clear stale Discover cache and force a fresh initialization.
      try {
        const userId = currentUser.id;
        const swipedKey = `swiped_profiles_${userId}`;
        const lastProfileKey = `driplove_last_profile_${userId}`;
        const lastProfileTimeKey = `driplove_last_profile_time_${userId}`;

        try { localStorage.removeItem(swipedKey); } catch { /* ignore */ }
        try { sessionStorage.removeItem(swipedKey); } catch { /* ignore */ }
        try { localStorage.removeItem(lastProfileKey); } catch { /* ignore */ }
        try { localStorage.removeItem(lastProfileTimeKey); } catch { /* ignore */ }
        try { sessionStorage.removeItem(lastProfileKey); } catch { /* ignore */ }
        try { sessionStorage.removeItem(lastProfileTimeKey); } catch { /* ignore */ }

        const deckPrefix = `driplove_discover_deck_${userId}_`;
        const orderPrefix = `driplove_profile_order_${userId}_`;

        try {
          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith(deckPrefix) || key.startsWith(orderPrefix)) {
              localStorage.removeItem(key);
            }
          });
        } catch {
          // ignore
        }

        try {
          Object.keys(sessionStorage).forEach((key) => {
            if (key.startsWith(deckPrefix) || key.startsWith(orderPrefix)) {
              sessionStorage.removeItem(key);
            }
          });
        } catch {
          // ignore
        }
      } catch {
        // ignore recovery cleanup errors
      }

      if (isCancelled) return;
      // The direct DB sanity query above already found no eligible candidates,
      // AND we just cleared all local caches.  There is genuinely nobody left to
      // show, so settle into the exhausted empty state rather than calling
      // forceRefresh() — which would reset hasCompletedInitialFetch→false and
      // isLoading→true and could stall forever if the re-triggered fetch never
      // completes (e.g. for users who truly have 0 eligible profiles).
      locallySwipedProfileIds.current.clear();
      setNoMoreProfiles(true);
      setEmptyStateMode('exhausted');
      setIsLoading(false);
      // hasCompletedInitialFetch stays true so the UI renders the empty state
      // card instead of the spinner.
    };

    void runRecovery();

    return () => {
      isCancelled = true;
    };
  }, [
    currentUser?.id,
    hasCompletedInitialFetch,
    noMoreProfiles,
    potentialMatches.length,
    forceRefresh,
    premiumActive,
    currentUser?.preference,
    getGenderFilter,
    injectAds,
  ]);

  // Expose force refresh to window for ProfilePage to trigger
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const win = window as Window & { discoverForceRefresh?: () => void };
      win.discoverForceRefresh = forceRefresh;
      return () => {
        delete win.discoverForceRefresh;
      };
    }
  }, [forceRefresh]);

  // Main effect to fetch data - optimized for fast loading
  useEffect(() => {
    if (!currentUser?.id) return;

    // Reset deck when premium context changes so we don't keep a stale single-country deck.
    if (lastPremiumActiveRef.current !== null && lastPremiumActiveRef.current !== premiumActive) {
      // Invalidate any in-flight fetch results so they cannot overwrite the new deck.
      fetchSequenceRef.current += 1;

      // Keep empty-state UI visible while this automatic re-initialization runs.
      // This avoids flashing the foreground "finding matches" loader when the user
      // is already in a confirmed empty state and we are just refreshing in background.
      const shouldKeepEmptyStateVisible =
        hasCompletedInitialFetchRef.current && potentialMatchesRef.current.length === 0;

      setPotentialMatches([]);
      setCurrentIndex(0);
      setImageIndex(0);
      setNoMoreProfiles(false);
      setHasCompletedInitialFetch(!shouldKeepEmptyStateVisible ? false : true);
      setIsArchivedFallback(false);
      setPremiumTrulyEmptyAfterRetry(false);
      premiumEmptyAutoRetryRef.current = false;

      if (shouldKeepEmptyStateVisible) {
        setIsLoading(false);
      }
    }
    lastPremiumActiveRef.current = premiumActive;

    // Create preference hash from key fields that affect matching
    const baseCountryCodeForKey = getTrustedBaseCountryCode(currentUser.country_code, currentUser.country);
    // CRITICAL: For FREE users, ignore unlocked_countries in cache key (they shouldn't see international profiles)
    const unlockedCountriesForKey = premiumActive 
      ? (currentUser.unlocked_countries || []).sort().join(',')
      : ''; // Free users always get empty unlocked countries
    const prefHash = [
      currentUser.gender || '',
      currentUser.preference || '',
      currentUser.min_age || '',
      currentUser.max_age || '',
      currentUser.max_distance || '',
      baseCountryCodeForKey,
      unlockedCountriesForKey,
    ].join('_');

    // Create cache key that includes date, premium status, AND preferences
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${currentUser.id}_${today}_${premiumActive ? 'premium' : 'free'}_${prefHash}`;

    if (initializedUserRef.current === cacheKey) {
      return; // Already initialized for this user today with these preferences
    }

    // locallySwipedProfileIds.current.clear(); // REMOVED

    // ⭐ CRITICAL FIX: Reconcile local swipe cache against DB source-of-truth on page load.
    // This prevents stale/corrupt local swipe entries from permanently hiding valid profiles.
    // Keep only server-backed history + very recent optimistic local swipes.
    const syncDbLikesToLocalStorage = async () => {
      try {
        // Fetch likes/matches/passes that Discover exclusion logic depends on.
        const now = Date.now();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        // Keep unsynced optimistic swipes only for a short grace window.
        const LOCAL_OPTIMISTIC_GRACE_MS = 10 * 60 * 1000;
        
        const [likesResult, matchesResult, passesResult] = await Promise.all([
          supabase
            .from('likes')
            .select('liked_id, created_at')
            .eq('liker_id', currentUser.id),
          supabase
            .from('matches')
            .select('user1_id, user2_id, created_at')
            .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`),
          supabase
            .from('passes')
            .select('passed_id, passed_at')
            .eq('passer_id', currentUser.id)
            .gte('passed_at', thirtyDaysAgo)
        ]);

        const reconciled = new Map<string, { action: 'like' | 'pass'; timestamp: number }>();

        // Merge server likes (permanent exclusion)
        if (likesResult.data && likesResult.data.length > 0) {
          for (const like of likesResult.data) {
            const likedId = like.liked_id;
            if (!likedId) continue;
            const timestamp = like.created_at ? new Date(like.created_at).getTime() : now;
            reconciled.set(likedId, { action: 'like', timestamp });
          }
        }

        // Merge server matches as permanent likes
        if (matchesResult.data && matchesResult.data.length > 0) {
          for (const match of matchesResult.data) {
            const matchedId = match.user1_id === currentUser.id ? match.user2_id : match.user1_id;
            if (!matchedId) continue;
            const timestamp = match.created_at ? new Date(match.created_at).getTime() : now;
            reconciled.set(matchedId, { action: 'like', timestamp });
          }
        }

        // Merge server passes (30-day exclusion)
        if (passesResult.data && passesResult.data.length > 0) {
          for (const pass of passesResult.data) {
            const passedId = pass.passed_id;
            if (!passedId) continue;
            // Never downgrade a permanent like/match into pass
            if (reconciled.get(passedId)?.action === 'like') continue;
            const timestamp = pass.passed_at ? new Date(pass.passed_at).getTime() : now;
            reconciled.set(passedId, { action: 'pass', timestamp });
          }
        }

        // Preserve only very recent optimistic local entries that might not be synced yet.
        for (const [id, data] of locallySwipedProfileIds.current.entries()) {
          if (!id || !data) continue;
          if (reconciled.has(id)) continue;
          if (!Number.isFinite(data.timestamp)) continue;
          if ((now - data.timestamp) <= LOCAL_OPTIMISTIC_GRACE_MS) {
            reconciled.set(id, data);
          }
        }

        locallySwipedProfileIds.current = reconciled;
        persistSwipedIds();
        
      } catch (error) {
        // Silently fail - app will still work with localStorage data
        console.warn('[DiscoverPage] Failed to sync DB likes/matches:', error);
      }
    };

    // Ensure local swipe history is hydrated before we read cached decks or build exclusions.
    // This prevents already-liked/passed profiles from resurrecting after refresh.
    try {
      const stored = getStoredSwipedIds();
      if (stored.size > 0 || locallySwipedProfileIds.current.size === 0) {
        locallySwipedProfileIds.current = stored;
      }
    } catch {
      // ignore storage errors 
    }

    const pruneExpiredPassedSwipes = () => {
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
    };

    const scheduleStorageCleanup = () => {
      setTimeout(() => {
        try {
          const today = todayStr();
          const prefix = `driplove_profile_order_${currentUser.id}_`;
          const deckPrefix = `driplove_discover_deck_${currentUser.id}_`;

          // Remove old profile orders (not today's) and old cached decks (different preferences)
          const keys = Object.keys(localStorage);
          keys.forEach(key => {
            // Remove old profile orders
            if (key.startsWith(prefix) && !key.includes(`_${today}_`)) {
              localStorage.removeItem(key);
            }
            // Remove cached decks that don't match current cache key
            if (key.startsWith(deckPrefix) && key !== `driplove_discover_deck_${cacheKey}`) {
              localStorage.removeItem(key);
            }
          });
        } catch {
          // Ignore localStorage errors
        }
      }, 1000); // Defer cleanup to not block initialization
    };

    // Start loading immediately - always fetch fresh to exclude swiped profiles
    let isCancelled = false;

    const initializeProfiles = async () => {
      initializedUserRef.current = cacheKey;

      const hydrateLocalSwipedIds = () => {
        try {
          const stored = getStoredSwipedIds();
          if (stored.size > 0 || locallySwipedProfileIds.current.size === 0) {
            locallySwipedProfileIds.current = stored;
          }
        } catch {
          // ignore
        }
      };

      // Kick off reconciliation in background so startup is never blocked.
      const syncPromise = syncDbLikesToLocalStorage();

      pruneExpiredPassedSwipes();
      scheduleStorageCleanup();

      // Apply reconciliation result when it completes and refresh in background.
      void syncPromise
        .then(() => {
          if (isCancelled) return;
          if (initializedUserRef.current !== cacheKey) return;
          if (!hasCompletedInitialFetchRef.current) return;
          pruneExpiredPassedSwipes();
          hydrateLocalSwipedIds();
          void fetchPotentialMatches({ background: true, cacheKey });
        })
        .catch(() => {
          // ignore sync completion failures
        });

      // Final safety net: hydrate again right before using cache.
      // (Helps during fast mount/unmount cycles or storage races.)
      hydrateLocalSwipedIds();

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
        
        const keyForStorage = buildDeckCacheKey(cacheKey);
        
        // For free users: calculate max distance (capped at 500km)
        const FREE_USER_MAX_DISTANCE_CACHE = 500;
        const userMaxDistanceForCache = currentUser.max_distance || currentUser.distance_preference || 500;
        const freeUserMaxDistance = premiumActive 
          ? userMaxDistanceForCache 
          : Math.min(userMaxDistanceForCache, FREE_USER_MAX_DISTANCE_CACHE);
        const userLat = currentUser.latitude;
        const userLon = currentUser.longitude;
        
        const filteredCachedDeck = cachedDeck.filter(item => {
          if (isAd(item)) return true; // Keep ads
          if (swipedToExclude.has(item.id)) return false;
          // Free users: never show other countries AND enforce distance limit
          if (!premiumActive) {
            if (!baseCountryCodeForKey) return false;
            // First check country
            if (!isLocalCountryForFreeUser(item, baseCountryCodeForKey)) return false;
            // Then check distance (if coordinates available)
            if (userLat && userLon && item.latitude && item.longitude) {
              const dist = calculateDistance(userLat, userLon, item.latitude, item.longitude);
              if (dist > freeUserMaxDistance) return false;
            }
            return true;
          }
          return true;
        });

        // If cache contains disallowed entries, delete it so refresh can't resurrect them.
        const hadProfilesRemoved = filteredCachedDeck.length !== cachedDeck.length;
        if (hadProfilesRemoved) {
          try { localStorage.removeItem(keyForStorage); } catch { /* ignore */ }
          try { sessionStorage.removeItem(keyForStorage); } catch { /* ignore */ }
          deckMemoryCacheRef.current.delete(keyForStorage);
        }
        
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

    return () => {
      isCancelled = true;
    };
  }, [
    currentUser?.id,
    currentUser?.country,
    currentUser?.country_code,
    currentUser?.distance_preference,
    currentUser?.gender,
    currentUser?.latitude,
    currentUser?.longitude,
    currentUser?.max_age,
    currentUser?.max_distance,
    currentUser?.min_age,
    currentUser?.preference,
    currentUser?.unlocked_countries,
    premiumActive,
    buildDeckCacheKey,
    fetchPotentialMatches,
    fetchReverseUsage,
    persistSwipedIds,
    getStoredSwipedIds,
    readDeckCache,
  ]);


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
    if (isReportModalOpenRef.current) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    currentXRef.current = touch.clientX;
    currentYRef.current = touch.clientY;
    isDraggingRef.current = true;
    setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0, dragOffsetY: 0 }));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const touch = e.touches[0];
    currentXRef.current = touch.clientX;
    currentYRef.current = touch.clientY;

    const deltaX = currentXRef.current - startXRef.current;
    const deltaY = currentYRef.current - startYRef.current;

    // The card follows the finger freely in both directions (grab-and-move feel).
    // Only the horizontal component decides the like/pass direction.
    latestDeltaRef.current = deltaX;
    latestDeltaYRef.current = deltaY;
    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true;
      requestAnimationFrame(() => {
        const d = latestDeltaRef.current;
        const dy = latestDeltaYRef.current;

        if (isAndroidDevice) {
          // ⭐ ANDROID ONLY: write the transform straight to the DOM node so the gesture never
          // re-renders the (very large) card tree mid-drag — that re-render is what makes the
          // Android WebView blink/stutter while holding and dragging. iOS/web are untouched.
          const el = cardElRef.current;
          if (el) {
            el.style.transform = `translate3d(${d}px, ${dy}px, 0) rotate(${d * 0.06}deg) scale(1)`;
          }
          // Sync React state only in coarse 60px steps so the like/pass overlay still appears
          // and grows, without a state update on every animation frame.
          const bucket = Math.round(Math.abs(d) / 60);
          const dir: 'left' | 'right' = d > 0 ? 'right' : 'left';
          if (bucket !== lastSyncedBucketRef.current) {
            lastSyncedBucketRef.current = bucket;
            setSwipeUI(prev => ({ ...prev, dragOffset: d, dragOffsetY: dy, swipeDistance: Math.abs(d), swipeDirection: dir }));
          }
        } else {
          setSwipeUI(prev => ({ ...prev, dragOffset: d, dragOffsetY: dy, swipeDistance: Math.abs(d), swipeDirection: d > 0 ? 'right' : 'left' }));
        }
        rafScheduledRef.current = false;
      });
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
    latestDeltaYRef.current = 0;
    if (rafScheduledRef.current) rafScheduledRef.current = false;
    // ⭐ ANDROID ONLY: drop the imperative transform written during the drag so React's
    // style (snap-back / exit animation) takes over again.
    if (isAndroidDevice) {
      lastSyncedBucketRef.current = 0;
      if (cardElRef.current) cardElRef.current.style.transform = '';
    }
    setSwipeUI(prev => ({ ...prev, dragOffset: 0, dragOffsetY: 0, swipeDistance: 0 }));


    if (Math.abs(deltaX) > minSwipeDistance) {
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
    if (isReportModalOpenRef.current) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    currentXRef.current = e.clientX;
    currentYRef.current = e.clientY;
    isDraggingRef.current = true;
    setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0, dragOffsetY: 0 }));

    // Attach global mouse listeners to ensure we capture mouseup/move even if pointer leaves the element
    const onWindowMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      currentXRef.current = ev.clientX;
      currentYRef.current = ev.clientY;
      const deltaX = currentXRef.current - startXRef.current;
      const deltaY = currentYRef.current - startYRef.current;
      // rAF throttle visual updates — card follows the cursor freely in both directions
      latestDeltaRef.current = deltaX;
      latestDeltaYRef.current = deltaY;
      if (!rafScheduledRef.current) {
        rafScheduledRef.current = true;
        requestAnimationFrame(() => {
          const d = latestDeltaRef.current;
          const dy = latestDeltaYRef.current;
          setSwipeUI(prev => ({ ...prev, dragOffset: d, dragOffsetY: dy, swipeDistance: Math.abs(d), swipeDirection: d > 0 ? 'right' : 'left' }));
          rafScheduledRef.current = false;
        });
      }
      // Prevent default to avoid text selection during dragging
      ev.preventDefault();
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
      latestDeltaYRef.current = 0;
      if (rafScheduledRef.current) rafScheduledRef.current = false;
      setSwipeUI(prev => ({ ...prev, dragOffset: 0, dragOffsetY: 0, swipeDistance: 0, swipeDirection: null }));
      if (Math.abs(deltaX) > minSwipeDistance) {
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

    // This function is mainly a compatibility shim - slide navigation lives inside MatchCard
  };

  // Function to load more matches when running low - optimized for 5 at a time
  const loadMoreMatches = useCallback(async () => {
    if (!currentUser?.id || isLoadingMore) return;

    try {
      setIsLoadingMore(true);

      // ✅ Refill should use the *same* eligibility rules as the initial fetch.
      // We call the shared fetch routine, then append only *new* profiles (deduped).
      const result = await fetchPotentialMatchesData(currentUser.id, allowedGenders);
      if (!result) return;

      const { matches, images, distances } = result;

      // CRITICAL FIX: Don't set noMoreProfiles if we got results but they're duplicates
      // This happens when the query returns profiles we already have
      // Instead, only set noMoreProfiles if the DB returned 0 profiles at all
      if (matches.length === 0) {
        // Truly no profiles available from DB
        setNoMoreProfiles(true);
        setEmptyStateMode('exhausted');
        return;
      }

      const existingProfileIds = new Set(
        potentialMatches
          .filter((p): p is PotentialMatch => !isAd(p))
          .map((p) => p.id)
      );

      const newProfiles = matches.filter((m) => !existingProfileIds.has(m.id));
      const refillChunkSize = isAndroidPlatform() ? 20 : 25;
      let refillChunk = newProfiles.slice(0, refillChunkSize);

      if (refillChunk.length === 0) {
        // Duplicate-heavy result set: retry once immediately to avoid a confusing no-op.
        const retryResult = await fetchPotentialMatchesData(currentUser.id, allowedGenders);
        if (!retryResult || retryResult.matches.length === 0) {
          setEmptyStateMode('no-new');
          return;
        }

        const retryNewProfiles = retryResult.matches.filter((m) => !existingProfileIds.has(m.id));
        refillChunk = retryNewProfiles.slice(0, refillChunkSize);

        if (refillChunk.length === 0) {
          setEmptyStateMode('no-new');
          return;
        }
      }

      setNoMoreProfiles(false);
      setEmptyStateMode('exhausted');
      if (premiumTrulyEmptyAfterRetry) setPremiumTrulyEmptyAfterRetry(false);

      // Merge images/distances for the incoming chunk (don't clobber current state)
      const refillIds = new Set(refillChunk.map((p) => p.id));
      const imageUpdates: Record<string, string[]> = {};
      for (const [id, urls] of Object.entries(images || {})) {
        if (refillIds.has(id) && Array.isArray(urls)) imageUpdates[id] = urls;
      }

      const distanceUpdates: Record<string, number> = {};
      for (const id of refillIds) {
        const d = (distances as Record<string, unknown> | undefined)?.[id];
        if (typeof d === 'number' && Number.isFinite(d)) distanceUpdates[id] = d;
      }

      if (Object.keys(imageUpdates).length > 0) {
        setUserImages((prev) => ({ ...prev, ...imageUpdates }));
      }
      if (Object.keys(distanceUpdates).length > 0) {
        setUserDistances((prev) => ({ ...prev, ...distanceUpdates }));
      }

      const refillWithAds = injectAds(refillChunk);
      setPotentialMatches((prev) =>
        mergeDecksWithoutProfileDupes(prev, refillWithAds, locallySwipedProfileIds.current)
      );

      // Keep the same preload/language behavior for refills
      preloadProfileImages(refillChunk, 0);
      batchFetchLanguages(refillChunk.map((p) => p.id).filter(Boolean));
    } catch {
      // ignore load more errors; UI will retry via refill effect
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    currentUser,
    allowedGenders,
    potentialMatches,
    isLoadingMore,
    preloadProfileImages,
    injectAds,
    batchFetchLanguages,
    premiumTrulyEmptyAfterRetry,
    fetchPotentialMatchesData,
  ]);

  const lastAutoRefillAttemptAtRef = useRef<number>(0);

  // ⭐ AUTO-REFILL ON SWIPE - Load more profiles as user swipes
  // Triggers when 25 REAL profiles remaining (excludes ads) - SINGLE SOURCE OF TRUTH for reloads
  useEffect(() => {
    // Count only real profiles (exclude ads) for accurate reload timing
    const remainingReal = potentialMatches
      .slice(currentIndex)
      .filter(m => !isAd(m))
      .length;

    const REFILL_THRESHOLD = isAndroidPlatform() ? 14 : 25; // Refill earlier on Android to avoid swipe starvation

    if (!hasCompletedInitialFetch) return;
    if (isLoadingMore) return;
    // When the empty state is shown, keep it stable until the user manually refreshes.
    if (potentialMatches.length === 0 || noMoreProfiles) return;
    if (remainingReal > REFILL_THRESHOLD) return;

    // Avoid tight loops when the deck is empty. Retry occasionally so new profiles
    // (or newly-indexed location matches) can appear without requiring a manual refresh.
    const now = Date.now();
    const COOLDOWN_MS = 30_000;
    if (now - lastAutoRefillAttemptAtRef.current < COOLDOWN_MS) return;
    lastAutoRefillAttemptAtRef.current = now;

    loadMoreMatches();
  }, [potentialMatches, currentIndex, isLoadingMore, hasCompletedInitialFetch, noMoreProfiles, loadMoreMatches]);

  // ⭐ SWIPE FATIGUE RESCUE: Inject active profiles after long no-match streaks
  // This prevents user fatigue and increases retention (Tinder-style behavior)
  useEffect(() => {
    // Early exit conditions - these are lightweight checks
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
  }, [noMatchStreak, potentialMatches, currentIndex, currentUser?.id, usersWhoLikedMeIds, RESCUE_COOLDOWN_MS, isArchivedFallback]);
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

  // Helper to persist swipe count to database using the proper RPC
  const persistSwipeCount = async (userId: string) => {
    try {
      // Use the update_user_usage RPC which correctly handles upsert + increment
      const { error } = await (supabase as unknown as {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc('update_user_usage', {
        user_id_param: userId,
        usage_type: 'swipe',
        increment_by: 1,
      });

      if (error) {
        console.error('Failed to persist swipe count via RPC:', error);
        // Fallback: Direct SQL upsert with proper increment
        const today = new Date().toISOString().split('T')[0];
        
        // First check if record exists
        const { data: existing } = await supabase
          .from('user_usage')
          .select('swipes_used')
          .eq('user_id', userId)
          .eq('date', today)
          .maybeSingle();
        
        if (existing) {
          // Update existing record
          await supabase
            .from('user_usage')
            .update({ swipes_used: (existing.swipes_used || 0) + 1 })
            .eq('user_id', userId)
            .eq('date', today);
        } else {
          // Insert new record
          await supabase
            .from('user_usage')
            .insert({
              user_id: userId,
              date: today,
              swipes_used: 1,
              reverse_dislikes_used: 0,
            });
        }
      }
    } catch (err) {
      console.error('Error persisting swipe count:', err);
    }
  };

  // Optimistic UI: move to next card instantly, then process like in background
  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Prevent refresh from “resetting” swipes: don’t allow swiping until the DB swipe count is loaded.
    if (!hasLoadedSwipeCountFromDb || todaySwipeCount === null) {
      toast({
        title: 'One sec 💕',
        description: 'Checking your swipe balance...',
        duration: 1500,
      });
      return;
    }

    // Include optimistic swipes so ultra-fast swiping can't bypass daily limit.
    const effectiveSwipeCount = todaySwipeCount + pendingSwipesRef.current;

    swipeDebug('handleLike: start', {
      currentIndex,
      deckLen: potentialMatches.length,
      current: isAd(currentMatch) ? `ad:${currentMatch.id}` : currentMatch.id,
      pending: pendingSwipesRef.current,
      todaySwipeCount,
      effectiveSwipeCount,
      swipeLimit: premiumActive ? 200 : 29,
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
    if (effectiveProfileCompletion < 70 && effectiveSwipeCount >= 5) {
      swipeDebug('handleLike: blocked by profile completion', {
        parentProfileCompletion,
        computedProfileCompletion,
        effectiveProfileCompletion,
        todaySwipeCount,
        effectiveSwipeCount,
      });
      toast({
        title: t('discover.errors.profileCompletionRequired'),
        description: (
          <div className="flex items-center justify-between gap-3">
            <span className="flex-1">
              {t('discover.errors.profileCompletionMessage')}
            </span>
            {onNavigateToProfile && (
              <button
                type="button"
                className="shrink-0 underline font-semibold"
                onClick={onNavigateToProfile}
              >
                Profile
              </button>
            )}
          </div>
        ),
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: 20 swipes, Premium users: 200 swipes
    const swipeLimit = premiumActive ? 200 : 29;

    // Block purely based on the authoritative swipe count.
    if (effectiveSwipeCount >= swipeLimit) {
      setIsOutOfSwipes(true);
      return;
    }

    // Optimistic path: advance UI immediately, then persist the action in background.
    const prevMatch = currentMatch;

    // ✅ Increment local swipe count immediately (persists across refresh/app close).
    bumpLocalSwipeCount(1);

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

    // Revoke blob URLs after animation completes (400ms) to free memory
    setTimeout(() => {
      const imagesToRevoke = userImages[prevMatch.id] || [];
      revokeBlobUrlsForProfile(prevMatch.id, imagesToRevoke);
    }, 450);

    // Capture values now to avoid stale closures inside the queue job
    const likerId = currentUser.id;
    const likedId = prevMatch.id;
    const premiumParam = premiumActive;

    // Immediately advance the UI
    moveToNext(prevMatch);

    // Persist the like in background immediately (NOT queued).
    // Rationale: queued tasks can lag behind fast swiping; if the app is refreshed/closed,
    // the queued jobs may never run and the DB swipe count under-reports, letting users
    // swipe again after a refresh. Running immediately makes the daily limit persist.
    void (async () => {
      try {
        swipeDebug('handleLike: DB persist starting', { likerId, likedId, premiumParam });
        
        // Attempt the batched RPC to record the like and detect mutual
        const rpcName = 'like_and_usage_batched';
        const { data: rpcData, error: rpcError } = await (supabase as unknown as {
          rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc(rpcName, {
          liker_id_param: likerId,
          liked_id_param: likedId,
          premium_param: premiumParam,
        });

        swipeDebug('handleLike: RPC completed', { rpcData, rpcError });

        if (rpcError) {
          swipeDebug('handleLike: RPC failed, attempting fallback', { rpcError });
          // Fallback: attempt to insert like and check mutual
          try {
            const { data: existingLike } = await supabase
              .from('likes')
              .select('id')
              .match({ liker_id: likerId, liked_id: likedId })
              .maybeSingle();

            if (!existingLike) {
              const { error: insertError } = await supabase
                .from('likes')
                .insert({ liker_id: likerId, liked_id: likedId });

              if (insertError) {
                swipeDebug('handleLike: Fallback insert failed', { insertError });
                throw insertError;
              }
              
              swipeDebug('handleLike: Fallback like inserted successfully');
              await persistSwipeCount(currentUser.id);

              // Notify other parts of the app (e.g., Profile stats) immediately
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('swipePersisted', { detail: { type: 'like', delta: 1 } })
                );
              }
              
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
              .match({ liker_id: likedId, liked_id: likerId })
              .maybeSingle();

            if (mutualLike) {
              setMatchedUser(prevMatch);
              setShowMatchAnimation(true);
              
              if (registerMatchAndCheckIsFirst()) {
                isFirstEverMatchRef.current = true;
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
          // RPC succeeded — increment swipe count after successful DB write
          swipeDebug('handleLike: RPC succeeded');
          await persistSwipeCount(currentUser.id);

          // Notify other parts of the app (e.g., Profile stats) immediately
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('swipePersisted', { detail: { type: 'like', delta: 1 } })
            );
          }
          
          // If server reports a match, show animation
          const hasMatch =
            !!rpcData &&
            typeof rpcData === 'object' &&
            Boolean((rpcData as Record<string, unknown>).match);
          if (hasMatch) {
            // ⭐ SWIPE FATIGUE RESCUE: Reset streak on match
            setNoMatchStreak(0);
            
            setMatchedUser(prevMatch);
            setShowMatchAnimation(true);

            if (registerMatchAndCheckIsFirst()) {
              isFirstEverMatchRef.current = true;
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
        // No-op: local swipe count is bumped immediately and is authoritative.
      }
    })();
  };

  // Optimistic UI: move to next card instantly, then process pass in background
  // Function to execute pass after user confirms (used when "they liked you" popup is shown)
  const executePassLogic = async (matchToPass: PotentialMatch) => {
    // Prevent refresh from “resetting” swipes: don’t allow swiping until the DB swipe count is loaded.
    if (!hasLoadedSwipeCountFromDb || todaySwipeCount === null) {
      toast({
        title: 'One sec 💕',
        description: 'Checking your swipe balance...',
        duration: 1500,
      });
      return;
    }

    // Include optimistic swipes so ultra-fast swiping can't bypass daily limit.
    const effectiveSwipeCount = todaySwipeCount + pendingSwipesRef.current;

    swipeDebug('executePassLogic: start', {
      currentIndex,
      deckLen: potentialMatches.length,
      matchToPassId: matchToPass?.id,
      pending: pendingSwipesRef.current,
      todaySwipeCount,
      effectiveSwipeCount,
      swipeLimit: premiumActive ? 200 : 29,
      parentProfileCompletion,
      computedProfileCompletion,
      effectiveProfileCompletion,
    });

    // Check profile completion restriction (70% after 5 swipes)
    if (effectiveProfileCompletion < 70 && effectiveSwipeCount >= 5) {
      swipeDebug('executePassLogic: blocked by profile completion', {
        parentProfileCompletion,
        computedProfileCompletion,
        effectiveProfileCompletion,
        todaySwipeCount,
        effectiveSwipeCount,
      });
      toast({
        title: t('discover.errors.profileCompletionRequired'),
        description: (
          <div className="flex items-center justify-between gap-3">
            <span className="flex-1">
              {t('discover.errors.profileCompletionMessage')}
            </span>
            {onNavigateToProfile && (
              <button
                type="button"
                className="shrink-0 underline font-semibold"
                onClick={onNavigateToProfile}
              >
                Profile
              </button>
            )}
          </div>
        ),
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: 20 swipes, Premium users: 200 swipes
    const swipeLimit = premiumActive ? 200 : 29;

    // Block purely based on the authoritative swipe count.
    if (effectiveSwipeCount >= swipeLimit) {
      setIsOutOfSwipes(true);
      return;
    }

    // Optimistic path for pass: add to passed list locally, advance UI, persist in background and rollback on error
    // ✅ Use the passed parameter, not undefined currentMatch
    const prevMatch = matchToPass;

    // ✅ Increment local swipe count immediately (persists across refresh/app close).
    bumpLocalSwipeCount(1);

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

    // Revoke blob URLs after animation completes (400ms) to free memory
    setTimeout(() => {
      const imagesToRevoke = userImages[prevMatch.id] || [];
      revokeBlobUrlsForProfile(prevMatch.id, imagesToRevoke);
    }, 450);

    // Optimistically add to passed list
    setPassedUsers(prev => [{ user_id: prevMatch.id, passed_at: new Date() }, ...prev.slice(0, 9)]);

    // Capture values now to avoid stale closures inside the queue job
    const passerId = currentUser.id;
    const passedId = prevMatch.id;
    const premiumParam = premiumActive;

    // Immediately advance UI
    moveToNext(prevMatch);

    // Persist the pass in background immediately (NOT queued).
    // This keeps DB usage in sync even if the user refreshes/closes quickly after swiping.
    void (async () => {
      try {
        const rpcName = 'pass_and_usage_batched';
        const { error: rpcError } = await (supabase as unknown as {
          rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc(rpcName, {
          passer_id_param: passerId,
          passed_id_param: passedId,
          premium_param: premiumParam,
        });

        if (rpcError) {
          swipeDebug('executePassLogic: RPC failed, attempting fallback', { rpcError });
          // Fallback: insert pass directly
          try {
            const { data: existingPass } = await supabase
              .from('passes')
              .select('id')
              .match({ passer_id: passerId, passed_id: passedId })
              .maybeSingle();

            if (!existingPass) {
              const { error: insertError } = await supabase
                .from('passes')
                .insert({ passer_id: passerId, passed_id: passedId });

              if (insertError) {
                throw insertError;
              }
              
              await persistSwipeCount(currentUser.id);

              // Notify other parts of the app (for debugging/telemetry)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('swipePersisted', { detail: { type: 'pass', delta: 1 } })
                );
              }
            }
          } catch (fallbackErr) {
            // ✅ DO NOT rollback on network/RPC failures.
            // Keep UX moving; we'll retry sync later.
            swipeDebug('executePassLogic: persist failed (fallback), not rolling back', { err: fallbackErr });
            return;
          }
        } else {
          // RPC succeeded — persist server usage
          await persistSwipeCount(currentUser.id);

          // Notify other parts of the app (for debugging/telemetry)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('swipePersisted', { detail: { type: 'pass', delta: 1 } })
            );
          }
        }
      } catch (jobErr) {
        // ✅ DO NOT rollback on unexpected network/RPC failures.
        // Keep UX moving; we'll retry sync later.
        swipeDebug('executePassLogic: persist failed (job), not rolling back', { err: jobErr });
      } finally {
        // No-op: local swipe count is bumped immediately and is authoritative.
      }
    })();
  };

  const handlePass = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Skip passes on ads - just move to next
    if (isAd(currentMatch)) {
      moveToNext(currentMatch);
      return;
    }

    // ⭐ NEW: Show notification if this user already liked you (but still allow the pass)
    if (usersWhoLikedMeIds.includes(currentMatch.id)) {
      toast({
        title: `${currentMatch.first_name} already likes you 💕`,
        description: 'Want to give them a chance?',
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
    if (!premiumActive) {
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
          const userWithImages = toPotentialMatch(profileData as unknown as ProfileRow, { images: [] });
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
        const baseCountryCode = normalizeCountryCode(String(currentUser?.country_code ?? ''));
        const unlockedCountries = normalizeCountryCodeList(currentUser?.unlocked_countries, baseCountryCode);
        const userMaxDistanceRaw = currentUser?.max_distance ?? currentUser?.distance_preference ?? 50;
        const userMaxDistance = Number(userMaxDistanceRaw);
        const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;
        const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, premiumActive, safeUserMaxDistance);
        const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
        const savedOrder = readPersistentItem(savedOrderKey);
        if (savedOrder) {
          const parsed: unknown = JSON.parse(savedOrder);
          const obj = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : null;
          const orderIds = Array.isArray(obj?.order)
            ? obj!.order.filter((id): id is string => typeof id === 'string')
            : (Array.isArray(parsed)
                ? parsed.filter((id): id is string => typeof id === 'string')
                : []);
          if (!orderIds.includes(lastPassedUser.user_id)) {
            const next = { premium: premiumActive, countries: unlockedCountries, order: [lastPassedUser.user_id, ...orderIds] };
            writePersistentItem(savedOrderKey, JSON.stringify(next));
          }
        }
      } catch {
        // ignore localStorage errors
      }

      // Update reverse usage count if not premium
      if (!premiumActive) {
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
      deckLen: potentialMatches.length,
    });
    
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

        // Also remove anything already locally swiped (likes always; passes for 8 days)
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
        beforeLen: prev.length,
        afterLen: newMatches.length,
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
        const feedSignature = buildFeedSignature(baseCountryCode, unlockedCountries, premiumActive, safeUserMaxDistance);
        const savedOrderKey = buildSavedOrderKey(currentUser?.id || '', feedSignature);
        
        const savedOrder = readPersistentItem(savedOrderKey);
        if (savedOrder) {
          const parsed: unknown = JSON.parse(savedOrder);
          const obj = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : null;
          const orderIds = Array.isArray(obj?.order)
            ? obj!.order.filter((id): id is string => typeof id === 'string')
            : (Array.isArray(parsed)
                ? parsed.filter((id): id is string => typeof id === 'string')
                : []);
          const updatedOrder = orderIds.filter((id) => id !== swipedProfileId);
          const next = { premium: premiumActive, countries: unlockedCountries, order: updatedOrder };
          writePersistentItem(savedOrderKey, JSON.stringify(next));
        }
      } catch (error) {
        // Ignore localStorage errors
      }
      
      // ⭐ REMOVED: Auto-reload logic moved to useEffect (single source of truth)
      // The useEffect will detect when remainingReal <= 10 and trigger loadMoreMatches
      // No need for duplicate reload logic here - keeps it simple and predictable
      
      // ⭐ SMART IMAGE LOADING: Cancel previous profile images and preload next profiles with priority
      // Cancel ALL images from the swiped profile (no longer needed)
      if (!isAd(swipedItem)) {
        const swipedImages = userImagesRef.current[swipedItem.id] || [];
        if (swipedImages.length > 0) {
          // Cancel all images for this profile to free up bandwidth
          cancelImages(swipedImages);
        }
      }
      
      // ⭐ FIX 3A: Preload NEXT profiles using NEW array (after removal)
      // Priority: Load 3 images for current profile, 2 for next profile
      const currentProfile = newMatches[0]; // After removal, the next card is index 0
      const nextProfile = newMatches[1]; // Profile after current
      
      if (currentProfile && !isAd(currentProfile)) {
        if (!userImagesRef.current[currentProfile.id]?.length) {
          loadAllImagesForProfile(currentProfile.id).then(imgs => {
            if (imgs && imgs.length > 0) {
              setUserImages(prevImgs => ({ ...prevImgs, [currentProfile.id]: imgs }));
              // Preload first 3 images with high priority, rest with low priority
              preloadImages(imgs.slice(0, 3), 'high');
              if (imgs.length > 3) {
                // Queue remaining images with low priority for background loading
                preloadImages(imgs.slice(3), 'low');
              }
            }
          });
        } else {
          const cachedImgs = userImagesRef.current[currentProfile.id] || [];
          if (cachedImgs.length > 0) {
            preloadImages(cachedImgs.slice(0, 3), 'high');
            if (cachedImgs.length > 3) preloadImages(cachedImgs.slice(3), 'low');
          }
        }
      }
      
      if (nextProfile && !isAd(nextProfile)) {
        if (!userImagesRef.current[nextProfile.id]?.length) {
          loadAllImagesForProfile(nextProfile.id).then(imgs => {
            if (imgs && imgs.length > 0) {
              setUserImages(prevImgs => ({ ...prevImgs, [nextProfile.id]: imgs }));
              // Preload first 2 images with medium priority
              preloadImages(imgs.slice(0, 2), 'medium');
            }
          });
        } else {
          const cachedImgs = userImagesRef.current[nextProfile.id] || [];
          if (cachedImgs.length > 0) preloadImages(cachedImgs.slice(0, 2), 'medium');
        }
      }
      
      // ⭐ SMART BACKGROUND LOADING: Check if we're running low on profiles and trigger background load
      const remainingProfiles = newMatches.filter(m => !isAd(m)).length;
      if (remainingProfiles <= 5 && !isLoadingMore && hasCompletedInitialFetch && !noMoreProfiles) {
        // Running low on profiles - trigger background load
        const now = Date.now();
        const COOLDOWN_MS = 10_000; // 10 second cooldown
        if (now - lastAutoRefillAttemptAtRef.current >= COOLDOWN_MS) {
          lastAutoRefillAttemptAtRef.current = now;
          setTimeout(() => {
            loadMoreMatches();
          }, 100); // Small delay to not block the swipe animation
        }
      }
      
      return newMatches;
    });
    
    // ⭐ RULE 5: Hard-cut instant card removal - always stay at index 0
    setCurrentIndex(0);
    
    // ⭐ REMOVED: Old preload logic that used stale potentialMatches array
    // Now handled inside setPotentialMatches callback with correct newMatches array (3A)
    
    // ⭐ 25% LIKE-BACK INJECTION: Inject profiles who liked the current user
    // This happens AFTER the current profile is removed, inserting at +2 to +4
    onLikeBackSwipe(potentialMatches, (injectedProfile, position) => {
      setPotentialMatches(prev => {
        // Don't inject if profile is already in queue
        const existingIds = new Set(prev.filter(p => !isAd(p)).map(p => p.id));
        if (existingIds.has(injectedProfile.id)) return prev;
        
        // Insert at calculated position (clamped to valid range)
        const insertPos = Math.min(position, prev.length);
        const updated = [...prev];
        updated.splice(insertPos, 0, injectedProfile);
        
        swipeDebug('likeBackInjection: injected', {
          profileId: injectedProfile.id,
          name: `${injectedProfile.first_name} ${injectedProfile.last_name}`,
          position: insertPos,
          newDeckLen: updated.length,
        });
        
        // Preload images for injected profile
        loadAllImagesForProfile(injectedProfile.id).then(imgs => {
          if (imgs) {
            setUserImages(prevImgs => ({ ...prevImgs, [injectedProfile.id]: imgs }));
          }
        });
        
        return updated;
      });
    });
    
    // Progressive Refill System Integration - load more profiles in background when running low
    checkAndTriggerRefill(currentUser.id, 0);
  };

  // Debug: log whenever the “current” card identity changes after a deck update
  useEffect(() => {
    if (!isSwipeDebugEnabled()) return;
    const m = potentialMatches[currentIndex];
    swipeDebug('render: current card snapshot', {
      currentIndex,
      deckLen: potentialMatches.length,
      current: m ? (isAd(m) ? `ad:${m.id}` : m.id) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, potentialMatches.length]);

  const maybeTriggerRatingFunnel = () => {
    if (!isFirstEverMatchRef.current) return;
    isFirstEverMatchRef.current = false;
    if (!isRatingFunnelEligible()) return;
    setTimeout(() => {
      markRatingFunnelTriggered();
      setShowRatingFunnel(true);
    }, 3000);
  };

  const handleStartChat = (userId: string) => {
    setShowMatchAnimation(false);
    maybeTriggerRatingFunnel();
    if (onNavigateToChat) {
      onNavigateToChat(userId);
    }
  };

  const handleCloseMatch = () => {
    setShowMatchAnimation(false);
    setMatchedUser(null);
    // Profile already moved when like was processed
    maybeTriggerRatingFunnel();
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
        <Card className="max-w-md w-full mx-4 bg-black border border-pink-500/25 text-white shadow-2xl">
          <CardContent className="p-6 text-center flex flex-col items-center">
            <Heart className="w-12 h-12 mb-3 text-pink-500/80" />
            <h2 className="text-lg font-semibold mb-1.5 text-white">{t('discover.outOfSwipes.title')}</h2>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">
              {premiumActive
                ? t('discover.outOfSwipes.premiumUserMessage')
                : t('discover.outOfSwipes.freeUserMessage')
              }
            </p>
            <div className="w-full space-y-2.5">
            {!premiumActive && (
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
                  // Close the modal and show the last profile they were viewing
                  // They can see the profile but if they try to swipe, the limit will be checked again
                  setIsOutOfSwipes(false);
                }}
                variant="outline"
                className="w-full bg-transparent border border-white/20 text-white hover:bg-white/10"
              >
                {t('discover.outOfSwipes.okButton')}
              </Button>

              <Button
                onClick={() => navigate('/games')}
                variant="outline"
                className="w-full border border-pink-500/30 text-pink-400 hover:bg-pink-500/10 bg-transparent flex items-center justify-center gap-2"
                aria-label="Play games"
              >
                <Gamepad2 className="w-4 h-4" />
                  Play Love Games
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
          <SwipeButtons
            onReverse={handleReverse}
            canReverse={false}
            isPremium={premiumActive}
          />
        </div>
      </div>
    );
  }

  // Show loading state ONLY while initial fetch is in progress AND we have no profiles
  if (!hasCompletedInitialFetch && potentialMatches.length === 0 && isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
        <div className="flex flex-col items-center">
          <div className="mb-4">
            <HoppingLogo size={80} />
          </div>
        </div>
      </div>
    );
  }

  // Deck hit zero exactly while a background refill is already in flight (e.g. fast
  // swiping outran the fetch). Show the same lightweight loading state instead of the
  // "no more profiles" dead end - loadMoreMatches always resolves (its finally block
  // clears isLoadingMore), so this can't get stuck, and it closes the visible gap
  // where the empty screen would flash before the refill silently lands a moment later.
  if (potentialMatches.length === 0 && hasCompletedInitialFetch && isLoadingMore) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
        <div className="flex flex-col items-center">
          <div className="mb-4">
            <HoppingLogo size={80} />
          </div>
        </div>
      </div>
    );
  }

  // When the deck is empty after initial fetch completed - show empty state immediately
  // Do NOT show loading spinner when deck is empty - this prevents infinite reload loop
  if (potentialMatches.length === 0 && hasCompletedInitialFetch) {
    const emptyTitle = emptyStateMode === 'transient-error'
      ? 'Refresh didn\'t work'
      : emptyStateMode === 'no-new'
        ? 'No new profiles yet'
        : t('discover.noMoreProfiles');

    const emptyDescription = emptyStateMode === 'transient-error'
      ? 'We hit a quick connection issue. Tap refresh to retry.'
      : emptyStateMode === 'no-new'
        ? 'You\'re all caught up for now. Tap refresh to check again.'
        : t('discover.noProfilesDescription');

    // Show empty state - user can manually refresh
    // Background loading will continue silently without showing spinner
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
        <Card className="max-w-md w-full mx-4 bg-black border border-pink-500/25 text-white shadow-2xl">
          <CardContent className="p-6 text-center flex flex-col items-center">
            <Heart className="w-12 h-12 mb-3 text-pink-500/80" />
            <h2 className="text-lg font-semibold mb-1.5 text-white">{emptyTitle}</h2>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">{emptyDescription}</p>
            <div className="grid grid-cols-2 gap-2.5 w-full">
              <Button
                onClick={() => {
                  // Clear all caches and force a complete refresh
                  setPotentialMatches([]);
                  setUserImages({});
                  setUserDistances({});
                  setCurrentIndex(0);
                  setNoMoreProfiles(false);
                  setEmptyStateMode('exhausted');
                  setIsLoading(true);
                  setIsLoadingMore(false);
                  setHasCompletedInitialFetch(false);

                  // Clear image cache
                  clearCache();

                  // Fetch fresh profiles
                  setTimeout(() => {
                    fetchPotentialMatches();
                  }, 100);
                }}
                className="w-full bg-gradient-to-r from-pink-600 to-rose-700 hover:from-pink-500 hover:to-rose-600 text-white"
              >
                {t('discover.refresh')}
              </Button>

              <Button
                onClick={() => navigate('/games')}
                variant="outline"
                className="w-full border border-pink-500/30 text-pink-400 hover:bg-pink-500/10 bg-transparent flex items-center justify-center gap-2"
                aria-label="Play games"
              >
                <Gamepad2 className="w-4 h-4" />
                Play Love Games
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate swipe overlay opacity and transform
  const swipeOpacity = Math.min(swipeUI.swipeDistance / 100, 0.8);

  // Simple card transform for smooth dragging - use translate3d for GPU acceleration
  const cardTransform = (() => {
    if (exitingCard && exitDirection) {
      const screenWidth = window.innerWidth;
      const exitX = exitDirection === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5;
      const exitY = window.innerHeight * 0.3;
      const rotation = exitDirection === 'right' ? 24 : -24;
      // Card shrinks away as it flies off — reads as receding into the distance, not zooming in
      return `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg) scale(0.55)`;
    }
    if (swipeUI.isDragging) {
      // Follow the finger 1:1 in both directions with a natural tilt — a real grab-and-move feel,
      // not a rail locked to the horizontal axis. No scale change while actively held.
      return `translate3d(${swipeUI.dragOffset}px, ${swipeUI.dragOffsetY}px, 0) rotate(${swipeUI.dragOffset * 0.06}deg) scale(1)`;
    }
    return 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
  })();

  // Flush/square while resting so the photo fills the frame edge-to-edge; the moment the card
  // is picked up (dragging) or flung away, its corners round in like a card lifting off the stack.
  const cardIsLifted = swipeUI.isDragging || exitingCard;
  const cardCornerRadius = cardIsLifted ? '26px' : '0px';



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
          }

          /* When expanded, cap the image so the info panel below has room to grow. */
          .discover-image-area.expanded {
            max-height: 65vh !important;
          }

          /* NOTE: .discover-info-area.expanded height is now driven entirely by inline styles
             computed from actual viewport height in JS (see the flex wrapper + scroll content +
             filler div below), so real content can never end up hidden behind the floating nav.
             A flat max-height: 48vh !important here used to silently override all of that JS
             sizing on every real mobile device (this media query only matches touch/coarse
             pointers) — removed so the two systems stop fighting each other. */
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
             // Shifted down 55px (instead of the individual card/image having its own internal
             // padding or margin for this) — the whole fixed layer moves together: current card,
             // next-card preview, everything. That way the gap at the top reveals the app's own
             // background behind this layer, not some other layer that isn't shifted the same
             // way and ends up visually mismatched with it.
             top: '55px',
             height: 'calc(100vh - 78px - 55px)', // Reserve room for the floating pill nav (now higher/slimmer)
             // Mobile browser viewport fix
             minHeight: 'calc(100vh - 78px - 55px)',
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
          style={{
            background: 'rgba(20, 10, 20, 0.28)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            cursor: 'pointer',
          }}
          onClick={() => {
            setShowSwipeGuide(false);
            localStorage.setItem('driplove_swipe_guide_shown', 'true');
          }}
        >
          <style>{`
            @keyframes swipeGuideIn {
              0% { opacity: 0; transform: scale(0.9) translateY(12px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes trackSwipeLeft {
              0%   { transform: translateX(26px); opacity: 0; }
              15%  { opacity: 1; }
              85%  { opacity: 1; }
              100% { transform: translateX(-26px); opacity: 0; }
            }
            @keyframes trackSwipeRight {
              0%   { transform: translateX(-26px); opacity: 0; }
              15%  { opacity: 1; }
              85%  { opacity: 1; }
              100% { transform: translateX(26px); opacity: 0; }
            }
            @keyframes ringPulseRed {
              0% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.45); }
              70% { box-shadow: 0 0 0 14px rgba(244, 63, 94, 0); }
              100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
            }
            @keyframes ringPulseGreen {
              0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45); }
              70% { box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); }
              100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            .swipe-guide-card {
              animation: swipeGuideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .swipe-guide-icon-left {
              animation: ringPulseRed 2.2s ease-out infinite;
            }
            .swipe-guide-icon-right {
              animation: ringPulseGreen 2.2s ease-out infinite;
            }
            .swipe-guide-track-left span {
              animation: trackSwipeLeft 1.6s ease-in-out infinite;
            }
            .swipe-guide-track-right span {
              animation: trackSwipeRight 1.6s ease-in-out infinite;
            }
            .swipe-guide-track-left span:nth-child(2) { animation-delay: 0.18s; }
            .swipe-guide-track-left span:nth-child(1) { animation-delay: 0.36s; }
            .swipe-guide-track-right span:nth-child(2) { animation-delay: 0.18s; }
            .swipe-guide-track-right span:nth-child(3) { animation-delay: 0.36s; }
          `}</style>
          <div
            className="swipe-guide-card flex flex-col items-center rounded-[28px] px-8 py-7"
            style={{
              maxWidth: 340,
              width: '90%',
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(236, 72, 153, 0.7)',
              boxShadow: '0 20px 50px -12px rgba(236, 72, 153, 0.35), 0 0 0 1px rgba(236,72,153,0.25) inset',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white mb-5 text-center tracking-tight">
              {t('discover.swipeGuide.title')}
            </h3>
            <div className="flex flex-row items-start gap-10 mb-5">
              {/* Swipe Left */}
              <div className="flex flex-col items-center">
                <div
                  className="swipe-guide-icon-left rounded-full flex items-center justify-center mb-3"
                  style={{
                    width: 56,
                    height: 56,
                    background: 'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(244,63,94,0.05))',
                    border: '1.5px solid rgba(244,63,94,0.35)',
                  }}
                >
                  <X className="w-6 h-6" style={{ color: '#f43f5e' }} strokeWidth={2.5} />
                </div>
                <div className="swipe-guide-track-left flex gap-0.5 mb-1.5 h-4">
                  <span className="block"><ChevronLeft className="w-4 h-4" style={{ color: '#f43f5e' }} strokeWidth={3} /></span>
                  <span className="block"><ChevronLeft className="w-4 h-4" style={{ color: '#f43f5e' }} strokeWidth={3} /></span>
                </div>
                <span className="text-sm font-bold text-rose-500">{t('discover.swipeGuide.nope')}</span>
                <span className="text-[11px] text-gray-300 mt-0.5">{t('discover.swipeGuide.swipeLeft')}</span>
              </div>
              {/* Swipe Right */}
              <div className="flex flex-col items-center">
                <div
                  className="swipe-guide-icon-right rounded-full flex items-center justify-center mb-3"
                  style={{
                    width: 56,
                    height: 56,
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))',
                    border: '1.5px solid rgba(16,185,129,0.35)',
                  }}
                >
                  <Heart className="w-6 h-6" style={{ color: '#10b981' }} strokeWidth={2.5} fill="#10b981" />
                </div>
                <div className="swipe-guide-track-right flex gap-0.5 mb-1.5 h-4">
                  <span className="block"><ChevronRight className="w-4 h-4" style={{ color: '#10b981' }} strokeWidth={3} /></span>
                  <span className="block"><ChevronRight className="w-4 h-4" style={{ color: '#10b981' }} strokeWidth={3} /></span>
                </div>
                <span className="text-sm font-bold text-emerald-400">{t('discover.swipeGuide.like')}</span>
                <span className="text-[11px] text-gray-300 mt-0.5">{t('discover.swipeGuide.swipeRight')}</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-300 text-center">{t('discover.swipeGuide.tapToClose')}</p>
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
                className="w-full h-full object-cover object-top"
                style={{ position: 'relative', zIndex: 1 }}
                draggable={false}
                loading="eager"
                decoding="async"
              />
            ) : nextMatch && !isAd(nextMatch) ? (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 via-neutral-900 to-black flex items-center justify-center">
                <span className="text-6xl font-bold text-white/80">
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
            transformOrigin: 'center center',
            transition: exitingCard
              ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.3s ease' // Smooth exit with slight bounce
              : swipeUI.isDragging
                ? 'border-radius 0.2s ease' // transform tracks the finger instantly; only radius eases
                : 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.3s ease, box-shadow 0.3s ease', // Springy snap-back
            willChange: 'transform',
            borderRadius: cardCornerRadius,
            overflow: 'hidden',
            boxShadow: swipeUI.isDragging
              ? '0 14px 34px -8px rgba(0,0,0,0.28)'
              : exitingCard
                ? '0 20px 44px -10px rgba(0,0,0,0.3)'
                : '0 2px 8px rgba(0,0,0,0.08)'
          }}
        >
          {/* Drag-state outline. The card itself no longer has any internal top gap to work
              around — that offset now happens one level up, at discover-container's own `top`
              (see below), before this card even starts — so this can just be a normal complete
              border around the whole card, top edge included. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none transition-opacity duration-200"
            style={{
              border: '1.5px solid rgba(236,72,153,0.95)',
              borderRadius: cardCornerRadius,
              opacity: swipeUI.isDragging ? 1 : 0,
              zIndex: 30,
            }}
          />
          {/* Image area - flexible height that fills remaining space */}
          <div
            className={`discover-image-area flex-1 cursor-pointer select-none relative transition-all duration-300 overflow-hidden ${showMoreInfo ? 'expanded' : ''}`}
            style={{
              // Use flexible height calculation that works better on mobile browsers
              // Extra vh reclaimed from the header now offsetting to 0 so the photo reaches the top edge.
              // Collapsed: no cap — the image (flex-1) absorbs all leftover space itself, so the
              // compact info panel below just hugs its own content instead of being stretched.
              // Expanded: capped so the info panel has room to grow and show more detail.
              minHeight: showMoreInfo ? 'max(48vh, 340px)' : 'max(58vh, 400px)',
              maxHeight: showMoreInfo ? '72vh' : 'none',
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
                {/* Like Overlay - Right Swipe: heart, positioned left, near top */}
                {swipeUI.swipeDirection === 'right' && (
                  <>
                    <div className="absolute inset-0 z-20 flex items-start justify-start pl-10 pointer-events-none" style={{ paddingTop: '35%' }}>
                      <div
                        className="relative"
                        style={{
                          transform: `scale(${Math.min(0.85 + swipeOpacity * 0.5, 1.35)}) rotate(${swipeUI.swipeDistance * 0.08}deg)`,
                          opacity: Math.min(0.55 + swipeOpacity, 1),
                          transition: 'none'
                        }}
                      >
                        {/* Second, softer heart offset behind for a fuller "double love" burst */}
                        <Heart
                          className="w-20 h-20 absolute -top-2 -left-2 opacity-50"
                          style={{ color: '#ef4444', fill: '#ef4444', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.3))' }}
                        />
                        <Heart
                          className="w-20 h-20 relative"
                          style={{ color: '#dc2626', fill: '#dc2626', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.35))' }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Pass Overlay - Left Swipe: white X, positioned right, near top */}
                {swipeUI.swipeDirection === 'left' && (
                  <>
                    <div className="absolute inset-0 z-20 flex items-start justify-end pr-10 pointer-events-none" style={{ paddingTop: '35%' }}>
                      <X
                        className="w-28 h-28"
                        strokeWidth={3}
                        style={{
                          color: '#ffffff',
                          filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.35))',
                          transform: `scale(${Math.min(0.85 + swipeOpacity * 0.5, 1.35)}) rotate(${-swipeUI.swipeDistance * 0.08}deg)`,
                          opacity: Math.min(0.55 + swipeOpacity, 1),
                          transition: 'none'
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            )}
            {/* Render MatchCard for image/swipe area */}
            {currentMatch && !isAd(currentMatch) && (
              <MatchCard
                match={currentMatch}
                imageIndex={imageIndex}
                showMoreInfo={showMoreInfo}
                isPremium={premiumActive}
                userImages={currentMatchImages}
                preloadedBlobImages={preloadedBlobImages[currentMatch.id]} // ⭐ Instant image rendering
                preferredLanguageName={userLanguages[currentMatch.id]} // ⭐ No DB call needed
                currentUserLatitude={currentUser.latitude}
                currentUserLongitude={currentUser.longitude}
                onImageClick={() => handleImageAreaClick({} as React.MouseEvent<HTMLDivElement>)}
                onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
                onImageIndexChange={(currentIdx: number, totalImages: number) => {
                  // ⭐ SMART PROGRESSIVE LOADING: Load more images as user slides through them
                  if (!currentMatch || isAd(currentMatch)) return;
                  
                  const allImages = userImagesRef.current[currentMatch.id] || [];
                  const hasMoreImages = allImages.length > totalImages;
                  
                  // If user is at image 2 or later, and there are more images to load, preload them
                  if (currentIdx >= 1 && hasMoreImages) {
                    const remainingImages = allImages.slice(totalImages);
                    if (remainingImages.length > 0) {
                      // Load next batch of images with medium priority
                      preloadImages(remainingImages.slice(0, 3), 'medium');
                    }
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
                isActiveTab={isActiveTab}
                onReportModalOpenChange={(isOpen) => { isReportModalOpenRef.current = isOpen; }}
              />
            )}
          </div>

          {/* Info section - dynamic height that fits content exactly */}
          {/*
            Always sized to its own content (flex-shrink-0), never stretched:
            - Collapsed: the image above has no max-height, so it absorbs all leftover
              vertical space itself, leaving this panel compact and hugging its content.
            - Expanded: the image is capped, giving this panel room to grow; the inner
              wrapper below handles the actual scroll/height animation via showMoreInfo.
          */}
          {/*
            No background of its own (transparent) and pulled up slightly over the photo
            (-mt) so the glassy top of .detailsContainer genuinely overlaps the image and
            blurs it, instead of just sitting on a second flat pink layer behind it.
          */}
          {/*
            Uses transform (not a negative margin) to visually pull this panel up over the
            photo — a negative margin here changes how much space this flex item consumes,
            which lets the image sibling (flex-1) grow to reclaim it, canceling the overlap
            out. transform is purely visual and doesn't feed back into flex sizing.
          */}
          <div
            className={`discover-info-area relative z-20 transition-all duration-300 flex-shrink-0 ${
              showMoreInfo ? 'expanded' : 'overflow-hidden'
            }`}
            style={{ transform: 'translateY(-160px)', marginBottom: '-160px' }}
          >
            <div
              style={showMoreInfo ? {
                display: 'flex',
                flexDirection: 'column',
                // Total panel height (background) reaches almost all the way to the bottom of
                // the screen, so there's no gap of photo/transparency below it. The extra -55
                // accounts for discover-container itself now starting 55px lower (see its `top`
                // above) — that much less vertical space is actually available overall, so this
                // needs to know about it too or the panel overclaims space that isn't there,
                // eating into the bottom padding/clearance that's supposed to be reserved.
                maxHeight: `${Math.max(400, vh - 170 - 55)}px`,
              } : undefined}
            >
              <div
                ref={contentRef}
                className={`w-full pt-1 ${showMoreInfo ? 'overflow-y-scroll scrollbar-hide' : 'overflow-hidden'}`}
                style={{
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  scrollBehavior: 'smooth',
                  // The SCROLLABLE zone is explicitly capped short of the panel's total height
                  // (see the filler div below) — real content can only ever scroll within this
                  // safe zone, so it can never end up rendered behind the floating nav, no matter
                  // the scroll position.
                  maxHeight: showMoreInfo ? `${Math.max(280, Math.max(400, vh - 170 - 55) - 150)}px` : '360px',
                  minHeight: showMoreInfo ? 'min(20vh, 200px)' : 'auto',
                }}
              >
              {/* Render MatchCard details area */}
              {currentMatch && !isAd(currentMatch) && (
                <MatchCard
                  match={currentMatch}
                  imageIndex={imageIndex}
                  showMoreInfo={showMoreInfo}
                  isPremium={premiumActive}
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
                  isDragging={swipeUI.isDragging}
                  isVerified={!!currentMatch.is_verified}
                  isSwipeAreaOnly={false}
                  isDetailsAreaOnly={true} // Render only details/info area
                  getOptimizedUrl={getOptimizedUrl}
                  preCalculatedDistance={userDistances[currentMatch.id]}
                  currentUserAdinkraSymbols={currentUser.adinkra_symbols}
                />
              )}
              </div>
              {/* Purely decorative black filler — extends the panel's background down toward the
                  true bottom of the screen (behind the floating nav) without ever holding real,
                  scrollable content, so it can never cover up info the user needs to read. */}
              {showMoreInfo && (
                <div
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    flexGrow: 1,
                    background: '#000',
                    borderRadius: '0 0 0.75rem 0.75rem',
                  }}
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
          canReverse={premiumActive ? true : passedUsers.length > 0}
          reversesLeft={premiumActive ? undefined : Math.max(0, 2 - reverseUsageToday)}
          isPremium={premiumActive}
        />
      </div>
      </div>
      
      {/* One-time rating funnel - 3s after the user's first-ever match screen closes */}
      <RatingFunnel
        open={showRatingFunnel}
        onClose={() => setShowRatingFunnel(false)}
      />
    </>
  );
}

export default React.memo(DiscoverPage);

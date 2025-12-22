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

// ⭐ Import background component
import DominantColorImageBg from './discover/DominantColorImageBg';

// ⭐ Lazy load AdinkraBar for performance
const AdinkraBar = lazy(() => import('./discover/AdinkraBar'));

// Fallback for AdinkraBar while loading
const AdinkraBarFallback = () => (
  <div className="w-full h-9 bg-gradient-to-r from-blue-500 via-yellow-400 to-blue-500" />
);

// ⭐ Wrapped lazy AdinkraBar with suspense
const LazyAdinkraBar = memo(() => (
  <Suspense fallback={<AdinkraBarFallback />}>
    <AdinkraBar />
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

// Make cache globally accessible for preloading
if (typeof window !== 'undefined') {
  (window as any).discoverCache = discoverCache;
}

interface DiscoverPageProps {
  currentUser: CurrentUser;
  onNavigateToChat?: (userId: string) => void;
  isPremium?: boolean;
}

interface PassedUser {
  user_id: string;
  passed_at: Date;
}

const DiscoverPage = ({ currentUser, onNavigateToChat, isPremium }: DiscoverPageProps) => {
  const { t } = useTranslation();
  
  // IAP: Track if buy is enabled
  const [canBuy, setCanBuy] = useState(false);
  useEffect(() => {
    function onProductUpdated() {
      // @ts-ignore
      const p = window.CdvPurchase?.store?.get('com.driplove.dating.premium.monthlysub1');
      setCanBuy(!!p && !!p.getOffer());
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
  const [localProfilesExhausted, setLocalProfilesExhausted] = useState(false);
  const [isArchivedFallback, setIsArchivedFallback] = useState(false); // Two-phase: true when showing archived profiles
  
  // Dynamic content height management
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
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
      console.error('Failed to persist swiped IDs:', error);
    }
  }, [currentUser?.id]);
  
  const { toast } = useToast();
  const { sendMatchNotification, sendMultipleLikesNotification } = usePushNotifications(currentUser?.id);
  const { subscription, checkUsageLimit, refetchSubscription } = useSubscription(currentUser?.id);
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
    return currentUser?.country_code || '';
  }, [currentUser?.country_code]);
  
  useEffect(() => {
    const fetchAds = async () => {
      try {
        const { data, error } = await supabase
          .from('ads')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter ads by user's country - show ad if target_countries is empty OR includes user's country
        const filteredAds = (data || []).filter((ad: any) => {
          const targetCountries = ad.target_countries || [];
          // If no target countries specified, show to everyone
          if (targetCountries.length === 0) return true;
          // Otherwise, only show if user's country is in the list
          return userCountryCode && targetCountries.includes(userCountryCode);
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
    const adFrequency = isPremium ? 10 : 5;
    
    for (let i = 0; i < matches.length; i++) {
      result.push(matches[i]);
      
      // Insert ad at the specified frequency, ensuring we cycle through ALL ads
      if ((i + 1) % adFrequency === 0) {
        const selectedAd = stableShuffledAds[adIndex % stableShuffledAds.length];
        result.push(selectedAd);
        adIndex++;
      }
    }
    
    return result;
  }, [stableShuffledAds, isPremium]);

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
      // ...removed log...
          return;
        }

        // Fetch user images
        const { data: images, error: imagesError } = await supabase
          .from('user_images')
          .select('image_url, is_approved, moderation_status')
          .eq('user_id', currentUser.id);

        if (imagesError) {
      // ...removed log...
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

        // CRITICAL: Check swipe restrictions on mount/reload
        const restrictions = await checkSwipeRestrictions(currentUser.id, completionResult.completion, isPremium || false);
        
        // If user can't swipe, block them immediately
        if (!restrictions.canSwipe) {
          if (restrictions.requiresProfileCompletion) {
            // Show profile completion modal if they need to complete profile
            setShowProfileCompletionModal(true);
          } else if (restrictions.reason === 'Daily limit reached') {
            // Show out of swipes screen if they've hit daily limit
            setIsOutOfSwipes(true);
          }
        }
      } catch (error) {
  // ...removed log...
      }
    };

    fetchUserProfileCompletion();
  }, [currentUser?.id, isPremium]);

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
  // ...removed log...
        return;
      }

      setReverseUsageToday(data?.reverse_dislikes_used || 0);
    } catch (error) {
  // ...removed log...
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

  // Store pre-calculated verification status from database (NO calculation in DiscoverPage!)
  const [verificationStatusMap, setVerificationStatusMap] = useState<{ [key: string]: boolean }>({});
  
  // Fetch pre-calculated verification status from database (NO calculation!)
  const fetchVerificationStatus = useCallback(async (userId: string) => {
    if (!userId || verificationStatusMap[userId] !== undefined) return; // Already fetched
    
    try {
      // For now, we'll calculate it once here and cache it, but ideally this should be pre-calculated in the database
      const { data: images, error: imageError } = await supabase
        .from('user_images')
        .select('image_url, is_approved, moderation_status')
        .eq('user_id', userId);

      if (imageError) {
        setVerificationStatusMap(prev => ({ ...prev, [userId]: false }));
        return;
      }

      // Get the profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profileData) {
        setVerificationStatusMap(prev => ({ ...prev, [userId]: false }));
        return;
      }

      // Calculate verification status once and cache it (this should ideally be done server-side)
      const { showVerifiedBadge } = calculateProfileCompletion(profileData, images || []);
      
      setVerificationStatusMap(prev => ({ ...prev, [userId]: showVerifiedBadge }));
    } catch (error) {
      setVerificationStatusMap(prev => ({ ...prev, [userId]: false }));
    }
  }, [verificationStatusMap]);

  // Get verification status from cache (NO calculation!)
  const isProfileVerified = useCallback((profile: any) => {
    if (!profile) {
      return false;
    }
    
    // Check if we have cached status
    if (verificationStatusMap[profile.id] === undefined) {
      // Start fetching if not cached
      fetchVerificationStatus(profile.id);
      return false;
    }

    return verificationStatusMap[profile.id];
  }, [verificationStatusMap, fetchVerificationStatus]);

  // ⭐ ANDROID OPTIMIZATION: Load ALL images for ONE profile with abort support
  // ⭐ TINDER-STYLE: Load all images for ONE profile with instant abort support
  const loadAllImagesForProfile = useCallback(async (profileId: string) => {
    // ⭐ RULE 3: Cancel previous load if user swiped
    if (currentImageAbortController) {
      currentImageAbortController.abort();
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
      const result = await fetchPotentialMatchesData(currentUser.id);
      if (result) {
        const { matches, images, distances, index } = result;
        
        const matchesWithAds = injectAds(matches);
        
        // DISABLED: Background fetch no longer updates cache to prevent profile shuffling
        // The cache will only be updated on manual refresh or navigation
        // ⭐ REMOVED: Duplicate verification fetching (handled in main fetch)
      }
    } catch (error) {
      // Silently handle background fetch errors
    } finally {
      backgroundFetchingRef.current = false;
      // Allow full fetches again after background refresh completes
      suppressFetchRef.current = false;
    }
  }, [currentUser?.id]);

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
    
    let query = supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .in('country_code', unlockedCountries);

    if (excludedIds.length > 0) {
      query = query.not('id', 'in', `(${excludedIds.join(',')})`);
    }

    const { data, error } = await query
      .in('gender', allowedGenders)
      .eq('account_status', 'active')
      .eq('is_admin', false)
      .eq('is_archived', false)
      .limit(limit);

    if (error) return [];

    // Mark all unlocked country profiles with distance = 999
    (data || []).forEach(p => distanceMap[p.id] = 999);
    return data || [];
  }, []);

  // Shared data fetching logic - optimized for speed
  const fetchPotentialMatchesData = useCallback(async (userId: string) => {
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
        .select('max_distance, distance_preference, country, country_code, min_age, max_age, preference, unlocked_countries')
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
    
    // Store in state for "they liked you" popup feature
    setUsersWhoLikedMeIds(usersWhoLikedMeIds);
    
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
    // Fix: Match the correct values stored in database ('male', 'female', 'everyone')
    const allowedGenders = currentUserData?.preference === 'male' ? ['male'] : 
                          currentUserData?.preference === 'female' ? ['female'] : 
                          currentUserData?.preference === 'everyone' || currentUserData?.preference === 'both' ? ['male', 'female', 'other'] :
                          ['male', 'female', 'other']; // Default to all if preference is not set

    const baseCountryCode = (currentUserData?.country_code || '').trim();

    // Get unlocked countries for premium users
    const unlockedCountries: string[] = Array.isArray(currentUserData?.unlocked_countries)
      ? currentUserData.unlocked_countries
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map(c => c.trim())
      : [];

    // IMPORTANT: Non-premium users ONLY see profiles in their own country.
    // Premium users can additionally see profiles from unlocked countries.
    const allowedCountryCodes = Array.from(
      new Set([
        ...(baseCountryCode ? [baseCountryCode] : []),
        ...(isPremium ? unlockedCountries : []),
      ])
    );

    // Get location-based matches (distance filter)
    const locationMatches = await locationService.getLocationBasedMatches(userId, safeUserMaxDistance);

    // ⭐ OPTIMIZED: Single pass to build both distanceMap and locationProfileIds (50ms saved)
    const distanceMap: { [key: string]: number } = {};
    const locationProfileIds = uniqUuids(locationMatches
      .filter((m) => !allowedCountryCodes.length || allowedCountryCodes.includes(m.country_code))
      .map((match) => {
        distanceMap[match.profile_id] = match.distance_km;
        return match.profile_id;
      }));

    // ⭐ STRATIFIED SAMPLING: Fetch all profiles then apply fair distribution
    // Common profile select fields (includes created_at for stratified sampling)
    const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at';

    // ⭐ PREMIUM FIX: Detect if premium user has unlocked countries
    const hasUnlockedCountries = isPremium && unlockedCountries.length > 0;
    const localProfilesEmpty = locationProfileIds.length === 0;
    
    // ⭐ RESET BANNER: If local profiles exist again, reset the exhausted banner
    if (locationProfileIds.length > 0 && localProfilesExhausted) {
      setLocalProfilesExhausted(false);
    }

    let filteredProfiles: any[] = [];
    let usingArchivedFallback = false; // Track if we're showing archived profiles
    
    // =====================================================
    // PHASE 1: ACTIVE USERS ONLY (is_archived = false)
    // =====================================================
    
    // 1️⃣ Normal local flow - ACTIVE users only
    if (locationProfileIds.length > 0) {
      let query = supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .in('id', locationProfileIds);

      // Enforce country rules at DB level too
      if (allowedCountryCodes.length > 0) {
        query = query.in('country_code', allowedCountryCodes);
      }

      if (excludedIds.length > 0) {
        query = query.not('id', 'in', `(${excludedIds.join(',')})`);
      }

      const { data: profiles, error } = await query
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('is_archived', false) // PHASE 1: Active users only
        .limit(100);

      if (error) throw error;
      filteredProfiles = profiles || [];
    }
    // 2️⃣ PREMIUM FALLBACK — unlocked countries ONLY when local is empty
    else if (hasUnlockedCountries) {
      const unlockedProfiles = await fetchUnlockedCountryProfiles({
        unlockedCountries,
        excludedIds,
        allowedGenders,
        distanceMap,
        limit: 100
      });
      
      filteredProfiles = unlockedProfiles;

      // ✨ Show gentle toast (once) when premium users see unlocked country profiles
      if (filteredProfiles.length > 0 && !localProfilesExhausted) {
        setLocalProfilesExhausted(true); // Flag to prevent repeated toasts
        toast({
          title: '🌍 Showing matches from your selected countries',
          description: 'You\'ve seen nearby profiles. Exploring your unlocked countries now.',
          duration: 4000,
        });
      }
    }
    // 3️⃣ Free-user fallback (same country only) - ACTIVE users only
    else if (baseCountryCode) {
      let query = supabase.from('profiles').select(PROFILE_SELECT);

      if (excludedIds.length > 0) {
        query = query.not('id', 'in', `(${excludedIds.join(',')})`);
      }

      const { data: profiles, error } = await query
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('is_archived', false) // PHASE 1: Active users only
        .eq('country_code', baseCountryCode)
        .limit(100);

      if (error) throw error;
      filteredProfiles = profiles || [];
    }

    // ⭐ PREMIUM FEATURE: Mix unlocked countries with local profiles ONLY if local profiles exist
    // If local is empty, unlocked countries are already fetched in premium fallback above
    if (unlockedCountries.length > 0 && isPremium && locationProfileIds.length > 0 && filteredProfiles.length > 0) {
      const existingIds = new Set(filteredProfiles.map(p => p.id));
      const allExcludedIds = [...excludedIds, ...Array.from(existingIds)];
      
      const unlockedProfiles = await fetchUnlockedCountryProfiles({
        unlockedCountries,
        excludedIds: allExcludedIds,
        allowedGenders,
        distanceMap,
        limit: 50
      });

      if (unlockedProfiles.length > 0) {
        filteredProfiles = [...filteredProfiles, ...unlockedProfiles];
      }
    }

    // =====================================================
    // PHASE 2: ARCHIVED FALLBACK (only if Phase 1 returns 0)
    // =====================================================
    if (filteredProfiles.length === 0) {
      // Phase 1 returned 0 active profiles, trying archived fallback
      let archivedQuery = supabase.from('profiles').select(PROFILE_SELECT);
      
      if (excludedIds.length > 0) {
        archivedQuery = archivedQuery.not('id', 'in', `(${excludedIds.join(',')})`);
      }
      
      // Build country filter based on user type
      if (isPremium && allowedCountryCodes.length > 0) {
        archivedQuery = archivedQuery.in('country_code', allowedCountryCodes);
      } else if (baseCountryCode) {
        archivedQuery = archivedQuery.eq('country_code', baseCountryCode);
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
      }
    }
    
    // Update the fallback state
    setIsArchivedFallback(usingArchivedFallback);
 
    // Apply age filtering
    const userMinAge = currentUserData?.min_age || 18;
    const userMaxAge = currentUserData?.max_age || 99;
    
    filteredProfiles = filteredProfiles.filter(profile => {
      if (!profile.date_of_birth) return false;
      const age = calculateAge(profile.date_of_birth);
      return age >= userMinAge && age <= userMaxAge;
    });

    // Add empty images array and precomputed distance
    const profilesWithImages = filteredProfiles
      .filter(profile => profile.id !== userId)
      .map(profile => ({
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
    const today = new Date().toISOString().split('T')[0];
    const shuffleSeed = `${userId}_${today}`;
    
    // ⭐ Check if we have a saved profile order for today
    const savedOrderKey = `driplove_profile_order_${userId}_${today}`;
    const savedOrder = localStorage.getItem(savedOrderKey);
    
    let shuffled: typeof uniqueProfiles;
    
    if (savedOrder) {
      // Restore saved order
      try {
        const orderIds: string[] = JSON.parse(savedOrder);
        const orderMap = new Map(uniqueProfiles.map(p => [p.id, p]));
        
        // Reorder profiles according to saved order, append any new profiles at end
        const orderedProfiles = orderIds
          .map(id => orderMap.get(id))
          .filter((p): p is typeof uniqueProfiles[0] => p !== undefined);
        
        // Add any new profiles that weren't in saved order (use stratified sampling for them)
        const orderedIds = new Set(orderIds);
        const newProfiles = uniqueProfiles.filter(p => !orderedIds.has(p.id));
        
        // Apply stratified sampling to new profiles
        const stratifiedNewProfiles = newProfiles.length > 0 
          ? getStratifiedBatches(newProfiles, 15, 4, shuffleSeed + '_new')
          : [];
        
        shuffled = [...orderedProfiles, ...stratifiedNewProfiles];
      } catch (error) {
        // If parse fails, apply stratified sampling
        shuffled = getStratifiedBatches(uniqueProfiles, 15, 4, shuffleSeed);
      }
    } else {
      // First time today - apply stratified sampling for fair distribution
      // Get 4 batches of 15 profiles each (60 total) with fair distribution
      shuffled = getStratifiedBatches(uniqueProfiles, 15, 4, shuffleSeed);
      
      // Save profile order to localStorage
      try {
        const profileIds = shuffled.map(p => p.id);
        localStorage.setItem(savedOrderKey, JSON.stringify(profileIds));
      } catch (error) {
        // Ignore localStorage errors
      }
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
      const userId = currentUser?.id || '';
      const dateSeed = new Date().toISOString().split('T')[0];
      const injectionSeed = `${userId}_priority_${dateSeed}`;
      
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
      
      // Build final array with injections at calculated positions
      const finalProfiles: typeof shuffled = [];
      let priorityIdx = 0;
      
      for (let i = 0; i < nonPriorityProfiles.length; i++) {
        // Check if we should inject at this position
        if (injectionPositions.includes(i) && priorityIdx < limitedPriorityProfiles.length) {
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
  }, [loadAllImagesForProfile, isPremium, fetchUnlockedCountryProfiles]);

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
  
    try {
      // Background loading - don't block UI
      setIsLoading(true);
      setNoMoreProfiles(false); // Reset when fetching new profiles

      const result = await fetchPotentialMatchesData(currentUser.id);
      if (result) {
        const { matches, images, distances, index } = result;
        
        const matchesWithAds = injectAds(matches);
        
        // ⭐ Cache REMOVED - was causing already-swiped profiles to reappear

        // ⭐ CRITICAL: Only set profiles if we don't already have them loaded
        // This prevents replacing profiles when the effect runs multiple times
        setPotentialMatches(prev => {
          // If we already have profiles, don't replace them (prevents duplicates)
          if (prev.length > 0) {
            return prev;
          }
          return matchesWithAds;
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

        // ⭐ OPTIMIZED: Batch fetch verification status and languages (30-50ms saved)
        const profileIds = matches.map(m => m.id).filter(Boolean);
        
        // Fetch verification status for profiles not yet cached
        profileIds.forEach(id => {
          if (verificationStatusMap[id] === undefined) {
            fetchVerificationStatus(id);
          }
        });

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
  // ...removed log...
      toast({
        title: t('common.error'),
        description: t('discover.errors.loadFailed'),
        variant: 'destructive'
      });
      setIsLoading(false);
      setHasCompletedInitialFetch(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allowedGenders, toast]);

  // ⭐ PARALLEL IMAGE PRELOADING - Load images in background without blocking
  // ⭐ ANDROID OPTIMIZATION: Reduced batch size for Android (2 vs 10 for iOS)
  const preloadProfileImages = useCallback((profiles: PotentialMatch[], startIndex: number = 0) => {
    // Android: Load only 2 profiles ahead, iOS: Load 6 profiles ahead
    const batchSize = isAndroidPlatform() ? 2 : 6;
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
          // ⭐ ANDROID OPTIMIZATION: Abort if user already moved past this profile
          if (currentIndex !== indexOfProfileBeingLoaded) {
            requestedImageProfileIds.current.delete(user.id);
            return;
          }

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

          // Preload blobs in parallel (non-blocking)
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
        } catch (error) {
          console.error(`Failed to preload profile ${user.id}:`, error);
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

  // Track if we've already initialized for this user to prevent re-fetching
  const initializedUserRef = useRef<string | null>(null);

  // Main effect to fetch data - optimized for fast loading
  useEffect(() => {
    if (!currentUser?.id) return;

    // Create cache key that includes date to ensure daily consistency
    const today = new Date().toISOString().split('T')[0]; // "2025-10-08"
    const cacheKey = `${currentUser.id}_${today}`;

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
      const today = new Date().toISOString().split('T')[0];
      const prefix = `driplove_profile_order_${currentUser.id}_`;
      
      // Remove old profile orders (not today's)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && !key.endsWith(today)) {
          localStorage.removeItem(key);
        }
      }
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
  }, [currentUser?.id]); // Removed adsLoaded to prevent double-fetching

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
  setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0 }));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
  if (!swipeUI.isDragging) return;
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
    if (!swipeUI.isDragging) return;
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
  setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0 }));

    // Attach global mouse listeners to ensure we capture mouseup/move even if pointer leaves the element
    const onWindowMouseMove = (ev: MouseEvent) => {
  if (!swipeUI.isDragging) return;
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
    if (!swipeUI.isDragging) return;
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
      
      // ⭐ STRATIFIED REFILL: Include created_at for stratified sampling
      const PROFILE_SELECT = 'id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at';

      // Enforce country rules early for speed + correctness
      const baseCountryCode = (currentUser.country_code || '').trim();
      
      // Get unlocked countries for premium users with proper filtering
      const unlockedCountries: string[] = isPremium && Array.isArray(currentUser.unlocked_countries)
        ? currentUser.unlocked_countries
            .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
            .map(c => c.trim())
        : [];
      
      const allowedCountryCodes = Array.from(
        new Set([
          ...(baseCountryCode ? [baseCountryCode] : []),
          ...unlockedCountries,
        ])
      );

      // ⭐ PREMIUM FIX: Check if we have unlocked countries
      const hasUnlockedCountries = isPremium && unlockedCountries.length > 0;

      let query = supabase.from('profiles').select(PROFILE_SELECT);

      if (allExcludedIds.length > 0) {
        query = query.not('id', 'in', `(${allExcludedIds.join(',')})`);
      }

      if (allowedCountryCodes.length > 0) {
        query = query.in('country_code', allowedCountryCodes);
      }

      const { data: newProfiles, error } = await query
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('is_archived', false) // PHASE 1: Active profiles only
        .limit(100); // Larger pool for stratified sampling

      if (error) throw error;
      
      // ⭐ Initialize distanceMap early for premium fallback
      const distanceMap: { [key: string]: number } = {};
      
      // =====================================================
      // PHASE 2: ARCHIVED FALLBACK (only if Phase 1 returns 0)
      // Same logic as main fetch - mirror the two-phase system
      // =====================================================
      let activeProfiles = newProfiles || [];
      let usingArchivedFallback = false;
      
      if (activeProfiles.length === 0) {
        // Phase 1 returned 0 active profiles, trying archived fallback
        let archivedQuery = supabase.from('profiles').select(PROFILE_SELECT);
        
        if (allExcludedIds.length > 0) {
          archivedQuery = archivedQuery.not('id', 'in', `(${allExcludedIds.join(',')})`);
        }
        
        // Build country filter based on user type
        if (isPremium && allowedCountryCodes.length > 0) {
          archivedQuery = archivedQuery.in('country_code', allowedCountryCodes);
        } else if (baseCountryCode) {
          archivedQuery = archivedQuery.eq('country_code', baseCountryCode);
        }

        const { data: archivedProfiles, error: archivedError } = await archivedQuery
          .eq('is_archived', true) // PHASE 2: Archived users
          .eq('account_status', 'active') // Still respect account status
          .eq('is_admin', false)
          .in('gender', allowedGenders)
          .limit(50);

        if (!archivedError && archivedProfiles && archivedProfiles.length > 0) {
          activeProfiles = archivedProfiles;
          usingArchivedFallback = true;
          
          // Update fallback state if we're now showing archived profiles
          if (!isArchivedFallback) {
            setIsArchivedFallback(true);
          }
        }
      }
      
      // If no new profiles found, try premium fallback before giving up
      if (activeProfiles.length === 0 && hasUnlockedCountries) {
        // Try unlocked countries only as fallback
        const fallbackProfiles = await fetchUnlockedCountryProfiles({
          unlockedCountries,
          excludedIds: allExcludedIds,
          allowedGenders,
          distanceMap,
          limit: 100
        });
        
        if (fallbackProfiles.length > 0) {
          // ✨ Show gentle toast (once) for premium fallback
          if (!localProfilesExhausted) {
            setLocalProfilesExhausted(true);
            toast({
              title: '🌍 Showing matches from your selected countries',
              description: 'You\'ve seen nearby profiles. Exploring your unlocked countries now.',
              duration: 4000,
            });
          }
          
          // Continue with fallback profiles
          const profilesWithImages = fallbackProfiles.map(profile => ({
            ...profile,
            images: [],
            distance: distanceMap[profile.id]
          }));

          // Apply age filtering
          const userMinAge = currentUser.min_age || 18;
          const userMaxAge = currentUser.max_age || 99;
          const ageFiltered = profilesWithImages.filter(profile => {
            if (!profile.date_of_birth) return false;
            const age = calculateAge(profile.date_of_birth);
            return age >= userMinAge && age <= userMaxAge;
          });

          // Apply stratified sampling
          const today = new Date().toISOString().split('T')[0];
          const refillSeed = `${currentUser.id}_refill_${today}_${Date.now()}`;
          const stratifiedProfiles = stratifiedSample(ageFiltered, 15, refillSeed);
          
          // Remove duplicates
          const existingProfileIds = new Set(potentialMatches.map(p => !isAd(p) ? p.id : null).filter(Boolean));
          const uniqueProfiles = stratifiedProfiles.filter(profile => !existingProfileIds.has(profile.id));
          
          if (uniqueProfiles.length > 0) {
            const newProfilesWithAds = injectAds(uniqueProfiles);
            setPotentialMatches(prev => [...prev, ...newProfilesWithAds]);
            
            // Preload images
            preloadNextProfileImages(uniqueProfiles, userImages, 0);
            
            // Batch fetch languages
            const newProfileIds = uniqueProfiles.map(p => p.id).filter(Boolean);
            if (newProfileIds.length > 0) {
              batchFetchLanguages(newProfileIds);
            }
            
            return; // Success - exit early
          }
        }
      }
      
      // If no new profiles found even after premium fallback, we've exhausted the pool
      // BUT: Only mark exhausted if premium fallback isn't available AND we didn't use archived fallback
      if (
        activeProfiles.length === 0 &&
        !hasUnlockedCountries &&
        !usingArchivedFallback
      ) {
        setNoMoreProfiles(true); // Mark that we've exhausted all available profiles
        return;
      }

      // Apply same filtering logic as original fetch using location service
      let filteredProfiles = activeProfiles;
      const userMaxDistanceRaw = (currentUser as any).max_distance ?? (currentUser as any).distance_preference ?? 50;
      const userMaxDistance = Number(userMaxDistanceRaw);
      const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : 50;


      // Get location-based matches for distance filtering
      const locationMatches = await locationService.getLocationBasedMatches(currentUser.id, safeUserMaxDistance * 2);
      // ⭐ OPTIMIZED: Single pass for distanceMap and locationProfileIds (30ms saved)
      const locationProfileIds = uniqUuids(locationMatches
        .filter((m) => !allowedCountryCodes.length || allowedCountryCodes.includes(m.country_code))
        .map((match) => {
          distanceMap[match.profile_id] = match.distance_km;
          return match.profile_id;
        }));

      // Filter profiles to only those within distance range AND allowed countries
      filteredProfiles = filteredProfiles.filter((profile) => {
        if (allowedCountryCodes.length && !allowedCountryCodes.includes(profile.country_code)) {
          return false;
        }

        if (!profile.latitude || !profile.longitude) {
          return profile.country_code === baseCountryCode;
        }

        return locationProfileIds.includes(profile.id);
      });

      // ⭐ PREMIUM FEATURE: Also fetch profiles from unlocked countries for premium users\n      if (isPremium && currentUser.unlocked_countries && Array.isArray(currentUser.unlocked_countries) && currentUser.unlocked_countries.length > 0) {\n        const existingIds = new Set(filteredProfiles.map(p => p.id));\n        const premiumExcludedIds = uniqUuids([...allExcludedIds, ...Array.from(existingIds)]);\n        const unlockedCountryCodes = (currentUser.unlocked_countries || [])\n          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)\n          .map(c => c.trim());\n        \n        if (unlockedCountryCodes.length > 0) {\n          const unlockedProfiles = await fetchUnlockedCountryProfiles({\n            unlockedCountries: unlockedCountryCodes,\n            excludedIds: premiumExcludedIds,\n            allowedGenders,\n            distanceMap,\n            limit: 50\n          });\n\n          if (unlockedProfiles.length > 0) {\n            filteredProfiles = [...filteredProfiles, ...unlockedProfiles];\n          }\n        }\n      }

      // Apply age filtering
      const userMinAge = currentUser.min_age || 18;
      const userMaxAge = currentUser.max_age || 99;
      filteredProfiles = filteredProfiles.filter(profile => {
        if (!profile.date_of_birth) return false;
        const age = calculateAge(profile.date_of_birth);
        return age >= userMinAge && age <= userMaxAge;
      });

      const profilesWithImages = filteredProfiles.map(profile => ({
        ...profile,
        images: [],
        distance: distanceMap[profile.id]
      }));

      // ⭐ STRATIFIED SAMPLING: Apply fair distribution to refilled profiles
      const today = new Date().toISOString().split('T')[0];
      const refillSeed = `${currentUser.id}_refill_${today}_${Date.now()}`;
      const stratifiedProfiles = stratifiedSample(profilesWithImages, 15, refillSeed);
      
      // ⭐ DEDUPLICATION: Filter out profiles that are already in potentialMatches
      const existingProfileIds = new Set(potentialMatches.map(p => !isAd(p) ? p.id : null).filter(Boolean));
      const uniqueProfiles = stratifiedProfiles.filter(profile => !existingProfileIds.has(profile.id));
      
      // Add new UNIQUE profiles to the END of the array (with ads injected)
      const newProfilesWithAds = injectAds(uniqueProfiles);
      setPotentialMatches(prev => [...prev, ...newProfilesWithAds]);
      
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
      console.error('Error loading more matches:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentUser, allowedGenders, potentialMatches, calculateAge, isLoadingMore, userImages, preloadNextProfileImages, injectAds, fetchUnlockedCountryProfiles, batchFetchLanguages, isPremium]);

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
    if (!noMoreProfiles && !isLoadingMore && hasCompletedInitialFetch && remainingReal <= REFILL_THRESHOLD && remainingReal > 0) {
      loadMoreMatches();
    }
  }, [potentialMatches, currentIndex, noMoreProfiles, isLoadingMore, hasCompletedInitialFetch, loadMoreMatches]);

  // ⭐ 3B: CENTRALIZED IMAGE PRELOADING - Single source of truth
  // Automatically preloads upcoming profiles based on current position
  useEffect(() => {
    if (!hasCompletedInitialFetch || potentialMatches.length === 0) return;

    // Filter out ads - only preload real profiles
    const realMatches = potentialMatches.filter(m => !isAd(m));
    
    // Preload upcoming profiles (4 on Android, 10 on iOS)
    const batchSize = isAndroidPlatform() ? 4 : 10;
    const upcoming = realMatches.slice(currentIndex, currentIndex + batchSize);
    
    // Preload images for upcoming profiles
    if (upcoming.length > 0) {
      preloadProfileImages(upcoming as PotentialMatch[], 0);
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

    // Check profile completion restriction (70% after 8 swipes) - MUST be checked BEFORE swipe
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
    // Free users: 16 swipes, Premium users: 65 swipes
    const swipeLimit = isPremium ? 65 : 16;
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
          locallySwipedProfileIds.current.delete(prevMatch.id);
          persistSwipedIds(); // Keep sessionStorage in sync
          setPotentialMatches(prev => [prevMatch, ...prev]);
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
                console.error('💖 Error checking like count:', countError);
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
                console.error('🔔 Match notification error:', notificationError);
              }
            }
          } catch (fallbackErr) {
            // If even fallback fails, rollback to keep UI consistent
            locallySwipedProfileIds.current.delete(prevMatch.id);
            persistSwipedIds(); // Keep sessionStorage in sync
            setPotentialMatches(prev => [prevMatch, ...prev]);
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
              console.error('🔔 Match notification error:', notificationError);
            }
          } else {
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
              console.error('💖 Error checking like count:', countError);
            }
          }
        }
      } catch (jobErr) {
        // On unexpected errors, attempt a rollback to keep UX consistent
        locallySwipedProfileIds.current.delete(prevMatch.id);
        persistSwipedIds(); // Keep sessionStorage in sync
        setPotentialMatches(prev => [prevMatch, ...prev]);
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
    // Check profile completion restriction (70% after 8 swipes) - MUST be checked BEFORE swipe
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
    // Free users: 16 swipes, Premium users: 65 swipes
    const swipeLimit = isPremium ? 65 : 16;
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
    const prevIndex = currentIndex;
    const prevMatch = currentMatch;

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
          locallySwipedProfileIds.current.delete(prevMatch.id);
          persistSwipedIds(); // Keep sessionStorage in sync
          setPotentialMatches(prev => [prevMatch, ...prev]);
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
            locallySwipedProfileIds.current.delete(prevMatch.id);
            persistSwipedIds(); // Keep sessionStorage in sync
            setPotentialMatches(prev => [prevMatch, ...prev]);
            setCurrentIndex(0);
            setPassedUsers(prev => prev.filter(p => p.user_id !== prevMatch.id));
            setTodaySwipeCount(prev => Math.max(0, prev - 1));
            toast({ title: 'Error', description: 'Could not skip this profile.', variant: 'destructive' });
            return;
          }
        }
      } catch (jobErr) {
        // Unexpected error: rollback
        locallySwipedProfileIds.current.delete(prevMatch.id);
        persistSwipedIds(); // Keep sessionStorage in sync
        setPotentialMatches(prev => [prevMatch, ...prev]);
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
  // ...removed log...
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
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols')
          .eq('id', lastPassedUser.user_id)
          .eq('account_status', 'active')
          .single();

        if (!profileError && profileData) {
          // Add the user back with empty images array (will be loaded when needed)
          const userWithImages = { ...profileData, images: [] };
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

      // Update reverse usage count if not premium
      if (!isPremium) {
        setReverseUsageToday(prev => prev + 1);
      }

    } catch (error) {
  // ...removed log...
      toast({
        title: t('common.error'),
        description: t('discover.errors.reverseFailed'),
        variant: 'destructive'
      });
    }
  };

  // Helper to update cache after rollback
  const moveToNext = () => {
    // ⭐ ANDROID OPTIMIZATION: Abort any pending image loads for previous profile
    if (currentImageAbortController) {
      currentImageAbortController.abort();
    }

    // ⭐ CRITICAL FIX: Remove the swiped profile from array to prevent duplicates
    // Use callback to get accurate remaining count AFTER removal
    setPotentialMatches(prev => {
      const newMatches = prev.filter((_, i) => i !== currentIndex);
      const remainingProfiles = newMatches.length;
      
      // ⭐ Update saved profile order in localStorage (remove swiped profile)
      try {
        const today = new Date().toISOString().split('T')[0];
        const savedOrderKey = `driplove_profile_order_${currentUser?.id}_${today}`;
        const currentProfile = prev[currentIndex];
        
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
      const nextProfile = newMatches[1]; // Index 1 in the NEW array
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
          <LazyAdinkraBar />
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

  // Show no profiles if we've exhausted all available profiles OR if initial fetch found none
  // BUT: Premium users with unlocked countries should never see this unless truly exhausted
  const hasUnlockedCountries = isPremium && currentUser?.unlocked_countries && 
    Array.isArray(currentUser.unlocked_countries) && currentUser.unlocked_countries.length > 0;
  
  if (
    (noMoreProfiles && potentialMatches.length === 0 && !hasUnlockedCountries) || 
    (potentialMatches.length === 0 && hasCompletedInitialFetch && !isLoading && !hasUnlockedCountries)
  ) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">{t('discover.noMoreProfiles')}</h2>
            <p className="text-gray-600 mb-4">
              {t('discover.noProfilesDescription')}
            </p>
            <Button onClick={() => {
              setNoMoreProfiles(false); // Reset the state
              fetchPotentialMatches();
            }} className="w-full">
              {t('discover.refresh')}
            </Button>
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

// Helper component to extract and apply dominant color as background

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
                  }
                }}
                calculateAge={calculateAge}
                calculateDistance={calculateDistance}
                swipeDirection={swipeUI.swipeDirection}
                swipeDistance={swipeUI.swipeDistance}
                isVerified={isProfileVerified(currentMatch)}
                isSwipeAreaOnly={true} // Render only swipeable image area
                isDetailsAreaOnly={false}
                getOptimizedUrl={getOptimizedUrl}
                preCalculatedDistance={userDistances[currentMatch.id]}
              />
            )}
          </div>
          
          {/* AdinkraBar - between image and info sections */}
          <LazyAdinkraBar />

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
                        ? (window.innerHeight < 700 ? '190px' : '180px')
                        : (window.innerHeight < 700 ? '190px' : '180px')
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
                isVerified={isProfileVerified(currentMatch)}
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

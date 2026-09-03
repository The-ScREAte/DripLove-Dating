import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users, Heart, X, Calendar, MapPin, ArrowLeft, ArrowUp, ArrowDown,
  Briefcase, GraduationCap, Crown, Lock, Languages
} from 'lucide-react';

// ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { getPlatformSync } from '@/utils/platformUtils';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import RatingFunnel from './RatingFunnel';
import { registerMatchAndCheckIsFirst, isRatingFunnelEligible, markRatingFunnelTriggered } from '@/utils/ratingFunnelStorage';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';

// FIX #1: Import blob cache for instant Android image loading
import { preloadImageToBlob } from '@/utils/imageCache';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

import type { AppUser, LikedMeCacheValue, LikerProfile } from '@/types/cacheTypes';
import type { PotentialMatch } from '@/types';

// Reuse Discover's exact slide-building/rendering so the "view a liker" screen
// looks and behaves identically to the swipe card's own expanded view.
import { SlideRenderer } from './discover/SlideRenderer';
import { buildSlides, getUserColorHash, getPreviewHighlights, HIGHLIGHT_CHIP_BORDER_COLORS, truncateChipLabel } from './discover/MatchCardHelpers';
import UserAdinkraDisplay from './discover/UserAdinkraDisplay';

// =========================================================
// GLOBAL CACHES
// =========================================================

const LIKED_ME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LIKED_ME_STORAGE_KEY_PREFIX = 'likedMe_v1_';

type CurrentUser = AppUser;

const getStorageKey = (userId: string) =>
  `${LIKED_ME_STORAGE_KEY_PREFIX}${userId}`;

const readCacheFromStorage = (userId: string): LikedMeCacheValue | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(getStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LikedMeCacheValue;
    if (!parsed.timestamp) return null;

    const isExpired = Date.now() - parsed.timestamp > LIKED_ME_CACHE_TTL;
    if (isExpired) {
      sessionStorage.removeItem(getStorageKey(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCacheToStorage = (userId: string, value: LikedMeCacheValue) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(getStorageKey(userId), JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const likedMeCache = new Map<string, LikedMeCacheValue>();

// UUID helper for deduplicating UUIDs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
const uniqUuids = (values: unknown[]): string[] => Array.from(new Set(values.filter(isUuid)));

const likedMePollIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Throttles the "refresh in background" call that fires whenever this page
// (re)mounts. Without this, switching tabs/navigating back to Liked Me
// re-triggers a background refetch every time even though the cache is
// only seconds old, and the wholesale list/image swap it performs is what
// caused the visible "loads, then reloads to the right thing" flash.
const LIKED_ME_BACKGROUND_REFRESH_THROTTLE = 20 * 1000; // 20 seconds
const likedMeLastBackgroundFetchAt = new Map<string, number>();

const hasListChanged = (previous: LikerProfile[], next: LikerProfile[]) => {
  if (previous.length !== next.length) return true;
  const prevMap = new Map(previous.map(p => [p.id, p.updated_at]));
  for (const n of next) {
    if (prevMap.get(n.id) !== n.updated_at) return true;
  }
  return false;
};

if (typeof window !== 'undefined') {
  window.likedMeCache = likedMeCache;
}

// =========================================================
// COMPONENT START
// =========================================================

interface LikedMePageProps {
  currentUser: CurrentUser;
  isPremium?: boolean;
  // Whether the Liked Me tab is currently the visible one in the bottom nav
  // (parent keeps this component mounted via display:none when not active).
  isActiveTab?: boolean;
  // Switches the bottom nav to the Chat tab - used by the match banner's
  // "Start Chatting" button when liking someone back turns into a mutual match.
  onNavigateToChat?: (userId: string) => void;
}

const LikedMePage = ({ currentUser, isPremium = false, isActiveTab = true, onNavigateToChat }: LikedMePageProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // ------------------
  // STATE HOOKS (must stay in same order forever)
  // ------------------
  const [likers, setLikers] = useState<LikerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<LikerProfile | null>(null);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  // Report/block modal - same shape and fields as Discover's swipe card modal.
  const [showReportModal, setShowReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState('');
  const [selectedReportReason, setSelectedReportReason] = useState('');
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [isBlockSuccess, setIsBlockSuccess] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  // Swipe-to-pass/like-back on the photo card, same gesture as Discover's swipe
  // card, replacing the old dedicated X/heart button row.
  const [swipeDragX, setSwipeDragX] = useState(0);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const [swipeExitDirection, setSwipeExitDirection] = useState<'left' | 'right' | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  // rAF-throttled drag, same fix as Discover's swipe card: pointermove can fire far
  // more often than the display refreshes (especially on Android), and calling
  // setSwipeDragX on every single event re-renders this whole page that often -
  // capping the state update to once per animation frame, and writing the
  // transform straight to the card's own DOM node ahead of that (so it never
  // waits on this page's render to actually land), is what keeps the drag feeling
  // glued to the finger instead of stuttering on weaker hardware.
  const swipeCardElRef = useRef<HTMLDivElement>(null);
  const latestSwipeDeltaRef = useRef(0);
  const swipeRafScheduledRef = useRef(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);

  // Navigating away from this tab always drops the premium-upgrade screen, so
  // coming back to Liked Me never lands on a stale upgrade screen instead of
  // the actual list.
  useEffect(() => {
    if (!isActiveTab) {
      setShowPremiumUpgrade(false);
    }
  }, [isActiveTab]);
  const [lockoutEndDate, setLockoutEndDate] = useState<Date | null>(null);
  const [hasInteractedToday, setHasInteractedToday] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const [showRatingFunnel, setShowRatingFunnel] = useState(false);
  // Liking someone back here can turn into a mutual match without ever
  // visiting Discover - same "It's a match!" banner as Discover uses.
  const [showMatchAnimation, setShowMatchAnimation] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<LikerProfile | null>(null);
  // ------------------
  // REFS
  // ------------------
  const isFirstEverMatchRef = useRef(false);
  const backgroundFetchingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const preloadAbortRef = useRef<AbortController | null>(null);
  const fullImageAbortRef = useRef<AbortController | null>(null);

  // ------------------
  // MEMOIZED PLATFORM
  // ------------------
  const platform = useMemo(() => getPlatformSync(), []);

  // ------------------
  // SAFE IMAGE RESOLVER (stable, never creates hooks)
  // ------------------
  const getSafeImageSrc = useCallback(
    (urlOrBlob?: string, isGridThumbnail = false): string | undefined => {
      if (!urlOrBlob) return undefined;

      // Blob URLs always safe
      if (urlOrBlob.startsWith("blob:")) return urlOrBlob;

      // Optimize remote URLs for faster loading (sized for retina screens so
      // cards don't look soft on 2x/3x devices).
      if (urlOrBlob.includes('supabase')) {
        const width = isGridThumbnail ? 700 : 1080;
        return optimizeImageUrl(urlOrBlob, { width, quality: 82 });
      }

      return urlOrBlob;
    },
    []
  );


  // ⭐ ANDROID OPTIMIZATION: Single debounced resize handler
  const [columnsPerRow, setColumnsPerRow] = useState(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 375;
    if (width >= 1024) return 4;
    if (width >= 768) return 3;
    return 2;
  });
   
  useEffect(() => {
    let rafId: number | null = null;
    
    const updateColumns = () => {
      if (rafId) return; // Skip if already scheduled
      
      rafId = requestAnimationFrame(() => {
        const width = window.innerWidth;
        const newColumns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
        setColumnsPerRow(prev => prev !== newColumns ? newColumns : prev);
        rafId = null;
      });
    };
    
    window.addEventListener('resize', updateColumns, { passive: true });
    return () => {
      window.removeEventListener('resize', updateColumns);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  
  // Ensure virtualizer count is always stable (never undefined)
  const virtualizerCount = useMemo(() => {
    return likers.length > 0 ? Math.ceil(likers.length / columnsPerRow) : 0;
  }, [likers.length, columnsPerRow]);
  
  // ⭐ ANDROID OPTIMIZATION: Memoized row config calculation (replaces 4 separate useStates + useEffect)
  const rowConfig = useMemo(() => {
    const maxWidth = 1400;
    const containerWidth = scrollContainerRef.current 
      ? Math.min(scrollContainerRef.current.clientWidth, maxWidth) 
      : Math.min(typeof window !== 'undefined' ? window.innerWidth : 375, maxWidth);

    // Responsive padding based on columns
    const paddingMap: Record<number, number> = { 2: 8, 3: 32, 4: 48 };
    const gapMap: Record<number, number> = { 2: 12, 3: 40, 4: 56 };
    const vGapMap: Record<number, number> = { 2: 100, 3: 175, 4: 220 };

    const rowPadding = paddingMap[columnsPerRow] ?? 8;
    const horizontalGap = gapMap[columnsPerRow] ?? 12;
    const verticalGap = vGapMap[columnsPerRow] ?? 180;

    const innerWidth = Math.max(0, containerWidth - rowPadding * 2);
    const totalGaps = horizontalGap * (columnsPerRow - 1);
    const cardWidth = (innerWidth - totalGaps) / Math.max(1, columnsPerRow);

    const imageHeight = Math.round(cardWidth * 3 / 4);
    const contentHeight = 56;
    const extra = 8;
    const cardHeight = imageHeight + contentHeight + extra;

    return {
      estimatedRowHeight: Math.max(200, cardHeight),
      rowVerticalGap: verticalGap,
      rowPaddingHorizontal: rowPadding,
      rowColumnGap: horizontalGap
    };
  }, [columnsPerRow]);

  // Destructure for backwards compatibility
  const { estimatedRowHeight, rowVerticalGap, rowPaddingHorizontal, rowColumnGap } = rowConfig;

  // ⭐ CRITICAL FIX: Create stable callbacks OUTSIDE useVirtualizer (hooks can't be nested)
  const getScrollElement = useCallback(() => scrollContainerRef.current, []);
  // Include vertical gap in the virtualizer size so we don't have to manually offset `top` or container height.
  const getEstimateSize = useCallback(
    () => estimatedRowHeight + rowVerticalGap,
    [estimatedRowHeight, rowVerticalGap]
  );

  // ⭐ Always create virtualizer - don't conditionally enable/disable based on state
  const rowVirtualizer = useVirtualizer({
    count: virtualizerCount,
    getScrollElement,
    estimateSize: getEstimateSize,
    overscan: 5
  });

  const calculateAge = useCallback((dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }, []);

  const ageByLikerId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const liker of likers) {
      if (liker?.id && liker?.date_of_birth) {
        map[liker.id] = calculateAge(liker.date_of_birth);
      }
    }
    return map;
  }, [likers, calculateAge]);

  const checkLockoutStatus = useCallback(async () => {
    if (!currentUser?.id || isPremium) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('like_me_cooldown_until')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching cooldown:', error);
        return;
      }

      if (data?.like_me_cooldown_until) {
        const cooldownDate = new Date(data.like_me_cooldown_until);
        if (cooldownDate > new Date()) {
          setLockoutEndDate(cooldownDate);
        }
      }
    } catch (error) {
      console.error('Error in fetchCooldown:', error);
    }
  }, [currentUser?.id, isPremium]);

  const supabaseRpc = useCallback(
    (fn: string, params: Record<string, unknown>) => {
      return (supabase as unknown as {
        rpc: (
          fn: string,
          params: Record<string, unknown>
        ) => Promise<{ data: unknown; error: unknown }>;
      }).rpc(fn, params);
    },
    []
  );

  // Shared data fetching logic
  const fetchLikersData = useCallback(async (userId: string) => {
    // 1. Get all likes for this user
    const { data: likes, error: likesError } = await supabase
      .from('likes')
      .select('liker_id, created_at')
      .eq('liked_id', userId);
    
    if (likesError) throw likesError;
    if (!likes || likes.length === 0) {
      return { likers: [], userImages: {} };
    }

    // 2. Get block relationships (both directions)
    const blocksRes = await supabase
      .from('blocks')
      .select('blocked_id, blocker_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    if (blocksRes.error) throw blocksRes.error;

    const blockedUsers = blocksRes.data || [];
    const blockedIds = new Set(
      blockedUsers
        .map((block) => (block.blocker_id === userId ? block.blocked_id : block.blocker_id))
        .filter(Boolean)
    );

    // 3. Get existing matches - we should NOT show matched users in "liked me" page
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (matchesError) throw matchesError;

    const matchedIds = new Set(
      (matches || [])
        .map((m) => (m.user1_id === userId ? m.user2_id : m.user1_id))
        .filter(Boolean)
    );

    // 4. Build likerIds - exclude blocked users and matched users
    const likerIds = uniqUuids(likes.map((like) => like.liker_id).filter(Boolean))
      .filter((id) => id !== userId)
      .filter((id) => !blockedIds.has(id))
      .filter((id) => !matchedIds.has(id));

    if (likerIds.length === 0) {
      return { likers: [], userImages: {} };
    }

    // 5. Fetch all profiles in one go
    // NOTE: deliberately does NOT filter on is_archived. That flag just marks
    // a lower-priority/backfill pool Discover tops decks up with when a
    // country's active supply is thin (see DiscoverPage's active-then-archived
    // top-up query) - it does not mean removed, deleted, or unmatchable. Their
    // likes are real rows in `likes` and swiping on them in Discover produces
    // a genuine match, so excluding them here only hid real likers from this
    // list without stopping them from being liked back / matched elsewhere.
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', likerIds)
      .neq('is_admin', true);

    if (profileError) throw profileError;

    // Preserve "most recent like" ordering as best-effort
    const latestLikeAtByLiker = new Map<string, number>();
    for (const like of likes) {
      const likerId = like?.liker_id;
      if (!likerId) continue;
      const ts = Date.parse(String((like as any).created_at || ''));
      const t = Number.isFinite(ts) ? ts : 0;
      const prev = latestLikeAtByLiker.get(likerId) ?? 0;
      if (t > prev) latestLikeAtByLiker.set(likerId, t);
    }

    const likers = ((profiles || []) as unknown as LikerProfile[]).sort((a, b) => {
      const ta = latestLikeAtByLiker.get(a.id) ?? 0;
      const tb = latestLikeAtByLiker.get(b.id) ?? 0;
      return tb - ta;
    });

    // 6. Fetch all first images for these profiles in one query
    let imagesData = null;
    if (likerIds.length > 0) {
      const { data: approvedImages, error: imagesError } = await supabase
        .from('user_images')
        .select('user_id, image_url, image_order')
        .in('user_id', likerIds)
        .eq('is_approved', true)
        .order('image_order', { ascending: true });

      if (imagesError && imagesError.message.includes('does not exist')) {
        const { data: fallbackImages, error: fallbackError } = await supabase
          .from('user_images')
          .select('user_id, image_url, image_order')
          .in('user_id', likerIds)
          .order('image_order', { ascending: true });

        if (fallbackError) throw fallbackError;
        imagesData = fallbackImages;
      } else if (imagesError) {
        throw imagesError;
      } else {
        imagesData = approvedImages;
      }
    }

    // Map exactly one (first) image URL per liker (cheap), then selectively blob-preload only the first few.
    const imageMap: { [key: string]: string[] } = {};
    if (imagesData) {
      // Group images by user_id
      const imagesByUser: { [key: string]: typeof imagesData } = {};
      for (const img of imagesData) {
        if (!imagesByUser[img.user_id]) {
          imagesByUser[img.user_id] = [];
        }
        imagesByUser[img.user_id].push(img);
      }

      // Always assign a first image URL for every liker, so cards don't fall back to initials.
      for (const likerId of likerIds) {
        const firstImageUrl = imagesByUser[likerId]?.[0]?.image_url;
        if (firstImageUrl) {
          imageMap[likerId] = [firstImageUrl];
        }
      }
    }

    return { likers, userImages: imageMap };
  }, []);

  // Background fetching function
  const fetchLikersInBackground = useCallback(async () => {
    if (!currentUser?.id || backgroundFetchingRef.current) return;
    backgroundFetchingRef.current = true;
    likedMeLastBackgroundFetchAt.set(currentUser.id, Date.now());

    try {
      const result = await fetchLikersData(currentUser.id);
      if (result) {
        const { likers: newLikers, userImages: newUserImages } = result;
        const cached = likedMeCache.get(currentUser.id);
        const shouldUpdate = hasListChanged(cached?.likers || [], newLikers);

        if (shouldUpdate) {
          const cacheValue: LikedMeCacheValue = {
            likers: newLikers,
            userImages: newUserImages,
            timestamp: Date.now(),
          };

          likedMeCache.set(currentUser.id, cacheValue);
          writeCacheToStorage(currentUser.id, cacheValue);

          // Cancel any in-flight blob preload from a previous fetch - otherwise
          // it can resolve after this swap and stomp a fresh image URL with a
          // stale blob for a liker who is no longer even in the new list,
          // which is what made images sometimes show the wrong/broken photo.
          if (preloadAbortRef.current) {
            preloadAbortRef.current.abort();
            preloadAbortRef.current = null;
          }

          setLikers(newLikers);
          setUserImages(newUserImages);
        } else if (cached) {
          cached.timestamp = Date.now();
          writeCacheToStorage(currentUser.id, cached);
        }
      }
    } catch {
      // Silently handle background fetch errors
    } finally {
      backgroundFetchingRef.current = false;
    }
  }, [currentUser?.id, fetchLikersData]);

  // ⭐ ANDROID OPTIMIZATION: Lighter preload - skip createImageBitmap on Android (causes lag)
  const preloadFirstProfilesWithBlobs = useCallback(async (
    profiles: { id: string }[], 
    imageUrls: { [key: string]: string[] }
  ) => {
    // ⭐ FIX #4: Cancel previous loads
    if (preloadAbortRef.current) {
      preloadAbortRef.current.abort();
      preloadAbortRef.current = null;
    }
    
    const controller = new AbortController();
    preloadAbortRef.current = controller;

    // ⭐ ANDROID FIX: Only preload first 2 profiles (reduced from 3)
    const profilesToPreload = profiles.slice(0, 2);

    for (const profile of profilesToPreload) {
      const firstImageUrl = imageUrls[profile.id]?.[0];
      if (!firstImageUrl || controller.signal.aborted) break;

      try {
        // ⭐ FIX #1: Preload as blob URL
        const blobUrl = await preloadImageToBlob(firstImageUrl);
        
        if (controller.signal.aborted) break;
        
        // ⭐ ANDROID FIX: Skip createImageBitmap on Android - it causes main thread blocking
        // Standard image preloading is sufficient for smooth rendering
        if (blobUrl && platform !== 'android' && typeof createImageBitmap !== 'undefined') {
          try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();
            await createImageBitmap(blob);
          } catch {
            // Silent fail - image still works without pre-decode
          }
        }

        // Update userImages with blob URL
        if (!controller.signal.aborted) {
          setUserImages(prev => ({
            ...prev,
            [profile.id]: blobUrl ? [blobUrl] : prev[profile.id]
          }));
        }
      } catch {
        // Silent fail for individual images
      }
    }
    if (preloadAbortRef.current === controller) {
      preloadAbortRef.current = null;
    }
  }, [platform]); // Add platform dependency

  // Optimized: batch queries and filter in SQL
  const fetchLikers = useCallback(async (showLoading = false) => {
    if (!currentUser?.id) {
      setLikers([]);
      setUserImages({});
      setLoading(false);
      return;
    }
    try {
      if (showLoading) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      const result = await fetchLikersData(currentUser.id);
      if (result) {
        const { likers: newLikers, userImages: newUserImages } = result;
        
        const cacheValue: LikedMeCacheValue = {
          likers: newLikers,
          userImages: newUserImages,
          timestamp: Date.now()
        };

        // Update cache
        likedMeCache.set(currentUser.id, cacheValue);
        writeCacheToStorage(currentUser.id, cacheValue);

        setLikers(newLikers);
        setUserImages(newUserImages);

        // ⭐ FIX #1: Preload first 3 profile images as blob URLs for instant Android rendering
        if (newLikers && newLikers.length > 0) {
          preloadFirstProfilesWithBlobs(newLikers.slice(0, 3), newUserImages);
        }
      }
    } catch (error) {
      console.error('Error fetching likers:', error);
      if (showLoading && !navigator.onLine) {
        toast({
          title: t('matches.error'),
          description: "You appear to be offline. Please check your connection.",
          variant: "destructive",
        });
      }
    } finally {
      if (showLoading) {
        setIsRefreshing(false);
        setPullDistance(0);
      } else {
        setLoading(false);
      }
    }
  }, [currentUser?.id, toast, t, fetchLikersData, preloadFirstProfilesWithBlobs]);

  // Load additional images when profile is selected - only approved onesclicked
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 1) return; // Already loaded

    // ⭐ FIX #4: Cancel previous image loads
    if (fullImageAbortRef.current) {
      fullImageAbortRef.current.abort();
      fullImageAbortRef.current = null;
    }

    const controller = new AbortController();
    fullImageAbortRef.current = controller;

    try {
      // Try to fetch approved images first
      const { data: initialImages, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', profileId)
        .eq('is_approved', true) // Only show approved images
        .order('image_order')
        .abortSignal(controller.signal);

      let images = initialImages;

      if (controller.signal.aborted) return;

      // If moderation columns don't exist, fall back to basic query
      if (error && error.message.includes('does not exist')) {
        const { data: fallbackImages, error: fallbackError } = await supabase
          .from('user_images')
          .select('image_url')
          .eq('user_id', profileId)
          .order('image_order')
          .abortSignal(controller.signal);

        if (fallbackError || controller.signal.aborted) return; // Silent fail for fallback
        images = fallbackImages;
      } else if (error || controller.signal.aborted) {
        return; // Silent fail
      }

      if (images?.length && !controller.signal.aborted) {
        const imageUrls = images.map(img => img.image_url);
        
        // ⭐ FIX #1: Preload all images as blobs for instant flipping
        const blobUrls = await Promise.all(
          imageUrls.map(url => preloadImageToBlob(url))
        );

        if (!controller.signal.aborted) {
          setUserImages(prev => ({
            ...prev,
            [profileId]: blobUrls.filter(Boolean) as string[]
          }));
        }
      }
    } catch (error) {
      // Silent fail for image loading - don't log for aborted requests
    } finally {
      if (fullImageAbortRef.current === controller) {
        fullImageAbortRef.current = null;
      }
    }
  }, [userImages]); // Removed platform dependency - it's stable via useMemo

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false);
      setLikers([]);
      setUserImages({});
      return;
    }

    // 1) Try in-memory cache
    let cached = likedMeCache.get(currentUser.id) as LikedMeCacheValue | undefined;

    // 2) If no in-memory cache, try sessionStorage
    if (!cached) {
      const stored = readCacheFromStorage(currentUser.id);
      if (stored) {
        cached = stored;
        likedMeCache.set(currentUser.id, stored);
      }
    }

    if (cached) {
      // 👉 Show cached UI immediately (no spinner)
      setLikers(cached.likers);
      setUserImages(cached.userImages);
      setLoading(false);

      // 👉 Refresh in background (non-blocking) - but only if we haven't
      // just done so. Re-firing this on every mount (e.g. switching tabs
      // back to Liked Me) is what caused the list/images to visibly swap
      // right after appearing correct.
      const lastFetch = likedMeLastBackgroundFetchAt.get(currentUser.id) || 0;
      if (Date.now() - lastFetch > LIKED_ME_BACKGROUND_REFRESH_THROTTLE) {
        fetchLikersInBackground();
      }
    } else {
      // No cache at all → do a real fetch
      fetchLikers();
    }

    checkLockoutStatus();
  }, [currentUser?.id, checkLockoutStatus, fetchLikers, fetchLikersInBackground]);

  // ⭐ ANDROID OPTIMIZATION: Increased polling interval (60s instead of 30s)
  useEffect(() => {
    if (!currentUser?.id) return;
    const existingInterval = likedMePollIntervals.get(currentUser.id);
    if (existingInterval) {
      return () => clearInterval(existingInterval);
    }

    // ⭐ ANDROID FIX: Reduced polling frequency from 30s to 60s
    const interval = setInterval(() => {
      void fetchLikersInBackground();
    }, 60000);

    likedMePollIntervals.set(currentUser.id, interval);

    return () => {
      clearInterval(interval);
      likedMePollIntervals.delete(currentUser.id);
    };
  }, [currentUser?.id, fetchLikersInBackground]);

  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false);
    setCurrentSlide(0);
    setSwipeDragX(0);
    setIsSwipeDragging(false);
    setSwipeExitDirection(null);
    swipeStartRef.current = null;
  }, [selectedProfile]);

  // Slide list built by the exact same helper Discover's swipe card uses, so the
  // mix of photos/bio/fun-question slides matches it exactly.
  const slides = useMemo(() => {
    if (!selectedProfile) return [];
    const profileImages = userImages[selectedProfile.id] || [];
    return buildSlides(selectedProfile as unknown as PotentialMatch, profileImages);
  }, [selectedProfile, userImages]);

  // Same "one interest + up to 2 lifestyle attributes" chip line Discover's
  // swipe card shows when collapsed, via the shared helper.
  const previewHighlights = useMemo(() => {
    if (!selectedProfile) return [];
    return getPreviewHighlights(selectedProfile as unknown as PotentialMatch);
  }, [selectedProfile]);

  // One cultural sign to surface as its own chip: whichever sign this profile
  // shares with the current user if they have one in common, otherwise just
  // one of the profile's own signs (deterministic, so it doesn't change on
  // every re-render).
  const signHighlight = useMemo(() => {
    const theirs = selectedProfile?.adinkra_symbols;
    if (!theirs || theirs.length === 0) return null;
    const mine = (currentUser as unknown as { adinkra_symbols?: string[] | null })?.adinkra_symbols || [];
    return theirs.find(symbol => mine.includes(symbol)) || theirs[0];
  }, [selectedProfile, currentUser]);

  // Same 4-color palette Discover's swipe card uses for non-photo slide backgrounds.
  const slideBackgroundColors = useMemo(() => [
    'bg-gradient-to-br from-pink-600 to-rose-900',
    'bg-gradient-to-br from-blue-700 to-indigo-950',
    'bg-gradient-to-br from-red-800 to-rose-950',
    'bg-gradient-to-br from-zinc-700 to-neutral-950',
  ], []);

  // Clamp currentSlide if slides array shrinks
  useEffect(() => {
    if (currentSlide > Math.max(0, slides.length - 1)) {
      setCurrentSlide(Math.max(0, slides.length - 1));
    }
  }, [slides.length, currentSlide]);

  // ⭐ FIX #6: Memoize getRemainingDays (prevents recalc on every render)
  const getRemainingDays = useMemo(() => {
    if (!lockoutEndDate) return 0;
    const now = new Date();
    const diff = lockoutEndDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [lockoutEndDate]);

  const isInLockout = useMemo(() => 
    !isPremium && lockoutEndDate && new Date() < lockoutEndDate,
    [isPremium, lockoutEndDate]
  );

  const setLockoutPeriod = useCallback(async () => {
    if (isPremium || !currentUser?.id) return;

    try {
      const lockoutDate = new Date();
      lockoutDate.setDate(lockoutDate.getDate() + 50);

      const { error } = await supabase
        .from('profiles')
        .update({ like_me_cooldown_until: lockoutDate.toISOString() })
        .eq('id', currentUser.id);

      if (error) throw error;

      setLockoutEndDate(lockoutDate);
    } catch (error) {
      console.error('Error setting cooldown:', error);
    }
  }, [currentUser?.id, isPremium]);

    const handleNavigationClick = useCallback((e: React.MouseEvent) => {
    if (!selectedProfile) return;
    
    const x = e.clientX;
    const width = window.innerWidth;
    const clickX = (x / width) * 100;

    if (clickX < 50) {
      // Left half - go to previous slide
      setCurrentSlide(prev => Math.max(0, prev - 1));
    } else {
      // Right half - go to next slide
      setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1));
    }
  }, [selectedProfile, slides.length]);

  // Only fire the one-time rating funnel for a user's actual first-ever match,
  // and only after the match banner itself has been dismissed - same sequencing
  // Discover uses (see DiscoverPage's maybeTriggerRatingFunnel).
  const maybeTriggerRatingFunnel = useCallback(() => {
    if (!isFirstEverMatchRef.current) return;
    isFirstEverMatchRef.current = false;
    if (!isRatingFunnelEligible()) return;
    setTimeout(() => {
      markRatingFunnelTriggered();
      setShowRatingFunnel(true);
    }, 3000);
  }, []);

  const handleStartChatFromMatch = useCallback((userId: string) => {
    setShowMatchAnimation(false);
    maybeTriggerRatingFunnel();
    onNavigateToChat?.(userId);
  }, [maybeTriggerRatingFunnel, onNavigateToChat]);

  const handleCloseMatchAnimation = useCallback(() => {
    setShowMatchAnimation(false);
    setMatchedProfile(null);
    maybeTriggerRatingFunnel();
  }, [maybeTriggerRatingFunnel]);

  const handleLikeBack = useCallback(async (profileId: string) => {
    // Optimistic update - remove profile immediately
    const profileToRemove = likers.find(liker => liker.id === profileId);
    setLikers(prev => prev.filter(liker => liker.id !== profileId));
    setSelectedProfile(null);
    
    // Update cache immediately
    if (currentUser?.id) {
      const cached = likedMeCache.get(currentUser.id);
      if (cached) {
        const updatedLikers = cached.likers.filter(liker => liker.id !== profileId);
        const updatedImages = { ...cached.userImages };
        delete updatedImages[profileId];
        
        const cacheValue: LikedMeCacheValue = {
          likers: updatedLikers,
          userImages: updatedImages,
          timestamp: Date.now()
        };

        likedMeCache.set(currentUser.id, cacheValue);
        writeCacheToStorage(currentUser.id, cacheValue);
      }
    }

    try {
      // Use the proper function that creates matches on mutual likes
      const { data, error } = await supabase.rpc('like_and_usage_batched', {
        liker_id_param: currentUser.id,
        liked_id_param: profileId,
        premium_param: isPremium || false
      });

      if (error) throw error;

      // Set lockout period for free users
      if (!isPremium && !hasInteractedToday) {
        await setLockoutPeriod();
        setHasInteractedToday(true);
      }

      // A like-back can create a match without ever visiting Discover - show
      // the exact same "It's a match!" banner Discover uses, then let the
      // one-time rating funnel fire after the banner is dismissed.
      const madeMatch = !!data && typeof data === 'object' && Boolean((data as Record<string, unknown>).match);
      if (madeMatch) {
        if (registerMatchAndCheckIsFirst()) {
          isFirstEverMatchRef.current = true;
        }
        if (profileToRemove) {
          setMatchedProfile(profileToRemove);
          setShowMatchAnimation(true);
        }

        // ChatPage keeps running in the background once visited (MainApp mounts
        // tabs and hides them via display:none rather than unmounting), so its
        // own match-fetch only ever runs once on that first mount. From then on
        // it depends entirely on this event to know a new match exists - without
        // it, a match made here would only ever surface after ChatPage's stale
        // cache happens to expire on its own. Same pair of calls DiscoverPage's
        // handleLike makes on a match.
        if (typeof window !== 'undefined') {
          const win = window as Window & { chatMatchesCache?: Map<string, unknown> };
          win.chatMatchesCache?.delete(currentUser.id);
          window.dispatchEvent(new CustomEvent('newMatch', { detail: { userId: currentUser.id } }));
        }
      }
    } catch (error) {
      // Revert optimistic update on error
      if (profileToRemove) {
        setLikers(prev => [profileToRemove, ...prev]);
        
        // Revert cache
        if (currentUser?.id) {
          const cached = likedMeCache.get(currentUser.id);
          if (cached) {
            const cacheValue: LikedMeCacheValue = {
              likers: [profileToRemove, ...cached.likers],
              userImages: cached.userImages,
              timestamp: Date.now()
            };

            likedMeCache.set(currentUser.id, cacheValue);
            writeCacheToStorage(currentUser.id, cacheValue);
          }
        }
      }
      
      toast({
        title: "Error",
        description: "Failed to like back. Profile has been restored.",
        variant: "destructive",
      });
    }
  }, [currentUser?.id, hasInteractedToday, isPremium, likers, setLockoutPeriod, toast]);

  const handlePass = useCallback(async (profileId: string) => {
    // Optimistic update - remove profile immediately
    const profileToRemove = likers.find(liker => liker.id === profileId);
    setLikers(prev => prev.filter(liker => liker.id !== profileId));
    setSelectedProfile(null);
    
    // Update cache immediately
    if (currentUser?.id) {
      const cached = likedMeCache.get(currentUser.id);
      if (cached) {
        const updatedLikers = cached.likers.filter(liker => liker.id !== profileId);
        const updatedImages = { ...cached.userImages };
        delete updatedImages[profileId];
        
        const cacheValue: LikedMeCacheValue = {
          likers: updatedLikers,
          userImages: updatedImages,
          timestamp: Date.now()
        };

        likedMeCache.set(currentUser.id, cacheValue);
        writeCacheToStorage(currentUser.id, cacheValue);
      }
    }

    // Show success message immediately
    toast({
      title: "Passed",
      description: "Profile removed from your likes",
    });

    try {
      // Use the same RPC as DiscoverPage for consistency
      const { error: rpcError } = await supabaseRpc('pass_and_usage_batched', {
        passer_id_param: currentUser.id,
        passed_id_param: profileId,
        premium_param: !!isPremium,
      });

      if (rpcError) {
        console.error('RPC error:', rpcError);
        // Fallback: insert pass directly
        const { data: existingPass } = await supabase
          .from('passes')
          .select('id')
          .match({ passer_id: currentUser.id, passed_id: profileId })
          .maybeSingle();

        if (!existingPass) {
          const { error: insertError } = await supabase
            .from('passes')
            .insert({ passer_id: currentUser.id, passed_id: profileId });
          
          if (insertError) {
            console.error('Error inserting pass:', insertError);
            throw insertError;
          }
        }
      }

      // Invalidate cache to force refresh on next load
      if (currentUser?.id) {
        likedMeCache.delete(currentUser.id);
        sessionStorage.removeItem(getStorageKey(currentUser.id));
      }
      
      // Set lockout period for free users
      if (!isPremium && !hasInteractedToday) {
        await setLockoutPeriod();
        setHasInteractedToday(true);
      }
    } catch (error) {
      console.error('Error in handlePass:', error);
      // Revert optimistic update on error
      if (profileToRemove) {
        setLikers(prev => [profileToRemove, ...prev]);
        
        // Revert cache
        if (currentUser?.id) {
          const cached = likedMeCache.get(currentUser.id);
          if (cached) {
            const cacheValue: LikedMeCacheValue = {
              likers: [profileToRemove, ...cached.likers],
              userImages: cached.userImages,
              timestamp: Date.now()
            };

            likedMeCache.set(currentUser.id, cacheValue);
            writeCacheToStorage(currentUser.id, cacheValue);
          }
        }
      }

      toast({
        title: "Error",
        description: "Failed to pass. Profile has been restored.",
        variant: "destructive",
      });
    }
  }, [currentUser?.id, hasInteractedToday, isPremium, likers, setLockoutPeriod, supabaseRpc, toast]);

  // Swipe-to-pass/like-back, mirroring Discover's own swipe gesture: drag
  // right past the threshold to like back, drag left to pass. A tap (no real
  // drag movement) falls through to the existing left/right-half slide
  // navigation instead, so browsing photos still works exactly as before.
  const SWIPE_THRESHOLD_RATIO = 0.3;

  const handleSwipePointerDown = useCallback((e: React.PointerEvent) => {
    if (swipeExitDirection) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY, dragging: false };
  }, [swipeExitDirection]);

  const handleSwipePointerMove = useCallback((e: React.PointerEvent) => {
    const start = swipeStartRef.current;
    if (!start || swipeExitDirection) return;
    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;
    if (!start.dragging) {
      // Ignore small jitter and mostly-vertical movement (that's a scroll, not a swipe).
      if (Math.abs(deltaX) < 8 || Math.abs(deltaY) > Math.abs(deltaX)) return;
      start.dragging = true;
      setIsSwipeDragging(true);
    }
    latestSwipeDeltaRef.current = deltaX;
    if (!swipeRafScheduledRef.current) {
      swipeRafScheduledRef.current = true;
      requestAnimationFrame(() => {
        const d = latestSwipeDeltaRef.current;
        if (swipeCardElRef.current) {
          swipeCardElRef.current.style.transform = `translateX(${d}px) rotate(${Math.max(-15, Math.min(15, d * 0.05))}deg)`;
        }
        setSwipeDragX(d);
        swipeRafScheduledRef.current = false;
      });
    }
  }, [swipeExitDirection]);

  const handleSwipePointerUp = useCallback((e: React.PointerEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;

    if (!start.dragging) {
      // Not a drag - treat it as the existing tap-to-navigate-slides gesture.
      handleNavigationClick(e as unknown as React.MouseEvent);
      return;
    }

    setIsSwipeDragging(false);
    // Flush any pending rAF from handleSwipePointerMove - otherwise it can fire
    // after this point with a stale delta and briefly redraw the card at the
    // wrong position right after it's been reset/committed to an exit.
    latestSwipeDeltaRef.current = 0;
    swipeRafScheduledRef.current = false;
    const threshold = window.innerWidth * SWIPE_THRESHOLD_RATIO;
    if (Math.abs(swipeDragX) > threshold && selectedProfile) {
      const direction = swipeDragX > 0 ? 'right' : 'left';
      setSwipeExitDirection(direction);
      setTimeout(() => {
        if (direction === 'right') {
          handleLikeBack(selectedProfile.id);
        } else {
          handlePass(selectedProfile.id);
        }
      }, 250);
    } else {
      setSwipeDragX(0);
    }
  }, [swipeDragX, selectedProfile, handleLikeBack, handlePass, handleNavigationClick]);

  const closeReportModal = useCallback(() => {
    setShowReportModal(false);
    setSelectedReportReason('');
    setReportError('');
    setBlockReason('');
    setIsBlockSuccess(false);
  }, []);

  // Reports whichever photo is currently on screen - same semantics as Discover's
  // swipe card, which is why the trigger only shows up while viewing a photo slide.
  const handleReportImage = useCallback(async () => {
    if (!selectedProfile) return;
    if (!selectedReportReason) {
      setReportError(t('reportModal.selectReason'));
      return;
    }

    setReporting(true);
    setReportError('');
    try {
      const currentSlideData = slides[currentSlide];
      const imageUrl = currentSlideData?.type === 'image' ? currentSlideData.content : undefined;
      if (!imageUrl) throw new Error('Missing image');

      const { error } = await supabase.from('reported_images').insert({
        reporter_id: currentUser.id,
        reported_user_id: selectedProfile.id,
        image_url: imageUrl,
        status: 'pending',
        reason: selectedReportReason,
      });
      if (error) throw error;

      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
        setSelectedReportReason('');
      }, 1500);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : t('reportModal.error'));
    } finally {
      setReporting(false);
    }
  }, [selectedProfile, slides, currentSlide, currentUser?.id, selectedReportReason, t]);

  const handleBlockUser = useCallback(async () => {
    if (!selectedProfile || !currentUser?.id) return;

    setIsBlocking(true);
    try {
      const { error } = await supabase
        .from('blocks')
        .insert({
          blocker_id: currentUser.id,
          blocked_id: selectedProfile.id,
          reason: blockReason.trim() || null,
        });
      if (error) throw error;

      setIsBlockSuccess(true);
      const blockedId = selectedProfile.id;
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
        setIsBlockSuccess(false);
        setSelectedReportReason('');
        setBlockReason('');
        setLikers(prev => prev.filter(liker => liker.id !== blockedId));
        setSelectedProfile(null);
      }, 3000);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Failed to block user');
    } finally {
      setIsBlocking(false);
    }
  }, [selectedProfile, currentUser?.id, blockReason]);

  const handleProfileClick = (liker: LikerProfile, index: number) => {
    // For free users, only allow clicking if they're premium
    if (!isPremium) {
      setShowPremiumUpgrade(true);
      return;
    }

    setSelectedProfile(liker);
    // Load full images when profile is selected
    loadFullImages(liker.id);
  };

  // Pull to refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!selectedProfile) {
      const container = e.currentTarget as HTMLElement;
      if (container.scrollTop === 0) {
        setStartY(e.touches[0].clientY);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!selectedProfile && startY > 0 && !isRefreshing) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, Math.min(100, currentY - startY));
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (!selectedProfile && pullDistance > 50 && !isRefreshing) {
      fetchLikers(true);
    } else {
      setPullDistance(0);
    }
    setStartY(0);
  };
  // ⭐ FIX #7: Memoize entire selected profile card (1,200+ lines) to prevent re-render storms on Android
  const selectedProfileCard = useMemo(() => {
    if (!selectedProfile) return null;

    const totalSlides = slides.length;
    const currentSlideData = slides[currentSlide] || slides[0];
    const isImageSlide = currentSlideData.type === 'image';
    const userBackgroundColor = getUserColorHash(selectedProfile.id, slideBackgroundColors);

    return (
      <div
        className="h-full w-full relative flex flex-col bg-black overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Photo area - fixed height only while the info panel below is actually
            showing (so that panel has room to breathe, same proportion Discover
            gives its own expanded panel). Collapsed, there's no info panel
            rendered at all (see below), so the photo fills 100% of the available
            space instead of stopping at a fixed height and leaving a dead gap -
            exactly how Discover's own collapsed card behaves. */}
        <div
          className="relative flex-shrink-0 w-full overflow-hidden"
          style={{ height: showMoreInfo ? '58%' : '100%', minHeight: '220px' }}
        >
          {/* Swipeable unit - photo, swipe hint, AND the name/caption all live in
              this one box and move together as a single card on drag, the same
              way Discover's swipe card carries its own caption along with it
              (not a separate static layer next to a moving photo). Only the
              chrome that Discover ALSO keeps fixed in place during a swipe -
              slide dots, back button, report button - stays outside this box,
              as real siblings of it rather than children. */}
          <div
            ref={swipeCardElRef}
            className="absolute inset-0 select-none"
            style={{
              willChange: 'transform',
              cursor: 'pointer',
              touchAction: 'pan-y',
              transform: `translateX(${swipeDragX}px) rotate(${Math.max(-15, Math.min(15, swipeDragX * 0.05))}deg)`,
              opacity: swipeExitDirection ? 0 : 1,
              transition: isSwipeDragging ? 'none' : 'transform 300ms ease-out, opacity 250ms ease-out',
            }}
            onPointerDown={handleSwipePointerDown}
            onPointerMove={handleSwipePointerMove}
            onPointerUp={handleSwipePointerUp}
            onPointerCancel={handleSwipePointerUp}
          >
            <SlideRenderer
              slide={currentSlideData}
              userBackgroundColor={userBackgroundColor}
              matchFirstName={selectedProfile.first_name || ''}
              matchLastName={selectedProfile.last_name || ''}
              getOptimizedUrl={(url) => getSafeImageSrc(url) || url}
            />

            {/* Swipe direction hint, same red/green X and heart the removed
                button row used, now surfacing as a fading overlay tied to drag
                distance instead of a pair of dedicated buttons. */}
            {swipeDragX !== 0 && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center w-16 h-16 rounded-full border-4 ${
                  swipeDragX > 0 ? 'right-6 border-green-400 bg-green-500/20' : 'left-6 border-red-400 bg-red-500/20'
                }`}
                style={{ opacity: Math.min(1, Math.abs(swipeDragX) / (window.innerWidth * SWIPE_THRESHOLD_RATIO)) }}
              >
                {swipeDragX > 0 ? (
                  <Heart className="w-8 h-8 text-green-400" />
                ) : (
                  <X className="w-8 h-8 text-red-400" />
                )}
              </div>
            )}

            {/* Name/age caption - pinned to the bottom of the photo with a feathered
                gradient, same pattern as Discover's MatchCard caption and
                ProfilePreviewModal (an ordinary overlay clipped by the photo's own
                overflow-hidden, no transform/negative-margin tricks). Living inside
                the swipeable unit above (not a separate static sibling) is what
                makes it move together with the photo on drag, just like Discover. */}
            <div
              className={`absolute inset-x-0 bottom-0 z-20 px-4 pt-16 ${showMoreInfo ? 'pb-2' : 'pb-5'}`}
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.94) 58%, rgba(0,0,0,1) 70%)',
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h2 className="text-[clamp(15px,4.4vw,18px)] font-bold text-white">
                    {selectedProfile.first_name} {selectedProfile.last_name}
                  </h2>
                  <div className="flex items-center gap-3 text-[clamp(12px,3.4vw,14px)] text-gray-300 mt-1">
                    <div className="flex items-center">
                      <Calendar className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                      <span>{ageByLikerId[selectedProfile.id] ?? calculateAge(selectedProfile.date_of_birth)} {t('matches.yearsOld')}</span>
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                      <span>{selectedProfile.city}, {selectedProfile.country}</span>
                    </div>
                  </div>

                  {!showMoreInfo && (previewHighlights.length > 0 || signHighlight) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {previewHighlights.map((highlight, index) => (
                        <span
                          key={index}
                          className={`text-[clamp(9px,2.8vw,12px)] font-medium text-white/85 bg-white/10 border ${HIGHLIGHT_CHIP_BORDER_COLORS[index % HIGHLIGHT_CHIP_BORDER_COLORS.length]} px-2 py-0.5 rounded-full truncate max-w-[100px] min-[400px]:max-w-[140px] shrink-0`}
                        >
                          {truncateChipLabel(highlight)}
                        </span>
                      ))}
                      {signHighlight && (
                        <span className="flex items-center justify-center bg-yellow-400/10 border border-yellow-400/60 rounded-full w-8 h-8 shrink-0">
                          <UserAdinkraDisplay adinkraSymbols={[signHighlight]} />
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Expand/collapse control - identical pink-gradient glass circle used
                    on Discover's own swipe card. */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMoreInfo(!showMoreInfo); }}
                  aria-label={showMoreInfo ? t('matches.showLess') : t('matches.showMore')}
                  className="text-white rounded-full p-[clamp(0.4rem,2vw,0.55rem)] transition-colors duration-200 shrink-0 backdrop-blur-md"
                  style={{
                    background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
                    boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
                  }}
                >
                  {showMoreInfo ? (
                    <ArrowUp className="w-[clamp(14px,3.8vw,17px)] h-[clamp(14px,3.8vw,17px)]" strokeWidth={2.5} />
                  ) : (
                    <ArrowDown className="w-[clamp(14px,3.8vw,17px)] h-[clamp(14px,3.8vw,17px)]" strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Slide indicators */}
          <div
            className="absolute left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10"
            style={{
              // env(safe-area-inset-top) is now reliable on Android too (see
              // @capacitor-community/safe-area setup in src/main.tsx).
              top: 'clamp(8px, calc(env(safe-area-inset-top, 8px) + 12px), 40px)'
            }}
          >
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  idx === currentSlide ? 'bg-white w-6' : 'bg-white/50 w-1.5'
                }`}
              />
            ))}
          </div>

          {/* Header buttons - icon-only, same small glass-circle style as Discover's
              expand/collapse control. Smaller (w-8 h-8, down from w-10 h-10) and
              nudged up a bit compared to before. */}
          <button
            onClick={() => {
              setSelectedProfile(null);
              setCurrentSlide(0);
            }}
            aria-label={t('matches.back')}
            className="absolute left-4 z-10 flex items-center justify-center w-7 h-7 rounded-full text-white backdrop-blur-md transition-transform active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
              boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
              top: 'clamp(8px, calc(env(safe-area-inset-top, 8px) + 12px), 40px)'
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>

          {/* Report - exact same trigger Discover uses (small white circle, red
              accent), and like Discover it only shows up while viewing a photo since
              it reports whichever photo is currently on screen. */}
          {isImageSlide && (
            <button
              onClick={() => setShowReportModal(true)}
              aria-label={t('reportModal.title')}
              className="absolute right-4 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-white/95 border border-red-300 text-red-600 transition-colors hover:bg-red-100 active:scale-95"
              style={{
                top: 'clamp(8px, calc(env(safe-area-inset-top, 8px) + 12px), 40px)'
              }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>

        {/* Expanded details - plain black panel below the photo, same relationship as
            ProfilePreviewModal's/Discover's expanded panel (no transform/overlap
            hack: the caption now lives inside the photo box itself). Renders
            nothing at all when collapsed, so there's no empty flex-1 box below the
            photo either. */}
        {showMoreInfo && (
        <div
          className="relative z-20 flex-1 overflow-y-auto bg-black"
          style={{
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="px-6 pt-4" style={{ paddingBottom: '24px' }}>
            <div className="space-y-3">
              {selectedProfile.bio && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-1">{t('matches.about')}</h4>
                  <p className="text-gray-200 text-sm leading-relaxed">{selectedProfile.bio}</p>
                </div>
              )}

              {[selectedProfile.smoking, selectedProfile.drinking, selectedProfile.exercise_level, selectedProfile.sleeping_schedule].some(Boolean) && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Lifestyle</h4>
                  <div className="space-y-2">
                    {selectedProfile.smoking && (
                      <div className="flex items-center text-sm">
                        <span className="font-semibold mr-2 text-white">Smoking:</span>
                        <span className="text-gray-200">{selectedProfile.smoking}</span>
                      </div>
                    )}
                    {selectedProfile.drinking && (
                      <div className="flex items-center text-sm">
                        <span className="font-semibold mr-2 text-white">Drinking:</span>
                        <span className="text-gray-200">{selectedProfile.drinking}</span>
                      </div>
                    )}
                    {selectedProfile.exercise_level && (
                      <div className="flex items-center text-sm">
                        <span className="font-semibold mr-2 text-white">Exercise:</span>
                        <span className="text-gray-200">{selectedProfile.exercise_level}</span>
                      </div>
                    )}
                    {selectedProfile.sleeping_schedule && (
                      <div className="flex items-center text-sm">
                        <span className="font-semibold mr-2 text-white">Sleep:</span>
                        <span className="text-gray-200">{selectedProfile.sleeping_schedule}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(selectedProfile.occupation || selectedProfile.education_level || selectedProfile.industry) && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Work & Education</h4>
                  <div className="space-y-2">
                    {selectedProfile.occupation && (
                      <div className="flex items-center text-sm">
                        <Briefcase className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                        <span className="text-gray-200">{selectedProfile.occupation}</span>
                      </div>
                    )}
                    {selectedProfile.education_level && (
                      <div className="flex items-center text-sm">
                        <GraduationCap className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                        <span className="text-gray-200">{selectedProfile.education_level}</span>
                      </div>
                    )}
                    {selectedProfile.industry && (
                      <div className="flex items-center text-sm">
                        <Briefcase className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                        <span className="text-gray-200">{selectedProfile.industry}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedProfile.interests && selectedProfile.interests.length > 0 && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">{t('matches.interests')}</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedProfile.interests.map((interest: string, index: number) => (
                      <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedProfile.preferred_language && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Language</h4>
                  <div className="flex items-center text-sm">
                    <Languages className="w-3.5 h-3.5 mr-2 text-pink-500 shrink-0" />
                    <span className="text-gray-200">{selectedProfile.preferred_language}</span>
                  </div>
                </div>
              )}

              {selectedProfile.relationship_intent && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Looking For</h4>
                  <div className="flex items-center text-sm">
                    <Heart className="w-3.5 h-3.5 mr-2 text-pink-500 shrink-0" />
                    <span className="text-gray-200">{selectedProfile.relationship_intent}</span>
                  </div>
                </div>
              )}

              {!(
                selectedProfile.bio ||
                [selectedProfile.smoking, selectedProfile.drinking, selectedProfile.exercise_level, selectedProfile.sleeping_schedule].some(Boolean) ||
                selectedProfile.occupation || selectedProfile.education_level || selectedProfile.industry ||
                (selectedProfile.interests && selectedProfile.interests.length > 0) ||
                selectedProfile.preferred_language ||
                selectedProfile.relationship_intent
              ) && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-6 text-center">
                  <p className="text-gray-400 text-sm">No additional details shared yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Action buttons removed - pass/like-back is the swipe gesture on the
            photo (drag left = pass, drag right = like back), same as Discover's
            swipe card, with the red/green hint overlay standing in for what
            these buttons used to make explicit. */}

        {/* Report/Block modal - same content and flow as Discover's swipe card. */}
        {showReportModal && (
          <div
            className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closeReportModal}
          >
            <div
              className="bg-black rounded-2xl shadow-2xl border border-pink-500/30 w-full max-w-sm mx-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
              style={{ maxHeight: '85vh' }}
            >
              <div className="relative px-3 pt-3 pb-2 border-b border-pink-500/20 bg-black shrink-0">
                <button
                  onClick={closeReportModal}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white transition-colors rounded-full bg-white/10 border border-pink-500/20 hover:bg-white/20"
                  disabled={reporting}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="pr-8">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-rose-400 font-semibold">Safety Center</p>
                  <h3 className="text-base font-bold text-white mt-0.5">{t('reportModal.title')}</h3>
                  <p className="text-[11px] text-gray-300 mt-0.5">{t('reportModal.instruction')}</p>
                </div>
              </div>

              <div className="px-3 pb-3 pt-2 overflow-y-auto flex-1 min-h-0">
                {isBlockSuccess ? (
                  <div className="text-green-400 font-semibold text-center py-8">
                    <div className="mb-2 text-3xl">🚫</div>
                    <div className="text-lg mb-2">{t('reportModal.blockSuccess.title')}</div>
                    <div className="text-sm text-gray-300">{t('reportModal.blockSuccess.message')}</div>
                  </div>
                ) : reportSuccess ? (
                  <div className="text-green-400 font-semibold text-center py-8">
                    <div className="mb-2 text-2xl">✓</div>
                    <div>{t('reportModal.success')}</div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      {[
                        t('reportModal.reasons.inappropriate'),
                        t('reportModal.reasons.fake'),
                        t('reportModal.reasons.spam'),
                        t('reportModal.reasons.offensive'),
                        t('reportModal.reasons.harassment'),
                        t('reportModal.reasons.other'),
                      ].map((reason) => (
                        <button
                          key={reason}
                          onClick={() => setSelectedReportReason(reason)}
                          disabled={reporting || isBlocking}
                          className={`w-full min-h-9 px-2.5 py-1.5 text-left rounded-lg border-2 transition-all duration-200 ${
                            selectedReportReason === reason
                              ? 'border-rose-500 bg-rose-950/50 text-rose-300 ring-1 ring-rose-500/30'
                              : 'border-pink-500/20 bg-black/60 text-gray-200 hover:border-pink-500/40 hover:bg-white/5'
                          } ${(reporting || isBlocking) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span className="text-xs sm:text-sm font-semibold leading-tight">{reason}</span>
                        </button>
                      ))}
                    </div>

                    <div className="mb-3 p-2.5 bg-black/60 rounded-lg border border-pink-500/20">
                      <p className="text-gray-200 mb-1.5 text-xs font-semibold uppercase tracking-wide">{t('reportModal.blockSection.title')}</p>
                      <textarea
                        placeholder={t('reportModal.blockSection.placeholder')}
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        disabled={reporting || isBlocking}
                        className="w-full p-2 bg-black/40 border border-pink-500/30 text-white placeholder:text-gray-500 rounded-lg text-xs resize-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-500/50 disabled:opacity-50"
                        rows={2}
                      />
                      <button
                        className="w-full mt-1.5 h-8 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors duration-200 text-xs"
                        onClick={handleBlockUser}
                        disabled={isBlocking || reporting}
                      >
                        {isBlocking ? t('reportModal.blockSection.blocking') : t('reportModal.blockSection.blockButton')}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        className="w-full h-9 bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50 transition-all duration-200"
                        onClick={handleReportImage}
                        disabled={reporting || !selectedReportReason || isBlocking}
                      >
                        {reporting ? t('reportModal.reporting') : t('reportModal.reportButton')}
                      </button>
                      <button
                        className="w-full h-9 bg-black hover:bg-white/5 text-gray-200 font-semibold text-sm rounded-lg border border-pink-500/30 disabled:opacity-50 transition-colors duration-200"
                        onClick={closeReportModal}
                        disabled={reporting || isBlocking}
                      >
                        {t('reportModal.cancel')}
                      </button>
                    </div>

                    {reportError && (
                      <div className="text-red-300 text-xs mt-2 text-center bg-red-950/50 p-2 rounded-lg border border-red-500/30">
                        {reportError}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }, [selectedProfile, slides, previewHighlights, signHighlight, slideBackgroundColors, currentSlide, showMoreInfo, platform, showReportModal, reporting, reportSuccess, reportError, selectedReportReason, isBlocking, blockReason, isBlockSuccess, closeReportModal, handleReportImage, handleBlockUser, calculateAge, t, ageByLikerId, getSafeImageSrc, swipeDragX, isSwipeDragging, swipeExitDirection, handleSwipePointerDown, handleSwipePointerMove, handleSwipePointerUp]);

  // ⭐ All early returns MUST be after all hooks
  if (showMatchAnimation && matchedProfile) {
    return (
      <MatchAnimation
        currentUserName={(currentUser as unknown as { first_name?: string })?.first_name || 'You'}
        matchedUserName={`${matchedProfile.first_name} ${matchedProfile.last_name}`}
        matchedUserImage={userImages[matchedProfile.id]?.[0]}
        matchedUserId={matchedProfile.id}
        onClose={handleCloseMatchAnimation}
        onStartChat={handleStartChatFromMatch}
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

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  // ⭐ CRITICAL: Early return if currentUser is null (prevents crash during session refresh)
  // Guard must run after all hooks have been declared
  if (!currentUser || !currentUser.id) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  // ⭐ FIX #7: Return memoized card to prevent re-render storms
  if (selectedProfile) {
    return selectedProfileCard;
  }

  return (
    <div
      className="h-full flex flex-col bg-black"
      style={{
        touchAction: 'pan-x pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center bg-black transition-all duration-200"
          style={{ height: `${pullDistance}px` }}
        >
          <div className="text-pink-400 text-sm">
            {pullDistance > 50 ? (isRefreshing ? `🔄 ${t('matches.refreshing')}` : `↓ ${t('matches.releaseToRefresh')}`) : `↓ ${t('matches.pullToRefresh')}`}
          </div>
        </div>
      )}

  <div
    className="flex-shrink-0 shadow-sm border-b border-pink-500/30 px-4 py-4"
    style={{
      background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.9))',
      // env(safe-area-inset-top) is now reliable on Android too (see
      // @capacitor-community/safe-area setup in src/main.tsx).
      marginTop: 'clamp(0px, calc(env(safe-area-inset-top, 0px) + 23px), 50px)'
    }}
  >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-1.5">
            <Users className="w-4 h-4 text-pink-400" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">{t('matches.peopleWhoLikedYou')}</h1>
          </div>
          {!isPremium && (
            <Button
              onClick={() => setShowPremiumUpgrade(true)}
              size="sm"
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-semibold text-[10px] px-2 py-0.5 h-6"
            >
              <Crown className="w-3 h-3 mr-0.5" />
              {t('matches.upgrade')}
            </Button>
          )}
        </div>
        <p className="text-gray-400 text-xs">({t('matches.peopleCount', { count: likers.length })})</p>

        {!isPremium && (
          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-2 mt-2">
            <div className="flex items-center space-x-1.5 text-yellow-300">
              <Lock className="w-3 h-3" />
              <span className="text-[10px] font-medium">
                {t('matches.upgradeToPremium')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24 bg-black" ref={scrollContainerRef}>
        {likers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">{t('matches.noNewLikes')}</h3>
              <p className="text-gray-400">{t('matches.keepSwiping')}</p>
            </div>
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              // Subtract the final gap so we don't end with extra whitespace after the last row.
              height: `${Math.max(0, rowVirtualizer.getTotalSize() - rowVerticalGap)}px`
            }}
          >
            {rowVirtualizer.getVirtualItems().map(row => {
              const startIndex = row.index * columnsPerRow;
              const rowLikers = likers.slice(startIndex, startIndex + columnsPerRow);
              const isLocked = !isPremium;
              
              return (
                <div
                  key={row.index}
                  style={{
                    position: 'absolute',
                    top: `${row.start}px`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    maxWidth: '1400px',
                    width: '100%',
                    height: `${Math.max(0, row.size - rowVerticalGap)}px`,
                    paddingLeft: `${rowPaddingHorizontal}px`,
                    paddingRight: `${rowPaddingHorizontal}px`,
                    columnGap: `${rowColumnGap}px`,
                    rowGap: `${rowVerticalGap}px`,
                    boxSizing: 'border-box'
                  }}
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {rowLikers.map((liker, colIndex) => {
                    const likerIndex = startIndex + colIndex;
                    const isFirstThree = likerIndex < 3;
                    return (
                    <Card
                      key={liker.id}
                      className={`cursor-pointer hover:shadow-lg transition-shadow flex flex-col h-full bg-black border-pink-500/30 ${isLocked ? 'opacity-75' : ''}`}
                      onClick={() => handleProfileClick(liker, likerIndex)}
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-lg">
                        {(() => {
                          const profileImages = userImages[liker.id] || [];
                          return profileImages.length > 0 ? (
                            <img
                              loading={isFirstThree ? "eager" : "lazy"}
                              decoding="async"
                              src={getSafeImageSrc(profileImages[0], true)}
                              alt={`${liker.first_name}'s photo`}
                              className={`w-full h-full object-cover ${isLocked ? 'blur-md' : ''}`}
                              style={{
                                height: '100%',
                                width: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center',
                                display: 'block',
                                minHeight: '100%',
                                minWidth: '100%',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)'
                              }}
                            />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-br from-pink-950 to-purple-950 flex items-center justify-center ${isLocked ? 'blur-md' : ''}`}>
                              <span className="text-2xl font-bold text-pink-200">
                                {liker.first_name?.[0]}{liker.last_name?.[0]}
                              </span>
                            </div>
                          );
                        })()}
                        {isLocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <div className="bg-black/80 border border-pink-500/40 backdrop-blur-sm rounded-full p-3">
                              <Lock className="w-6 h-6 text-pink-300" />
                            </div>
                          </div>
                        )}
                      </div>
                      <CardContent className="p-3 flex-1 bg-black">
                        <h3 className={`font-semibold text-white truncate text-sm ${isLocked ? 'blur-sm' : ''}`}>
                          {liker.first_name}, {ageByLikerId[liker.id] ?? calculateAge(liker.date_of_birth)}
                        </h3>
                        <p className="text-xs text-gray-400 truncate">
                          {liker.country}, {liker.city}
                        </p>
                      </CardContent>
                    </Card>
                  );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RatingFunnel
        open={showRatingFunnel}
        onClose={() => setShowRatingFunnel(false)}
      />
    </div>
  );
};

export default React.memo(LikedMePage, (prevProps, nextProps) => {
  // Must also compare isActiveTab - otherwise switching tabs never re-renders
  // this component (currentUser.id/isPremium don't change), so its internal
  // "tab went inactive, reset showPremiumUpgrade" effect never even runs and
  // coming back to this tab lands right back on the stale premium screen.
  return prevProps.currentUser?.id === nextProps.currentUser?.id &&
         prevProps.isPremium === nextProps.isPremium &&
         prevProps.isActiveTab === nextProps.isActiveTab;
});

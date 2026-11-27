import React, { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import { CardGridSkeleton } from '@/components/ui/LoadingStates';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Heart, X, ArrowLeft, Crown, Lock } from 'lucide-react';

// ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { getPlatformSync } from '@/utils/platformUtils';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { requestPopup, openPremiumUpgrade } from '@/popups';
import { ProfileDetailsPanel } from './profile-card/ProfileDetailsPanel';
import { useCaptionedPhotos, toTitleCase } from './profile-card/profileCardUtils';
import { ProfileCaption } from './profile-card/ProfileCaption';
import { icebreakerPillFor } from './icebreaker/target';
import { ProfileReportModal } from './profile-card/ProfileReportModal';
import { useProfileReport } from './profile-card/useProfileReport';
import { useBackClose } from '@/utils/backStack';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { useTranslation } from 'react-i18next';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// FIX #1: Import blob cache for instant Android image loading
import { preloadImageToBlob } from '@/utils/imageCache';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { publishSwipeDecision } from '@/utils/swipeSync';

import type { AppUser, LikedMeCacheValue, LikerProfile } from '@/types/cacheTypes';
import type { PotentialMatch } from '@/types';

// Reuse Discover's exact slide-building/rendering so the "view a liker" screen
// looks and behaves identically to the swipe card's own expanded view.
import { SlideRenderer } from './discover/SlideRenderer';
import { buildSlides, getUserColorHash, getPreviewHighlights, seedFromString, mulberry32, seededShuffle } from './discover/MatchCardHelpers';
import { findFavoriteWithLink, parseFavorites } from '@/constants/favorites';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import { isRecentlyOnline, SWIPE_ONLINE_WINDOW_MS } from '@/utils/onlineStatus';
import ThumbnailImage from '@/components/common/ThumbnailImage';
import { calculateAge } from '@/utils/dateUtils';


// Swipe card position/tilt for a given horizontal drag offset (px).
const swipeCardTransform = (d: number) =>
  `translate3d(${d}px, 0, 0) rotate(${Math.max(-15, Math.min(15, d * 0.05))}deg)`;

// =========================================================
// GLOBAL CACHES
// =========================================================

const LIKED_ME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LIKED_ME_STORAGE_KEY_PREFIX = 'likedMe_v1_';
// Likers are fetched a page at a time via get_likers_page - this is both
// the initial page size and the size of each subsequent "Load More" page.
const LIKERS_PAGE_SIZE = 500;
const MIN_REFRESH_VISIBLE_MS = 2000;
// Caption text is capped at 50 characters, matching the limit enforced when
// saving it in ImageManagement.tsx, so this should rarely ever truncate -
// it's just a safety net for older captions saved before that cap existed.

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

const NO_IMAGES: readonly string[] = [];

const LikedMePage = ({ currentUser, isPremium = false, isActiveTab = true, onNavigateToChat }: LikedMePageProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  // Drives the "Try for free today" vs standard upgrade copy below - real
  // trial eligibility read from the store, never hardcoded.
  const { eligibleForTrial: likedMeTrialEligible } = useFreeTrialOffer(currentUser?.id);

  // ------------------
  // STATE HOOKS (must stay in same order forever)
  // ------------------
  const [likers, setLikers] = useState<LikerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  // True infinite-scroll beyond the base LIKERS_PAGE_SIZE cap - only matters
  // for an account with more likers than that, which is rare today, but a
  // "Load More" tap should never silently do nothing once it happens.
  const [hasMoreLikers, setHasMoreLikers] = useState(true);
  const [loadingMoreLikers, setLoadingMoreLikers] = useState(false);
  // Once extra pages are loaded, the periodic background refresh (which
  // only ever re-fetches the first page) must not overwrite `likers` with
  // just that first page again - it would silently discard everything the
  // user scrolled past the cap to load. Simpler and safer than trying to
  // merge partial/paged results back into a diff-and-replace cache design
  // built around a single full snapshot.
  const extraLikersLoadedRef = useRef(false);
  const [selectedProfile, setSelectedProfile] = useState<LikerProfile | null>(null);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const userImagesRef = useRef(userImages);
  userImagesRef.current = userImages;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  // Optional per-photo label/caption (ImageManagement.tsx), keyed by the
  // photo's own image_url - same pattern as DiscoverPage.tsx's imageCaptions.
  const [imageCaptions, setImageCaptions] = useState<Record<string, { label?: string | null; caption?: string | null }>>({});
  const mergeImageCaptions = useCallback((rows: Array<{ image_url: string; label?: string | null; caption?: string | null }>) => {
    const withContent = rows.filter((r) => r.label || r.caption);
    if (withContent.length === 0) return;
    setImageCaptions((prev) => {
      const next = { ...prev };
      for (const row of withContent) {
        next[row.image_url] = { label: row.label ?? null, caption: row.caption ?? null };
      }
      return next;
    });
  }, []);
  // Swipe-to-pass/like-back on the photo card, same gesture as Discover's swipe
  // card, replacing the old dedicated X/heart button row.
  // Only the hint's direction lives in state (it changes at most a couple of
  // times per drag). The live drag offset is written straight to the DOM - a
  // per-frame state update re-rendered the entire memoized profile card below
  // on every frame, which is what made this drag stutter on Android.
  const [swipeHintDir, setSwipeHintDir] = useState<'left' | 'right' | null>(null);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const [swipeExitDirection, setSwipeExitDirection] = useState<'left' | 'right' | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; dragging: boolean; lastX: number; lastT: number; vx: number } | null>(null);
  const swipeHintElRef = useRef<HTMLDivElement>(null);
  // rAF-throttled drag, same approach as Discover's swipe card: pointermove can
  // fire far more often than the display refreshes (especially on Android), so the
  // transform is written straight to the card's own DOM node once per frame and
  // never waits on this page's render to land.
  const swipeCardElRef = useRef<HTMLDivElement>(null);
  const latestSwipeDeltaRef = useRef(0);
  const swipeRafScheduledRef = useRef(false);
  const swipeRafIdRef = useRef<number | null>(null);
  // The upgrade page and the match celebration are popups owned by the popup coordinator
  // (src/popups): this page only ASKS for them.
  const [lockoutEndDate, setLockoutEndDate] = useState<Date | null>(null);
  const [hasInteractedToday, setHasInteractedToday] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { sendMatchNotification } = usePushNotifications(currentUser?.id);
  // ------------------
  // REFS
  // ------------------
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

      // Supabase's Image Transformations feature is now switched off at the
      // project level (see getDetailImageUrl), so every remote URL - grid
      // thumbnail or full view - resolves to the same raw, already-compressed
      // file.
      if (urlOrBlob.includes('supabase')) {
        return getDetailImageUrl(urlOrBlob);
      }

      return urlOrBlob;
    },
    []
  );

  // Card sizing/positioning used to be hand-computed in JS (a manually
  // row-virtualized grid with pixel heights precomputed from
  // scrollContainerRef.current.clientWidth) so it could stay in sync with
  // Tailwind's responsive grid-cols breakpoints. That JS math kept
  // drifting out of sync with what the CSS grid actually rendered
  // (stale widths after a resize, wrong row heights) and caused the
  // repeated overlapping/cropped-card bugs on tablet-width screens. A
  // plain, un-virtualized responsive CSS grid can't drift like that - the
  // browser lays every card out itself from the real rendered width, always
  // correct at any size with zero JS involved. With the like list capped at
  // LIKERS_PAGE_SIZE (500) and images lazy-loaded, rendering all cards at
  // once here is not a real performance concern.

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

  // Shared data fetching logic - one page at a time. `offset` defaults to 0
  // for the normal/cached/background-refresh path; loadMoreLikers (below)
  // is the only caller that passes a non-zero offset, for real
  // infinite-scroll past the first page.
  const fetchLikersData = useCallback(async (userId: string, offset: number = 0) => {
    // Who liked this user, with blocks/matches already excluded server-side
    // (get_likers_page does the exclusion in SQL) - this used to be three
    // separate unbounded queries (every like, every block, every match for
    // this account) joined and filtered in JS.
    const { data: likerRows, error: likersError } = await supabaseRpc('get_likers_page', {
      p_user_id: userId,
      p_limit: LIKERS_PAGE_SIZE,
      p_offset: offset,
    });

    if (likersError) throw likersError;
    const likes = (likerRows || []) as { liker_id: string; liked_at: string }[];
    if (likes.length === 0) {
      return { likers: [], userImages: {}, hasMore: false };
    }
    const likerIds = uniqUuids(likes.map((like) => like.liker_id).filter(Boolean));

    if (likerIds.length === 0) {
      return { likers: [], userImages: {}, hasMore: likes.length === LIKERS_PAGE_SIZE };
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
      const ts = Date.parse(String(like.liked_at || ''));
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
          .neq('image_order', -1)
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

    return { likers, userImages: imageMap, hasMore: likes.length === LIKERS_PAGE_SIZE };
  }, [supabaseRpc]);

  // Background fetching function
  const fetchLikersInBackground = useCallback(async () => {
    if (!currentUser?.id || backgroundFetchingRef.current) return;
    // This only ever re-fetches the first page - once the user has loaded
    // pages beyond it via "Load More", letting this proceed would silently
    // discard everything past page 1 the moment it runs.
    if (extraLikersLoadedRef.current) return;
    backgroundFetchingRef.current = true;
    likedMeLastBackgroundFetchAt.set(currentUser.id, Date.now());

    try {
      const result = await fetchLikersData(currentUser.id);
      if (result) {
        const { likers: newLikers, userImages: newUserImages, hasMore } = result;
        setHasMoreLikers(hasMore);
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
    const refreshStartedAt = showLoading ? Date.now() : 0;
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
        const { likers: newLikers, userImages: newUserImages, hasMore } = result;
        // A manual/pull-to-refresh reload starts over from page 1 - any
        // previously loaded extra pages are intentionally dropped here,
        // same as any other "refresh" action would.
        extraLikersLoadedRef.current = false;
        setHasMoreLikers(hasMore);

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
        const remainingHold = MIN_REFRESH_VISIBLE_MS - (Date.now() - refreshStartedAt);
        if (remainingHold > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remainingHold));
        }
        setIsRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [currentUser?.id, toast, t, fetchLikersData, preloadFirstProfilesWithBlobs]);

  // Fetches the next page beyond what's already loaded and appends it -
  // real pagination, not just a bigger cap. Only relevant once an account
  // has more likers than LIKERS_PAGE_SIZE, which is rare today; this is
  // what stops that from being a silent, permanent truncation once it does
  // happen. Deliberately does not touch the cache/background-refresh
  // machinery (see extraLikersLoadedRef) - appended pages are session-local
  // until the next full refresh.
  const loadMoreLikers = useCallback(async () => {
    if (!currentUser?.id || loadingMoreLikers || !hasMoreLikers) return;
    setLoadingMoreLikers(true);
    try {
      const result = await fetchLikersData(currentUser.id, likers.length);
      if (result) {
        const { likers: newLikers, userImages: newUserImages, hasMore } = result;
        extraLikersLoadedRef.current = true;
        setHasMoreLikers(hasMore);
        if (newLikers.length > 0) {
          setLikers(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            return [...prev, ...newLikers.filter(l => !existingIds.has(l.id))];
          });
          setUserImages(prev => ({ ...prev, ...newUserImages }));
        }
      }
    } catch (error) {
      console.error('Error loading more likers:', error);
    } finally {
      setLoadingMoreLikers(false);
    }
  }, [currentUser?.id, loadingMoreLikers, hasMoreLikers, likers.length, fetchLikersData]);

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
        .select('image_url, label, caption')
        .eq('user_id', profileId)
        .eq('is_approved', true)
          .neq('image_order', -1) // Only show approved images
        .order('image_order')
        .abortSignal(controller.signal);

      let images = initialImages;

      if (controller.signal.aborted) return;

      // If moderation columns don't exist, fall back to basic query
      if (error && error.message.includes('does not exist')) {
        const { data: fallbackImages, error: fallbackError } = await supabase
          .from('user_images')
          .select('image_url, label, caption')
          .eq('user_id', profileId)
          .order('image_order')
          .abortSignal(controller.signal);

        if (fallbackError || controller.signal.aborted) return; // Silent fail for fallback
        images = fallbackImages;
      } else if (error || controller.signal.aborted) {
        return; // Silent fail
      }

      if (images?.length && !controller.signal.aborted) {
        mergeImageCaptions(images);
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
  }, [userImages, mergeImageCaptions]); // Removed platform dependency - it's stable via useMemo

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
    setShowMoreInfo(false);
    setCurrentSlide(0);
    setSwipeHintDir(null);
    setIsSwipeDragging(false);
    setSwipeExitDirection(null);
    swipeStartRef.current = null;
    latestSwipeDeltaRef.current = 0;
  }, [selectedProfile]);

  // Slide list built by the exact same helper Discover's swipe card uses, so the
  // mix of photos/bio/fun-question slides matches it exactly.
  const slides = useMemo(() => {
    if (!selectedProfile) return [];
    const profileImages = userImages[selectedProfile.id] || [];
    return buildSlides(selectedProfile as unknown as PotentialMatch, profileImages);
  }, [selectedProfile, userImages]);

  // Same rotating highlight-chip pool Discover's swipe card uses, paging
  // through a fresh set of profile attributes as the viewer taps through
  // photos instead of always showing the same handful.
  const previewHighlights = useMemo(() => {
    if (!selectedProfile) return [];
    return getPreviewHighlights(selectedProfile as unknown as PotentialMatch, currentSlide);
  }, [selectedProfile, currentSlide]);

  // Up to 2 captioned photos (seeded pick, shared with every other profile view),
  // limited to photos this viewer can actually see for that profile.
  const { captionedPhotos, secondPhotoAnchor } = useCaptionedPhotos(
    imageCaptions,
    selectedProfile?.id ?? '',
    userImages[selectedProfile?.id ?? ''] ?? NO_IMAGES
  );

  // The collapsed card's "body" rotates through chips and a bio excerpt as
  // the viewer taps through photos, mirroring Discover's MatchCard -
  // captioned photos are surfaced separately, in the expanded "Photos"
  // section below, not here in the collapsed call-out.
  const infoSlotSequence = useMemo(() => {
    const seq: Array<'chips' | 'about'> = ['chips', 'chips'];
    if (selectedProfile?.bio?.trim()) seq.push('about');
    return seq;
  }, [selectedProfile]);

  const activeInfoSlot = infoSlotSequence[currentSlide % infoSlotSequence.length];
  const showAbout = activeInfoSlot === 'about';

  // Same "earned" verified badge shown on the user's own profile page (>=85%
  // profile completion), not a face-verification flag.
  const showVerifiedBadge = useMemo(() => {
    if (!selectedProfile) return false;
    const profileImages = userImages[selectedProfile.id] || [];
    return calculateProfileCompletion(selectedProfile, profileImages).showVerifiedBadge;
  }, [selectedProfile, userImages]);

  // Two cultural signs to surface as their own chips, shuffled with a
  // per-profile seed so which ones lead feels random without reshuffling on
  // every render - shared signs with the current user are still weighted to
  // shuffle ahead of the rest so common ground tends to surface first. Still
  // cycles which two lead as the viewer taps through photos, mirroring
  // Discover's MatchCard.
  const signHighlights = useMemo(() => {
    const theirs = selectedProfile?.adinkra_symbols;
    if (!theirs || theirs.length === 0) return [];
    const mine = (currentUser as unknown as { adinkra_symbols?: string[] | null })?.adinkra_symbols || [];
    const shared = theirs.filter(symbol => mine.includes(symbol));
    const rest = theirs.filter(symbol => !mine.includes(symbol));
    const rand = mulberry32(seedFromString(`${selectedProfile?.id || ''}_signhighlight`));
    const ordered = [...seededShuffle(shared, rand), ...seededShuffle(rest, rand)];
    if (ordered.length === 0) return [];
    if (ordered.length === 1) return [ordered[0]];
    const start = currentSlide % ordered.length;
    return [ordered[start], ordered[(start + 1) % ordered.length]];
  }, [selectedProfile, currentUser, currentSlide]);

  // Structured favorites (jsonb) - parsed once so both the compact preview
  // row and the expanded panel can read plain FavoriteEntry objects.
  const selectedProfileFavorites = useMemo(
    () => parseFavorites(selectedProfile?.favorites),
    [selectedProfile]
  );

  // The selected profile as the shared details panel reads it (favorites already parsed).
  const detailsProfile = useMemo(
    () => (selectedProfile ? { ...selectedProfile, favorites: selectedProfileFavorites } : {}),
    [selectedProfile, selectedProfileFavorites]
  );

  // Whether there is anything at all to show in the expanded details panel.
  const hasProfileDetails = useMemo(() => {
    const p = selectedProfile;
    if (!p) return false;
    return !!(
      p.bio ||
      (typeof p.height_cm === 'number' && p.height_cm > 0) ||
      [p.smoking, p.drinking, p.exercise_level, p.sleeping_schedule].some(Boolean) ||
      p.family_plans || p.occupation || p.education_level || p.industry ||
      typeof p.introvert_extrovert === 'number' || typeof p.spontaneous_planner === 'number' || typeof p.messy_organized === 'number' ||
      p.communication_style?.length || p.love_style?.length || p.interests?.length ||
      selectedProfileFavorites.length > 0 || p.pets?.length || p.languages?.length ||
      p.social_media || p.preferred_language || p.relationship_intent
    );
  }, [selectedProfile, selectedProfileFavorites]);

  const musicHighlight = useMemo(
    () => findFavoriteWithLink(selectedProfileFavorites),
    [selectedProfileFavorites]
  );

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
        premium_param: !!isPremium
      });

      if (error) throw error;

      // Tell every other surface (Circle pool, Recommended/Similar rows,
      // Discover deck) this person is now decided, so they disappear there
      // immediately instead of lingering until a cache expires.
      publishSwipeDecision(currentUser.id, profileId, 'like');

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
        if (profileToRemove) {
          // Liking back here can become a mutual match without ever visiting Discover: same
          // "It's a match!" popup. It tells the rating engine a happy moment ended when it closes.
          requestPopup('match', {
            matchedUserId: profileToRemove.id,
            matchedUserName: `${profileToRemove.first_name} ${profileToRemove.last_name}`,
            matchedUserImage: userImagesRef.current[profileToRemove.id]?.[0],
          });
        }

        // Liking back from this page is the same mutual-like outcome as
        // Discover and Circle: notify the other person that it is a match,
        // rather than leaving them with only their earlier like state.
        try {
          const currentUserName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
          await sendMatchNotification(currentUserName, profileId);
        } catch {
          // A notification failure must never undo a successfully created match.
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
  }, [currentUser?.id, currentUser?.first_name, currentUser?.last_name, hasInteractedToday, isPremium, likers, sendMatchNotification, setLockoutPeriod, toast]);

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
        publishSwipeDecision(currentUser.id, profileId, 'pass');
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

  // Cancels any queued drag frame so it can't land after the card has been
  // released and stomp the spring-back / fly-off transform.
  const cancelSwipeFrame = useCallback(() => {
    if (swipeRafIdRef.current !== null) {
      cancelAnimationFrame(swipeRafIdRef.current);
      swipeRafIdRef.current = null;
    }
    swipeRafScheduledRef.current = false;
  }, []);

  const springSwipeCardBack = useCallback(() => {
    const el = swipeCardElRef.current;
    if (el) {
      el.style.transition = 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.transform = swipeCardTransform(0);
    }
    if (swipeHintElRef.current) swipeHintElRef.current.style.opacity = '0';
    latestSwipeDeltaRef.current = 0;
    setSwipeHintDir(null);
  }, []);

  const handleSwipePointerDown = useCallback((e: React.PointerEvent) => {
    if (swipeExitDirection) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY, dragging: false, lastX: e.clientX, lastT: e.timeStamp, vx: 0 };
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
      // Kill any in-flight spring-back transition before the first drag frame,
      // so the card tracks the finger 1:1 instead of easing behind it.
      if (swipeCardElRef.current) swipeCardElRef.current.style.transition = 'none';
      // Low priority: this re-renders the large memoized profile card; the
      // drag itself is driven directly on the DOM and never waits on it.
      startTransition(() => setIsSwipeDragging(true));
    }
    // Smoothed horizontal velocity (px/ms) so a quick flick counts as a swipe
    // even when it doesn't travel past the distance threshold.
    const dt = e.timeStamp - start.lastT;
    if (dt > 0) {
      start.vx = 0.8 * ((e.clientX - start.lastX) / dt) + 0.2 * start.vx;
      start.lastX = e.clientX;
      start.lastT = e.timeStamp;
    }
    latestSwipeDeltaRef.current = deltaX;
    if (!swipeRafScheduledRef.current) {
      swipeRafScheduledRef.current = true;
      swipeRafIdRef.current = requestAnimationFrame(() => {
        swipeRafIdRef.current = null;
        swipeRafScheduledRef.current = false;
        const d = latestSwipeDeltaRef.current;
        if (swipeCardElRef.current) {
          swipeCardElRef.current.style.transform = swipeCardTransform(d);
        }
        if (swipeHintElRef.current) {
          swipeHintElRef.current.style.opacity = String(Math.min(1, Math.abs(d) / (window.innerWidth * SWIPE_THRESHOLD_RATIO)));
        }
        const dir = d > 0 ? 'right' : d < 0 ? 'left' : null;
        startTransition(() => setSwipeHintDir(prev => (prev === dir ? prev : dir)));
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

    // Read the release position from the event itself, not from state - state
    // can trail the finger by a frame, which made borderline swipes misfire.
    const deltaX = e.clientX - start.x;
    cancelSwipeFrame();
    setIsSwipeDragging(false);

    const threshold = window.innerWidth * SWIPE_THRESHOLD_RATIO;
    const isFlick = Math.abs(start.vx) > 0.6 && Math.abs(deltaX) > 40 && Math.sign(start.vx) === Math.sign(deltaX);
    if ((Math.abs(deltaX) > threshold || isFlick) && selectedProfile) {
      const direction = deltaX > 0 ? 'right' : 'left';
      const el = swipeCardElRef.current;
      if (el) {
        const exitX = (direction === 'right' ? 1 : -1) * window.innerWidth * 1.3;
        el.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out';
        el.style.transform = swipeCardTransform(exitX);
      }
      setSwipeExitDirection(direction);
      const profileId = selectedProfile.id;
      setTimeout(() => {
        if (direction === 'right') {
          handleLikeBack(profileId);
        } else {
          handlePass(profileId);
        }
      }, 260);
    } else {
      springSwipeCardBack();
    }
  }, [selectedProfile, handleLikeBack, handlePass, handleNavigationClick, cancelSwipeFrame, springSwipeCardBack]);

  // The OS/browser took the touch over (vertical scroll began, system gesture,
  // incoming call...). Never treat that as a tap - it used to fall through to
  // handleSwipePointerUp and flip the photo when the user only meant to scroll.
  const handleSwipePointerCancel = useCallback(() => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start?.dragging) return;
    cancelSwipeFrame();
    setIsSwipeDragging(false);
    springSwipeCardBack();
  }, [cancelSwipeFrame, springSwipeCardBack]);

  // Closing early while a block is still in its undo window (see
  // handleBlockUser) finalizes it right away instead of leaving a timer
  // running after the modal's already gone.
  // Android back from a profile returns to the grid, same as the on-screen back arrow.
  useBackClose(!!selectedProfile, () => {
    setSelectedProfile(null);
    setCurrentSlide(0);
  });

  // Report / block (with undo) - one flow shared with Discover and the preview.
  // Blocking removes the liker from this list once the undo window has passed.
  const report = useProfileReport({
    reportedUserId: selectedProfile?.id,
    getImageUrl: () => {
      const slide = slides[currentSlide];
      return slide?.type === 'image' ? slide.content : undefined;
    },
    onBlocked: (blockedId) => {
      setLikers((prev) => prev.filter((liker) => liker.id !== blockedId));
      setSelectedProfile(null);
    },
  });

  const handleProfileClick = (liker: LikerProfile, index: number) => {
    // For free users, only allow clicking if they're premium
    if (!isPremium) {
      openPremiumUpgrade();
      return;
    }

    setSelectedProfile(liker);
    // Load full images when profile is selected
    loadFullImages(liker.id);
  };

  // Pull to refresh (only from the top of the list, and not while a profile is open).
  const pullToRefresh = usePullToRefresh({
    onRefresh: () => fetchLikers(true),
    isRefreshing,
    getScrollTop: () => scrollContainerRef.current?.scrollTop ?? 0,
    enabled: !selectedProfile,
  });
  // ⭐ FIX #7: Memoize entire selected profile card (1,200+ lines) to prevent re-render storms on Android
  const selectedProfileCard = useMemo(() => {
    if (!selectedProfile) return null;

    const totalSlides = slides.length;
    const currentSlideData = slides[currentSlide] || slides[0];
    const isImageSlide = currentSlideData.type === 'image';
    const userBackgroundColor = getUserColorHash(selectedProfile.id, slideBackgroundColors);

    return (
      <div
        className={`profile-info-layout ${showMoreInfo ? 'is-expanded' : ''} h-full w-full relative bg-black overflow-hidden`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Photo area - fixed height only while the info panel below is actually
            showing (so that panel has room to breathe, same proportion Discover
            gives its own expanded panel). Collapsed, there's no info panel
            rendered at all (see below), so the photo fills 100% of the available
            space instead of stopping at a fixed height and leaving a dead gap -
            exactly how Discover's own collapsed card behaves. */}
        <div
          className="profile-info-photo relative w-full overflow-hidden"
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
              // Constant at rest and during a drag: the live offset is written
              // imperatively (see handleSwipePointerMove), so React must not
              // re-write this mid-drag or it would yank the card back.
              transform: swipeExitDirection
                ? swipeCardTransform((swipeExitDirection === 'right' ? 1 : -1) * window.innerWidth * 1.3)
                : swipeCardTransform(0),
              opacity: swipeExitDirection ? 0 : 1,
              transition: isSwipeDragging ? 'none' : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out',
            }}
            onPointerDown={handleSwipePointerDown}
            onPointerMove={handleSwipePointerMove}
            onPointerUp={handleSwipePointerUp}
            onPointerCancel={handleSwipePointerCancel}
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
            {swipeHintDir && (
              <div
                ref={swipeHintElRef}
                className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center w-16 h-16 rounded-full border-4 ${
                  swipeHintDir === 'right' ? 'right-6 border-green-400 bg-green-500/20' : 'left-6 border-red-400 bg-red-500/20'
                }`}
                style={{ opacity: Math.min(1, Math.abs(latestSwipeDeltaRef.current) / (window.innerWidth * SWIPE_THRESHOLD_RATIO)) }}
              >
                {swipeHintDir === 'right' ? (
                  <Heart className="w-8 h-8 text-green-400" />
                ) : (
                  <X className="w-8 h-8 text-red-400" />
                )}
              </div>
            )}

                        {/* Name / location / highlights caption + expand control (shared with Discover
                and the preview so every screen shows the same header). It lives inside the
                swipeable unit, so it moves together with the photo on drag. */}
            <ProfileCaption
              name={`${toTitleCase(selectedProfile.first_name)} ${toTitleCase(selectedProfile.last_name)}`.trim()}
              age={ageByLikerId[selectedProfile.id] ?? calculateAge(selectedProfile.date_of_birth)}
              online={isRecentlyOnline(selectedProfile.last_login_at, SWIPE_ONLINE_WINDOW_MS)}
              verified={showVerifiedBadge}
              city={selectedProfile.city}
              country={selectedProfile.country}
              heightCm={typeof selectedProfile.height_cm === 'number' ? selectedProfile.height_cm : null}
              relationshipIntent={selectedProfile.relationship_intent}
              bio={selectedProfile.bio}
              highlights={previewHighlights}
              signHighlights={signHighlights}
              musicHighlight={musicHighlight}
              currentSlide={currentSlide}
              showAbout={showAbout}
              expanded={showMoreInfo}
              onToggle={() => setShowMoreInfo((v) => !v)}
              action={icebreakerPillFor(selectedProfile, slides, { viewerId: currentUser?.id, photoUrl: userImages[selectedProfile.id]?.[0], currentSlide })}
            />
          </div>

          {/* Slide indicators */}
          <div
            className="absolute left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10"
            style={{
              // env(safe-area-inset-top) is now reliable on Android too (see
              // @capacitor-community/safe-area setup in src/main.tsx).
              top: 'clamp(8px, calc(env(safe-area-inset-top, 8px) + 12px), 84px)'
            }}
          >
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  idx === currentSlide ? 'bg-pink-500 w-6' : 'bg-pink-500/30 w-1.5'
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
            className="dl-hit absolute left-4 z-10 flex items-center justify-center w-7 h-7 rounded-full text-white backdrop-blur-md transition-transform active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
              boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
              top: 'clamp(8px, calc(env(safe-area-inset-top, 8px) + 12px), 84px)'
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>

          {/* Report - same pink-gradient round trigger as the rest of the card's
              floating action buttons (back arrow above, "show details" elsewhere),
              and like Discover it only shows up while viewing a photo since it
              reports whichever photo is currently on screen. */}
          {isImageSlide && (
            <button
              onClick={report.open}
              aria-label={t('reportModal.title')}
              className="dl-hit absolute right-4 z-10 flex items-center justify-center rounded-full text-white backdrop-blur-md transition-transform active:scale-95 shrink-0"
              style={{
                width: 24,
                height: 24,
                minWidth: 24,
                minHeight: 24,
                padding: 0,
                background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
                boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
                top: 'clamp(8px, calc(env(safe-area-inset-top, 8px) + 12px), 84px)'
              }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
        <div
          className="profile-info-panel relative z-20 overflow-y-auto bg-black scrollbar-hide"
          aria-hidden={!showMoreInfo}
          style={{
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <ProfileDetailsPanel
            profile={detailsProfile}
            captionedPhotos={captionedPhotos}
            secondPhotoAnchor={secondPhotoAnchor}
            preferredLanguageName={selectedProfile.preferred_language || undefined}
            className="pb-24"
          />
          {!hasProfileDetails && (
            <div className="mx-4 rounded-2xl border border-brand/20 bg-white/[0.03] p-6 text-center">
              <p className="text-sm text-white/60">{t('matches.noDetailsYet', 'No additional details shared yet.')}</p>
            </div>
          )}
        </div>

        {/* Action buttons removed - pass/like-back is the swipe gesture on the
            photo (drag left = pass, drag right = like back), same as Discover's
            swipe card, with the red/green hint overlay standing in for what
            these buttons used to make explicit. */}

        
      </div>
    );
  }, [selectedProfile, slides, previewHighlights, signHighlights, selectedProfileFavorites, musicHighlight, slideBackgroundColors, currentSlide, showMoreInfo, report.open, detailsProfile, hasProfileDetails, calculateAge, t, ageByLikerId, getSafeImageSrc, swipeHintDir, isSwipeDragging, swipeExitDirection, handleSwipePointerDown, handleSwipePointerMove, handleSwipePointerUp, handleSwipePointerCancel, captionedPhotos, secondPhotoAnchor, showAbout, showVerifiedBadge]);

  // ⭐ All early returns MUST be after all hooks
  if (loading) {
    return (
      <div className="h-full w-full bg-black overflow-hidden">
        <CardGridSkeleton />
      </div>
    );
  }

  // ⭐ CRITICAL: Early return if currentUser is null (prevents crash during session refresh)
  // Guard must run after all hooks have been declared
  if (!currentUser || !currentUser.id) {
    return (
      <div className="h-full w-full bg-black overflow-hidden">
        <CardGridSkeleton />
      </div>
    );
  }

  // ⭐ FIX #7: Return memoized card to prevent re-render storms
  if (selectedProfile) {
    return (
      <>
        {selectedProfileCard}
        <ProfileReportModal report={report} />
      </>
    );
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
      {...pullToRefresh.handlers}
    >
      {pullToRefresh.indicator}

  <div
    className="flex-shrink-0 shadow-sm border-b border-pink-500/30 px-4 py-4"
    style={{
      background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.9))',
      // No extra top offset here - MainApp's persistent app header is a real
      // flex sibling above this page's content box, so this box already
      // starts exactly at the header's bottom edge. The old marginTop here
      // was a leftover from before that flex-layout refactor (when pages had
      // to reserve space for a position:fixed header via a pixel guess) and
      // was just adding a redundant gap between the two headers.
    }}
  >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-1.5">
            <Users className="w-4 h-4 text-pink-400" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">{t('matches.peopleWhoLikedYou')}</h1>
          </div>
          {!isPremium && (
            <Button variant="premium" size="sm"
              onClick={() => openPremiumUpgrade()}
             
             
            >
              <Crown className="w-3.5 h-3.5 mr-1" />
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
                {likedMeTrialEligible ? 'Try Premium now for free to see who liked you and interact with them' : t('matches.upgradeToPremium')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-y-contain p-4 pb-24 bg-black" ref={scrollContainerRef}>
        {likers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">{t('matches.noNewLikes')}</h3>
              <p className="text-gray-400">{t('matches.keepSwiping')}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-2 md:grid-cols-3 md:gap-8 md:px-8 lg:grid-cols-4 lg:gap-14 lg:px-12 max-w-[1400px] mx-auto">
            {likers.map((liker, likerIndex) => {
              const isLocked = !isPremium;
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
                        <ThumbnailImage
                          loading={isFirstThree ? "eager" : "lazy"}
                          decoding="async"
                          src={getSafeImageSrc(profileImages[0], true)}
                          alt={isLocked ? '' : `${liker.first_name}'s photo`}
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
                            {isLocked ? '•' : `${liker.first_name?.[0] ?? ''}${liker.last_name?.[0] ?? ''}`}
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
                    <h3 className={`flex items-center gap-1.5 font-semibold text-white truncate text-sm ${isLocked ? 'blur-sm' : ''}`}>
                      <span className="truncate">
                        {isLocked
                          ? `${liker.first_name?.[0] ?? ''}••••`
                          : `${liker.first_name}, ${ageByLikerId[liker.id] ?? calculateAge(liker.date_of_birth)}`}
                      </span>
                      {isRecentlyOnline(liker.last_login_at, SWIPE_ONLINE_WINDOW_MS) && (
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" aria-label="Active now" />
                      )}
                    </h3>
                    <p className="text-xs text-gray-400 truncate">
                      {liker.country}, {liker.city}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {hasMoreLikers && likers.length > 0 && (
          <div className="flex justify-center pt-4">
            <Button variant="line" size="sm" className="text-white"
              onClick={loadMoreLikers}
              disabled={loadingMoreLikers}
            >
              {loadingMoreLikers ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LikedMePage, (prevProps, nextProps) => {
  // isActiveTab is compared so the tab re-renders when it becomes (in)active.
  return prevProps.currentUser?.id === nextProps.currentUser?.id &&
         prevProps.isPremium === nextProps.isPremium &&
         prevProps.isActiveTab === nextProps.isActiveTab;
});
 
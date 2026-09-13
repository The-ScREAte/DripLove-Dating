import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users, Heart, X, Calendar, MapPin, ArrowLeft, ArrowUp, ArrowDown,
  Briefcase, GraduationCap, Crown, Lock, Languages, RefreshCw, ArrowDownToLine,
  Ruler, Baby, MessageCircle, Gift, PawPrint, Share2
} from 'lucide-react';

// ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { getPlatformSync } from '@/utils/platformUtils';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import RatingFunnel from './RatingFunnel';
import { isRatingFunnelEligible, markRatingFunnelShown, syncRatingFunnelFromDb } from '@/utils/ratingFunnelStorage';
import { fetchHasRatedAppFromDb } from '@/utils/ratingPlatform';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { useTranslation } from 'react-i18next';

// FIX #1: Import blob cache for instant Android image loading
import { preloadImageToBlob } from '@/utils/imageCache';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

import type { AppUser, LikedMeCacheValue, LikerProfile } from '@/types/cacheTypes';
import type { PotentialMatch } from '@/types';

// Reuse Discover's exact slide-building/rendering so the "view a liker" screen
// looks and behaves identically to the swipe card's own expanded view.
import { SlideRenderer } from './discover/SlideRenderer';
import { buildSlides, getUserColorHash, getPreviewHighlights, HIGHLIGHT_CHIP_BORDER_COLORS, truncateChipLabel, seedFromString, mulberry32 } from './discover/MatchCardHelpers';
import { favoriteEmoji, formatFavoriteLabel, findFavoriteWithLink, parseFavorites } from '@/constants/favorites';
import MusicLinkBadge from './discover/MusicLinkBadge';
import UserAdinkraDisplay from './discover/UserAdinkraDisplay';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import {
  FAMILY_PLANS_OPTIONS,
  COMMUNICATION_STYLE_OPTIONS,
  LOVE_STYLE_OPTIONS,
  PETS_OPTIONS,
  SOCIAL_MEDIA_OPTIONS,
  traitLabel,
} from '@/constants/profileTraits';

const formatHeightLabel = (cm: number) => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
};

// Supabase/Postgrest errors are plain objects, not real Error instances, so
// `err instanceof Error` misses them and silently falls back to a generic
// message - masking the actual reason a query failed (RLS denial, a unique
// constraint, etc.) right when it's most useful to see it.
const getSupabaseErrorMessage = (err: unknown): string | undefined => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return undefined;
};

// =========================================================
// GLOBAL CACHES
// =========================================================

const LIKED_ME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LIKED_ME_STORAGE_KEY_PREFIX = 'likedMe_v1_';
// Likers are fetched a page at a time via get_likers_page - this is both
// the initial page size and the size of each subsequent "Load More" page.
const LIKERS_PAGE_SIZE = 500;
// Where the second captioned photo call-out can land in the expanded details
// panel - always above Personality. Module-level (not per-render) since it's
// a fixed constant, not something that needs recreating on every render.
const PHOTO_ANCHORS = ['lifestyle', 'workEducation'] as const;
// Caption text is capped at 50 characters, matching the limit enforced when
// saving it in ImageManagement.tsx, so this should rarely ever truncate -
// it's just a safety net for older captions saved before that cap existed.
const truncateCaption = (text: string) => (text.length > 50 ? `${text.slice(0, 50).trimEnd()}…` : text);

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
  // Report/block modal - same shape and fields as Discover's swipe card modal.
  const [showReportModal, setShowReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState('');
  const [selectedReportReason, setSelectedReportReason] = useState('');
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [isBlockSuccess, setIsBlockSuccess] = useState(false);
  // Same "Undo" window as Discover's report/block modal - the block row is
  // real in the DB immediately, but removing the liker from this list waits
  // a few seconds so a mistaken block can be reversed at the same spot.
  const [lastBlockedUserId, setLastBlockedUserId] = useState<string | null>(null);
  const [isUndoingBlock, setIsUndoingBlock] = useState(false);
  const blockCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const pendingMatchForRatingRef = useRef(false);
  const backgroundFetchingRef = useRef(false);

  // See DiscoverPage's identical effect - the account's has_rated_app flag
  // is the source of truth, synced into the local cache so this page's own
  // isRatingFunnelEligible() check stays correct even if this page mounts
  // before Discover's own copy of this sync has run.
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    fetchHasRatedAppFromDb(currentUser.id).then((hasRated) => {
      if (!cancelled) syncRatingFunnelFromDb(hasRated);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

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
        setIsRefreshing(false);
        setPullDistance(0);
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

  // Same rotating highlight-chip pool Discover's swipe card uses, paging
  // through a fresh set of profile attributes as the viewer taps through
  // photos instead of always showing the same handful.
  const previewHighlights = useMemo(() => {
    if (!selectedProfile) return [];
    return getPreviewHighlights(selectedProfile as unknown as PotentialMatch, currentSlide);
  }, [selectedProfile, currentSlide]);

  // Up to 2 of this profile's photos that have a caption set (ImageManagement.tsx),
  // picked once via a seeded shuffle so the same 1-2 photos surface consistently
  // for this profile rather than a different random pick every render.
  const captionedPhotos = useMemo(() => {
    if (!selectedProfile) return [];
    const entries = Object.entries(imageCaptions)
      .filter(([url, v]) => v?.caption && (userImages[selectedProfile.id] || []).includes(url))
      .map(([url, v]) => ({ url, caption: v!.caption as string, label: v!.label || null }));
    if (entries.length === 0) return [];
    const seed = seedFromString(`${selectedProfile.id || ''}_photocaption`);
    const rand = mulberry32(seed);
    const shuffled = [...entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 2);
  }, [selectedProfile, imageCaptions, userImages]);

  // Both captioned photos show in the expanded panel, but scattered rather
  // than back-to-back: the first sits right after About, and the second
  // lands after a randomly chosen later section (seeded per profile, so it's
  // consistent rather than jumping around on every re-render).
  const secondPhotoAnchor = useMemo(() => {
    if (captionedPhotos.length < 2 || !selectedProfile) return null;
    const seed = seedFromString(`${selectedProfile.id || ''}_photo2anchor`);
    const rand = mulberry32(seed);
    return PHOTO_ANCHORS[Math.floor(rand() * PHOTO_ANCHORS.length)];
  }, [captionedPhotos.length, selectedProfile]);

  // useCallback (stable reference, no closures over changing state - purely a
  // function of its argument) so it can safely sit in other memos' dependency
  // arrays without forcing them to recompute every render.
  const renderPhotoCaptionCard = useCallback((photo: { url: string; caption: string; label?: string | null }) => (
    <div className="relative w-56 aspect-[3/4] rounded-lg overflow-hidden bg-black">
      <img
        src={optimizeImageUrl(photo.url, { width: 400, quality: 70 })}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div
        className="absolute inset-x-0 bottom-0 px-3 pt-8 pb-2.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))' }}
      >
        {photo.label && (
          <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wide truncate">{photo.label}</p>
        )}
        <p className="text-white text-sm leading-snug break-words">{truncateCaption(photo.caption)}</p>
      </div>
    </div>
  ), []);

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

  // One cultural sign to surface as its own chip, cycling through ALL of this
  // profile's signs (not just the first) as the viewer taps through photos -
  // shared signs with the current user come first, then the rest follow in
  // order across later photos, mirroring Discover's MatchCard.
  const signHighlight = useMemo(() => {
    const theirs = selectedProfile?.adinkra_symbols;
    if (!theirs || theirs.length === 0) return null;
    const mine = (currentUser as unknown as { adinkra_symbols?: string[] | null })?.adinkra_symbols || [];
    const shared = theirs.filter(symbol => mine.includes(symbol));
    const rest = theirs.filter(symbol => !mine.includes(symbol));
    const ordered = [...shared, ...rest];
    return ordered[currentSlide % ordered.length];
  }, [selectedProfile, currentUser, currentSlide]);

  // Structured favorites (jsonb) - parsed once so both the compact preview
  // row and the expanded panel can read plain FavoriteEntry objects.
  const selectedProfileFavorites = useMemo(
    () => parseFavorites(selectedProfile?.favorites),
    [selectedProfile]
  );

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

  // Only fire the one-time rating funnel for a user's actual first-ever match,
  // and only after the match banner itself has been dismissed - same sequencing
  // Discover uses (see DiscoverPage's maybeTriggerRatingFunnel).
  const maybeTriggerRatingFunnel = useCallback(() => {
    if (!pendingMatchForRatingRef.current) return;
    pendingMatchForRatingRef.current = false;
    if (!isRatingFunnelEligible()) return;
    setTimeout(() => {
      markRatingFunnelShown();
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
        premium_param: !!isPremium
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
        pendingMatchForRatingRef.current = true;
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

  // Closing early while a block is still in its undo window (see
  // handleBlockUser) finalizes it right away instead of leaving a timer
  // running after the modal's already gone.
  const closeReportModal = useCallback(() => {
    if (blockCommitTimerRef.current) {
      clearTimeout(blockCommitTimerRef.current);
      blockCommitTimerRef.current = null;
      if (isBlockSuccess && selectedProfile) {
        const blockedId = selectedProfile.id;
        setLikers(prev => prev.filter(liker => liker.id !== blockedId));
        setSelectedProfile(null);
      }
    }
    setShowReportModal(false);
    setSelectedReportReason('');
    setReportError('');
    setBlockReason('');
    setIsBlockSuccess(false);
    setLastBlockedUserId(null);
  }, [isBlockSuccess, selectedProfile]);

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
      setReportError(getSupabaseErrorMessage(error) || t('reportModal.error'));
    } finally {
      setReporting(false);
    }
  }, [selectedProfile, slides, currentSlide, currentUser?.id, selectedReportReason, t]);

  // Requires a reason picked above or a note typed here (also enforced by
  // the Block button's disabled state; checked again as defense in depth).
  // The block itself is written immediately - real and enforced right away
  // - but removing this liker from the list is deferred a few seconds so
  // "Undo" below can delete the row again first if this was a mistake.
  const handleBlockUser = useCallback(async () => {
    if (!selectedProfile || !currentUser?.id) return;
    if (!selectedReportReason && !blockReason.trim()) {
      setReportError(t('reportModal.selectReason'));
      return;
    }

    setIsBlocking(true);
    try {
      // Plain insert, no .select() chained after it - blocker_id+blocked_id
      // is already unique, so Undo can delete by that pair directly without
      // needing the row's own id back from the insert.
      const { error } = await supabase
        .from('blocks')
        .insert({
          blocker_id: currentUser.id,
          blocked_id: selectedProfile.id,
          reason: blockReason.trim() || selectedReportReason || null,
        });

      // A duplicate-key conflict (23505) means this person is already
      // blocked from an earlier attempt - the end state the user wants is
      // already true, so treat it as success instead of surfacing a raw DB
      // constraint error for something that isn't actually a failure.
      const isAlreadyBlocked = (error as { code?: string } | null)?.code === '23505';
      if (error && !isAlreadyBlocked) throw error;

      setLastBlockedUserId(selectedProfile.id);
      setIsBlockSuccess(true);
      const blockedId = selectedProfile.id;
      blockCommitTimerRef.current = setTimeout(() => {
        blockCommitTimerRef.current = null;
        setShowReportModal(false);
        setReportSuccess(false);
        setIsBlockSuccess(false);
        setSelectedReportReason('');
        setBlockReason('');
        setLastBlockedUserId(null);
        setLikers(prev => prev.filter(liker => liker.id !== blockedId));
        setSelectedProfile(null);
      }, 5000); // Undo window - give real time to notice and react
    } catch (error) {
      setReportError(getSupabaseErrorMessage(error) || 'Failed to block user');
    } finally {
      setIsBlocking(false);
    }
  }, [selectedProfile, currentUser?.id, blockReason, selectedReportReason, t]);

  // Reverse a block made by mistake, while still inside the undo window.
  const handleUndoBlock = useCallback(async () => {
    if (blockCommitTimerRef.current) {
      clearTimeout(blockCommitTimerRef.current);
      blockCommitTimerRef.current = null;
    }
    setIsUndoingBlock(true);
    try {
      if (currentUser?.id && lastBlockedUserId) {
        const { error } = await supabase
          .from('blocks')
          .delete()
          .eq('blocker_id', currentUser.id)
          .eq('blocked_id', lastBlockedUserId);
        if (error) throw error;
      }
      setShowReportModal(false);
      setIsBlockSuccess(false);
      setSelectedReportReason('');
      setBlockReason('');
      setLastBlockedUserId(null);
      // Deliberately no list filtering here - the liker stays exactly as
      // they were, as if the block had never happened.
    } catch (error) {
      setReportError(getSupabaseErrorMessage(error) || 'Failed to undo block');
    } finally {
      setIsUndoingBlock(false);
    }
  }, [lastBlockedUserId, currentUser?.id]);

  // Clear any pending block-commit timer on unmount so it can't fire once
  // this page is gone.
  useEffect(() => {
    return () => {
      if (blockCommitTimerRef.current) {
        clearTimeout(blockCommitTimerRef.current);
        blockCommitTimerRef.current = null;
      }
    };
  }, []);

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

  // Pull to refresh handlers.
  // handleTouchStart used to check e.currentTarget.scrollTop, but
  // currentTarget here is the outer non-scrolling wrapper (it's a flex
  // column, header + flex-1 list - it never scrolls itself, so its
  // scrollTop is always 0). That armed pull-to-refresh on literally every
  // touch anywhere on the page, not just when the actual list
  // (scrollContainerRef) was scrolled to its top - hence "very sensitive".
  const PULL_TRIGGER_THRESHOLD = 70; // was 50 - needs a more deliberate pull
  const PULL_MAX_VISUAL = 90;
  const PULL_DAMPING = 0.55; // rubber-band feel: finger travel > visual pull

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!selectedProfile && (scrollContainerRef.current?.scrollTop ?? 0) === 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!selectedProfile && startY > 0 && !isRefreshing) {
      // If the list has scrolled away from the top mid-gesture (or was
      // never really at the top), abandon the pull instead of tracking it.
      if ((scrollContainerRef.current?.scrollTop ?? 0) > 0) {
        setStartY(0);
        setPullDistance(0);
        return;
      }
      const currentY = e.touches[0].clientY;
      const rawDistance = currentY - startY;
      if (rawDistance <= 0) {
        setPullDistance(0);
        return;
      }
      const distance = Math.max(0, Math.min(PULL_MAX_VISUAL, rawDistance * PULL_DAMPING));
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (!selectedProfile && pullDistance > PULL_TRIGGER_THRESHOLD && !isRefreshing) {
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
                  <div className="flex items-center gap-2 mb-1 leading-tight">
                    <h2 className="text-[clamp(15px,4.4vw,18px)] font-bold text-white">
                      {selectedProfile.first_name} {selectedProfile.last_name}
                    </h2>
                    {showVerifiedBadge && (
                      <img
                        loading="lazy"
                        decoding="async"
                        src="/images/verified.svg"
                        alt="Verified profile"
                        title="Verified profile"
                        className="w-[clamp(18px,5vw,24px)] h-[clamp(18px,5vw,24px)]"
                        aria-hidden="false"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[clamp(12px,3.4vw,14px)] text-gray-300 mt-1">
                    <div className="flex items-center">
                      <Calendar className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                      <span>{ageByLikerId[selectedProfile.id] ?? calculateAge(selectedProfile.date_of_birth)} {t('matches.yearsOld')}</span>
                    </div>
                    {/* Location and "looking for" alternate by photo, one at a time, matching
                        Discover's MatchCard - falls back to whichever exists if only one is set. */}
                    {(() => {
                      const hasLocation = !!selectedProfile.city;
                      const hasIntent = !!selectedProfile.relationship_intent;
                      const showLocation = hasLocation && (!hasIntent || currentSlide % 2 === 0);
                      // Never alongside About - a bio excerpt already speaks for the
                      // person, so pairing it with "looking for" felt redundant.
                      const showIntent = !showAbout && hasIntent && (!hasLocation || currentSlide % 2 === 1);

                      if (showLocation) {
                        return (
                          <div className="flex items-center">
                            <MapPin className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                            <span>
                              {selectedProfile.city}, {selectedProfile.country}
                              {typeof selectedProfile.height_cm === 'number' && selectedProfile.height_cm > 0 && (
                                <span className="ml-2">• {formatHeightLabel(selectedProfile.height_cm)}</span>
                              )}
                            </span>
                          </div>
                        );
                      }
                      if (showIntent) {
                        return (
                          <div className="flex items-center">
                            <Heart className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                            <span>{selectedProfile.relationship_intent}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {!showMoreInfo && showAbout ? (
                    <p className="mt-2 pr-8 text-[clamp(11px,3.2vw,13px)] text-white/85 line-clamp-2">
                      {selectedProfile.bio}
                    </p>
                  ) : (
                    !showMoreInfo && (previewHighlights.length > 0 || signHighlight || musicHighlight) && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2 pr-8">
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
                        {musicHighlight?.link && (
                          <MusicLinkBadge link={musicHighlight.link} label={formatFavoriteLabel(musicHighlight)} />
                        )}
                      </div>
                    )
                  )}
                </div>

                {/* Expand/collapse control - identical pink-gradient glass circle used
                    on Discover's own swipe card. */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMoreInfo(!showMoreInfo); }}
                  aria-label={showMoreInfo ? t('matches.showLess') : t('matches.showMore')}
                  className="flex items-center justify-center text-white rounded-full transition-colors duration-200 shrink-0 backdrop-blur-md -mt-1.5"
                  style={{
                    width: 30,
                    height: 30,
                    minWidth: 30,
                    minHeight: 30,
                    padding: 0,
                    background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
                    boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
                  }}
                >
                  {showMoreInfo ? (
                    <ArrowUp size={15} style={{ width: 15, height: 15 }} strokeWidth={2.5} />
                  ) : (
                    <ArrowDown size={15} style={{ width: 15, height: 15 }} strokeWidth={2.5} />
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
          className="relative z-20 flex-1 overflow-y-auto bg-black scrollbar-hide"
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

              {/* First captioned photo (ImageManagement.tsx) - no section heading, just
                  the photo, its preset label (what it's about), and the full caption
                  (capped at 50 chars) pinned to the image's own bottom edge. */}
              {captionedPhotos[0] && renderPhotoCaptionCard(captionedPhotos[0])}

              {typeof selectedProfile.height_cm === 'number' && selectedProfile.height_cm > 0 && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Height</h4>
                  <div className="flex items-center text-sm">
                    <Ruler className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-gray-200">{formatHeightLabel(selectedProfile.height_cm)}</span>
                  </div>
                </div>
              )}

              {[selectedProfile.smoking, selectedProfile.drinking, selectedProfile.exercise_level, selectedProfile.sleeping_schedule].some(Boolean) && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Lifestyle</h4>
                  <div className="space-y-2">
                    {selectedProfile.smoking && (
                      <div className="flex items-center text-sm">
                        <span className="mr-2 flex-shrink-0" aria-hidden="true">🚬</span>
                        <span className="font-semibold mr-2 text-white">Smoking:</span>
                        <span className="text-gray-200">{selectedProfile.smoking}</span>
                      </div>
                    )}
                    {selectedProfile.drinking && (
                      <div className="flex items-center text-sm">
                        <span className="mr-2 flex-shrink-0" aria-hidden="true">🍸</span>
                        <span className="font-semibold mr-2 text-white">Drinking:</span>
                        <span className="text-gray-200">{selectedProfile.drinking}</span>
                      </div>
                    )}
                    {selectedProfile.exercise_level && (
                      <div className="flex items-center text-sm">
                        <span className="mr-2 flex-shrink-0" aria-hidden="true">🏋️</span>
                        <span className="font-semibold mr-2 text-white">Exercise:</span>
                        <span className="text-gray-200">{selectedProfile.exercise_level}</span>
                      </div>
                    )}
                    {selectedProfile.sleeping_schedule && (
                      <div className="flex items-center text-sm">
                        <span className="mr-2 flex-shrink-0" aria-hidden="true">😴</span>
                        <span className="font-semibold mr-2 text-white">Sleep:</span>
                        <span className="text-gray-200">{selectedProfile.sleeping_schedule}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {secondPhotoAnchor === 'lifestyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

              {selectedProfile.family_plans && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Family Plans</h4>
                  <div className="flex items-center text-sm">
                    <Baby className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-gray-200">{traitLabel(FAMILY_PLANS_OPTIONS, selectedProfile.family_plans)}</span>
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

              {secondPhotoAnchor === 'workEducation' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

              {(typeof selectedProfile.introvert_extrovert === 'number' || typeof selectedProfile.spontaneous_planner === 'number' || typeof selectedProfile.messy_organized === 'number') && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-3">Personality</h4>
                  <div className="space-y-4">
                    {typeof selectedProfile.introvert_extrovert === 'number' && (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-400">Introvert</span>
                        <div className="flex-1 bg-white/10 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${selectedProfile.introvert_extrovert}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-400">Extrovert</span>
                      </div>
                    )}
                    {typeof selectedProfile.spontaneous_planner === 'number' && (
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-400">Spontaneous</span>
                          <div className="flex-1 bg-white/10 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${selectedProfile.spontaneous_planner}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-400">Planner</span>
                        </div>
                      </div>
                    )}
                    {typeof selectedProfile.messy_organized === 'number' && (
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-400">Messy</span>
                          <div className="flex-1 bg-white/10 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${selectedProfile.messy_organized}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-400">Organized</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {secondPhotoAnchor === 'personality' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

              {selectedProfile.communication_style && selectedProfile.communication_style.length > 0 && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-pink-500" />
                    Communication Style
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedProfile.communication_style.map((value, index) => (
                      <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                        {traitLabel(COMMUNICATION_STYLE_OPTIONS, value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {secondPhotoAnchor === 'communicationStyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

              {selectedProfile.love_style && selectedProfile.love_style.length > 0 && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-pink-500" />
                    Love Style
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedProfile.love_style.map((value, index) => (
                      <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                        {traitLabel(LOVE_STYLE_OPTIONS, value)}
                      </span>
                    ))}
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

              {selectedProfileFavorites.length > 0 && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">{t('matches.favorites')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProfileFavorites.map((favorite, index) => (
                      <span key={index} className="inline-flex items-center gap-1 h-6 leading-none px-2 py-0 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-xs">
                        <span className="text-[11px] leading-none">{favoriteEmoji(favorite.category)}</span>
                        <span className="leading-none">{formatFavoriteLabel(favorite)}</span>
                        {favorite.link && (
                          <MusicLinkBadge link={favorite.link} label={formatFavoriteLabel(favorite)} variant="inline" />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedProfile.pets && selectedProfile.pets.length > 0 && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                    <PawPrint className="w-3.5 h-3.5 text-pink-500" />
                    Pets
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedProfile.pets.map((value, index) => (
                      <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                        {traitLabel(PETS_OPTIONS, value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedProfile.languages && selectedProfile.languages.length > 0 && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Languages</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedProfile.languages.map((lang, index) => (
                      <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedProfile.social_media && (
                <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                  <h4 className="font-semibold text-pink-400 mb-2">Social Media</h4>
                  <div className="flex items-center text-sm">
                    <Share2 className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-gray-200">{traitLabel(SOCIAL_MEDIA_OPTIONS, selectedProfile.social_media)}</span>
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
                (typeof selectedProfile.height_cm === 'number' && selectedProfile.height_cm > 0) ||
                [selectedProfile.smoking, selectedProfile.drinking, selectedProfile.exercise_level, selectedProfile.sleeping_schedule].some(Boolean) ||
                selectedProfile.family_plans ||
                selectedProfile.occupation || selectedProfile.education_level || selectedProfile.industry ||
                (typeof selectedProfile.introvert_extrovert === 'number' || typeof selectedProfile.spontaneous_planner === 'number' || typeof selectedProfile.messy_organized === 'number') ||
                (selectedProfile.communication_style && selectedProfile.communication_style.length > 0) ||
                (selectedProfile.love_style && selectedProfile.love_style.length > 0) ||
                (selectedProfile.interests && selectedProfile.interests.length > 0) ||
                selectedProfileFavorites.length > 0 ||
                (selectedProfile.pets && selectedProfile.pets.length > 0) ||
                (selectedProfile.languages && selectedProfile.languages.length > 0) ||
                selectedProfile.social_media ||
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
                  <div className="text-center py-6">
                    <div className="text-green-400 font-semibold">
                      <div className="mb-2 text-3xl">🚫</div>
                      <div className="text-lg mb-2">{t('reportModal.blockSuccess.title')}</div>
                      <div className="text-sm text-gray-300">{t('reportModal.blockSuccess.message')}</div>
                    </div>
                    <button
                      className="mt-4 h-9 px-5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-lg border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                      onClick={handleUndoBlock}
                      disabled={isUndoingBlock}
                    >
                      {isUndoingBlock ? t('reportModal.blockSuccess.undoing') : t('reportModal.blockSuccess.undo')}
                    </button>
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

                    {/* Block section - just the optional note now; the actual
                        action moved down to sit next to Report (below) so
                        there's one clear pair of outcomes instead of three
                        competing buttons. */}
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
                        className="w-full h-9 bg-pink-600 hover:bg-pink-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors duration-200"
                        onClick={handleBlockUser}
                        disabled={isBlocking || reporting || (!selectedReportReason && !blockReason.trim())}
                      >
                        {isBlocking ? t('reportModal.blockSection.blocking') : t('reportModal.blockSection.blockButton')}
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
  }, [selectedProfile, slides, previewHighlights, signHighlight, selectedProfileFavorites, musicHighlight, slideBackgroundColors, currentSlide, showMoreInfo, showReportModal, reporting, reportSuccess, reportError, selectedReportReason, isBlocking, blockReason, isBlockSuccess, isUndoingBlock, closeReportModal, handleReportImage, handleBlockUser, handleUndoBlock, calculateAge, t, ageByLikerId, getSafeImageSrc, swipeDragX, isSwipeDragging, swipeExitDirection, handleSwipePointerDown, handleSwipePointerMove, handleSwipePointerUp, captionedPhotos, secondPhotoAnchor, renderPhotoCaptionCard, showAbout, showVerifiedBadge]);

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
          className="flex items-center justify-center gap-2 bg-black transition-all duration-200"
          style={{ height: `${pullDistance}px` }}
        >
          {isRefreshing ? (
            <RefreshCw className="w-4 h-4 text-pink-400 animate-spin" strokeWidth={2.5} />
          ) : (
            <ArrowDownToLine
              className="w-4 h-4 text-pink-400 transition-transform duration-150"
              strokeWidth={2.5}
              style={{ transform: pullDistance > PULL_TRIGGER_THRESHOLD ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          )}
          <div className="text-pink-400 text-sm">
            {pullDistance > PULL_TRIGGER_THRESHOLD ? (isRefreshing ? t('matches.refreshing') : t('matches.releaseToRefresh')) : t('matches.pullToRefresh')}
          </div>
        </div>
      )}

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
            <Button
              onClick={() => setShowPremiumUpgrade(true)}
              style={{ height: 28, minHeight: 28, padding: '0 12px' }}
              className="rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-semibold text-xs leading-none shadow-sm"
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
        )}

        {hasMoreLikers && likers.length > 0 && (
          <div className="flex justify-center pt-4">
            <Button
              onClick={loadMoreLikers}
              disabled={loadingMoreLikers}
              variant="outline"
              className="rounded-full text-xs px-4 h-8 border-pink-500/40 text-pink-300 hover:bg-pink-500/10"
            >
              {loadingMoreLikers ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </div>

      <RatingFunnel
        open={showRatingFunnel}
        onClose={() => setShowRatingFunnel(false)}
        userId={currentUser?.id}
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

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
  uniqUuids,
  todayStr,
  applyLightActivityWeighting,
  getUserFeedSeed,
  readCachedSwipeCount,
  writeCachedSwipeCount,
  getTrustedBaseCountryCode,
  isLocalCountryForFreeUser,
  mixByCountryRoundRobin,
  buildFeedSignature,
  buildSavedOrderKey,
  readPersistentItem,
  writePersistentItem,
  normalizeCountryCodeList,
  matchesReciprocalPreference,
} from './discover/discoverFeedUtils';
import { applyCompatibilityWeighting } from '@/utils/matchScoring';
import { trackLikedYouShown, trackLikedYouSwiped } from '@/utils/discoverTelemetry';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Crown, Gamepad2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSubscription } from '@/hooks/useSubscription';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { calculateDistance } from '@/constants/locationData';
import { checkAndTriggerRefill } from '@/utils/performanceOptimizer';
import { locationService } from '@/services/locationService';
import { calculateProfileCompletion, getTodaySwipeCount } from '@/utils/profileCompletion';
import { parseFavorites } from '@/constants/favorites';
import { readCachedPremiumStatus } from '@/utils/premiumStatusCache';
import { getLanguageName } from '@/utils/languageNames';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import MatchCard from './discover/MatchCard';
import SwipeButtons from './discover/SwipeButtons';
import AdCard from './discover/AdCard';
import RatingFunnel from './RatingFunnel';
import VerifyIdentityPrompt from './VerifyIdentityPrompt';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import HoppingLogo from '@/components/HoppingLogo';
import { isRatingFunnelEligible, markRatingFunnelShown, syncRatingFunnelFromDb } from '@/utils/ratingFunnelStorage';
import { fetchHasRatedAppFromDb } from '@/utils/ratingPlatform';
import { isVerifyPromptEligible, markVerifyPromptTriggered } from '@/utils/verifyPromptStorage';
import { CurrentUser, PotentialMatch } from '@/types';
import { publishSwipeDecision } from '@/utils/swipeSync';

// How many lifetime swipes before an unverified user sees the "verify your
// identity" prompt (shown once, ever - see verifyPromptStorage.ts). Set to 1
// for now to validate the flow end to end; raise to ~15 once that's done.
const SWIPES_BEFORE_VERIFY_PROMPT = 1;

// Single source of truth for the daily swipe caps - must match the
// `update_user_usage` DB function's own `usage_limit` for 'swipe' (see
// supabase/migrations). Previously "29"/"200" were hardcoded separately in
// five different places in this file, which is exactly how they drift out
// of sync with each other and with the server.
const FREE_DAILY_SWIPE_LIMIT = 30;
const PREMIUM_DAILY_SWIPE_LIMIT = 200;

// Free users are capped at this distance (km) regardless of their own
// max_distance/distance_preference setting. This was independently
// redeclared as a local const under two different names
// (FREE_USER_MAX_DISTANCE, FREE_USER_MAX_DISTANCE_CACHE) plus two more raw
// "500" literals, in four separate places in this file - the same drift
// risk that caused the swipe-limit bug. One constant now.
const FREE_USER_MAX_DISTANCE_KM = 600;
// Premium users can search further than free users, but still up to a
// concrete ceiling rather than being fully unbounded - matches the max on
// the distance slider in the profile's Location section. The radius is
// ALWAYS additionally bounded by the home country: a bigger radius never
// pulls in a neighbouring country's profiles.
const PREMIUM_USER_MAX_DISTANCE_KM = 5000;

// Below this profile-completion percentage, swiping is blocked once the user
// has already had a few free look-arounds. Was hardcoded as "70" and "5"
// independently in both handleLike and handlePass.
const PROFILE_COMPLETION_REQUIRED_PERCENT = 70;
const PROFILE_COMPLETION_GRACE_SWIPES = 8;

// Fallback age range used whenever a user hasn't set min_age/max_age -
// was independently re-typed as "18"/"99" in three separate places.
const DEFAULT_MIN_AGE = 18;
const DEFAULT_MAX_AGE = 99;

// How long a PASS keeps a profile excluded from the deck before it's
// eligible to reappear - a like is excluded permanently (no time window at
// all) and is intentionally not part of this constant. Was independently
// re-computed as `30 * 24 * 60 * 60 * 1000` in eight separate places in this
// file (matching the server's own `passes` query window in
// fetchPotentialMatchesData) - the same drift risk as the constants above.
const PASS_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// Fallback distance (km) used whenever a user hasn't set max_distance or
// distance_preference - was independently re-typed as a raw "50" in eight
// separate places across this file.
const DEFAULT_MAX_DISTANCE_KM = 50;

// Resumes the deck at whatever card the user was actually looking at, not
// index 0 - `driplove_last_profile_<userId>` is written by moveToNext() as
// the id of the card that becomes current right after a swipe, so resuming
// ON it (not past it) shows the same card the user hadn't swiped yet.
// BUG this fixes: this used to only run inside the cold-fetch path
// (fetchPotentialMatchesData) - the far more common "restore from the local
// deck cache" path on every subsequent refresh that same day unconditionally
// reset to index 0 instead, so a refresh/relaunch would jump back to
// whatever card happened to be first in the cached array - looking like a
// random different person every time, defeating the point of resuming at
// all. Both paths now share this one calculation.
const resolveResumeIndex = (profiles: { id: string }[], userId: string): number => {
  const savedId = readPersistentItem(`driplove_last_profile_${userId}`);
  const savedTime = parseInt(readPersistentItem(`driplove_last_profile_time_${userId}`) || '0');
  const twentyFourHours = 24 * 60 * 60 * 1000;
  const isSavedValid = Boolean(savedId) && Date.now() - savedTime < twentyFourHours;
  if (!isSavedValid || !savedId) return 0;

  const foundIndex = profiles.findIndex((p) => p.id === savedId);
  if (foundIndex === -1) return 0;
  return Math.min(foundIndex, profiles.length - 1);
};

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
  onNavigateToAdvertise?: () => void;
  onNavigateToVerify?: () => void;
  isPremium?: boolean;
  profileCompletion?: number; // Pass from parent (Profile page calculates it)
  isActiveTab?: boolean; // Whether this tab is currently the visible one (parent keeps it mounted via display:none)
}

interface PassedUser {
  user_id: string;
  passed_at: Date;
}

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
  | 'favorites'
  | 'gender'
  | 'preference'
  | 'max_distance'
  | 'distance_preference'
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
  | 'height_cm'
  | 'languages'
  | 'family_plans'
  | 'communication_style'
  | 'love_style'
  | 'pets'
  | 'social_media'
> & {
  // Set client-side only when a row was fetched via the archived-users
  // mix-in, before it's converted to a PotentialMatch - never a real column
  // read from the query itself (is_archived IS a real column, but this
  // marks "was deliberately mixed in as archived," which is narrower).
  __isArchivedMixin?: boolean;
};

const toPotentialMatch = (
  profile: ProfileRow,
  extras?: { images?: string[]; distance?: number }
): PotentialMatch => {
  const interestsRaw = profile.interests;
  const interests = Array.isArray(interestsRaw)
    ? interestsRaw.filter((i): i is string => typeof i === 'string')
    : [];

  const favorites = parseFavorites(profile.favorites);

  const adinkraRaw = profile.adinkra_symbols;
  const adinkra_symbols = Array.isArray(adinkraRaw)
    ? adinkraRaw.filter((i): i is string => typeof i === 'string')
    : undefined;

  const asStringArray = (raw: unknown): string[] | undefined =>
    Array.isArray(raw) ? raw.filter((i): i is string => typeof i === 'string') : undefined;

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
    favorites,
    images: extras?.images ?? [],
    is_verified: profile.is_verified ?? undefined,
    gender: profile.gender ?? '',
    preference: profile.preference ?? undefined,
    max_distance: profile.max_distance ?? undefined,
    distance_preference: profile.distance_preference ?? undefined,
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
    height_cm: profile.height_cm ?? undefined,
    languages: asStringArray(profile.languages),
    family_plans: profile.family_plans ?? undefined,
    communication_style: asStringArray(profile.communication_style),
    love_style: asStringArray(profile.love_style),
    pets: asStringArray(profile.pets),
    social_media: profile.social_media ?? undefined,
    distance: extras?.distance,
    is_archived: profile.__isArchivedMixin || undefined,
    last_login_at: profile.last_login_at ?? undefined,
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
    const thirtyDaysMs = PASS_EXPIRY_MS;
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

const DiscoverPage = ({ currentUser, onNavigateToChat, onNavigateToProfile, onNavigateToAdvertise, onNavigateToVerify, isPremium, profileCompletion: parentProfileCompletion, isActiveTab = true }: DiscoverPageProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  
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
  const [emptyStateMode, setEmptyStateMode] = useState<'exhausted' | 'transient-error'>('exhausted');

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
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false);
  // A match just happened and its screen is about to close - the rating
  // funnel may fire once that settles, subject to isRatingFunnelEligible()
  // (DB has_rated_app + local cooldown), not just on the user's first-ever
  // match - a single missed shot at a brand-new, OS-quota-throttled review
  // prompt should never be the only chance a user ever gets to be asked.
  const pendingMatchForRatingRef = useRef(false);

  // The account's has_rated_app flag is the source of truth (survives a
  // reinstall or a different device, unlike localStorage) - synced into the
  // local cache once per load so isRatingFunnelEligible()'s synchronous
  // check (needed at the exact moment a match closes) stays correct.
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

  // Persist just the current + next card's own photo URLs (not the whole
  // `userImages` map - this only needs to survive long enough to paint the
  // very first frame after a relaunch). The deck itself is cached, but a
  // deck entry always has `images: []` by construction (see toPotentialMatch
  // callers) - actual URLs only ever live in `userImages`, which starts empty
  // on every fresh mount, so restoring the deck from cache still needed one
  // live query before any photo could render. Caching these two profiles'
  // URLs lets that first paint happen with zero network wait instead.
  useEffect(() => {
    if (!currentUser?.id) return;
    const current = potentialMatches[currentIndex];
    const next = potentialMatches[currentIndex + 1];
    const toCache: { [key: string]: string[] } = {};
    if (current && !isAd(current) && userImages[current.id]?.length) {
      toCache[current.id] = userImages[current.id];
    }
    if (next && !isAd(next) && userImages[next.id]?.length) {
      toCache[next.id] = userImages[next.id];
    }
    if (Object.keys(toCache).length === 0) return;
    try {
      localStorage.setItem(
        `driplove_last_card_images_${currentUser.id}`,
        JSON.stringify({ ts: Date.now(), images: toCache })
      );
    } catch {
      // ignore (private mode / storage full)
    }
  }, [userImages, potentialMatches, currentIndex, currentUser?.id]);
  // Optional per-photo label/caption (set in ImageManagement.tsx), keyed by the
  // photo's own image_url - global across every profile fetched rather than
  // per-profile, since image_url is already unique and this is simpler to
  // merge as new profiles/images stream in from the several fetch paths below.
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
  // Merges in the global (image_url-keyed) captions map so MatchCard can look
  // up the currently-shown photo's caption off match.imageCaptions without
  // every profile-construction site elsewhere needing to know about captions.
  // Declared here (unconditionally, alongside the other top-level hooks) -
  // not further down near where it's used - because several early returns
  // between here and there (out of swipes, premium upsell, match animation)
  // would otherwise make this hook run conditionally, which React's rules of
  // hooks forbid and can crash the component when those states toggle.
  const currentMatchWithCaptions = useMemo(() => {
    const current = potentialMatches[currentIndex];
    // Every call site falls back to `currentMatch` (already non-ad-checked)
    // via `currentMatchWithCaptions || currentMatch`, so returning undefined
    // here for the ad case is equivalent to returning the ad itself - but
    // typed correctly as PotentialMatch | undefined instead of including
    // AdData, which is what MatchCard's `match` prop actually accepts.
    if (!current || isAd(current)) return undefined;
    return { ...current, imageCaptions } as PotentialMatch;
  }, [potentialMatches, currentIndex, imageCaptions]);
  // Store distances from location service
  const [userDistances, setUserDistances] = useState<{ [key: string]: number }>({});
  // Store preloaded blob URLs for instant image rendering
  const [preloadedBlobImages, setPreloadedBlobImages] = useState<{ [key: string]: { [url: string]: string } }>({});
  // Store fetched language names to avoid DB calls in MatchCard
  const [userLanguages, setUserLanguages] = useState<{ [key: string]: string }>({});
  const [reverseUsageToday, setReverseUsageToday] = useState(0);
  // Local computed completion (fallback when parent/DB completion is unavailable)
  const [computedProfileCompletion, setComputedProfileCompletion] = useState(0);
  const [, setUserProfileImages] = useState<UserImageRow[]>([]);
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
  const [, setContentHeight] = useState(0);
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
  
  // Hard cap on how many swiped-profile entries this ever holds. `pass`
  // entries already get pruned after 30 days (pruneExpiredPassedSwipes), but
  // `like` entries never did - a long-time power user's likes accumulated
  // here forever, so every single swipe re-serialized an ever-growing
  // object to localStorage. The server-side query is the real source of
  // truth for "already liked" (this is only a client-side fast-path to
  // avoid a flash of already-swiped profiles), so trimming the oldest
  // entries once past this cap is safe.
  const MAX_LOCAL_SWIPED_ENTRIES = 5000;

  // Persist swiped IDs to BOTH localStorage and sessionStorage whenever they change
  // This ensures swipes survive page refresh, app restart, and navigation
  const persistSwipedIds = useCallback(() => {
    if (!currentUser?.id) return;
    if (locallySwipedProfileIds.current.size > MAX_LOCAL_SWIPED_ENTRIES) {
      const entries = Array.from(locallySwipedProfileIds.current.entries())
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, MAX_LOCAL_SWIPED_ENTRIES);
      locallySwipedProfileIds.current = new Map(entries);
    }
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
  const revokeBlobUrlsForProfile = useCallback((profileId: string) => {
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

  // Full-cache version of the above - used wherever the whole deck resets
  // (preference changes, "no more profiles" retry) rather than just one
  // profile advancing. Without this, every reset left the outstanding blob
  // URLs from before it un-revoked, leaking memory for the rest of the
  // session (iOS/Web only - Android skips blob preloading entirely).
  const revokeAllBlobUrls = useCallback(() => {
    setPreloadedBlobImages(prev => {
      for (const profileBlobs of Object.values(prev)) {
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
      return {};
    });
  }, []);

  const { toast } = useToast();
  const { sendMatchNotification, sendMultipleLikesNotification } = usePushNotifications(currentUser?.id);
  const {
    loading: subscriptionLoading,
    isPremium: isPremiumFromSubscription,
    checkUsageLimit,
    refetchSubscription
  } = useSubscription(currentUser?.id);

  // Premium status comes from two independent signals - the parent's `isPremium`
  // prop and this page's own useSubscription() hook - and both must have had a
  // chance to answer before we trust "not premium" enough to enforce the free
  // swipe cap. Previously this was an OR, so the page could enforce the cap the
  // instant *either* signal settled (often the DB swipe count, which loads
  // fast) even though the other was still mid-flight and would have said
  // "premium" a moment later - a paying user could get capped at the free
  // limit during that window. Requiring BOTH closes that race.
  const premiumResolved = isPremium !== undefined && !subscriptionLoading;

  // Last confirmed premium status for this device (see premiumStatusCache).
  // Used only while the live signals above haven't both resolved yet, so a
  // slow/flaky lookup can't transiently demote a paying user to the free cap.
  const cachedPremium = readCachedPremiumStatus(currentUser?.id);

  const premiumActive = Boolean(isPremium) || isPremiumFromSubscription() || (!premiumResolved && cachedPremium === true);

  // Drives the "Try now for free" vs "Unlock More Countries" copy on the
  // no-more-profiles empty state below - real trial length/eligibility read
  // from the store, same hook the free trial banner uses, never hardcoded.
  const { eligibleForTrial: emptyStateTrialEligible } = useFreeTrialOffer(currentUser?.id);

  const { preloadImages, cancelImages, getOptimizedUrl, clearCache } = useImagePreloader({
    maxConcurrent: 6, // Slightly higher concurrency for faster swipe experience
    // Cards are full-bleed on modern 2x/3x phones - 500px @ q60 was visibly soft.
    quality: 82,
    width: 1080
  });


  // Track in-flight image load requests to avoid duplicate DB calls
  const requestedImageProfileIds = useRef<Set<string>>(new Set());

  // ⭐ LIKE-BACK INJECTION: 25% injection of users who liked the current user
  // ⭐ FIX: Store blocked IDs in state (populated from fetchPotentialMatchesData)
  const [blockedUserIds] = useState<string[]>([]);
  const {
    onLikeBackSwipe,
  } = useDiscoverLikeBack({
    currentUser,
    premiumActive,
    potentialMatches,
    blockedUserIds,
    locallySwipedProfileIds,
    isAd,
  });

  const { injectAds } = useDiscoverAds({
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
  // The timer lives in a ref and is NEVER cancelled by effect cleanup: swiping
  // updates profile/swipe state, which can re-run this effect (or briefly flip
  // the page into the loading/out-of-swipes/ad render branch) — the old
  // clearTimeout-on-cleanup let exactly that kill the guide mid-display. Only
  // the 10s timeout (or an explicit dismiss below) hides the guide now.
  const swipeGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dismisses the guide immediately (used when the user actually swipes it,
  // instead of only auto-hiding after the timer) and permanently marks it
  // seen either way, same as the timeout path.
  const dismissSwipeGuide = useCallback(() => {
    if (swipeGuideTimerRef.current) {
      clearTimeout(swipeGuideTimerRef.current);
      swipeGuideTimerRef.current = null;
    }
    setShowSwipeGuide(false);
    if (currentUser?.id) {
      try {
        localStorage.setItem(`driplove_swipe_guide_shown_${currentUser.id}`, 'true');
      } catch {
        // ignore
      }
    }
  }, [currentUser?.id]);
  useEffect(() => {
    // Only show for new users - keyed per account (not a single blanket
    // flag), so a fresh signup on a device that's already seen this for a
    // previous account still gets to see it once for their own account.
    if (!currentUser?.id) return;
    const shownKey = `driplove_swipe_guide_shown_${currentUser.id}`;
    if (localStorage.getItem(shownKey)) return;
    if (swipeGuideTimerRef.current) return; // timer already running — don't restart
    setShowSwipeGuide(true);
    swipeGuideTimerRef.current = setTimeout(() => {
      dismissSwipeGuide();
    }, 10000); // 10 seconds
  }, [currentUser?.id, dismissSwipeGuide]);

  // The guide overlay is swipeable, but ONLY itself - it has its own fully
  // separate drag state/handlers here, completely decoupled from the real
  // card's cardElRef/swipeUI/handleLike/handlePass. Swiping the guide slides
  // the guide's own tagline+icons off screen and dismisses it; the real card
  // underneath is never touched, dragged, or swiped for real, so there's no
  // way for this to ever count as an actual like/pass no matter how it's used.
  const [guideDrag, setGuideDrag] = useState({ x: 0, y: 0 });
  const [guideExitDir, setGuideExitDir] = useState<'left' | 'right' | null>(null);
  const guideDragActiveRef = useRef(false);
  const guideDragXRef = useRef(0);
  const guideStartRef = useRef({ x: 0, y: 0 });
  const GUIDE_SWIPE_THRESHOLD = 80;

  const finishGuideDrag = useCallback((finalX: number) => {
    guideDragActiveRef.current = false;
    if (Math.abs(finalX) > GUIDE_SWIPE_THRESHOLD) {
      const dir: 'left' | 'right' = finalX > 0 ? 'right' : 'left';
      setGuideExitDir(dir);
      // Let the CSS transition play the fly-off before actually dismissing/
      // unmounting - matches the same 300ms feel as the real card's own exit.
      setTimeout(() => {
        dismissSwipeGuide();
        setGuideExitDir(null);
        setGuideDrag({ x: 0, y: 0 });
      }, 300);
    } else {
      setGuideDrag({ x: 0, y: 0 });
    }
  }, [dismissSwipeGuide]);

  const handleGuideTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    guideStartRef.current = { x: t.clientX, y: t.clientY };
    guideDragXRef.current = 0;
    guideDragActiveRef.current = true;
  }, []);

  const handleGuideTouchMove = useCallback((e: React.TouchEvent) => {
    if (!guideDragActiveRef.current) return;
    const t = e.touches[0];
    const x = t.clientX - guideStartRef.current.x;
    const y = t.clientY - guideStartRef.current.y;
    guideDragXRef.current = x;
    setGuideDrag({ x, y });
  }, []);

  const handleGuideTouchEnd = useCallback(() => {
    if (!guideDragActiveRef.current) return;
    finishGuideDrag(guideDragXRef.current);
  }, [finishGuideDrag]);

  const handleGuideMouseDown = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;
    guideDragActiveRef.current = true;
    guideDragXRef.current = 0;

    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX - startX;
      const y = ev.clientY - startY;
      guideDragXRef.current = x;
      setGuideDrag({ x, y });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      finishGuideDrag(ev.clientX - startX);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [finishGuideDrag]);
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
        // Trust the DB value once it loads - it's the authoritative count.
        // This used to be Math.max(cached, dbValue), which meant a stale-high
        // cache (e.g. from an earlier session that swiped a lot today) could
        // never be corrected back down by a fresh DB read, permanently
        // overstating usage - including making a server-side admin reset of
        // this user's daily count invisible on that device for the rest of
        // the day. In-flight optimistic swipes from *this* session are
        // already accounted for separately via pendingSwipesRef (see
        // effectiveSwipeCount in handleLike/executePassLogic), so nothing is
        // lost by letting the DB value win here.
        setTodaySwipeCount(swipeCount);
        writeCachedSwipeCount(currentUser.id, swipeCount);
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
        } else {
          const completionResult = calculateProfileCompletion(profile, userImages);
          setComputedProfileCompletion(completionResult.completion);
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
    const swipeLimit = premiumActive ? PREMIUM_DAILY_SWIPE_LIMIT : FREE_DAILY_SWIPE_LIMIT;
    
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

  // Snaps the local swipe counter (and its cache) to the server's
  // authoritative value whenever persistSwipeCount actually gets one back -
  // corrects any drift from a failed/lagged persist or a no-op duplicate
  // swipe, instead of letting bumpLocalSwipeCount's optimistic +1 stand
  // uncorrected all session. A no-op when there's nothing to reconcile
  // (serverUsage is null, e.g. a total network failure with no answer at
  // all - deliberately left alone rather than guessed at).
  const reconcileSwipeCountFromServer = useCallback((serverUsage: number | null) => {
    if (serverUsage === null || !currentUser?.id) return;
    setTodaySwipeCount(serverUsage);
    writeCachedSwipeCount(currentUser.id, serverUsage);
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
  const rafIdRef = useRef<number | null>(null);
  // Ref to whichever card element is currently mounted (the regular swipe card
  // or the ad-card variant - only one is ever rendered at a time, both attach
  // the same ref). During an active drag, the transform is written directly to
  // this DOM node's style in the rAF callback below, instead of only through
  // React state - a state update here still re-renders this whole (very large)
  // page, and on weaker Android hardware that render can take longer than a
  // frame, which is what shows up as the card stuttering/lagging behind the
  // finger. The direct write always lands the same frame, independent of how
  // long the rest of the page's render takes; the state update still happens
  // too (throttled to the same rAF), for the overlay hint/buttons that read
  // swipeDistance/swipeDirection, which can tolerate lagging a frame or two.
  const cardElRef = useRef<HTMLDivElement>(null);
  // Coarse-step gate for the React state updates during a drag (see handleTouchMove):
  // keeps Android from re-rendering this whole page on every single touchmove frame.
  const lastPushedDirRef = useRef<'left' | 'right' | null>(null);
  const lastPushedDistRef = useRef<number>(0);

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
          .select('image_url, image_order, label, caption')
          .eq('user_id', profileId)
          .eq('is_approved', true)
          .neq('image_order', -1)
          .order('image_order', { ascending: true });

        if (images) mergeImageCaptions(images);

        return images?.map(img => img.image_url) || [];
      } catch {
        return [];
      } finally {
        inFlightProfileImageFetchesRef.current.delete(profileId);
      }
    })();

    inFlightProfileImageFetchesRef.current.set(profileId, fetchPromise);

    return fetchPromise;
  }, [mergeImageCaptions]);

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
    const countryCodes = Array.from(new Set(unlockedCountries.map(normalizeCountryCode).filter(Boolean)));
    if (countryCodes.length === 0) return [];

    // Unlocked countries are what premium is paying for - each one should feel
    // like a real, healthy pool, not a token handful. Some unlocked countries
    // simply have far fewer active users than the viewer's home country, so an
    // active-only fetch alone starves them. Per country: fetch active first,
    // then top up with archived from that SAME country when active supply is
    // short, up to perCountryLimit.
    const perCountryLimit = Math.max(60, Math.ceil(limit / Math.max(1, countryCodes.length)));

    const results = await Promise.all(
      countryCodes.map(async (countryCode) => {
        // ⭐ FAIRNESS: get_random_discover_profiles orders by random() server-side,
        // so this isn't the same fixed slice of profiles every time - see the
        // migration for why a plain .limit() without ORDER BY was letting whole
        // segments of real users go permanently unseen.
        const { data: activeData, error: activeError } = await supabase.rpc('get_random_discover_profiles', {
          p_country_codes: [countryCode],
          p_allowed_genders: allowedGenders,
          p_archived: false,
          p_excluded_ids: excludedIds,
          p_limit: perCountryLimit,
        });
        const activeRows: ProfileRow[] = (!activeError && Array.isArray(activeData))
          ? (activeData as unknown as ProfileRow[])
          : [];

        if (activeRows.length >= perCountryLimit) {
          return activeRows;
        }

        const archivedTopUpLimit = perCountryLimit - activeRows.length;
        const archivedExcludedIds = uniqUuids([...excludedIds, ...activeRows.map((p) => p.id)]);
        const { data: archivedData, error: archivedError } = await supabase.rpc('get_random_discover_profiles', {
          p_country_codes: [countryCode],
          p_allowed_genders: allowedGenders,
          p_archived: true,
          p_excluded_ids: archivedExcludedIds,
          p_limit: archivedTopUpLimit,
        });
        const archivedRows: ProfileRow[] = (!archivedError && Array.isArray(archivedData))
          ? (archivedData as unknown as ProfileRow[])
          : [];

        return [...activeRows, ...archivedRows];
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
  const fetchPotentialMatchesData = useCallback(async (userId: string, allowedGenders: string[], opts?: { isRefill?: boolean }) => {
    // A background top-up (loadMoreMatches) must see the FULL eligible pool
    // this call found - the "fast first paint" caps below exist only for the
    // very first screen, but were being applied here too, silently discarding
    // every candidate past the cap on every single refill. Combined with the
    // "retry once" duplicate check re-asking with the exact same exclusions
    // (so it got the exact same capped slice back), a real pool of 100+
    // eligible people could show "no more profiles" the moment the visible
    // top 30-60 (by feed weight) had all been swiped - even though the rest
    // of that same pool was sitting right there, one rank below the cutoff.
    const isRefill = opts?.isRefill === true;
    // Create timeout wrapper for all database queries (15 second timeout)
    // Accepts any thenable so Supabase query builders (which are PromiseLike,
    // not real Promises) can be passed directly.
    const queryTimeout = <T,>(promise: PromiseLike<T>, timeoutMs = 15000): Promise<T> => {
      return Promise.race([
        Promise.resolve(promise),
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
      { data: usersWhoLikedMe },
      { data: activeCooldowns }
    ] = await queryTimeout(Promise.all([
      supabase
        .from('profiles')
        .select('max_distance, distance_preference, country, country_code, min_age, max_age, preference, gender, interests, introvert_extrovert, spontaneous_planner, messy_organized, unlocked_countries, profile_completion, latitude, longitude')
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
        .limit(50), // Get up to 50 recent likers
      // A dissolved match places both people on a 14-day cooldown (separate
      // from the 30-day pass window) - see dissolve_matches/match_cooldowns.
      supabase
        .from('match_cooldowns')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .gt('expires_at', new Date().toISOString())
    ]));

    const likedUserIds = uniqUuids((likedUsers || []).map(like => like.liked_id));
    const matchedUserIds = uniqUuids((matches || [])
      .map((m) => (m.user1_id === userId ? m.user2_id : m.user1_id))
      .filter(Boolean));
    const blockedUserIds = uniqUuids(blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || []);
    const passedUserIds = uniqUuids(recentPasses?.map(p => p.passed_id) || []);
    const cooldownUserIds = uniqUuids((activeCooldowns || [])
      .map((c) => (c.user1_id === userId ? c.user2_id : c.user1_id))
      .filter(Boolean));
    
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
    const thirtyDaysMs = PASS_EXPIRY_MS;
    const locallySwipedIds = uniqUuids(Array.from(locallySwipedProfileIds.current.entries())
      .filter(([_, data]) => {
        // Always exclude liked profiles
        if (data.action === 'like') return true;
        // Only exclude passed profiles if less than 30 days old
        return (now - data.timestamp) < thirtyDaysMs;
      })
      .map(([id, _]) => id));
    const excludedIds = uniqUuids([...likedUserIds, ...matchedUserIds, ...blockedUserIds, ...passedUserIds, ...cooldownUserIds, ...locallySwipedIds, userId]);
    
    const userMaxDistanceRaw = currentUserData?.max_distance ?? currentUserData?.distance_preference ?? DEFAULT_MAX_DISTANCE_KM;
    const userMaxDistance = Number(userMaxDistanceRaw);
    // CRITICAL: Free users capped at 500km max, premium users can use their full setting
    const safeUserMaxDistanceUncapped = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : DEFAULT_MAX_DISTANCE_KM;

    // CRITICAL: Use BOTH country_code AND country name as fallback for free user country filtering
    // If they disagree, trust the country name (what the user sees/sets) and fail-closed on missing.
    const baseCountryCode = getTrustedBaseCountryCode(currentUserData?.country_code, currentUserData?.country);

    const premiumForFeed = premiumActive;

    // Enforce the shared max distance cap - free users get the lower cap,
    // premium users get the much higher (but still concrete) one.
    const safeUserMaxDistance = premiumForFeed
      ? Math.min(safeUserMaxDistanceUncapped, PREMIUM_USER_MAX_DISTANCE_KM)
      : Math.min(safeUserMaxDistanceUncapped, FREE_USER_MAX_DISTANCE_KM);

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

    const hasUnlockedCountries = premiumForFeed && unlockedCountries.length > 0;


    let filteredProfiles: ProfileRow[] = [];
    let asyncActivityWeighted: ProfileRow[] | null = null;
    let usingArchivedFallback = false; // Track if we're showing archived profiles

    let localProfiles: ProfileRow[] = [];
    let intlProfiles: ProfileRow[] = [];

    // Phase 1: active users only
    
    if (premiumForFeed) {
      // STEP 1: Home country, bounded by the user's OWN distance setting.
      // Premium is no longer "whole country regardless of distance" - the
      // distance slider is the single truth for everyone, in Discover and
      // Circle alike. What premium still buys is a much larger maximum
      // radius (PREMIUM_USER_MAX_DISTANCE_KM) plus unlocked countries.
      // The radius never crosses a border: the country filter still applies.
      localProfiles = baseCountryCode
        ? await (async () => {
            const viewerLat = currentUserData?.latitude;
            const viewerLon = currentUserData?.longitude;
            const hasCoords = Number.isFinite(Number(viewerLat)) && Number.isFinite(Number(viewerLon)) && !!viewerLat && !!viewerLon;
            const radiusInDegrees = hasCoords ? safeUserMaxDistance / 111.32 : null;

            // ⭐ FAIRNESS: server-side ORDER BY feed_random_weight (a stable,
            // indexed column reshuffled once nightly via pg_cron, not a
            // fresh random() per call) - see get_random_discover_profiles.
            // RPC params travel in the POST body, not the URL, so the excluded-ids
            // list no longer needs the ~90-UUID URL-length workaround either.
            const { data: profiles, error } = await supabase.rpc('get_random_discover_profiles', {
              p_country_codes: [baseCountryCode],
              p_allowed_genders: allowedGenders,
              p_archived: false,
              p_excluded_ids: excludedIds,
              p_limit: 100,
              p_lat: radiusInDegrees != null ? viewerLat : null,
              p_lon: radiusInDegrees != null ? viewerLon : null,
              p_radius_degrees: radiusInDegrees,
            });

            if (error) throw error;
            let rows = Array.isArray(profiles) ? (profiles as unknown as ProfileRow[]) : [];

            // Precise haversine enforcement on top of the coarse box.
            if (hasCoords) {
              rows = rows.filter((p) => {
                if (!p.latitude || !p.longitude) return true;
                const dist = calculateDistance(Number(viewerLat), Number(viewerLon), p.latitude, p.longitude);
                distanceMap[p.id] = dist;
                return dist <= safeUserMaxDistance;
              });
            }

            rows.forEach((p) => (distanceMap[p.id] ??= 999));
            return rows;
          })()
        : [];

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
      const userMinAge = currentUserData?.min_age || DEFAULT_MIN_AGE;
      const userMaxAge = currentUserData?.max_age || DEFAULT_MAX_AGE;
      
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
      // Only cap the very first paint - a refill needs the whole pool this
      // call actually found, not a re-truncated slice of it.
      filteredProfiles = isRefill
        ? activityWeightedMixed
        : activityWeightedMixed.slice(0, isAndroid ? 30 : 60);


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
        // ⭐ FAIRNESS: server-side ORDER BY feed_random_weight (a stable,
        // indexed column reshuffled nightly, not a fresh random() per call)
        // within the location service's candidate set - see
        // get_random_discover_profiles. RPC
        // params travel in the POST body, so the full excluded-ids list is
        // always usable (no more ~90-UUID URL-length workaround).
        const { data: profiles, error } = await supabase.rpc('get_random_discover_profiles', {
          p_country_codes: [baseCountryCode],
          p_allowed_genders: allowedGenders,
          p_archived: false,
          p_excluded_ids: excludedIds,
          p_limit: 100,
          p_allowed_ids: locationProfileIdsForQuery,
        });

        if (error) throw error;
        filteredProfiles = Array.isArray(profiles) ? (profiles as unknown as ProfileRow[]) : [];
      } else {
        // Free users fallback: no location IDs from locationService
        // Apply bounding box distance filter if user has coordinates
        const userLat = currentUserData?.latitude;
        const userLon = currentUserData?.longitude;
        const radiusInDegrees = (userLat && userLon) ? safeUserMaxDistance / 111.32 : null;

        // ⭐ FAIRNESS: server-side ORDER BY feed_random_weight (a stable,
        // indexed column reshuffled once nightly via pg_cron, not a fresh
        // random() per call) - see get_random_discover_profiles.
        const { data: profiles, error } = await supabase.rpc('get_random_discover_profiles', {
          p_country_codes: [baseCountryCode],
          p_allowed_genders: allowedGenders,
          p_archived: false,
          p_excluded_ids: excludedIds,
          p_limit: 100,
          p_lat: userLat && userLon ? userLat : null,
          p_lon: userLat && userLon ? userLon : null,
          p_radius_degrees: radiusInDegrees,
        });

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
    // ARCHIVED MIX-IN — always attempted, capped at ~10% of the deck
    // =====================================================
    // Previously this only ran when the active pool was completely empty,
    // and then replaced it wholesale with archived (inactive 30+ days)
    // profiles - all-or-nothing, no cap. Now it always makes a small,
    // bounded attempt: when there's a healthy active pool, archived
    // profiles are mixed in lightly (~10% of the final deck) so they get
    // *some* visibility without dominating it; when the active pool is
    // genuinely empty, this is the last-resort fill and goes uncapped -
    // "show when there is no other choice," same as before. Tier 1 (gender/
    // orientation/age/distance, including the reciprocal-preference check)
    // still fully applies to archived candidates either way.
    {
      const activePoolSizeBeforeArchived = filteredProfiles.length;

      const allowedCountryCodes = Array.from(
        new Set([
          ...(baseCountryCode ? [baseCountryCode] : []),
          ...(premiumForFeed ? unlockedCountries : []),
        ])
      ).map((c) => normalizeCountryCode(String(c || ''))).filter(Boolean);

      const archivedCountryCodes = premiumForFeed && allowedCountryCodes.length > 0
        ? allowedCountryCodes
        : (baseCountryCode ? [baseCountryCode] : []);

      // Age filtering is done client-side using date_of_birth (profiles.age column doesn't exist)
      const userLat = currentUserData?.latitude;
      const userLon = currentUserData?.longitude;
      // Premium-only bug: this box used to be centered on the viewer's own
      // lat/lon while the query also pulled unlocked countries, silently
      // excluding every archived candidate from those countries - their
      // coordinates are obviously outside a radius drawn around the viewer's
      // home country, even though country_code already correctly matched
      // them. Free users aren't affected (they only ever query
      // baseCountryCode), and this mirrors how fetchUnlockedCountryProfiles
      // (the active-pool equivalent) already has no distance filter at all
      // for premium.
      const archivedRadiusInDegrees = (!premiumForFeed && baseCountryCode && userLat && userLon)
        ? safeUserMaxDistance / 111.32
        : null;

      // A small, bounded fetch is enough for a ≤10% mix-in; only the
      // last-resort (empty active pool) case needs a larger pull. Smaller
      // still on Android - this mix-in is a nice-to-have on top of an
      // already-healthy active deck, not worth extra payload on weaker
      // connections/hardware for that case specifically.
      const archivedFetchLimit = activePoolSizeBeforeArchived === 0 ? 300 : (isAndroidPlatform() ? 15 : 30);

      // This mix-in is a genuine extra network round-trip on top of the
      // already-completed active-pool fetch above - it must never be able to
      // stall the whole deck waiting on it. A short, dedicated timeout
      // (much tighter than the 15s used for the critical-path queries
      // earlier in this function) means a slow/flaky connection just skips
      // the archived mix-in for this cycle instead of delaying every card.
      // ⭐ FAIRNESS: server-side ORDER BY feed_random_weight (a stable,
      // indexed column reshuffled once nightly via pg_cron, not a fresh
      // random() per call) - see get_random_discover_profiles.
      let archivedProfiles: unknown[] | null = null;
      let archivedError: unknown = null;
      if (archivedCountryCodes.length > 0) {
        try {
          const result = await queryTimeout(
            supabase.rpc('get_random_discover_profiles', {
              p_country_codes: archivedCountryCodes,
              p_allowed_genders: allowedGenders,
              p_archived: true,
              p_excluded_ids: excludedIds,
              p_limit: archivedFetchLimit,
              p_lat: archivedRadiusInDegrees != null ? userLat : null,
              p_lon: archivedRadiusInDegrees != null ? userLon : null,
              p_radius_degrees: archivedRadiusInDegrees,
            }),
            4000
          );
          archivedProfiles = result.data;
          archivedError = result.error;
        } catch {
          // Timed out or otherwise failed - fine, this whole block is a bonus
          // on top of an already-valid active deck.
        }
      }

      if (!archivedError && archivedProfiles && archivedProfiles.length > 0) {
        let archivedCandidates: ProfileRow[] = Array.isArray(archivedProfiles) ? (archivedProfiles as unknown as ProfileRow[]) : [];

        // Same Tier 1 checks the active pool gets: exclusions, reciprocal
        // orientation, and (for free users) country/distance enforcement.
        archivedCandidates = archivedCandidates.filter((p) => !excludedIdsSet.has(p.id));
        archivedCandidates = archivedCandidates.filter((p) => matchesReciprocalPreference(currentUserData?.gender, p.preference));

        if (!premiumForFeed && baseCountryCode) {
          archivedCandidates = archivedCandidates.filter((p) => isLocalCountryForFreeUser(p, baseCountryCode));
          if (userLat && userLon) {
            archivedCandidates = archivedCandidates.filter((p) => {
              if (!p.latitude || !p.longitude) return true;
              const dist = calculateDistance(userLat, userLon, p.latitude, p.longitude);
              distanceMap[p.id] = dist;
              return dist <= safeUserMaxDistance;
            });
          }
        }

        if (premiumForFeed && allowedCountryCodes.length > 1) {
          const archivedSeed = getUserFeedSeed(userId) + '_archived';
          archivedCandidates = mixByCountryRoundRobin(
            archivedCandidates.filter((p) => allowedCountryCodes.includes(normalizeCountryCode(p.country_code || ''))),
            allowedCountryCodes,
            archivedSeed
          );
        }

        if (activePoolSizeBeforeArchived === 0) {
          // Last resort: archived IS the feed. Uncapped, and this is the one
          // case where the page-level "you're seeing inactive profiles"
          // banner (isArchivedFallback) still makes sense to show, since
          // every card on screen is archived, not just a small mix.
          archivedCandidates.forEach((p) => { p.__isArchivedMixin = true; });
          filteredProfiles = archivedCandidates;
          usingArchivedFallback = true;
        } else if (archivedCandidates.length > 0) {
          // Healthy active pool: cap so archived ends up ~10% of the
          // COMBINED total (active + archived), not 10% of the fetch.
          //
          // BUG FIX: for a small-but-nonzero active pool (e.g. 1-8 active
          // matches, common for a niche country/gender/age combo once most
          // of the small active pool has been swiped), this floor()'d down
          // to 0 - silently dropping the archived mix-in entirely on every
          // fetch cycle, even with hundreds of eligible archived candidates
          // sitting right there. That produced a near-empty deck each time
          // and made the app look "out of profiles" long before the real
          // pool was exhausted. Now falls back to a flat minimum batch
          // whenever the proportional formula would round to 0.
          const proportionalCap = Math.floor(activePoolSizeBeforeArchived * (0.10 / 0.90));
          const archivedCap = proportionalCap > 0
            ? proportionalCap
            : Math.min(archivedCandidates.length, 10);
          const cappedArchived = archivedCandidates.slice(0, archivedCap);
          cappedArchived.forEach((p) => { p.__isArchivedMixin = true; });
          filteredProfiles = [...filteredProfiles, ...cappedArchived];
          // Deliberately NOT setting usingArchivedFallback here - that flag
          // drives a page-level "showing inactive profiles" banner, which
          // would be misleading for a deck that's still ~90% active people.
          // No per-card indicator either (removed) - archived mix-ins are
          // presented identically to active profiles, by design.
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

    // TIER 1 — reciprocal orientation check. The gender filter above only
    // ever checked "does this candidate match what the viewer wants"; this
    // is the other direction, "does the candidate want the viewer back."
    // Applied here, once, after everything (premium's mixed pool, free's
    // direct pool, and the archived phase-2 fallback further above, since
    // all three write into filteredProfiles by this point) so every path
    // gets the same fix without duplicating it across every fetch branch.
    const viewerGenderForReciprocity = currentUserData?.gender;
    filteredProfiles = filteredProfiles.filter((p) => matchesReciprocalPreference(viewerGenderForReciprocity, p.preference));
    localProfiles = localProfiles.filter((p) => matchesReciprocalPreference(viewerGenderForReciprocity, p.preference));
    intlProfiles = intlProfiles.filter((p) => matchesReciprocalPreference(viewerGenderForReciprocity, p.preference));

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
      const userMinAge = currentUserData?.min_age || DEFAULT_MIN_AGE;
      const userMaxAge = currentUserData?.max_age || DEFAULT_MAX_AGE;
      
      filteredProfiles = filteredProfiles.filter(profile => {
        if (!profile.date_of_birth) return false;
        const age = calculateAge(profile.date_of_birth);
        return age >= userMinAge && age <= userMaxAge;
      });
      
      filteredProfiles = filteredProfiles.filter(profile => profile.id !== userId);
      
      // ⭐ PER-USER RANDOMIZATION: Use user-specific seed for free users too
      const freeUserSeed = getUserFeedSeed(userId);
      // Stratified sampling caps at 15*4=60 for a nice first paint - a
      // refill needs everyone this call actually found, same reasoning as
      // the premium cap above (otherwise a local pool bigger than 60 could
      // hit a false "no more profiles" the same way).
      filteredProfiles = isRefill
        ? filteredProfiles
        : getStratifiedBatches(filteredProfiles, 15, 4, freeUserSeed);

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

      const archivedRetryCountryCodes = premiumForFeed && allowedCountryCodes.length > 0
        ? allowedCountryCodes
        : (baseCountryCode ? [baseCountryCode] : []);

      const userLat = currentUserData?.latitude;
      const userLon = currentUserData?.longitude;
      // Same bug as the primary archived mix-in above: this box used to be
      // centered on the viewer's own coordinates, so applying it while also
      // querying unlocked countries silently excluded every archived
      // candidate from those countries. This is the true last-resort fetch
      // (runs only when the pool is genuinely empty), so this was the main
      // reason a premium user with unlocked countries could still hit "No
      // more profiles" despite a large archived pool existing in those
      // countries.
      const archivedRetryRadiusInDegrees = (!premiumForFeed && baseCountryCode && userLat && userLon)
        ? safeUserMaxDistance / 111.32
        : null;

      // ⭐ FAIRNESS: server-side ORDER BY feed_random_weight (a stable,
      // indexed column reshuffled once nightly via pg_cron, not a fresh
      // random() per call) - see get_random_discover_profiles.
      const { data: archivedRetryRows, error: archivedRetryError } = archivedRetryCountryCodes.length > 0
        ? await supabase.rpc('get_random_discover_profiles', {
            p_country_codes: archivedRetryCountryCodes,
            p_allowed_genders: allowedGenders,
            p_archived: true,
            p_excluded_ids: excludedIds,
            p_limit: 50,
            p_lat: archivedRetryRadiusInDegrees != null ? userLat : null,
            p_lon: archivedRetryRadiusInDegrees != null ? userLon : null,
            p_radius_degrees: archivedRetryRadiusInDegrees,
          })
        : { data: [], error: null };

      if (!archivedRetryError && archivedRetryRows && archivedRetryRows.length > 0) {
        filteredProfiles = Array.isArray(archivedRetryRows) ? (archivedRetryRows as unknown as ProfileRow[]) : [];
        // This retry only ever fires when the pool is genuinely empty at
        // this point (the guard above), so - same as the primary archived
        // mix-in's empty-pool branch - it's an uncapped last resort, and the
        // page-level "showing inactive profiles" banner is warranted.
        filteredProfiles.forEach((p) => { p.__isArchivedMixin = true; });
        usingArchivedFallback = true;

        // This fetch runs after the shared reciprocal-preference filter
        // point above (it populates filteredProfiles fresh, bypassing it),
        // so it needs its own pass - same Tier 1 guarantee as every other
        // source of candidates.
        filteredProfiles = filteredProfiles.filter((p) => matchesReciprocalPreference(currentUserData?.gender, p.preference));

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

    // TIER 2 — compatibility scoring. Biases the deck toward people who
    // share interests and/or sit close on the personality sliders with the
    // viewer, plus a soft distance preference - without collapsing it into a
    // rigid "best score first" sort (see applyCompatibilityWeighting's own
    // docblock for why: that would fight the fairness/variety machinery
    // above it, showing the same top-scoring handful to everyone). Runs
    // last, right before the liked-you injection, since it's meant to be
    // the finest-grained reorder on top of the pool composition the earlier
    // steps (country mix, age-bucket stratification, recency) established.
    //
    // A candidate never gets scored down for silence: interests/personality
    // components only ever fire when BOTH the viewer and that candidate
    // show real signal (see matchScoring.ts for exactly why - in this
    // schema, an empty/default value can't be told apart from "never
    // touched," so treating it as a score of zero would incorrectly
    // penalize people, not just skip them).
    //
    // Archived-mixin candidates are deliberately excluded from this scoring
    // pass and appended after it, always. Caught this by actually running
    // the feed end-to-end: a nearby archived profile's distance-decay score
    // alone was enough to land it in the "high compatibility" bucket -
    // meaning it could jump to the very FRONT of the deck, directly
    // contradicting "active always fills first, archived only fills gaps."
    // Tier 2 has no opinion on activity/staleness, so it can't be trusted to
    // preserve that ordering on its own.
    //
    // ⭐ STABILITY FIX: when a saved order was restored, only run this scoring
    // pass over the newly-appended profiles (people not in yesterday/earlier's
    // saved order) - never over the already-ordered prefix. A seeded shuffle is
    // only stable against its ORIGINAL input; feeding it its own prior output
    // (which restoring-then-rescoring effectively does, every single reload)
    // produces a genuinely different permutation each time even with an
    // identical seed, because Fisher-Yates walks the array's current order,
    // not some seed-derived absolute position. That was silently reshuffling
    // the whole deck - including the card currently on top - on every
    // refresh/relaunch, even though nothing had been swiped. Restricting
    // rescoring to only the unordered tail keeps the already-decided prefix
    // byte-for-byte identical across reloads, so the top card only ever
    // changes because it was actually swiped.
    const previouslyOrderedIds = new Set(savedOrderIds);
    const applyCompatWeighting = (pool: typeof shuffled, seedSuffix: string) => {
      const archivedMixin = pool.filter((p) => p.is_archived);
      const activePool = pool.filter((p) => !p.is_archived);
      const weightedActive = applyCompatibilityWeighting(
        activePool,
        {
          interests: currentUserData?.interests,
          introvert_extrovert: currentUserData?.introvert_extrovert,
          spontaneous_planner: currentUserData?.spontaneous_planner,
          messy_organized: currentUserData?.messy_organized,
        },
        distanceMap,
        `${shuffleSeed}${seedSuffix}`
      );
      return [...weightedActive, ...archivedMixin];
    };

    if (savedOrderValid) {
      const alreadyOrdered = shuffled.filter((p) => previouslyOrderedIds.has(p.id));
      const freshlyAdded = shuffled.filter((p) => !previouslyOrderedIds.has(p.id));
      shuffled = [...alreadyOrdered, ...applyCompatWeighting(freshlyAdded, '_compat_new')];
    } else {
      shuffled = applyCompatWeighting(shuffled, '_compat');
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

    // NOTE: "liked you" reveals used to also be injected here, baked directly
    // into this per-day persisted deck order (capped at 15% of the feed, in
    // fixed deck-position intervals). That ran independently of - and on top
    // of - the live per-swipe reveal schedule in useLikeBackInjection.ts,
    // making actual reveal frequency unpredictable and impossible to reason
    // about as one coherent rate. Reveals are now handled by exactly one
    // mechanism: the decaying swipe-based schedule in useLikeBackInjection.ts
    // (2 reveals in the first 20 swipes, 1 in the next 20, 1 in the next 30,
    // tapering further from there).

    // ⭐ PROFILE POSITION PERSISTENCE: Resume from last viewed profile
    const startIndex = resolveResumeIndex(shuffled, userId);

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
        .select('user_id, image_url, image_order, label, caption')
        .in('user_id', firstEightIds)
        .eq('is_approved', true)
          .neq('image_order', -1)
        .order('user_id', { ascending: true })
        .order('image_order', { ascending: true });

      if (!imgError && imageRows) {
        mergeImageCaptions(imageRows);
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
  }, [premiumActive, currentUser, fetchUnlockedCountryProfiles, mergeImageCaptions]);

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

  // Companion to the effect above that writes `driplove_last_card_images_*` -
  // read back on the cache-restore path so the very first paint after a
  // relaunch doesn't have to wait on a network round trip for photo URLs.
  const readLastCardImagesCache = useCallback((userId: string): { [key: string]: string[] } | null => {
    try {
      const raw = localStorage.getItem(`driplove_last_card_images_${userId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; images: { [key: string]: string[] } };
      if (!parsed?.ts || !parsed?.images) return null;
      if (Date.now() - parsed.ts > DISCOVER_DECK_CACHE_TTL_MS) return null;
      return parsed.images;
    } catch {
      return null;
    }
  }, [DISCOVER_DECK_CACHE_TTL_MS]);

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

      // Once every weighted profile has been placed, later slots must keep
      // their original card instead of reusing the last one - the previous
      // version kept `realIdx` pinned at `weightedReal.length - 1` forever,
      // which meant the same single profile got assigned to EVERY remaining
      // slot in the deck once the (usually much shorter) weighted list ran
      // out. That's the literal duplicate-card-every-swipe bug: the deck
      // looked huge, but most of it was one repeated person.
      let realIdx = 0;
      return deck.map((item) => {
        if (isAd(item)) return item;
        if (preservedIds.has(item.id)) return item;
        if (realIdx >= weightedReal.length) return item;
        const nextProfile = weightedReal[realIdx];
        realIdx += 1;
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

        // Captured from inside the setState updater below so the deck cache
        // write further down persists what's ACTUALLY in React state (the
        // resumed card preserved at the front by the merge branch), not
        // `initialDeck` - this fetch's own raw/trimmed result. Writing
        // `initialDeck` here used to be the deeper half of the resume bug:
        // a background refresh's random sample often doesn't happen to
        // include the profile the user was actually looking at, so its own
        // resume-index calc lands on 0 for a totally different profile -
        // caching THAT (while React's live state correctly still showed the
        // real resumed card, since the merge preserves `prev`'s front)
        // poisoned the very next reload, which reads the cache fresh with
        // no live state to protect it.
        let deckForCache: MatchOrAd[] = initialDeck;
        setPotentialMatches(prev => {
          // ⭐ CRITICAL: Always filter against locally swiped profiles to prevent repetition
          const swipedIds = locallySwipedProfileIds.current;
          const now = Date.now();
          const thirtyDaysMs = PASS_EXPIRY_MS;

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

          const merged = prev.length === 0
            ? filterSwiped(initialDeck)
            : mergeDecksWithoutProfileDupes(prev, matchesWithAds, swipedIds);
          deckForCache = merged;
          return merged;
        });
        // Merge (not replace) userImages: this fetch's `images` map only covers
        // its OWN freshly-shuffled top-4 profiles. On a background cache-refresh
        // (opts?.background === true, fired right after a cold-start cache
        // restore), the resumed/current profile almost never lands in that
        // top-4, so a full replace here was wiping out image data the
        // cache-restore preload effect had just loaded for it - leaving the
        // resumed card's photos blank until the user swiped away (at which
        // point a different preload path takes over). Merging preserves
        // already-loaded images for every other profile while still applying
        // this fetch's own results; on a true first load `prev` is empty so
        // merge and replace are equivalent.
        setUserImages(prev => ({ ...prev, ...images }));
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
        Object.entries(images).forEach(([, imageUrls], index) => {
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
          writeDeckCache(cacheKeyForWrite, deckForCache);
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
        type UserImageRow = { user_id: string; image_url: string; image_order: number | null; label?: string | null; caption?: string | null };

        const { data: imageRows } = await supabase
          .from('user_images')
          .select('user_id, image_url, image_order, label, caption')
          .in('user_id', idsToLoad)
          .eq('is_approved', true)
          .neq('image_order', -1)
          .order('user_id', { ascending: true })
          .order('image_order', { ascending: true })
          .returns<UserImageRow[]>();

        if (imageRows) mergeImageCaptions(imageRows);

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
  }, [mergeImageCaptions]);

  // Force refresh function for preference changes
  const forceRefresh = useCallback(() => {
    if (!currentUser?.id) return;

    // Reset the initialized ref to force re-initialization
    initializedUserRef.current = null;

    // Reset deck state
    fetchSequenceRef.current += 1;
    revokeAllBlobUrls();
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
  }, [currentUser?.id, revokeAllBlobUrls]);

  // Self-heal when client cache/pagination gets stuck on a false empty
  // state. Cooldown-gated, not one-shot: it used to permanently disable
  // itself after firing once per user/premium-status change, so on a long
  // swiping session, the FIRST "no more profiles" of the session could
  // self-heal correctly, but any later one (even minutes afterward, even
  // with a huge archived/unlocked-country pool genuinely still available)
  // would never get checked again - directly working against "keep loading
  // until they truly run out." A cooldown lets it re-check as many times
  // as the user actually hits empty, while still preventing tight loops.
  const lastEmptyStateRecoveryAtRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A genuine, always-changing dependency to force the effect below to
  // re-run on a timer - toggling noMoreProfiles false-then-true in the same
  // tick wouldn't work here, since React 18 batches synchronous state
  // updates and would just compute the same end value (true) it started
  // with, seeing no change at all.
  const [emptyStateRetryTick, setEmptyStateRetryTick] = useState(0);
  const EMPTY_STATE_RECOVERY_COOLDOWN_MS = 15_000;
  useEffect(() => {
    lastEmptyStateRecoveryAtRef.current = 0;
  }, [currentUser?.id, premiumActive]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!hasCompletedInitialFetch) return;
    if (!noMoreProfiles) return;
    if (potentialMatches.length > 0) return;
    const now = Date.now();
    if (now - lastEmptyStateRecoveryAtRef.current < EMPTY_STATE_RECOVERY_COOLDOWN_MS) return;

    lastEmptyStateRecoveryAtRef.current = now;
    let isCancelled = false;

    const runRecovery = async () => {
      // 1) Direct DB sanity query (bypass local cache/deck state).
      // If DB has valid candidates, immediately repopulate instead of showing empty.
      try {
        const userId = currentUser.id;
        const userPref = currentUser.preference || 'everyone';
        const allowedGendersForRecovery = getGenderFilter(userPref);

        const [{ data: currentUserData }, likesRes, matchesRes, blocksRes, passesRes, cooldownsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('max_distance, distance_preference, country, country_code, min_age, max_age, latitude, longitude, unlocked_countries')
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
          supabase
            .from('match_cooldowns')
            .select('user1_id, user2_id')
            .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
            .gt('expires_at', new Date().toISOString()),
        ]);

        if (!isCancelled && currentUserData) {
          const baseCountryCode = getTrustedBaseCountryCode(currentUserData.country_code, currentUserData.country);
          const maxDistanceRaw = Number(currentUserData.max_distance ?? currentUserData.distance_preference ?? DEFAULT_MAX_DISTANCE_KM);
          // BUG FIX: this recovery pass capped distance at the free-tier limit
          // unconditionally, same class of bug as the country-code fix above -
          // a premium user's recovery query was silently narrowed to the free
          // distance cap even though the main fetch respects their real one.
          const distanceCapForRecovery = premiumActive ? PREMIUM_USER_MAX_DISTANCE_KM : FREE_USER_MAX_DISTANCE_KM;
          const maxDistance = Number.isFinite(maxDistanceRaw) && maxDistanceRaw > 0 ? Math.min(maxDistanceRaw, distanceCapForRecovery) : DEFAULT_MAX_DISTANCE_KM;
          const minAge = Number(currentUserData.min_age ?? DEFAULT_MIN_AGE);
          const maxAge = Number(currentUserData.max_age ?? DEFAULT_MAX_AGE);
          // BUG FIX: this whole recovery pass used to be written as if every
          // user were free - hardcoded to baseCountryCode only, active
          // profiles only, and a distance box centered on the viewer's own
          // coordinates applied unconditionally. For a premium user with
          // unlocked countries, that silently hid every candidate from
          // those countries (and every archived one everywhere) right at
          // the one check that's supposed to catch a false "no more
          // profiles" - so it never could. Same allowedCountryCodes/gating
          // pattern used by the main fetch above.
          const allowedCountryCodes = Array.from(
            new Set([
              ...(baseCountryCode ? [baseCountryCode] : []),
              ...(premiumActive ? normalizeCountryCodeList(currentUserData.unlocked_countries, baseCountryCode) : []),
            ])
          ).map((c) => normalizeCountryCode(String(c || ''))).filter(Boolean);

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
          (cooldownsRes.data || []).forEach((c) => {
            const other = c.user1_id === userId ? c.user2_id : c.user1_id;
            if (other) excluded.add(other);
          });

          // Swipes are optimistic: the deck removes a card immediately and persists
          // the like/pass to the DB in the background afterward. This query only
          // knows about DB-persisted swipes, so without also checking this local,
          // in-memory record, a profile swiped moments ago (whose write hasn't
          // landed yet) would get pulled right back into the deck it was just
          // removed from - showing up as if the swipe never happened.
          const now = Date.now();
          const thirtyDaysMs = PASS_EXPIRY_MS;
          const locallyExcluded = new Set<string>();
          for (const [id, data] of locallySwipedProfileIds.current.entries()) {
            if (data.action === 'like' || (now - data.timestamp) < thirtyDaysMs) {
              locallyExcluded.add(id);
            }
          }

          const runRecoveryQuery = async (archived: boolean): Promise<ProfileRow[]> => {
            const recoveryCountryCodes = premiumActive && allowedCountryCodes.length > 0
              ? allowedCountryCodes
              : (baseCountryCode ? [baseCountryCode] : []);
            if (recoveryCountryCodes.length === 0) return [];

            // Distance is a free-tier concept only - premium browses unlocked
            // countries with no radius, same as the main fetch's international path.
            const recoveryRadiusInDegrees = (!premiumActive && currentUserData.latitude && currentUserData.longitude)
              ? maxDistance / 111.32
              : null;

            // ⭐ FAIRNESS: server-side ORDER BY feed_random_weight (a stable,
            // indexed column reshuffled once nightly via pg_cron, not a
            // fresh random() per call) - see get_random_discover_profiles.
            // RPC params travel in the POST body, so the full exclusion set is
            // always usable here too (no more ~90-id URL-length cap).
            const { data: rows } = await supabase.rpc('get_random_discover_profiles', {
              p_country_codes: recoveryCountryCodes,
              p_allowed_genders: allowedGendersForRecovery,
              p_archived: archived,
              p_excluded_ids: Array.from(excluded),
              p_limit: 200,
              p_lat: recoveryRadiusInDegrees != null ? currentUserData.latitude : null,
              p_lon: recoveryRadiusInDegrees != null ? currentUserData.longitude : null,
              p_radius_degrees: recoveryRadiusInDegrees,
            });
            return (Array.isArray(rows) ? (rows as ProfileRow[]) : [])
              .filter((p) => {
                // Final guard for large exclusion lists (liked/matched/passed/blocked).
                if (excluded.has(p.id)) return false;
                if (locallyExcluded.has(p.id)) return false;
                if (!matchesReciprocalPreference(currentUser.gender, p.preference)) return false;
                if (premiumActive) {
                  const cc = normalizeCountryCode(p.country_code || '');
                  if (!cc || !allowedCountryCodes.includes(cc)) return false;
                } else {
                  if (!baseCountryCode) return false;
                  if (!isLocalCountryForFreeUser(p, baseCountryCode)) return false;
                }
                if (!p.date_of_birth) return false;
                const age = calculateAge(p.date_of_birth);
                if (!Number.isFinite(age) || age < minAge || age > maxAge) return false;
                if (!premiumActive && currentUserData.latitude && currentUserData.longitude && p.latitude && p.longitude) {
                  const d = calculateDistance(currentUserData.latitude, currentUserData.longitude, p.latitude, p.longitude);
                  if (d > maxDistance) return false;
                }
                return true;
              });
          };

          // Active pool first; only reach for archived if active is genuinely empty -
          // same tiering the rest of Discover uses, which this recovery pass
          // previously skipped entirely (it only ever checked is_archived = false).
          let recoveredRows = await runRecoveryQuery(false);
          if (!isCancelled && recoveredRows.length === 0) {
            recoveredRows = await runRecoveryQuery(true);
          }

          const recoveredProfiles = recoveredRows.map((p) => toPotentialMatch(p, { images: [] }));

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
      // show right now, so settle into the exhausted empty state rather than
      // calling forceRefresh() — which would reset hasCompletedInitialFetch→false
      // and isLoading→true and could stall forever if the re-triggered fetch
      // never completes (e.g. for users who truly have 0 eligible profiles).
      locallySwipedProfileIds.current.clear();
      setNoMoreProfiles(true);
      setEmptyStateMode('exhausted');
      setIsLoading(false);
      // hasCompletedInitialFetch stays true so the UI renders the empty state
      // card instead of the spinner.

      // Keep checking, on the same cooldown, instead of going silent forever.
      // setNoMoreProfiles(true) above is a no-op re-render when it's already
      // true (React bails out on an unchanged boolean), so without this timer
      // nothing would ever re-run this effect again once genuinely empty -
      // "no more profiles" would stick even if a candidate becomes eligible
      // moments later (someone else's account/like activity, a swipe elsewhere
      // freeing a slot, etc.), only fixable by the user manually refreshing.
      retryTimerRef.current = setTimeout(() => {
        if (isCancelled) return;
        lastEmptyStateRecoveryAtRef.current = 0; // allow the next run immediately
        setEmptyStateRetryTick((t) => t + 1);
      }, EMPTY_STATE_RECOVERY_COOLDOWN_MS);
    };

    void runRecovery();

    return () => {
      isCancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
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
    emptyStateRetryTick,
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
      const thirtyDaysMs = PASS_EXPIRY_MS;
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
        const thirtyDaysMs = PASS_EXPIRY_MS;
        const swipedToExclude = new Set<string>();
        
        for (const [id, data] of locallySwipedProfileIds.current.entries()) {
          // Always exclude liked profiles, exclude passed profiles if less than 30 days old
          if (data.action === 'like' || (now - data.timestamp) < thirtyDaysMs) {
            swipedToExclude.add(id);
          }
        }
        
        const keyForStorage = buildDeckCacheKey(cacheKey);
        
        // Calculate max distance, capped at the shared per-tier limit
        const userMaxDistanceForCache = currentUser.max_distance || currentUser.distance_preference || 500;
        const freeUserMaxDistance = premiumActive
          ? Math.min(userMaxDistanceForCache, PREMIUM_USER_MAX_DISTANCE_KM)
          : Math.min(userMaxDistanceForCache, FREE_USER_MAX_DISTANCE_KM);
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
          // ⭐ INSTANT LOAD: Use filtered cached deck for immediate display.
          // Codebase-wide invariant: currentIndex is always 0 - "resuming"
          // means trimming the array so the resumed profile IS index 0, not
          // pointing an index into an untrimmed array. Every background
          // refresh after this (see fetchPotentialMatches below) unconditionally
          // resets currentIndex to 0 once it merges in fresh data, so leaving
          // this at a non-zero position (as a previous version of this fix
          // did) meant that very next background refresh silently swapped
          // the visible card out from under the user - "0" then pointed at
          // a completely different profile in the newly-merged array.
          const resumeIndex = resolveResumeIndex(filteredCachedDeck, currentUser.id);
          const resumedDeck = resumeIndex > 0 ? filteredCachedDeck.slice(resumeIndex) : filteredCachedDeck;
          setPotentialMatches(resumedDeck);
          setCurrentIndex(0);
          setImageIndex(0);
          setIsLoading(false);
          setHasCompletedInitialFetch(true);

          // The deck itself is cached, but `userImages` never is - it starts
          // empty on every fresh mount (cold app restart, most reliably).
          // The background refresh below fetches its OWN random top-4
          // profiles' images, which essentially never happens to include
          // the resumed card, so waiting on it left the resumed photo blank
          // for however long that whole re-fetch pipeline took (~5s), then
          // often landing outside its top-2 anyway and getting capped at a
          // single image instead of the full set.
          //
          // First, paint instantly with zero network wait from the small
          // last-seen-cards cache (written by the effect near userImagesRef)
          // if it has these exact profiles - then still fetch live in the
          // background afterward so a since-changed photo set self-corrects.
          const lastCardImages = readLastCardImagesCache(currentUser.id);
          if (lastCardImages) {
            const instant: { [key: string]: string[] } = {};
            for (const p of resumedDeck.slice(0, 2)) {
              if (!isAd(p) && lastCardImages[p.id]?.length) instant[p.id] = lastCardImages[p.id];
            }
            if (Object.keys(instant).length > 0) {
              setUserImages(prev => ({ ...instant, ...prev }));
            }
          }

          const resumedProfile = resumedDeck[0];
          const upNextProfile = resumedDeck[1];
          if (resumedProfile && !isAd(resumedProfile) && !userImagesRef.current[resumedProfile.id]?.length) {
            loadAllImagesForProfile(resumedProfile.id).then(imgs => {
              if (imgs && imgs.length > 0) {
                setUserImages(prev => ({ ...prev, [resumedProfile.id]: imgs }));
                preloadImages(imgs.slice(0, 3), 'high');
                if (imgs.length > 3) preloadImages(imgs.slice(3), 'low');
              }
            });
          }
          if (upNextProfile && !isAd(upNextProfile) && !userImagesRef.current[upNextProfile.id]?.length) {
            loadAllImagesForProfile(upNextProfile.id).then(imgs => {
              if (imgs && imgs.length > 0) {
                setUserImages(prev => ({ ...prev, [upNextProfile.id]: imgs }));
                preloadImages(imgs.slice(0, 2), 'medium');
              }
            });
          }

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
    loadAllImagesForProfile,
    preloadImages,
    readLastCardImagesCache,
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
    lastPushedDirRef.current = null;
    lastPushedDistRef.current = 0;
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
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        // The drag may have ended (and an exit animation started) between this
        // frame being scheduled and it running. Writing the transform now would
        // stomp the exit transform and snap the card back to center.
        if (!isDraggingRef.current) {
          rafScheduledRef.current = false;
          return;
        }
        const d = latestDeltaRef.current;
        const dy = latestDeltaYRef.current;
        // Write the transform straight to the DOM first, ahead of the state update
        // below - this always lands this frame regardless of how long the rest of
        // this page takes to re-render, which is what keeps the card itself glued
        // to the finger even when the (much larger) surrounding re-render lags on
        // slower Android hardware.
        if (cardElRef.current) {
          cardElRef.current.style.transform = `translate3d(${d}px, ${dy}px, 0) rotate(${d * 0.06}deg) scale(1)`;
        }
        // Android smoothness: the transform above is already on screen this frame.
        // The React state below only drives the Nope/Yep overlays, so push it in
        // coarse steps (every ~16px, or when the direction flips) instead of every
        // frame — a full re-render of this very large page on every touchmove is
        // what made Android drags stutter.
        const dir: 'left' | 'right' = d > 0 ? 'right' : 'left';
        const dist = Math.abs(d);
        if (
          dir !== lastPushedDirRef.current ||
          Math.abs(dist - lastPushedDistRef.current) > 16
        ) {
          lastPushedDirRef.current = dir;
          lastPushedDistRef.current = dist;
          setSwipeUI(prev => ({ ...prev, dragOffset: d, dragOffsetY: dy, swipeDistance: dist, swipeDirection: dir }));
        }
        rafScheduledRef.current = false;
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    lastPushedDirRef.current = null;
    lastPushedDistRef.current = 0;
    setSwipeUI(prev => ({ ...prev, isDragging: false }));

    const changedTouch = e.changedTouches && e.changedTouches[0];
    const endX = changedTouch ? changedTouch.clientX : currentXRef.current;

    const deltaX = endX - startXRef.current;
    const screenWidth = window.innerWidth;

    // Swipe threshold
    const SWIPE_RATIO = 0.25;
    const minSwipeDistance = Math.min(screenWidth * SWIPE_RATIO, 120);

    // Reset visual smear and kill any frame still queued from the drag — if it ran
    // after this point it would overwrite the exit transform below.
    latestDeltaRef.current = 0;
    latestDeltaYRef.current = 0;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    rafScheduledRef.current = false;
    setSwipeUI(prev => ({ ...prev, dragOffset: 0, dragOffsetY: 0, swipeDistance: 0 }));

    if (Math.abs(deltaX) > minSwipeDistance) {
      const dir: 'left' | 'right' = deltaX > 0 ? 'right' : 'left';
      // Drive the fly-away straight on the element too. The card's live transform was
      // written imperatively during the drag, so React's own style update alone can be
      // skipped or land a frame late — which is what made the card spring back to
      // center before vanishing instead of continuing off-screen the way it was thrown.
      if (cardElRef.current) {
        const exitX = dir === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5;
        const exitY = window.innerHeight * 0.3;
        const rotation = dir === 'right' ? 24 : -24;
        cardElRef.current.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
        cardElRef.current.style.transform = `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg) scale(0.55)`;
      }
      // Trigger exit animation
      setExitDirection(dir);
      setExitingCard(true);
      setSwipeUI(prev => ({ ...prev, swipeDirection: null }));

      // Wait for animation to complete before executing action
      setTimeout(() => {
        if (deltaX > 0) {
          handleLike();
        } else {
          handlePass();
        }
        // Snap the (reused) card element back to center with no transition, so the
        // next profile appears in place instead of flying in from off-screen.
        if (cardElRef.current) {
          cardElRef.current.style.transition = 'none';
          cardElRef.current.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
        }
        setExitingCard(false);
        setExitDirection(null);
      }, 400); // Animation duration
    } else {
      // Below threshold: spring back to center from wherever the finger left it.
      if (cardElRef.current) {
        cardElRef.current.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
        cardElRef.current.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
      }
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
    lastPushedDirRef.current = null;
    lastPushedDistRef.current = 0;
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
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (!isDraggingRef.current) {
            rafScheduledRef.current = false;
            return;
          }
          const d = latestDeltaRef.current;
          const dy = latestDeltaYRef.current;
          if (cardElRef.current) {
            cardElRef.current.style.transform = `translate3d(${d}px, ${dy}px, 0) rotate(${d * 0.06}deg) scale(1)`;
          }
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
      lastPushedDirRef.current = null;
      lastPushedDistRef.current = 0;
      setSwipeUI(prev => ({ ...prev, isDragging: false }));
      // compute final deltas
      const deltaX = ev.clientX - startXRef.current;

      // Swipe threshold
      const minSwipeDistance = 80;
      // Reset visual smear and cancel any frame still queued from the drag
      latestDeltaRef.current = 0;
      latestDeltaYRef.current = 0;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      rafScheduledRef.current = false;
      setSwipeUI(prev => ({ ...prev, dragOffset: 0, dragOffsetY: 0, swipeDistance: 0, swipeDirection: null }));
      if (Math.abs(deltaX) > minSwipeDistance) {
        const dir: 'left' | 'right' = deltaX > 0 ? 'right' : 'left';
        if (cardElRef.current) {
          const exitX = dir === 'right' ? window.innerWidth * 1.5 : -window.innerWidth * 1.5;
          const exitY = window.innerHeight * 0.3;
          const rotation = dir === 'right' ? 24 : -24;
          cardElRef.current.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
          cardElRef.current.style.transform = `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg) scale(0.55)`;
        }
        // Trigger exit animation
        setExitDirection(dir);
        setExitingCard(true);

        // Wait for animation to complete before executing action
        setTimeout(() => {
          if (deltaX > 0) handleLike(); else handlePass();
          if (cardElRef.current) {
            cardElRef.current.style.transition = 'none';
            cardElRef.current.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
          }
          setExitingCard(false);
          setExitDirection(null);
        }, 400); // Animation duration
      } else if (cardElRef.current) {
        cardElRef.current.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
        cardElRef.current.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
      }
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  };
  
  // Note: mousemove/mouseup handling is wired globally from mouseDown to ensure robust behavior

  const handleImageAreaClick = () => {
    // Prevent swipe action if dragging occurred
    if (Math.abs(swipeUI.dragOffset) > 10) return;

    // This function is mainly a compatibility shim - slide navigation lives inside MatchCard
  };

  // Function to load more matches when running low - optimized for 5 at a time
  const loadMoreMatches = useCallback(async (hasRemainingCards: boolean = false) => {
    if (!currentUser?.id || isLoadingMore) return;

    try {
      setIsLoadingMore(true);

      // ✅ Refill should use the *same* eligibility rules as the initial fetch.
      // We call the shared fetch routine, then append only *new* profiles (deduped).
      const result = await fetchPotentialMatchesData(currentUser.id, allowedGenders, { isRefill: true });
      if (!result) return;

      const { matches, images, distances } = result;

      // BUG FIX: this is called proactively while the user still has real
      // cards on screen (both the "≤25/14 remaining" effect below and the
      // per-swipe "≤5 remaining" trigger call this as a background prefetch,
      // not a last resort). fetchPotentialMatchesData can itself flip
      // noMoreProfiles(true) internally when ITS query comes back empty -
      // but an empty background-prefetch attempt does NOT mean the deck is
      // exhausted, since there are still cards left to swipe through. Setting
      // that flag here used to permanently block every future refill attempt
      // (both triggers below early-return on `noMoreProfiles`), so a single
      // failed background fetch would silently stop all further background
      // loading for the rest of the session - the user would coast through
      // their remaining cards with zero retries, then hit a hard "no more
      // profiles" wall the moment the deck actually reached 0, undoing the
      // whole point of prefetching early. Now: while real cards remain, a
      // failed attempt just no-ops (the cooldown lets the next trigger try
      // again) instead of latching the app into a false exhausted state.
      if (hasRemainingCards) {
        setNoMoreProfiles(false);
      }

      // CRITICAL FIX: Don't set noMoreProfiles if we got results but they're duplicates
      // This happens when the query returns profiles we already have
      // Instead, only set noMoreProfiles if the DB returned 0 profiles at all
      if (matches.length === 0) {
        if (!hasRemainingCards) {
          // Truly no profiles available from DB, and the deck is genuinely
          // empty right now - this is the real last-resort case.
          setNoMoreProfiles(true);
          setEmptyStateMode('exhausted');
        }
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
        const retryResult = await fetchPotentialMatchesData(currentUser.id, allowedGenders, { isRefill: true });
        if (!retryResult || retryResult.matches.length === 0) {
          setEmptyStateMode('exhausted');
          return;
        }

        const retryNewProfiles = retryResult.matches.filter((m) => !existingProfileIds.has(m.id));
        refillChunk = retryNewProfiles.slice(0, refillChunkSize);

        if (refillChunk.length === 0) {
          setEmptyStateMode('exhausted');
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

    // remainingReal is always > 0 here (the length===0 guard above already
    // returned) - this is always a background prefetch with real cards still
    // on screen, never the true last-resort case.
    loadMoreMatches(true);
  }, [potentialMatches, currentIndex, isLoadingMore, hasCompletedInitialFetch, noMoreProfiles, loadMoreMatches]);

  // ⭐ SWIPE FATIGUE RESCUE (Mechanism B): Inject active profiles after long
  // no-match streaks. This prevents user fatigue and increases retention
  // (Tinder-style behavior). Trigger (8-swipe no-match streak, 3-minute
  // cooldown) and the 72h activity gate are unchanged - both were already
  // the right behavior. What's new: previously, if the in-memory deck
  // didn't happen to have at least 5 remaining profiles, this bailed out
  // entirely and did nothing, even if the viewer had plenty of eligible
  // (active, liked-me) candidates that just weren't loaded into the deck
  // yet. Now it expands the pool with a small, targeted DB fetch for those
  // specific missing likers when the in-memory eligible count is low.
  useEffect(() => {
    // Early exit conditions - these are lightweight checks
    if (noMatchStreak < FATIGUE_RESCUE_THRESHOLD) return;
    if (potentialMatches.length === 0) return;
    if (isArchivedFallback) return;

    const now = Date.now();
    if (now - lastRescueRef.current < RESCUE_COOLDOWN_MS) return;

    const remainingProfiles = potentialMatches
      .slice(currentIndex)
      .filter((p): p is PotentialMatch => !isAd(p));

    if (remainingProfiles.length === 0) return;

    const todaySeed = todayStr();
    const likedMeSet = new Set(usersWhoLikedMeIds);
    const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
    const isActiveWithin72h = (p: PotentialMatch): boolean => {
      if (!p.last_login_at) return false;
      const lastActiveMs = new Date(p.last_login_at).getTime();
      return Number.isFinite(lastActiveMs) && (Date.now() - lastActiveMs) <= SEVENTY_TWO_HOURS_MS;
    };
    const eligibleInMemoryLikers = remainingProfiles.filter((p) => likedMeSet.has(p.id) && isActiveWithin72h(p));

    const runRescue = async () => {
      let candidatePool = remainingProfiles;

      if (eligibleInMemoryLikers.length < 5 && likedMeSet.size > 0 && currentUser?.id) {
        const inMemoryIds = new Set(remainingProfiles.map((p) => p.id));
        const missingLikerIds = Array.from(likedMeSet).filter((id) => !inMemoryIds.has(id));

        // Same country rule as every other candidate source in this file:
        // premium = home + unlocked countries, free = home country only
        // (further distance-capped below). A liker outside that set must
        // never surface here just because they liked the viewer first -
        // country/plan restrictions apply regardless of which mechanism
        // found the candidate.
        const rescueBaseCountryCode = getTrustedBaseCountryCode(currentUser?.country_code, currentUser?.country);
        const rescueUnlockedCountries = premiumActive
          ? normalizeCountryCodeList(currentUser?.unlocked_countries, rescueBaseCountryCode)
          : [];
        const rescueAllowedCountryCodes = Array.from(new Set([
          ...(rescueBaseCountryCode ? [rescueBaseCountryCode] : []),
          ...rescueUnlockedCountries,
        ])).filter(Boolean);

        if (missingLikerIds.length > 0 && rescueAllowedCountryCodes.length > 0) {
          const nowTs = Date.now();
          const thirtyDaysMs = PASS_EXPIRY_MS;
          const locallyExcluded = new Set<string>();
          for (const [id, data] of locallySwipedProfileIds.current.entries()) {
            if (data.action === 'like' || (nowTs - data.timestamp) < thirtyDaysMs) locallyExcluded.add(id);
          }
          const fetchIds = missingLikerIds.filter((id) => !locallyExcluded.has(id)).slice(0, 50);

          if (fetchIds.length > 0) {
            try {
              // Bounded the same way as the other bonus-on-top-of-a-valid-
              // deck fetches in this file: this expansion should never be
              // able to hold up the rescue effect on a slow connection.
              const { data: freshRows } = await Promise.race([
                supabase
                  .from('profiles')
                  .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, favorites, gender, preference, max_distance, distance_preference, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at, last_login_at, is_verified, height_cm, languages, family_plans, communication_style, love_style, pets, social_media')
                  .in('id', fetchIds)
                  .in('country_code', rescueAllowedCountryCodes)
                  .eq('account_status', 'active')
                  .eq('is_admin', false)
                  .eq('is_archived', false),
                new Promise<{ data: null }>((_, reject) => setTimeout(() => reject(new Error('rescue expansion timeout')), 3000)),
              ]);

              const rescueUserLat = currentUser?.latitude;
              const rescueUserLon = currentUser?.longitude;
              const rescueMaxDistanceRaw = currentUser?.max_distance ?? currentUser?.distance_preference ?? DEFAULT_MAX_DISTANCE_KM;
              const rescueMaxDistance = Number(rescueMaxDistanceRaw);
              const safeRescueMaxDistance = premiumActive
                ? Infinity
                : Math.min(Number.isFinite(rescueMaxDistance) && rescueMaxDistance > 0 ? rescueMaxDistance : DEFAULT_MAX_DISTANCE_KM, FREE_USER_MAX_DISTANCE_KM);

              const freshProfiles = (Array.isArray(freshRows) ? (freshRows as unknown as ProfileRow[]) : [])
                .filter((p) => {
                  // Defense-in-depth: re-check country client-side too, same
                  // as the other fetches in this file.
                  const cc = normalizeCountryCode(p.country_code || '');
                  if (!cc || !rescueAllowedCountryCodes.includes(cc)) return false;
                  if (!premiumActive && rescueUserLat && rescueUserLon && p.latitude && p.longitude) {
                    const dist = calculateDistance(rescueUserLat, rescueUserLon, p.latitude, p.longitude);
                    if (dist > safeRescueMaxDistance) return false;
                  }
                  return true;
                })
                .filter((p) => matchesReciprocalPreference(currentUser?.gender, p.preference))
                .map((p) => toPotentialMatch(p, { images: [] }));

              candidatePool = [...remainingProfiles, ...freshProfiles];
            } catch {
              // DB expansion is a bonus, not a requirement - fall through and
              // rescue from whatever was already in memory.
            }
          }
        }
      }

      const rescueCandidates = getSwipeFatigueRescueCandidates(
        candidatePool,
        3, // Inject up to 3 rescue profiles
        `${currentUser?.id || 'anon'}_${todaySeed}_rescue`,
        likedMeSet
      );

      if (rescueCandidates.length === 0) return;

      const taggedRescueCandidates = rescueCandidates.map((p) => ({ ...p, likedYouMechanism: 'B' as const }));

      // Inject rescue profiles near the front of the queue (positions 2-5)
      setPotentialMatches(prev => {
        const currentProfiles = prev.slice(currentIndex);
        const rescueIds = new Set(taggedRescueCandidates.map(p => p.id));

        // Remove rescue profiles from their current positions
        const withoutRescue = currentProfiles.filter(p => !isAd(p) ? !rescueIds.has(p.id) : true);

        // Inject at positions 2, 4, 6 (skip first profile which is current)
        const injected = injectRescueProfiles(withoutRescue, taggedRescueCandidates, {
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

      if (currentUser?.id) {
        // Position is approximate (index within the rescue batch, not the
        // exact post-spacing deck offset) - adequate for the aggregate
        // "did this mechanism correlate with matches" measurement this
        // exists for, not meant to be pixel-precise.
        rescueCandidates.forEach((p, idx) => {
          const lastActiveDays = p.last_login_at
            ? Math.floor((Date.now() - new Date(p.last_login_at).getTime()) / (24 * 60 * 60 * 1000))
            : null;
          trackLikedYouShown({
            viewerId: currentUser.id,
            likerId: p.id,
            mechanism: 'B',
            likerLastActiveDays: lastActiveDays,
            positionInDeck: idx,
          });
        });
      }
    };

    void runRescue();
  }, [noMatchStreak, potentialMatches, currentIndex, currentUser, usersWhoLikedMeIds, RESCUE_COOLDOWN_MS, isArchivedFallback, premiumActive]);
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

  // Re-warm the CURRENT card's blob preview whenever the user returns to this
  // tab. `preloadProfileImages` above only fires on `currentIndex`/`potentialMatches`
  // changes (i.e. on swipe) and, even then, skips any profile whose image URLs
  // are already known - it never re-checks whether the blob preview itself is
  // still around. If the webview discards blob: object URLs while this tab
  // sits hidden (display:none) behind another bottom-nav tab, the profile the
  // user left on comes back with its URLs still known but no blob - so the
  // photo falls back to a differently-sized, never-before-fetched optimized
  // URL (a real cache miss, unlike the raw blob-sourced URL) and shows blank
  // for a few seconds until something re-preloads it. Previously nothing did
  // that until the *next* swipe warmed the *next* card - hence "requires
  // swiping" to bring the current photo back. This re-warms the current card
  // specifically, right when the tab becomes visible again.
  useEffect(() => {
    if (!isActiveTab) return;
    if (isAndroidPlatform()) return; // Android intentionally skips blob preloading entirely
    const current = potentialMatches[currentIndex];
    if (!current || isAd(current)) return;
    if (preloadedBlobImages[current.id]) return; // already warm
    const urls = userImagesRef.current[current.id];
    if (!urls || urls.length === 0) return;

    let cancelled = false;
    (async () => {
      const blobMap: { [url: string]: string } = {};
      await Promise.all(
        urls.map(async (originalUrl) => {
          try {
            blobMap[originalUrl] = await preloadImageToBlob(originalUrl);
          } catch {
            blobMap[originalUrl] = originalUrl;
          }
        })
      );
      if (cancelled) return;
      setPreloadedBlobImages((prev) => ({ ...prev, [current.id]: blobMap }));
    })();

    return () => {
      cancelled = true;
    };
  }, [isActiveTab, currentIndex, potentialMatches, preloadedBlobImages]);

  // Helper to persist swipe count to database using the proper RPC.
  // Returns the server's authoritative usage figures whenever we actually
  // get an answer back, so callers can reconcile the optimistic local
  // counter (bumpLocalSwipeCount) against ground truth instead of letting
  // it silently drift ahead of what's really persisted - this was the root
  // cause of users seeing "out of swipes" while their real usage was well
  // under the limit: the local counter goes up on every swipe attempt
  // unconditionally, but previously nothing ever corrected it back down
  // (or synced it to the true count) when a persist failed, lagged, or hit
  // a duplicate/no-op path - errors just got logged and swallowed.
  const persistSwipeCount = async (
    userId: string
  ): Promise<{ ok: boolean; serverUsage: number | null; limitReached: boolean }> => {
    const result = await persistSwipeCountInner(userId);
    maybeShowVerifyPrompt(userId);
    return result;
  };

  const persistSwipeCountInner = async (
    userId: string
  ): Promise<{ ok: boolean; serverUsage: number | null; limitReached: boolean }> => {
    try {
      // Use the update_user_usage RPC which correctly handles upsert + increment
      const { data, error } = await (supabase as unknown as {
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
          const newUsage = (existing.swipes_used || 0) + 1;
          const { error: updateError } = await supabase
            .from('user_usage')
            .update({ swipes_used: newUsage })
            .eq('user_id', userId)
            .eq('date', today);
          if (updateError) return { ok: false, serverUsage: null, limitReached: false };
          return { ok: true, serverUsage: newUsage, limitReached: false };
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('user_usage')
            .insert({
              user_id: userId,
              date: today,
              swipes_used: 1,
              reverse_dislikes_used: 0,
            });
          if (insertError) return { ok: false, serverUsage: null, limitReached: false };
          return { ok: true, serverUsage: 1, limitReached: false };
        }
      }

      // update_user_usage returns { success, current_usage, limit, message }.
      // success:false means the SERVER's own authoritative count was already
      // at/over the limit when this call landed - a real signal, not a
      // failure, that the local count had drifted and must be corrected.
      const parsed = data as { success?: boolean; current_usage?: number } | null;
      const serverUsage = typeof parsed?.current_usage === 'number' ? parsed.current_usage : null;
      return { ok: parsed?.success !== false, serverUsage, limitReached: parsed?.success === false };
    } catch (err) {
      console.error('Error persisting swipe count:', err);
      return { ok: false, serverUsage: null, limitReached: false };
    }
  };

  // Single call site for "a like/pass RPC just succeeded, now record the
  // swipe usage" - used by both handleLike and executePassLogic (each has a
  // primary-RPC-succeeded path and a fallback-insert-succeeded path, four
  // call sites total), so the persist + reconcile + limit-check sequence
  // exists exactly once instead of copy-pasted at each site.
  const persistSwipeAndReconcile = async (userId: string) => {
    const persistResult = await persistSwipeCount(userId);
    reconcileSwipeCountFromServer(persistResult.serverUsage);
    if (persistResult.limitReached) setIsOutOfSwipes(true);
  };

  // Lifetime swipe count (distinct from the daily usage tracked above) -
  // used only to decide when to nudge an unverified user toward identity
  // verification. Runs after every swipe, like and pass alike.
  const maybeShowVerifyPrompt = async (userId: string) => {
    if (currentUser?.face_descriptor) return; // already verified
    if (!isVerifyPromptEligible()) return; // already shown once, ever

    try {
      const { data: newCount, error } = await supabase.rpc('increment_swipe_count', {
        user_id_param: userId,
      });

      if (error) {
        console.error('Failed to increment swipe count:', error);
        return;
      }

      if (typeof newCount === 'number' && newCount >= SWIPES_BEFORE_VERIFY_PROMPT) {
        markVerifyPromptTriggered();
        setShowVerifyPrompt(true);
      }
    } catch (err) {
      console.error('Error incrementing swipe count:', err);
    }
  };

  // Optimistic UI: move to next card instantly, then process like in background
  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Prevent refresh from “resetting” swipes: don’t allow swiping until the DB swipe count is loaded.
    // Also wait for premium status to positively resolve (both live signals settled, or the
    // cached status already makes premiumActive true) - otherwise a fast DB-count load racing
    // ahead of a slower premium check would get evaluated against the free cap.
    if (!hasLoadedSwipeCountFromDb || todaySwipeCount === null || (!premiumResolved && !premiumActive)) {
      toast({
        title: (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" /> One Moment
          </span>
        ),
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
      swipeLimit: premiumActive ? PREMIUM_DAILY_SWIPE_LIMIT : FREE_DAILY_SWIPE_LIMIT,
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
    if (effectiveProfileCompletion < PROFILE_COMPLETION_REQUIRED_PERCENT && effectiveSwipeCount >= PROFILE_COMPLETION_GRACE_SWIPES) {
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
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: FREE_DAILY_SWIPE_LIMIT swipes, Premium users: PREMIUM_DAILY_SWIPE_LIMIT swipes
    const swipeLimit = premiumActive ? PREMIUM_DAILY_SWIPE_LIMIT : FREE_DAILY_SWIPE_LIMIT;

    // Block purely based on the authoritative swipe count.
    if (effectiveSwipeCount >= swipeLimit) {
      setIsOutOfSwipes(true);
      return;
    }

    // Optimistic path: advance UI immediately, then persist the action in background.
    const prevMatch = currentMatch;

    // Closes the loop on the liked-you mechanisms: if this card was actually
    // surfaced via Mechanism A or B (tagged when injected), record what
    // happened to it. Silent no-op for every ordinary card (the vast
    // majority of swipes), since likedYouMechanism is only ever set on
    // injected profiles.
    const reportLikedYouOutcome = (direction: 'like' | 'pass', resultedInMatch: boolean) => {
      if (prevMatch.likedYouMechanism && currentUser?.id) {
        trackLikedYouSwiped({
          viewerId: currentUser.id,
          likerId: prevMatch.id,
          mechanism: prevMatch.likedYouMechanism,
          direction,
          resultedInMatch,
        });
      }
    };

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
      revokeBlobUrlsForProfile(prevMatch.id);
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
              {
                await persistSwipeAndReconcile(currentUser.id);
              }

              // Notify other parts of the app (e.g., Profile stats) immediately
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('swipePersisted', { detail: { type: 'like', delta: 1 } })
                );
                publishSwipeDecision(currentUser.id, prevMatch.id, 'like');
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
                  await sendMultipleLikesNotification(prevMatch.id, likeCount, currentUser.id);
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
              reportLikedYouOutcome('like', true);
              setMatchedUser(prevMatch);
              setShowMatchAnimation(true);
              pendingMatchForRatingRef.current = true;

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
              reportLikedYouOutcome('like', false);
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
          {
            await persistSwipeAndReconcile(currentUser.id);
          }

          // Notify other parts of the app (e.g., Profile stats) immediately
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('swipePersisted', { detail: { type: 'like', delta: 1 } })
            );
            publishSwipeDecision(currentUser.id, prevMatch.id, 'like');
          }
          
          // If server reports a match, show animation
          const hasMatch =
            !!rpcData &&
            typeof rpcData === 'object' &&
            Boolean((rpcData as Record<string, unknown>).match);
          if (hasMatch) {
            reportLikedYouOutcome('like', true);
            // ⭐ SWIPE FATIGUE RESCUE: Reset streak on match
            setNoMatchStreak(0);

            setMatchedUser(prevMatch);
            setShowMatchAnimation(true);
            pendingMatchForRatingRef.current = true;

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
            reportLikedYouOutcome('like', false);
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
                await sendMultipleLikesNotification(prevMatch.id, likeCount, currentUser.id);
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
    // Also wait for premium status to positively resolve (both live signals settled, or the
    // cached status already makes premiumActive true) - otherwise a fast DB-count load racing
    // ahead of a slower premium check would get evaluated against the free cap.
    if (!hasLoadedSwipeCountFromDb || todaySwipeCount === null || (!premiumResolved && !premiumActive)) {
      toast({
        title: (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" /> One Moment
          </span>
        ),
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
      swipeLimit: premiumActive ? PREMIUM_DAILY_SWIPE_LIMIT : FREE_DAILY_SWIPE_LIMIT,
      parentProfileCompletion,
      computedProfileCompletion,
      effectiveProfileCompletion,
    });

    // Check profile completion restriction (70% after 5 swipes)
    if (effectiveProfileCompletion < PROFILE_COMPLETION_REQUIRED_PERCENT && effectiveSwipeCount >= PROFILE_COMPLETION_GRACE_SWIPES) {
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
      return;
    }

    // Check daily limit - MUST be checked BEFORE swipe
    // Free users: FREE_DAILY_SWIPE_LIMIT swipes, Premium users: PREMIUM_DAILY_SWIPE_LIMIT swipes
    const swipeLimit = premiumActive ? PREMIUM_DAILY_SWIPE_LIMIT : FREE_DAILY_SWIPE_LIMIT;

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
      revokeBlobUrlsForProfile(prevMatch.id);
    }, 450);

    // Optimistically add to passed list
    setPassedUsers(prev => [{ user_id: prevMatch.id, passed_at: new Date() }, ...prev.slice(0, 9)]);

    // Capture values now to avoid stale closures inside the queue job
    const passerId = currentUser.id;
    const passedId = prevMatch.id;
    const premiumParam = premiumActive;

    // Closes the loop on the liked-you mechanisms - a pass is a definitive
    // outcome with no async result to wait for, unlike a like (which might
    // still turn into a match), so this fires immediately.
    if (prevMatch.likedYouMechanism && currentUser?.id) {
      trackLikedYouSwiped({
        viewerId: currentUser.id,
        likerId: prevMatch.id,
        mechanism: prevMatch.likedYouMechanism,
        direction: 'pass',
        resultedInMatch: false,
      });
    }

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
              
              {
                await persistSwipeAndReconcile(currentUser.id);
              }

              // Notify other parts of the app (for debugging/telemetry)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('swipePersisted', { detail: { type: 'pass', delta: 1 } })
                );
                publishSwipeDecision(currentUser.id, prevMatch.id, 'pass');
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
          {
            await persistSwipeAndReconcile(currentUser.id);
          }

          // Notify other parts of the app (for debugging/telemetry)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('swipePersisted', { detail: { type: 'pass', delta: 1 } })
            );
            publishSwipeDecision(currentUser.id, prevMatch.id, 'pass');
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
        title: (
          <span className="inline-flex items-center gap-1.5">
            <Heart className="w-4 h-4 text-pink-500" /> {currentMatch.first_name} already likes you
          </span>
        ),
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
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, favorites, gender, preference, max_distance, distance_preference, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, is_verified, height_cm, languages, family_plans, communication_style, love_style, pets, social_media')
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

      // The card's actual photos come from the separate `userImages` map
      // (keyed by profile id), not from the match object's own .images
      // field - reinserting the profile above doesn't populate that map.
      // Right after a normal pass this "just worked" because the profile's
      // entry was still sitting in that map from when it was first shown;
      // after a refresh rebuilds potentialMatches/userImages from scratch,
      // nothing repopulates it here, so the reversed-back card showed no
      // photos at all. Fetch fresh whenever we don't already have them.
      if (!userImagesRef.current[lastPassedUser.user_id]?.length) {
        loadAllImagesForProfile(lastPassedUser.user_id).then(imgs => {
          if (imgs && imgs.length > 0) {
            setUserImages(prevImgs => ({ ...prevImgs, [lastPassedUser.user_id]: imgs }));
            preloadImages(imgs.slice(0, 3), 'high');
            if (imgs.length > 3) preloadImages(imgs.slice(3), 'low');
          }
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
        const userMaxDistanceRaw = currentUser?.max_distance ?? currentUser?.distance_preference ?? DEFAULT_MAX_DISTANCE_KM;
        const userMaxDistance = Number(userMaxDistanceRaw);
        const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : DEFAULT_MAX_DISTANCE_KM;
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
      const thirtyDaysMs = PASS_EXPIRY_MS;

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
        const userMaxDistanceRaw = currentUser?.max_distance ?? currentUser?.distance_preference ?? DEFAULT_MAX_DISTANCE_KM;
        const userMaxDistance = Number(userMaxDistanceRaw);
        const safeUserMaxDistance = Number.isFinite(userMaxDistance) && userMaxDistance > 0 ? userMaxDistance : DEFAULT_MAX_DISTANCE_KM;
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
      
      // Auto-refill lives in the dedicated effect + the "running low" check
      // further below in this same updater - not duplicated here.

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
        // Running low on profiles - trigger background load.
        // remainingProfiles > 0 means the deck still has at least one real
        // card left (this is a proactive prefetch); 0 means this swipe was
        // the last card and the deck is genuinely empty right now.
        const stillHasCards = remainingProfiles > 0;
        const now = Date.now();
        const COOLDOWN_MS = 10_000; // 10 second cooldown
        if (now - lastAutoRefillAttemptAtRef.current >= COOLDOWN_MS) {
          lastAutoRefillAttemptAtRef.current = now;
          setTimeout(() => {
            loadMoreMatches(stillHasCards);
          }, 100); // Small delay to not block the swipe animation
        }
      }
      
      return newMatches;
    });
    
    // ⭐ RULE 5: Hard-cut instant card removal - always stay at index 0
    setCurrentIndex(0);
    
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
    if (!pendingMatchForRatingRef.current) return;
    pendingMatchForRatingRef.current = false;
    if (!isRatingFunnelEligible()) return;
    setTimeout(() => {
      // Marked "shown" only now, right as it actually appears - not when we
      // merely decided to schedule it, so a dismissed/never-displayed prompt
      // doesn't burn the only chance to ask again.
      markRatingFunnelShown();
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

  // Extracted so it can be rendered from every early-return branch below, not
  // just the main card return - completing a swipe can flip the page into
  // the loading/out-of-swipes/ad-card branch mid-guide, and since each of
  // those used to `return` a completely different tree, the guide (only
  // ever inlined in the main return before) would unmount right along with
  // it, well before its own 5s timer was up. It's plain JSX computed off
  // state, not a hook, so it's safe to build here ahead of the conditionals.
  // Suppressed while the user is genuinely out of swipes - this overlay's
  // z-[9999] otherwise visually covers the "out of swipes" modal for its
  // first ~5s (pointerEvents:none means the modal is still clickable
  // underneath, but the user can't read its message or see its buttons
  // during that window, which reads as the message not showing at all).
  const swipeGuideOverlay = showSwipeGuide && !isOutOfSwipes ? (
    // Interactive, and fully self-contained: dragging this overlay moves ONLY
    // its own tagline+icons card (guideDrag/guideExitDir below), never the
    // real card underneath (no cardElRef, no handleLike/handlePass involved
    // anywhere in this). Swiping it far enough sends it flying off screen and
    // dismisses the guide for good; a short drag just snaps it back to
    // center. Either way the real card is never touched, so this can never
    // count as an actual like/pass.
    <div
      className="fixed inset-0 z-[9999]"
      onTouchStart={handleGuideTouchStart}
      onTouchMove={handleGuideTouchMove}
      onTouchEnd={handleGuideTouchEnd}
      onMouseDown={handleGuideMouseDown}
    >
      <style>{`
        @keyframes swipeGuideIn {
          0% { opacity: 0; transform: scale(0.9) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes ringPulseWhite {
          0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.35); }
          70% { box-shadow: 0 0 0 14px rgba(255, 255, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
        }
        @keyframes ringPulseRed {
          0% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.45); }
          70% { box-shadow: 0 0 0 14px rgba(225, 29, 72, 0); }
          100% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0); }
        }
        @keyframes arrowNudgeLeft {
          0%, 100% { transform: translateX(0); opacity: 0.55; }
          50% { transform: translateX(-6px); opacity: 1; }
        }
        @keyframes arrowNudgeRight {
          0%, 100% { transform: translateX(0); opacity: 0.55; }
          50% { transform: translateX(6px); opacity: 1; }
        }
        .swipe-guide-card {
          animation: swipeGuideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .swipe-guide-icon-left {
          animation: ringPulseWhite 1.6s ease-out infinite;
        }
        .swipe-guide-icon-right {
          animation: ringPulseRed 1.6s ease-out infinite;
        }
        .swipe-guide-arrow-left { animation: arrowNudgeLeft 1.2s ease-in-out infinite; }
        .swipe-guide-arrow-right { animation: arrowNudgeRight 1.2s ease-in-out infinite; }
      `}</style>
      {/* This is the whole "card" being swiped - the dark blurred scrim itself,
          with a visible border around it, not just the tagline/icons floating
          on a static backdrop. It carries the drag transform, so the entire
          blurred surface follows the finger and flies off screen together,
          the same way the real photo card does. */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: 'rgba(0,0,0,0.62)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '2px solid rgba(236,72,153,0.65)',
          borderRadius: 24,
          ...(guideExitDir
            ? {
                transform: `translate3d(${guideExitDir === 'right' ? window.innerWidth * 1.2 : -window.innerWidth * 1.2}px, ${guideDrag.y}px, 0) rotate(${guideExitDir === 'right' ? 24 : -24}deg)`,
                transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
                opacity: 0,
              }
            : {
                transform: `translate3d(${guideDrag.x}px, ${guideDrag.y}px, 0) rotate(${guideDrag.x * 0.06}deg)`,
                transition: guideDrag.x === 0 && guideDrag.y === 0 ? 'transform 0.2s ease-out' : 'none',
              }),
        }}
      >
      <div className="swipe-guide-card flex flex-col items-center gap-6">
        <p
          className="font-brush text-center text-white font-bold px-8"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)', maxWidth: 320, fontSize: '26px' }}
        >
          Love awaits — a beautiful journey begins by swiping on DripLove.
        </p>
        <div className="flex flex-row items-center gap-6">
          {/* Swipe Left - Nope. Arrow sits outboard (further left), pointing
              further left - away from center, in the actual swipe direction. */}
          <ChevronLeft className="swipe-guide-arrow-left w-6 h-6 text-white/70 shrink-0" strokeWidth={3} />
          <div
            className="swipe-guide-icon-left rounded-full flex items-center justify-center shrink-0"
            style={{
              width: 72,
              height: 72,
              background: 'rgba(255,255,255,0.95)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            <X className="w-9 h-9" style={{ color: '#ef4444' }} strokeWidth={3} />
          </div>
          <div className="w-4" />
          {/* Swipe Right - Like. Arrow sits outboard (further right), pointing
              further right - away from center, in the actual swipe direction. */}
          <div
            className="swipe-guide-icon-right rounded-full flex items-center justify-center shrink-0"
            style={{
              width: 72,
              height: 72,
              background: '#e11d48',
              boxShadow: '0 4px 20px rgba(225,29,72,0.5)',
            }}
          >
            <Heart className="w-9 h-9" style={{ color: 'white' }} strokeWidth={0} fill="white" />
          </div>
          <ChevronRight className="swipe-guide-arrow-right w-6 h-6 text-white/70 shrink-0" strokeWidth={3} />
        </div>
      </div>
      </div>
    </div>
  ) : null;

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
      <>
      {swipeGuideOverlay}
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
      </>
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
        return `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg) scale(0.55)`;
      }
      if (swipeUI.isDragging) {
        // Same 1:1 finger-follow as the profile card - moves on both axes with a
        // natural tilt instead of being rail-locked to horizontal only.
        return `translate3d(${swipeUI.dragOffset}px, ${swipeUI.dragOffsetY}px, 0) rotate(${swipeUI.dragOffset * 0.06}deg) scale(1)`;
      }
      return 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
    };

    const adCardTransform = getAdCardTransform();
    // Same "flush at rest, rounds in the moment it's picked up or flung away" feel as
    // the profile card - keeps the ad card visually identical to a real match card
    // when the user is actually interacting with it.
    const adCardIsLifted = swipeUI.isDragging || exitingCard;
    const adCardCornerRadius = adCardIsLifted ? '26px' : '0px';

    return (
      <>
      {swipeGuideOverlay}
      <div className="h-full w-full relative overflow-hidden"
           style={{
             // Plain in-flow box: MainApp's content wrapper already reserves the header
             // (padding-top) and the nav (padding-bottom), so filling 100% of it is
             // exactly "between the header and the nav" on every screen size. No fixed
             // positioning and no vh math that can disagree with the real available space.
             touchAction: 'pan-y',
             overscrollBehavior: 'contain',
             userSelect: 'none',
             WebkitUserSelect: 'none',
             WebkitTouchCallout: 'none'
           }}>

        <div ref={cardElRef} className="h-full w-full relative z-10 flex flex-col"
             style={{
               transform: adCardTransform,
               transformOrigin: 'center center',
               transition: exitingCard
                 ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.3s ease' // Smooth exit with slight bounce
                 : swipeUI.isDragging
                   ? 'border-radius 0.2s ease' // transform tracks the finger instantly; only radius eases
                   : 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.3s ease, box-shadow 0.3s ease', // Springy snap-back
               willChange: 'transform',
               borderRadius: adCardCornerRadius,
               overflow: 'hidden',
               boxShadow: swipeUI.isDragging
                 ? '0 14px 34px -8px rgba(0,0,0,0.28)'
                 : exitingCard
                   ? '0 20px 44px -10px rgba(0,0,0,0.3)'
                   : '0 2px 8px rgba(0,0,0,0.08)',
               // Same fix as the main swipe card: this drives its own transform off both
               // axes via JS, so native touch-action panning must be fully disabled here
               // or it fights the manual drag (see the main discover-image-area for the
               // full explanation).
               touchAction: 'none',
             }}
             onTouchStart={handleTouchStart}
             onTouchMove={handleTouchMove}
             onTouchEnd={handleTouchEnd}
             onMouseDown={handleMouseDown}>
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none transition-opacity duration-200"
            style={{
              border: '1.5px solid rgba(236,72,153,0.95)',
              borderRadius: adCardCornerRadius,
              opacity: swipeUI.isDragging ? 1 : 0,
              zIndex: 30,
            }}
          />
          <AdCard ad={currentMatch} onSwipe={moveToNext} onAdvertiseClick={onNavigateToAdvertise} trackAnalytics />
          <SwipeButtons
            onReverse={handleReverse}
            canReverse={false}
            isPremium={premiumActive}
          />
        </div>
      </div>
      </>
    );
  }

  // Show loading state ONLY while initial fetch is in progress AND we have no profiles
  if (!hasCompletedInitialFetch && potentialMatches.length === 0 && isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center overflow-y-auto">
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
      <div className="h-full w-full flex items-center justify-center overflow-y-auto">
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
      : t('discover.noMoreProfiles');

    const emptyDescription = emptyStateMode === 'transient-error'
      ? 'We hit a quick connection issue. Tap refresh to retry.'
      : t('discover.noProfilesDescription');

    // Show empty state - user can manually refresh
    // Background loading will continue silently without showing spinner
    return (
      <div className="h-full w-full flex items-center justify-center overflow-y-auto">
        <Card className="max-w-md w-full mx-4 bg-black border border-pink-500/25 text-white shadow-2xl">
          <CardContent className="p-6 text-center flex flex-col items-center">
            <Heart className="w-12 h-12 mb-3 text-pink-500/80" />
            <h2 className="text-lg font-semibold mb-1.5 text-white">{emptyTitle}</h2>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">{emptyDescription}</p>
            {!premiumActive && (
              <div className="mb-3">
                <p className="text-yellow-400 text-sm mb-3 max-w-xs mx-auto">{t('discover.upgradeForMoreCountries')}</p>
                <Button
                  onClick={() => setShowPremiumUpgrade(true)}
                  className="w-auto h-8 !rounded-full px-3.5 text-xs bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
                >
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  {emptyStateTrialEligible ? 'Try now for free' : t('discover.upgradeForMoreCountriesButton')}
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button
                onClick={() => {
                  // Clear all caches and force a complete refresh
                  revokeAllBlobUrls();
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
                className="w-auto h-8 !rounded-full px-3.5 text-xs bg-gradient-to-r from-pink-600 to-rose-700 hover:from-pink-500 hover:to-rose-600 text-white"
              >
                {t('discover.refresh')}
              </Button>

              <Button
                onClick={() => navigate('/games')}
                variant="outline"
                className="w-auto h-8 !rounded-full px-3.5 text-xs border border-pink-500/30 text-pink-400 hover:bg-pink-500/10 bg-transparent flex items-center justify-center gap-1.5"
                aria-label="Play games"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
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

  // Blur + dark tint on the next card visible behind the one being dragged,
  // so a user mid-swipe can't already see who's next before they've actually
  // committed to the swipe.
  //
  // Earlier version revealed progressively based on drag distance vs.
  // minSwipeDistance (screenWidth * 0.25, capped 120px) - but that's the
  // distance that merely REGISTERS a swipe as valid on release, not how far
  // people actually drag before letting go. A real drag routinely travels
  // 200-300px+ while the finger is still down, well past that ~100px mark,
  // so the old formula saturated to "fully revealed" while the user was
  // still barely a third of the way across the screen, still holding -
  // exactly the "reveals everything mid-swipe" bug reported.
  //
  // Fixed: no distance-based reveal during the hold at all. Fully
  // blurred+dark for the entire drag, no matter how far, and it only clears
  // the instant the swipe actually completes (finger lifts past threshold,
  // exitingCard fires and the card starts flying away) - "hidden until the
  // swipe goes completely through," exactly as asked. A drag that doesn't
  // clear the threshold and springs back never reveals it at all.
  //
  // CSS blur is a real GPU cost on low-end Android WebViews (same reasoning
  // DominantColorImageBg already applies to its own backdrop blur) - capped
  // lower there. Opacity does most of the actual hiding work everywhere and
  // is essentially free on any device, so it isn't reduced by platform.
  const NEXT_CARD_MAX_BLUR_PX = isAndroidPlatform() ? 7 : 15;
  const NEXT_CARD_MAX_DARK_OPACITY = 0.3;
  const nextCardRevealProgress = exitingCard ? 1 : 0;
  const nextCardBlurPx = NEXT_CARD_MAX_BLUR_PX * (1 - nextCardRevealProgress);
  const nextCardDarkOpacity = NEXT_CARD_MAX_DARK_OPACITY * (1 - nextCardRevealProgress);

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

  // Bottom corners stay rounded at all times for a clean, finished edge against the nav below;
  // the top stays flush with the header while resting, and the moment the card is picked up
  // (dragging) or flung away, all four corners round in like a card lifting off the stack.
  const cardIsLifted = swipeUI.isDragging || exitingCard;
  const cardCornerRadius = cardIsLifted ? '26px' : '0px 0px 22px 22px';



  return (
    <>
      {/* Mobile browser viewport fix styles */}
      <style>{`
        /* The discover surface is a plain in-flow box that fills 100% of MainApp's
           already-padded content area (header reserved via padding-top, nav via
           padding-bottom). Nothing here uses vh/dvh math anymore - that math was
           duplicating the reservation and could disagree with the real available
           space, which is what pushed the card out of view. Everything below sizes
           itself as a percentage of that one container instead, so it works on any
           screen. */
        .discover-image-area.expanded {
          max-height: 58%;
        }
      `}</style>

      <div className="discover-container h-full w-full relative overflow-hidden"
           style={{
             touchAction: 'pan-y', // allow vertical scrolling, prevent horizontal scroll-from-browser during horizontal swipes
             overscrollBehavior: 'contain',
             userSelect: 'none',
             WebkitUserSelect: 'none',
             WebkitTouchCallout: 'none'
           }}>

      {/* --- Swipe Guide Popup for New Users --- */}
      {swipeGuideOverlay}

  <div className="flex-1 relative overflow-hidden" style={{
    height: '100%',
    // Match the parent's real height exactly - never a vh-based calc here. On mobile,
    // discover-container switches to 100dvh (the dynamic viewport, which shrinks when
    // the browser's URL bar is showing), but a static `100vh` calc on this child does
    // NOT track that - it stays pinned to the larger static viewport. That mismatch
    // (which can be much more than the ~33px it was on desktop, depending on how much
    // of the screen the URL bar takes) forced this div taller than its own parent, and
    // with justify-content: flex-end below, silently shoved the swipe card down and
    // clipped its bottom edge against this div's own overflow-hidden. The old separate
    // info-area masked this by transform-shifting itself up 160px regardless of where
    // it actually landed; the caption now lives pinned inside the photo box itself, so
    // it's directly exposed to this and needs to never exceed its parent, full stop.
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: 0
  }}>
        {/* ...existing code... */}
        {nextMatch && (
          <DominantColorImageBg
            // Raw URL, not getOptimizedUrl(...) - DominantColorImageBg applies
            // its own tiny 40px/q20 transform for this blurred backdrop, but
            // optimizeImageUrl() no-ops on a URL that's already been through
            // the /render/image/ endpoint (which getOptimizedUrl produces),
            // so passing the already-1080px-optimized URL here silently
            // defeated the "cheap tiny thumbnail" and loaded the full-size
            // photo as the blur backdrop on every card transition instead.
            imageUrl={nextMatchImages[0] || undefined}
          >
            {/* ...existing code for overlays, etc... */}
            {nextMatchImages.length > 0 && !isAd(nextMatch) ? (
              // Full-bleed, same as SlideRenderer's ImageSlide - no fixed 3:4
              // box centered inside this frame (that letterboxed on typical
              // taller-than-4:3 phone screens instead of filling edge-to-edge).
              // Keyed by id: once moveToNext() promotes this card to front and
              // assigns a NEW next-card behind it, this forces a clean remount
              // instead of reusing the same DOM node. Without the key, the old
              // node (mid-transition, having just animated to "revealed") got
              // reused for the brand-new photo and re-animated from that stale
              // revealed state back to hidden - a visible "reveals, then pops
              // blurry again" glitch right after every completed swipe, plus
              // the wasted extra animation pass was the actual slowdown. A
              // fresh mount just paints its correct hidden state immediately,
              // no transition to fight.
              <div key={nextMatch.id} className="relative w-full h-full bg-black overflow-hidden">
                  <img
                    src={(() => {
                      // ⭐ Use blob URL for instant loading if available
                      const originalUrl = nextMatchImages[0];
                      const blobUrl = preloadedBlobImages[nextMatch.id]?.[originalUrl];
                      return (blobUrl && blobUrl.startsWith('blob:')) ? blobUrl : getOptimizedUrl(originalUrl);
                    })()}
                    alt={`${nextMatch.first_name}'s photo`}
                    className="absolute inset-0 w-full h-full object-cover object-center"
                    style={{
                      filter: `blur(${nextCardBlurPx}px)`,
                      // Constant scale, never transitioned - only large enough
                      // to keep the blur's own edge-softening from revealing a
                      // hairline of the frame's black background. Letting this
                      // animate too (scale 1.2 -> 1 alongside the blur/opacity
                      // clearing) was a second simultaneous moving property
                      // compounding into the reveal looking like a "pop"
                      // instead of one clean, single fade.
                      transform: 'scale(1.1)',
                      transition: swipeUI.isDragging ? 'none' : 'filter 0.25s ease',
                      willChange: 'filter',
                    }}
                    draggable={false}
                    loading="eager"
                    decoding="async"
                  />
                  {/* Black tint on top of the blur - the blur alone still let too
                      much of the next photo read through at a glance. Fades out
                      in lockstep with the blur, so both clear together as one
                      single smooth reveal right as the swipe actually completes. */}
                  <div
                    className="absolute inset-0 pointer-events-none bg-black"
                    style={{
                      opacity: nextCardDarkOpacity,
                      transition: swipeUI.isDragging ? 'none' : 'opacity 0.25s ease',
                    }}
                  />
              </div>
            ) : nextMatch && !isAd(nextMatch) ? (

              <div className="w-full h-full bg-gradient-to-br from-zinc-800 via-neutral-900 to-black flex items-center justify-center">
                <span className="text-6xl font-bold text-white/80">
                  {nextMatch.first_name?.[0]}{nextMatch.last_name?.[0]}
                </span>
              </div>
            ) : null}
            {/* Grounds the peeking next-card preview in solid black at the bottom edge -
                stronger and taller than before so the blurred photo underneath reads as
                a deliberate dark backdrop instead of a messy blur blob peeking out. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.85) 22%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0) 65%)',
              }}
            />
          </DominantColorImageBg>
        )}

        {/* ...existing code... */}
        <div
          ref={cardElRef}
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
          {/* Pink outline — a subtle version always shows at rest (matching the nav pill's
              border below), and brightens to full strength while dragging. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none transition-opacity duration-200"
            style={{
              border: swipeUI.isDragging
                ? '1.5px solid rgba(236,72,153,0.95)'
                : '1px solid rgba(236,72,153,0.55)',
              borderRadius: cardCornerRadius,
              zIndex: 30,
            }}
          />
          {/* Image area - flexible height that fills remaining space */}
          <div
            className={`discover-image-area ${showMoreInfo ? 'flex-1' : ''} cursor-pointer select-none relative transition-all duration-300 overflow-hidden ${showMoreInfo ? 'expanded' : ''}`}
            style={{
              // Collapsed: absolutely positioned to the parent's exact box (inset 0),
              // not a flex-grow child. flex-basis/flex-grow still ultimately depend on
              // the browser resolving this element's own intrinsic/content size at some
              // point in the algorithm - on iOS Safari a tall photo could still win that
              // fight and force this box (and the parent) taller than intended, no matter
              // how many flex-basis/min-height overrides are stacked on top. Absolute
              // positioning removes that possibility entirely: this box is always exactly
              // the size of its (already real-height) `relative` parent, full stop,
              // regardless of what's rendered inside it.
              // Expanded: back to normal flow (flex-1 in className) since it now shares
              // the column with the details panel below and needs to negotiate space
              // with it - capped by min/max height so it can't blow past its share.
              ...(showMoreInfo
                ? { flex: '0 0 58%', minHeight: '180px', maxHeight: '58%' }
                : { position: 'absolute', inset: 0 }),

              // The outer discover-container above is 'pan-y' so the expanded info
              // panel further down can still scroll natively, but THIS specific element
              // fully drives its own dragging in both axes via JS (handleTouchMove sets
              // both dragOffset and dragOffsetY off a transform - see getCardTransform).
              // Left at 'pan-y' (inherited), the browser's own native vertical pan
              // gesture recognizer can engage on the same touch at the same time as the
              // JS handlers, fighting the manual transform for any touch with even a
              // slight vertical component (i.e. nearly every real swipe) - this is what
              // shows up as swipe jank/glitching, especially on Android Chrome, which is
              // more aggressive about honoring touch-action for native scroll
              // optimization. 'none' hands full control to the JS handlers with nothing
              // to fight.
              touchAction: 'none',
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
                match={currentMatchWithCaptions || currentMatch}
                imageIndex={imageIndex}
                showMoreInfo={showMoreInfo}
                isPremium={premiumActive}
                userImages={currentMatchImages}
                preloadedBlobImages={preloadedBlobImages[currentMatch.id]} // ⭐ Instant image rendering
                preferredLanguageName={userLanguages[currentMatch.id]} // ⭐ No DB call needed
                currentUserLatitude={currentUser.latitude}
                currentUserLongitude={currentUser.longitude}
                onImageClick={handleImageAreaClick}
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
                onUserBlocked={(blockedId) => {
                  // Defensive: prefer looking the blocked profile up fresh in
                  // the deck rather than assuming currentMatch is still the
                  // same one (the report modal pauses swiping while open, so
                  // in practice it always is, but this doesn't depend on it).
                  const blockedMatch = potentialMatches.find((m) => !isAd(m) && m.id === blockedId) as PotentialMatch | undefined;
                  moveToNext(blockedMatch || currentMatch);
                }}
              />
            )}
          </div>

          {/* Expanded details - plain black panel below the photo, same relationship
              (and the same simple flex-1 sizing) as Liked Me's and the profile
              preview's own expanded panel: the photo is a fixed 58% (see
              discover-image-area above), this is just the ordinary flex-1
              sibling taking the remaining space - no vh caps, no nested
              wrapper/filler divs fighting each other, so all three screens
              now open to the exact same proportion. */}
          {showMoreInfo && (
            <div
              className="discover-info-area relative z-20 flex-1 overflow-y-auto bg-black scrollbar-hide"
              style={{
                minHeight: 0,
                // Overlaps the photo by a hair as extra insurance against subpixel
                // rounding - same fix as the profile preview's expanded panel.
                marginTop: '-2px',
                WebkitOverflowScrolling: 'touch',
              }}
              ref={contentRef}
            >
              <div className="px-1 pt-1 pb-6">
                {/* Render MatchCard details area */}
                {currentMatch && !isAd(currentMatch) && (
                  <MatchCard
                    match={currentMatchWithCaptions || currentMatch}
                    imageIndex={imageIndex}
                    showMoreInfo={showMoreInfo}
                    isPremium={premiumActive}
                    userImages={currentMatchImages}
                    preloadedBlobImages={preloadedBlobImages[currentMatch.id]}
                    preferredLanguageName={userLanguages[currentMatch.id]}
                    currentUserLatitude={currentUser.latitude}
                    currentUserLongitude={currentUser.longitude}
                    onImageClick={handleImageAreaClick}
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
            </div>
          )}
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
      
      {/* Rating funnel - 3s after a match screen closes, subject to
          isRatingFunnelEligible() (stops for good only once the user has
          actually tapped "Yes", tracked on the account itself). */}
      <RatingFunnel
        open={showRatingFunnel}
        onClose={() => setShowRatingFunnel(false)}
        userId={currentUser?.id}
      />
      <VerifyIdentityPrompt
        open={showVerifyPrompt}
        onClose={() => setShowVerifyPrompt(false)}
        onVerifyNow={onNavigateToVerify}
      />

      {/* The free-trial pitch is shown exactly once, as the centered
          FreeTrialBottomSheet modal (mounted in MainApp) on its own
          10-minute-delayed cadence - no separate inline banner here, so
          users never see two different trial prompts at once. */}
    </>
  );
}

export default React.memo(DiscoverPage);

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PotentialMatch } from '@/types';
import { normalizeCountryCode } from '@/utils/countryCode';
import { readLikeBackCycle, writeLikeBackCycle, type LikeBackCycleState } from '@/utils/likeBackCycleStorage';
import { advanceLikeBackCycle } from '@/utils/likeBackSchedule';
import { parseFavorites } from '@/constants/favorites';

/**
 * Like-Back Injection Hook
 *
 * Implements Tinder-style "like-back injection" where profiles that liked the current user
 * are injected into the swipe queue at strategic positions.
 *
 * Reveal cycle:
 * - Dormant until the user has ever received their first like, ever - before
 *   that, nothing is injected, full stop.
 * - Once started, each calendar day gets a reveal quota from a repeating
 *   9-day schedule (2, 1, 1, 0, 1, 0, 0, 1, 2 - see DAY_QUOTA_CYCLE in
 *   likeBackSchedule.ts), day 10 wrapping back to day 1's quota, and so on.
 *   A day's quota (if any) is randomly mixed across that day's first 30
 *   swipes; a 0-quota day gets nothing at all.
 * - Cycle state (which calendar day, today's progress/planned offsets) is
 *   persisted per user, since the schedule is keyed by real days, not just
 *   swipes, and has to survive reloads/relaunches - see
 *   likeBackCycleStorage.ts.
 * - A reveal slot with no eligible quality candidate is simply skipped, never
 *   forced or carried over to a later slot.
 *
 * Placement rules:
 * - Never in the first 3 positions of the visible queue.
 * - Never two reveals back-to-back (enforced as a minimum real-swipe gap
 *   between reveal events).
 * - Candidates must already pass the same Discover eligibility as everyone
 *   else (gender/orientation/age/country/distance) - see useDiscoverLikeBack.ts.
 *   Free users only ever get likers from their own country; premium users get
 *   their home country plus whichever countries they've unlocked.
 * - Quality filter: only inject likers with 2+ approved photos.
 * - Deduplicate: never inject the same person twice.
 * - Respect: passed-today + blocked profiles excluded.
 * - Priority: most recent likers first (for higher match probability).
 */

interface UseLikeBackInjectionOptions {
  userId: string | undefined;
  blockedIds: Set<string>;
  passedTodayIds: Set<string>;
  inQueueIds: Set<string>;
  locallySwipedIds: Map<string, { action: 'like' | 'pass'; timestamp: number }>;
  // Country/location filtering: premium = home + unlocked countries (no
  // distance cap), free = home country only (distance-capped).
  isPremium?: boolean;
  userCountryCode?: string;
  unlockedCountries?: string[]; // Premium only; already excludes home country
  userLatitude?: number;
  userLongitude?: number;
  maxDistance?: number; // Max distance in km (free users max 500km)
}

interface LikerProfile {
  id: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  occupation: string | null;
  education_level: string | null;
  date_of_birth: string | null;
  interests: string[] | null;
  favorites?: unknown;
  gender: string | null;
  latitude: number | null;
  longitude: number | null;
  fun_fact: string | null;
  perfect_first_date: string | null;
  last_googled: string | null;
  relationship_intent: string | null;
  smoking: string | null;
  drinking: string | null;
  exercise_level: string | null;
  sleeping_schedule: string | null;
  introvert_extrovert: number | null;
  spontaneous_planner: number | null;
  messy_organized: number | null;
  adinkra_symbols: string[] | null;
  is_verified: boolean | null;
  image_count: number;
  liked_at: number; // Timestamp of when they liked (for recency sorting)
}

// Configuration
const MIN_PHOTOS_REQUIRED = 2; // Quality filter
const INJECTION_POSITION_MIN = 3; // never in the first 3 positions (0-indexed, so index 3 is the first allowed)
const INJECTION_POSITION_MAX = 5;

// Helper to calculate distance between two coordinates (Haversine formula)
const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export function useLikeBackInjection({
  userId,
  blockedIds,
  passedTodayIds,
  inQueueIds,
  locallySwipedIds,
  isPremium = false,
  userCountryCode,
  unlockedCountries = [],
  userLatitude,
  userLongitude,
  maxDistance = 500,
}: UseLikeBackInjectionOptions) {
  // Users who liked the current user (candidates for injection) - sorted by recency
  const [likedMeIds, setLikedMeIds] = useState<string[]>([]);
  const [likerProfiles, setLikerProfiles] = useState<Map<string, LikerProfile>>(new Map());

  // Keep latest dynamic filter sets/maps in refs so we don't recreate callbacks/effects
  // (Set/Map identity changes frequently and can cause runaway refetch/subscription loops)
  const blockedIdsRef = useRef(blockedIds);
  const passedTodayIdsRef = useRef(passedTodayIds);
  const inQueueIdsRef = useRef(inQueueIds);
  const locallySwipedIdsRef = useRef(locallySwipedIds);
  const likedMeIdsRef = useRef(likedMeIds);
  const likerProfilesRef = useRef(likerProfiles);
  const unlockedCountriesRef = useRef(unlockedCountries);
  const isPremiumRef = useRef(isPremium);
  const userCountryCodeRef = useRef(userCountryCode);

  useEffect(() => {
    blockedIdsRef.current = blockedIds;
    passedTodayIdsRef.current = passedTodayIds;
    inQueueIdsRef.current = inQueueIds;
    locallySwipedIdsRef.current = locallySwipedIds;
  }, [blockedIds, passedTodayIds, inQueueIds, locallySwipedIds]);

  // `unlockedCountries` is a plain array from a parent prop that may get a
  // fresh identity on unrelated re-renders - a ref plus a stable string key
  // (below) avoids recreating the fetch/candidate callbacks every render,
  // same reasoning as the Set/Map refs above.
  const unlockedCountriesKey = (unlockedCountries || []).join(',');
  useEffect(() => {
    unlockedCountriesRef.current = unlockedCountries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedCountriesKey]);
  useEffect(() => {
    isPremiumRef.current = isPremium;
    userCountryCodeRef.current = userCountryCode;
  }, [isPremium, userCountryCode]);

  useEffect(() => {
    likedMeIdsRef.current = likedMeIds;
  }, [likedMeIds]);

  useEffect(() => {
    likerProfilesRef.current = likerProfiles;
  }, [likerProfiles]);
  
  const injectedIdsRef = useRef<Set<string>>(new Set());

  // Persisted reveal-cycle state (see likeBackCycleStorage.ts) - loaded/reloaded
  // whenever the effective user changes, since it must survive reloads.
  const cycleRef = useRef<LikeBackCycleState | null>(null);
  const cycleUserIdRef = useRef<string | undefined>(undefined);
  const ensureCycleLoaded = useCallback(() => {
    if (cycleRef.current === null || cycleUserIdRef.current !== userId) {
      cycleRef.current = readLikeBackCycle(userId);
      cycleUserIdRef.current = userId;
    }
    return cycleRef.current;
  }, [userId]);
  useEffect(() => {
    cycleRef.current = readLikeBackCycle(userId);
    cycleUserIdRef.current = userId;
  }, [userId]);

  // Whether this user has ever received a like, ever - gates the whole cycle
  // on. Set true (permanently, for this ref's lifetime - persisted via the
  // cycle state once the cycle actually starts) the moment we observe any
  // `likes` row for them, from either the initial fetch or the realtime feed.
  const everReceivedLikeRef = useRef(false);

  // Guard against overlapping/thrashing fetches (can exhaust browser resources)
  const fetchInFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  // Fetch users who liked the current user
  const fetchLikedMeUsers = useCallback(async () => {
    if (!userId) return;

    const now = Date.now();
    // Avoid hammering the backend due to rapidly changing Set/Map identities in parent
    if (fetchInFlightRef.current) return;
    if (now - lastFetchAtRef.current < 8000) return; // 8s minimum interval
    fetchInFlightRef.current = true;
    lastFetchAtRef.current = now;

    try {
      // Get users who liked the current user (excluding already matched/liked back)
      const { data: likedUsers, error: likesError } = await supabase
        .from('likes')
        .select('liker_id, created_at')
        .eq('liked_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (likesError) {
        console.error('[LikeBackInjection] Error fetching liked me users:', likesError);
        return;
      }

      // `likedUsers` is every like ever received (matched or not) - its mere
      // presence is exactly "has this user ever received a like", independent
      // of the further eligibility filtering below.
      if ((likedUsers || []).length > 0) {
        everReceivedLikeRef.current = true;
      }

      const likerIds = (likedUsers || []).map(l => l.liker_id).filter(Boolean);
      if (likerIds.length === 0) {
        setLikedMeIds([]);
        return;
      }

      // Get only the subset of users I've already liked back (bounded to current likers)
      // This prevents huge downloads for accounts with lots of historical likes.
      const { data: myLikes, error: myLikesError } = await supabase
        .from('likes')
        .select('liked_id') 
        .eq('liker_id', userId)
        .in('liked_id', likerIds);

      if (myLikesError) {
        console.error('[LikeBackInjection] Error fetching my like-backs:', myLikesError);
        // Continue; worst case we may over-include candidates, but will still filter later.
      }

      const myLikedIds = new Set(myLikes?.map(l => l.liked_id) || []);

      // Build a map of liker_id -> liked_at timestamp for recency sorting
      const likerTimestampMap = new Map<string, number>();
      (likedUsers || []).forEach(l => {
        likerTimestampMap.set(l.liker_id, new Date(l.created_at).getTime());
      });

      // Filter out already liked back, blocked, passed today, already in queue
      const candidates = (likedUsers || [])
        .map(l => l.liker_id)
        .filter(id => 
          !myLikedIds.has(id) &&
          !blockedIdsRef.current.has(id) &&
          !passedTodayIdsRef.current.has(id) &&
          !inQueueIdsRef.current.has(id) &&
          !locallySwipedIdsRef.current.has(id) &&
          !injectedIdsRef.current.has(id)
        );

      if (candidates.length === 0) {
        setLikedMeIds([]);
        return;
      }

      // Country rule (same as every other candidate source on Discover):
      // premium = home + unlocked countries, free = home country only. Fail
      // closed - without a known allowed-country set, show nobody rather
      // than everybody.
      const likeBackUserCC = normalizeCountryCode(userCountryCode);
      const likeBackAllowedCountryCodes = Array.from(new Set([
        ...(likeBackUserCC ? [likeBackUserCC] : []),
        ...(isPremium ? unlockedCountriesRef.current.map(normalizeCountryCode).filter(Boolean) : []),
      ]));

      if (likeBackAllowedCountryCodes.length === 0) {
        setLikedMeIds([]);
        return;
      }

      // Fetch profiles with image count for quality filter
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, bio, city, country, country_code,
          occupation, education_level, date_of_birth, interests, favorites, gender,
          latitude, longitude, fun_fact, perfect_first_date, last_googled,
          relationship_intent, smoking, drinking, exercise_level,
          sleeping_schedule, introvert_extrovert, spontaneous_planner,
          messy_organized, adinkra_symbols, is_verified
        `)
        .in('id', candidates)
        .in('country_code', likeBackAllowedCountryCodes)
        .eq('account_status', 'active')
        .eq('is_admin', false);

      if (profilesError) {
        console.error('[LikeBackInjection] Error fetching liker profiles:', profilesError);
        return;
      }

      // Get image counts for quality filter
      const { data: imageCounts } = await supabase
        .from('user_images')
        .select('user_id')
        .in('user_id', candidates)
        .eq('is_approved', true);

      const imageCountMap = new Map<string, number>();
      (imageCounts || []).forEach(row => {
        imageCountMap.set(row.user_id, (imageCountMap.get(row.user_id) || 0) + 1);
      });

      // Filter by quality (2+ photos) and build profile map with liked_at timestamp
      const qualifiedProfiles = new Map<string, LikerProfile>();
      const qualifiedWithTimestamp: { id: string; liked_at: number }[] = [];

      (profiles || []).forEach(p => {
        const imgCount = imageCountMap.get(p.id) || 0;
        if (imgCount >= MIN_PHOTOS_REQUIRED) {
          const likedAt = likerTimestampMap.get(p.id) || 0;
          qualifiedProfiles.set(p.id, {
            ...p,
            image_count: imgCount,
            liked_at: likedAt,
          } as LikerProfile);
          qualifiedWithTimestamp.push({ id: p.id, liked_at: likedAt });
        }
      });

      // Sort by most recent like first (higher timestamp = more recent)
      qualifiedWithTimestamp.sort((a, b) => b.liked_at - a.liked_at);
      const qualifiedIds = qualifiedWithTimestamp.map(item => item.id);

      setLikerProfiles(qualifiedProfiles);
      setLikedMeIds(qualifiedIds);
    } catch (error) {
      console.error('[LikeBackInjection] Unexpected error:', error);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [userId, isPremium, userCountryCode, unlockedCountriesKey]);

  // Initial fetch
  useEffect(() => {
    fetchLikedMeUsers();
  }, [fetchLikedMeUsers]);

  // Realtime subscription for new likes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`likes-me-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'likes',
          filter: `liked_id=eq.${userId}`,
        },
        async (payload) => {
          const newLikerId = payload.new?.liker_id;
          if (!newLikerId) return;

          // Any INSERT on `likes` targeting this user is, definitionally, a like received.
          everReceivedLikeRef.current = true;

          const currentLikedMeIds = likedMeIdsRef.current;

          // Skip if already known, blocked, passed, or in queue
          if (
            currentLikedMeIds.includes(newLikerId) ||
            blockedIdsRef.current.has(newLikerId) ||
            passedTodayIdsRef.current.has(newLikerId) ||
            inQueueIdsRef.current.has(newLikerId) ||
            locallySwipedIdsRef.current.has(newLikerId) ||
            injectedIdsRef.current.has(newLikerId)
          ) {
            return;
          }

          // Fetch profile for quality check
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select(`
                id, first_name, last_name, bio, city, country, country_code,
                occupation, education_level, date_of_birth, interests, favorites, gender,
                latitude, longitude, fun_fact, perfect_first_date, last_googled,
                relationship_intent, smoking, drinking, exercise_level,
                sleeping_schedule, introvert_extrovert, spontaneous_planner,
                messy_organized, adinkra_symbols, is_verified
              `)
              .eq('id', newLikerId)
              .eq('account_status', 'active')
              .eq('is_admin', false)
              .single();

            if (!profile) return;

            // Same country rule as the initial fetch: premium = home +
            // unlocked countries, free = home country only.
            const realtimeUserCC = normalizeCountryCode(userCountryCodeRef.current);
            const realtimeAllowedCountryCodes = new Set([
              ...(realtimeUserCC ? [realtimeUserCC] : []),
              ...(isPremiumRef.current ? unlockedCountriesRef.current.map(normalizeCountryCode).filter(Boolean) : []),
            ]);
            const profileCC = normalizeCountryCode(profile.country_code || profile.country || '');
            if (!profileCC || !realtimeAllowedCountryCodes.has(profileCC)) return;

            // Check image count
            const { count } = await supabase
              .from('user_images')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', newLikerId)
              .eq('is_approved', true);

            const imgCount = count || 0;
            if (imgCount < MIN_PHOTOS_REQUIRED) return;

            const createdAt = payload.new?.created_at;
            const likedAt = createdAt ? new Date(createdAt).getTime() : Date.now();

            // Add to candidates (at front for priority)
            setLikedMeIds(prev => [newLikerId, ...prev]);
            setLikerProfiles(prev => {
              const updated = new Map(prev);
              updated.set(newLikerId, { ...profile, image_count: imgCount, liked_at: likedAt } as LikerProfile);
              return updated;
            });
          } catch (error) {
            console.error('[LikeBackInjection] Error processing realtime like:', error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);


  // Get injection candidate - country-restricted for everyone (premium =
  // home + unlocked countries, free = home country only), plus a distance
  // cap for free users specifically.
  const getInjectionCandidate = useCallback((): LikerProfile | null => {
    const userCC = normalizeCountryCode(userCountryCode);
    const allowedCountryCodes = new Set([
      ...(userCC ? [userCC] : []),
      ...(isPremium ? unlockedCountries.map(normalizeCountryCode).filter(Boolean) : []),
    ]);

    // Fail-closed: with no known allowed country, show nobody.
    if (allowedCountryCodes.size === 0) return null;

    for (const id of likedMeIds) {
      if (
        !blockedIds.has(id) &&
        !passedTodayIds.has(id) &&
        !inQueueIds.has(id) &&
        !locallySwipedIds.has(id) &&
        !injectedIdsRef.current.has(id)
      ) {
        const profile = likerProfiles.get(id);
        if (!profile) continue;

        const profileCC = normalizeCountryCode(profile.country_code);
        const profileCN = normalizeCountryCode(profile.country);

        // If both exist but disagree, treat as bad data and skip.
        if (profileCC && profileCN && profileCC !== profileCN) {
          continue;
        }

        const effectiveProfileCC = profileCC || profileCN;

        // Must be home country, or (premium) one of the unlocked countries.
        if (!effectiveProfileCC || !allowedCountryCodes.has(effectiveProfileCC)) {
          continue;
        }

        // Free users only: must also be within max distance (if coordinates available)
        if (
          !isPremium &&
          userLatitude != null &&
          userLongitude != null &&
          profile.latitude != null &&
          profile.longitude != null
        ) {
          const distance = calculateDistanceKm(
            userLatitude,
            userLongitude,
            profile.latitude,
            profile.longitude
          );
          if (distance > maxDistance) {
            continue;
          }
        }

        return profile;
      }
    }
    return null;
  }, [likedMeIds, likerProfiles, blockedIds, passedTodayIds, inQueueIds, locallySwipedIds, isPremium, userCountryCode, unlockedCountries, userLatitude, userLongitude, maxDistance]);

  // Convert liker profile to PotentialMatch format
  const likerToMatch = useCallback((liker: LikerProfile): PotentialMatch => {
    return {
      id: liker.id,
      first_name: liker.first_name || '',
      last_name: liker.last_name || '',
      bio: liker.bio || '',
      city: liker.city || '',
      country: liker.country || '',
      country_code: liker.country_code || '',
      occupation: liker.occupation || '',
      education_level: liker.education_level || '',
      date_of_birth: liker.date_of_birth || '',
      interests: liker.interests || [],
      favorites: parseFavorites(liker.favorites),
      images: [], // Will be loaded by DiscoverPage
      is_verified: liker.is_verified || undefined,
      gender: liker.gender || '',
      latitude: liker.latitude || undefined,
      longitude: liker.longitude || undefined,
      fun_fact: liker.fun_fact || undefined,
      perfect_first_date: liker.perfect_first_date || undefined,
      last_googled: liker.last_googled || undefined,
      relationship_intent: liker.relationship_intent || undefined,
      smoking: liker.smoking || undefined,
      drinking: liker.drinking || undefined,
      exercise_level: liker.exercise_level || undefined,
      sleeping_schedule: liker.sleeping_schedule || undefined,
      introvert_extrovert: liker.introvert_extrovert || undefined,
      spontaneous_planner: liker.spontaneous_planner || undefined,
      messy_organized: liker.messy_organized || undefined,
      adinkra_symbols: liker.adinkra_symbols || undefined,
    };
  }, []);

  // Calculate injection position - never in the first 3 positions of the queue
  const getInjectionPosition = useCallback((queueLength: number): number => {
    const minPos = INJECTION_POSITION_MIN;
    const maxPos = Math.min(INJECTION_POSITION_MAX, queueLength);
    
    if (maxPos < minPos) return minPos;
    
    // Random position between min and max
    const range = maxPos - minPos + 1;
    const offset = Math.floor(Math.random() * range);
    return minPos + offset;
  }, []);

  // Main injection function - call this after each real swipe. Advances the
  // persisted cycle by one swipe regardless of candidate availability (the
  // cycle's clock keeps ticking even through a dry spell - only the reveal
  // itself gets skipped when there's no quality candidate), then persists
  // the result so it survives a reload mid-burst or mid-quiet-gap.
  const onSwipe = useCallback(<T extends { id: string }>(
    queue: T[],
    addToQueue: (profile: PotentialMatch, position: number) => void
  ) => {
    if (!userId) return;
    const current = ensureCycleLoaded();
    const { next, shouldInject } = advanceLikeBackCycle(current, everReceivedLikeRef.current);
    cycleRef.current = next;

    if (!shouldInject) {
      writeLikeBackCycle(userId, next);
      return;
    }

    const candidate = getInjectionCandidate();
    // No eligible candidate right now - this slot is simply skipped, not
    // deferred to a later swipe, per "no bad cards are forced in".
    if (!candidate) {
      writeLikeBackCycle(userId, next);
      return;
    }

    const position = getInjectionPosition(queue.length);
    const match = likerToMatch(candidate);

    injectedIdsRef.current.add(candidate.id);
    next.lastInjectionAtSwipeGlobal = next.swipesGlobal;
    cycleRef.current = next;
    writeLikeBackCycle(userId, next);

    // Remove from candidates
    setLikedMeIds(prev => prev.filter(id => id !== candidate.id));

    // Insert into queue
    addToQueue(match, position);
  }, [userId, ensureCycleLoaded, getInjectionCandidate, getInjectionPosition, likerToMatch]);

  // Check if a profile ID is a "liked me" profile (for UI hints)
  const isLikedMeProfile = useCallback((profileId: string): boolean => {
    return likedMeIds.includes(profileId) || injectedIdsRef.current.has(profileId);
  }, [likedMeIds]);

  // Reset injection tracking. NOTE: this wipes the persisted cycle (including
  // hasStarted and any in-progress quiet gap) - only meant for an explicit
  // "start over" action (e.g. admin/testing), never called on a normal
  // reload/new session, since the whole point of persisting the cycle is
  // that reloads must NOT reset it.
  const resetInjectionTracking = useCallback(() => {
    const fresh = readLikeBackCycle(undefined); // defaults, not tied to any user
    cycleRef.current = { ...fresh };
    if (userId) writeLikeBackCycle(userId, cycleRef.current);
    injectedIdsRef.current.clear();
  }, [userId]);

  // Refresh candidates
  const refreshCandidates = useCallback(() => {
    fetchLikedMeUsers();
  }, [fetchLikedMeUsers]);

  return {
    likedMeIds,
    onSwipe,
    isLikedMeProfile,
    resetInjectionTracking,
    refreshCandidates,
    candidateCount: likedMeIds.length,
  };
}

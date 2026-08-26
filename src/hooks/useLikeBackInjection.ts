import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PotentialMatch } from '@/types';
import { normalizeCountryCode } from '@/utils/countryCode';

/**
 * 30% Like-Back Injection Hook
 * 
 * Implements Tinder-style "like-back injection" where profiles that liked the current user
 * are injected into the swipe queue at strategic positions.
 * 
 * Rules:
 * - 30% injection rate = ~1 injected profile every 3-4 cards
 * - Never inject as "next card" - use positions +2 to +4
 * - Cap: max 30% of cards per session (only after 10+ swipes to avoid early blocking)
 * - Cooldown: at least 3 swipes between injections
 * - Quality filter: only inject likers with 2+ photos
 * - Deduplicate: avoid same ID appearing twice
 * - Respect: passed today + blocked profiles excluded
 * - Priority: most recent likers first (for higher match probability)
 */

interface UseLikeBackInjectionOptions {
  userId: string | undefined;
  blockedIds: Set<string>;
  passedTodayIds: Set<string>;
  inQueueIds: Set<string>;
  locallySwipedIds: Map<string, { action: 'like' | 'pass'; timestamp: number }>;
  boostMode?: boolean; // Optional: 90% injection rate for turbo mode
  // Location-based filtering for free users
  isPremium?: boolean;
  userCountryCode?: string;
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
const NORMAL_INJECT_RATE = 0.30; // 30% normal
const BOOST_INJECT_RATE = 0.90; // 90% boost mode
const COOLDOWN_SWIPES = 3; // At least 3 swipes between injections
const MIN_PHOTOS_REQUIRED = 2; // Quality filter
const INJECTION_POSITION_MIN = 2; // Position +2
const INJECTION_POSITION_MAX = 4; // Position +4
const MAX_INJECTION_PERCENT = 0.30; // Cap at 30% of session
const MIN_SWIPES_FOR_CAP = 10; // Only enforce cap after 10+ swipes

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
  boostMode = false,
  isPremium = false,
  userCountryCode,
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

  useEffect(() => {
    blockedIdsRef.current = blockedIds;
    passedTodayIdsRef.current = passedTodayIds;
    inQueueIdsRef.current = inQueueIds;
    locallySwipedIdsRef.current = locallySwipedIds;
  }, [blockedIds, passedTodayIds, inQueueIds, locallySwipedIds]);

  useEffect(() => {
    likedMeIdsRef.current = likedMeIds;
  }, [likedMeIds]);

  useEffect(() => {
    likerProfilesRef.current = likerProfiles;
  }, [likerProfiles]);
  
  // Track injection state (single counter, no double counting)
  const swipeCountRef = useRef(0);
  const injectedCountRef = useRef(0);
  const lastInjectionSwipeRef = useRef(0);
  const injectedIdsRef = useRef<Set<string>>(new Set());

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

      // Fetch profiles with image count for quality filter
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, bio, city, country, country_code,
          occupation, education_level, date_of_birth, interests, gender,
          latitude, longitude, fun_fact, perfect_first_date, last_googled,
          relationship_intent, smoking, drinking, exercise_level,
          sleeping_schedule, introvert_extrovert, spontaneous_planner,
          messy_organized, adinkra_symbols, is_verified
        `)
        .in('id', candidates)
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
  }, [userId]);

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
                occupation, education_level, date_of_birth, interests, gender,
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

  // Get effective injection rate based on mode
  const injectRate = boostMode ? BOOST_INJECT_RATE : NORMAL_INJECT_RATE;
  const everyNSwipes = Math.round(1 / injectRate); // 3 for 30%, 1 for 90%

  // Check if we should inject on this swipe
  const shouldInjectNow = useCallback((): boolean => {
    const swipes = swipeCountRef.current;
    const injected = injectedCountRef.current;

    // No candidates available
    if (likedMeIds.length === 0) return false;

    // Don't exceed 30% injection cap (only after MIN_SWIPES_FOR_CAP swipes to avoid early blocking)
    if (swipes >= MIN_SWIPES_FOR_CAP && injected / swipes >= MAX_INJECTION_PERCENT) return false;

    // Cooldown: at least COOLDOWN_SWIPES swipes since last injection
    if (swipes - lastInjectionSwipeRef.current < COOLDOWN_SWIPES) return false;

    // Main check: every Nth swipe based on inject rate
    return swipes > 0 && swipes % everyNSwipes === 0;
  }, [likedMeIds.length, everyNSwipes]);

  // Get injection candidate - respects location filtering for free users
  const getInjectionCandidate = useCallback((): LikerProfile | null => {
    const userCC = normalizeCountryCode(userCountryCode);

    // Free users must have a known country; otherwise fail-closed.
    if (!isPremium && !userCC) return null;
    
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
        
        // For FREE users: enforce same country AND distance filtering
        if (!isPremium) {
          const profileCC = normalizeCountryCode(profile.country_code);
          const profileCN = normalizeCountryCode(profile.country);

          // If both exist but disagree, treat as bad data and skip.
          if (profileCC && profileCN && profileCC !== profileCN) {
            continue;
          }

          const effectiveProfileCC = profileCC || profileCN;
          
          // Must be same country
          if (!effectiveProfileCC || userCC !== effectiveProfileCC) {
            continue;
          }
          
          // Must be within max distance (if coordinates available)
          if (
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
        }
        
        return profile;
      }
    }
    return null;
  }, [likedMeIds, likerProfiles, blockedIds, passedTodayIds, inQueueIds, locallySwipedIds, isPremium, userCountryCode, userLatitude, userLongitude, maxDistance]);

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

  // Calculate injection position (+2 to +4, never next card)
  const getInjectionPosition = useCallback((queueLength: number): number => {
    const minPos = INJECTION_POSITION_MIN;
    const maxPos = Math.min(INJECTION_POSITION_MAX, queueLength);
    
    if (maxPos < minPos) return minPos;
    
    // Random position between min and max
    const range = maxPos - minPos + 1;
    const offset = Math.floor(Math.random() * range);
    return minPos + offset;
  }, []);

  // Main injection function - call this after each swipe
  const onSwipe = useCallback(<T extends { id: string }>(
    queue: T[],
    addToQueue: (profile: PotentialMatch, position: number) => void
  ) => {
    swipeCountRef.current += 1;

    if (!shouldInjectNow()) return;

    const candidate = getInjectionCandidate();
    if (!candidate) return;

    const position = getInjectionPosition(queue.length);
    const match = likerToMatch(candidate);

    // Mark as injected
    injectedIdsRef.current.add(candidate.id);
    injectedCountRef.current += 1;
    lastInjectionSwipeRef.current = swipeCountRef.current;

    // Remove from candidates
    setLikedMeIds(prev => prev.filter(id => id !== candidate.id));

    // Insert into queue
    addToQueue(match, position);
  }, [shouldInjectNow, getInjectionCandidate, getInjectionPosition, likerToMatch]);

  // Check if a profile ID is a "liked me" profile (for UI hints)
  const isLikedMeProfile = useCallback((profileId: string): boolean => {
    return likedMeIds.includes(profileId) || injectedIdsRef.current.has(profileId);
  }, [likedMeIds]);

  // Reset injection tracking (e.g., on new session)
  const resetInjectionTracking = useCallback(() => {
    swipeCountRef.current = 0;
    injectedCountRef.current = 0;
    lastInjectionSwipeRef.current = 0;
    injectedIdsRef.current.clear();
  }, []);

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

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PotentialMatch } from '@/types';

/**
 * 25% Like-Back Injection Hook
 * 
 * Implements Tinder-style "like-back injection" where profiles that liked the current user
 * are injected into the swipe queue at strategic positions.
 * 
 * Rules:
 * - 25% injection rate = 1 injected profile every 4 cards
 * - Never inject as "next card" - use positions +2 to +4
 * - Cap: max 25% of cards per session
 * - Cooldown: only 1 injection every 4 swipes minimum
 * - Quality filter: only inject likers with 2+ photos
 * - Deduplicate: avoid same ID appearing twice
 * - Respect: passed today + blocked profiles excluded
 */

interface UseLikeBackInjectionOptions {
  userId: string | undefined;
  blockedIds: Set<string>;
  passedTodayIds: Set<string>;
  inQueueIds: Set<string>;
  locallySwipedIds: Map<string, { action: 'like' | 'pass'; timestamp: number }>;
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
}

// Configuration
const INJECT_RATE = 0.25; // 25%
const EVERY_N_SWIPES = Math.round(1 / INJECT_RATE); // 4
const MIN_PHOTOS_REQUIRED = 2; // Quality filter
const INJECTION_POSITION_MIN = 2; // Position +2
const INJECTION_POSITION_MAX = 4; // Position +4
const MAX_INJECTION_PERCENT = 0.25; // Cap at 25% of session

export function useLikeBackInjection({
  userId,
  blockedIds,
  passedTodayIds,
  inQueueIds,
  locallySwipedIds,
}: UseLikeBackInjectionOptions) {
  // Users who liked the current user (candidates for injection)
  const [likedMeIds, setLikedMeIds] = useState<string[]>([]);
  const [likerProfiles, setLikerProfiles] = useState<Map<string, LikerProfile>>(new Map());
  
  // Track injection state
  const swipeCountRef = useRef(0);
  const injectedCountRef = useRef(0);
  const totalSwipesRef = useRef(0);
  const lastInjectionSwipeRef = useRef(0);
  const injectedIdsRef = useRef<Set<string>>(new Set());

  // Fetch users who liked the current user
  const fetchLikedMeUsers = useCallback(async () => {
    if (!userId) return;

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

      // Get users I've already liked back
      const { data: myLikes } = await supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', userId);

      const myLikedIds = new Set(myLikes?.map(l => l.liked_id) || []);

      // Filter out already liked back, blocked, passed today, already in queue
      const candidates = (likedUsers || [])
        .map(l => l.liker_id)
        .filter(id => 
          !myLikedIds.has(id) &&
          !blockedIds.has(id) &&
          !passedTodayIds.has(id) &&
          !inQueueIds.has(id) &&
          !locallySwipedIds.has(id) &&
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
        .eq('is_admin', false)
        .eq('is_archived', false);

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

      // Filter by quality (2+ photos) and build profile map
      const qualifiedProfiles = new Map<string, LikerProfile>();
      const qualifiedIds: string[] = [];

      (profiles || []).forEach(p => {
        const imgCount = imageCountMap.get(p.id) || 0;
        if (imgCount >= MIN_PHOTOS_REQUIRED) {
          qualifiedProfiles.set(p.id, {
            ...p,
            image_count: imgCount,
          } as LikerProfile);
          qualifiedIds.push(p.id);
        }
      });

      setLikerProfiles(qualifiedProfiles);
      setLikedMeIds(qualifiedIds);
    } catch (error) {
      console.error('[LikeBackInjection] Unexpected error:', error);
    }
  }, [userId, blockedIds, passedTodayIds, inQueueIds, locallySwipedIds]);

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

          // Skip if already known, blocked, passed, or in queue
          if (
            likedMeIds.includes(newLikerId) ||
            blockedIds.has(newLikerId) ||
            passedTodayIds.has(newLikerId) ||
            inQueueIds.has(newLikerId) ||
            locallySwipedIds.has(newLikerId) ||
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
              .eq('is_archived', false)
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

            // Add to candidates (at front for priority)
            setLikedMeIds(prev => [newLikerId, ...prev]);
            setLikerProfiles(prev => {
              const updated = new Map(prev);
              updated.set(newLikerId, { ...profile, image_count: imgCount } as LikerProfile);
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
  }, [userId, likedMeIds, blockedIds, passedTodayIds, inQueueIds, locallySwipedIds]);

  // Check if we should inject on this swipe
  const shouldInjectNow = useCallback((): boolean => {
    const swipes = swipeCountRef.current;
    const total = totalSwipesRef.current;
    const injected = injectedCountRef.current;

    // No candidates available
    if (likedMeIds.length === 0) return false;

    // Don't exceed 25% injection cap
    if (total > 0 && injected / total >= MAX_INJECTION_PERCENT) return false;

    // Cooldown: at least 4 swipes since last injection
    if (swipes - lastInjectionSwipeRef.current < EVERY_N_SWIPES) return false;

    // Main check: every 4th swipe
    return swipes > 0 && swipes % EVERY_N_SWIPES === 0;
  }, [likedMeIds.length]);

  // Get injection candidate
  const getInjectionCandidate = useCallback((): LikerProfile | null => {
    for (const id of likedMeIds) {
      if (
        !blockedIds.has(id) &&
        !passedTodayIds.has(id) &&
        !inQueueIds.has(id) &&
        !locallySwipedIds.has(id) &&
        !injectedIdsRef.current.has(id)
      ) {
        const profile = likerProfiles.get(id);
        if (profile) return profile;
      }
    }
    return null;
  }, [likedMeIds, likerProfiles, blockedIds, passedTodayIds, inQueueIds, locallySwipedIds]);

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
    totalSwipesRef.current += 1;

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

    console.log('[LikeBackInjection] Injected profile:', {
      id: candidate.id,
      name: `${candidate.first_name} ${candidate.last_name}`,
      position,
      totalInjected: injectedCountRef.current,
      totalSwipes: totalSwipesRef.current,
    });
  }, [shouldInjectNow, getInjectionCandidate, getInjectionPosition, likerToMatch]);

  // Check if a profile ID is a "liked me" profile (for UI hints)
  const isLikedMeProfile = useCallback((profileId: string): boolean => {
    return likedMeIds.includes(profileId) || injectedIdsRef.current.has(profileId);
  }, [likedMeIds]);

  // Reset injection tracking (e.g., on new session)
  const resetInjectionTracking = useCallback(() => {
    swipeCountRef.current = 0;
    injectedCountRef.current = 0;
    totalSwipesRef.current = 0;
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

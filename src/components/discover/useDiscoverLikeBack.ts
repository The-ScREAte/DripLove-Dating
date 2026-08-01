import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { CurrentUser } from '@/types';
import { useLikeBackInjection } from '@/hooks/useLikeBackInjection';
import { MatchOrAd } from './discoverTypes';

interface SwipeRecord {
  action: 'like' | 'pass';
  timestamp: number;
}

interface UseDiscoverLikeBackParams {
  currentUser: CurrentUser;
  premiumActive: boolean;
  potentialMatches: MatchOrAd[];
  blockedUserIds: string[];
  locallySwipedProfileIds: MutableRefObject<Map<string, SwipeRecord>>;
  isAd: (match: MatchOrAd) => boolean;
}

export const useDiscoverLikeBack = ({
  currentUser,
  premiumActive,
  potentialMatches,
  blockedUserIds,
  locallySwipedProfileIds,
  isAd,
}: UseDiscoverLikeBackParams) => {
  const blockedIdsSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds]);

  const passedTodayIdsSet = (() => {
    const passedToday = new Set<string>();
    for (const [id, data] of locallySwipedProfileIds.current.entries()) {
      if (data.action === 'pass') {
        passedToday.add(id);
      }
    }
    return passedToday;
  })();

  const inQueueIdsSet = useMemo(() => {
    const inQueue = new Set<string>();
    potentialMatches.forEach((m) => {
      if (!isAd(m)) inQueue.add(m.id);
    });
    return inQueue;
  }, [potentialMatches, isAd]);

  const likeBackMaxDistance = (() => {
    const userMax = currentUser?.max_distance || currentUser?.distance_preference || 500;
    const FREE_USER_MAX = 500;
    return premiumActive ? userMax : Math.min(userMax, FREE_USER_MAX);
  })();

  const {
    onSwipe: onLikeBackSwipe,
    isLikedMeProfile,
    candidateCount: likeBackCandidateCount,
    refreshCandidates: refreshLikeBackCandidates,
  } = useLikeBackInjection({
    userId: currentUser?.id,
    blockedIds: blockedIdsSet,
    passedTodayIds: passedTodayIdsSet,
    inQueueIds: inQueueIdsSet,
    locallySwipedIds: locallySwipedProfileIds.current,
    isPremium: premiumActive,
    userCountryCode: currentUser?.country_code || currentUser?.country,
    userLatitude: currentUser?.latitude,
    userLongitude: currentUser?.longitude,
    maxDistance: likeBackMaxDistance,
  });

  return {
    onLikeBackSwipe,
    isLikedMeProfile,
    likeBackCandidateCount,
    refreshLikeBackCandidates,
  };
};

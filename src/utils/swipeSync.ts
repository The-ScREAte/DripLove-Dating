export type SwipeDecision = 'like' | 'pass';

export const publishSwipeDecision = (userId: string, profileId: string, type: SwipeDecision): void => {
  if (typeof window === 'undefined') return;
  window.circleCache?.delete(userId);
  window.circleRowsCache?.delete(userId);
  window.dispatchEvent(new CustomEvent('profileDecided', { detail: { userId, profileId, type } }));
};
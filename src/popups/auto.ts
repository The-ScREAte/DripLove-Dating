import { useEffect } from 'react';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { cancelPopup, requestPopup } from './instance';

const RECHECK_MS = 5 * 60_000;

/**
 * Asks for the free-trial offer while the account is trial-eligible. The coordinator applies the
 * 10-minute-on-app wait, the 3-day cadence and every "not now" rule; we just keep the request alive
 * (re-asked every few minutes and on foreground) and withdraw it the moment the account stops being eligible.
 */
export const useFreeTrialPopupRequests = (userId: string | undefined): void => {
  const { loading, eligibleForTrial } = useFreeTrialOffer(userId);

  useEffect(() => {
    if (!userId || loading) return undefined;
    if (!eligibleForTrial) {
      cancelPopup('free-trial');
      return undefined;
    }
    const ask = () => requestPopup('free-trial', { userId, state: 'eligible' as const }, { ttlMs: 30 * 60_000 });
    ask();
    const interval = setInterval(ask, RECHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') ask();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, loading, eligibleForTrial]);
};

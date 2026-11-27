import { useEffect } from 'react';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { cancelPopup, popupStore, requestPopup } from './instance';
import { festivalDue } from './festive';

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

/**
 * Asks for the festive greeting while a festival is on and this person has not had it yet. Nothing is requested on
 * ordinary days or once the festival has passed, so a greeting that was missed never turns up late.
 */
export const useFestivePopupRequest = (userId: string | undefined): void => {
  useEffect(() => {
    if (!userId) return undefined;
    const ask = () => {
      const key = festivalDue(userId);
      if (key) requestPopup('festive-greeting', { userId, key }, { ttlMs: 20 * 60_000, delayMs: 2500 });
      // Withdraw a queued request, but never close the greeting while the person is looking at it (it is marked
      // seen the moment it appears, so returning from the background would otherwise make it vanish).
      else if (!popupStore.isActive('festive-greeting')) cancelPopup('festive-greeting');
    };
    ask();
    const onVisible = () => {
      if (document.visibilityState === 'visible') ask();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);
};

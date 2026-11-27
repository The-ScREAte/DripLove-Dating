/**
 * RatingHost - renders nothing. Mount ONCE inside the logged-in app shell.
 *
 * It counts sessions, mirrors the account's has_rated_app flag, and when a
 * happy moment is recorded it asks the popup coordinator for the 'rating-funnel'
 * slot after a short "afterglow". The coordinator decides WHEN it can really
 * show (never while typing, swiping, in a call, onboarding...), re-checks
 * eligibility at that instant, and the slot calls the NATIVE review API.
 * No custom question and no reward - store rules (see ratingEngine.ts).
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { requestPopup } from '@/popups/instance';
import { RULES } from './ratingEngine';
import {
  mutateRatingState,
  recordRatingMoment,
  setRatingAccountCreatedAt,
  subscribeRatingMoments,
} from './ratingMoments';
import { isNativeApp } from './nativeReview';
import { getRatingDecision } from './ratingGate';
import { trackRating } from './ratingAnalytics';

const SESSION_FLAG = 'driplove_rating_session_counted';

interface RatingHostProps {
  userId: string | undefined;
  /** profiles.created_at (ISO) when available. */
  accountCreatedAt?: string | null;
  /** 0-100; reaching 100 records a (weak) happy moment once per account. */
  profileCompletion?: number;
}

const RatingHost = ({ userId, accountCreatedAt, profileCompletion }: RatingHostProps) => {
  useEffect(() => {
    const ms = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
    setRatingAccountCreatedAt(Number.isFinite(ms) ? ms : null);
  }, [accountCreatedAt]);

  // Count one session per app launch.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
      sessionStorage.setItem(SESSION_FLAG, '1');
    } catch {
      // ignore - worst case sessions are under-counted, which only delays asking
    }
    mutateRatingState((s) => ({ ...s, sessions: s.sessions + 1 }));
  }, []);

  // Mirror the account's has_rated_app flag so another device / reinstall stops asking.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('has_rated_app')
          .eq('id', userId)
          .maybeSingle();
        if (!cancelled && data?.has_rated_app) {
          mutateRatingState((s) => ({ ...s, hasRated: true }));
        }
      } catch {
        // offline - local state is enough
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Profile reached 100% -> weak happy moment (once per account).
  useEffect(() => {
    if (!userId || (profileCompletion ?? 0) < 100) return;
    const key = `driplove_rating_profile100_${userId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return;
    }
    recordRatingMoment('profile_complete');
  }, [userId, profileCompletion]);

  // A happy moment ended -> ask the coordinator for the slot after the afterglow.
  useEffect(() => {
    if (!isNativeApp()) return undefined; // web never asks
    return subscribeRatingMoments((trigger) => {
      const decision = getRatingDecision(trigger);
      if (!decision.ask) {
        trackRating('ask_skipped', { trigger, reason: decision.reason });
        return;
      }
      requestPopup('rating-funnel', trigger, { delayMs: RULES.afterglowMs, ttlMs: 2 * 60_000 });
    });
  }, []);

  return null;
};

export default RatingHost;

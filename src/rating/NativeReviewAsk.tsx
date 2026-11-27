/**
 * The 'rating-funnel' popup body: draws nothing. The coordinator calls this at
 * the moment it decided the user is free (and eligibility re-passed); the OS
 * shows its own review sheet (Apple StoreKit / Google Play In-App Review). We
 * never wrap, preface or reward it - store rules.
 */
import { useEffect, useRef } from 'react';
import { mutateRatingState } from './ratingMoments';
import { requestNativeReview } from './nativeReview';
import { trackRating } from './ratingAnalytics';

/** Never issue two requests within this window, whatever re-renders happen. */
const DOUBLE_FIRE_GUARD_MS = 60_000;

const NativeReviewAsk = ({ trigger, onDone }: { trigger?: string; onDone: () => void }) => {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return; // StrictMode / re-mount safety
    firedRef.current = true;

    const at = Date.now();
    let alreadyAsked = false;
    mutateRatingState((s) => {
      alreadyAsked = s.requests.some((t) => at - t < DOUBLE_FIRE_GUARD_MS);
      return alreadyAsked ? s : { ...s, requests: [...s.requests, at] };
    });
    if (!alreadyAsked) {
      trackRating('native_requested', { trigger });
      void requestNativeReview().then((result) => {
        if (result === 'error') trackRating('native_error', { trigger });
      });
    }
    onDone();
    // run exactly once per showing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default NativeReviewAsk;

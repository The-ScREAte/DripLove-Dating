import { useCallback, useEffect, useRef, useState } from 'react';
import FreeTrialBanner from '@/components/FreeTrialBanner';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { msUntilNextFreeTrialSheet, markFreeTrialSheetShown, FreeTrialSheetCadenceState } from '@/utils/freeTrialStorage';

interface FreeTrialBottomSheetProps {
  userId: string | undefined;
}

// A multi-day/week cadence wait is never worth holding a live timer open
// for - only schedule one when the next due time is already close; anything
// further out is simply re-checked (and shown, if due) next time the app is
// opened or brought to the foreground.
const MAX_SCHEDULE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Free-trial bottom sheet, mounted once, high in the app tree (MainApp).
 * Re-shows on a repeating cadence rather than a single "once ever" flag, so
 * it nudges free users toward the trial without ever bugging them:
 *  - First ever appearance waits until the user has been on DripLove for at
 *    least 7 minutes.
 *  - While still trial-eligible and not yet started, re-shows every 3 days.
 *  - Once their trial is used/cancelled (no longer eligible, not premium),
 *    backs off to every 3 weeks - the normal pay-to-use pitch, not a free
 *    one, since useFreeTrialOffer's trialEnded state already switches
 *    FreeTrialBanner's own copy/CTA to "Resubscribe" for this case.
 *  - Stops entirely once premium - useFreeTrialOffer's eligibleForTrial/
 *    trialEnded are both false for a premium user, so this component simply
 *    never schedules anything for them.
 */
const FreeTrialBottomSheet = ({ userId }: FreeTrialBottomSheetProps) => {
  const { loading, eligibleForTrial, trialEnded } = useFreeTrialOffer(userId);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const checkAndSchedule = useCallback(() => {
    if (loading || !userId || openRef.current) return undefined;
    if (!eligibleForTrial && !trialEnded) return undefined;

    const cadenceState: FreeTrialSheetCadenceState = eligibleForTrial ? 'eligible' : 'trialEnded';
    const msUntilDue = msUntilNextFreeTrialSheet(userId, cadenceState);

    if (msUntilDue > MAX_SCHEDULE_MS) {
      // Not due for a long while - don't hold a timer open for that; the
      // next app open/resume re-checks and shows it right on schedule.
      return undefined;
    }

    const delay = Math.max(msUntilDue, 0);
    const timer = setTimeout(() => {
      setOpen(true);
      markFreeTrialSheetShown(userId);
    }, delay);

    return () => clearTimeout(timer);
  }, [loading, eligibleForTrial, trialEnded, userId]);

  // Check on mount / whenever eligibility state changes.
  useEffect(() => {
    return checkAndSchedule();
  }, [checkAndSchedule]);

  // Also re-check whenever the app comes back to the foreground - a
  // multi-day cadence can easily become due while the app sits backgrounded
  // rather than fully closed, and that shouldn't require a fresh page load
  // to notice.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (state.isActive && !cancelled) {
            checkAndSchedule();
          }
        });
        if (cancelled) {
          listener.remove();
        } else {
          removeListener = () => listener.remove();
        }
      } catch {
        // Not on a native platform (or plugin unavailable) - ignore.
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [checkAndSchedule]);

  const close = () => setOpen(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center px-3" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={close}
      />
      <div className="relative w-full max-w-md animate-in zoom-in-95 fade-in duration-300">
        <FreeTrialBanner userId={userId} dismissible onDismiss={close} />
      </div>
    </div>
  );
};

export default FreeTrialBottomSheet;

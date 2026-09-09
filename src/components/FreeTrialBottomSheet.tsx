import { useEffect, useState } from 'react';
import FreeTrialBanner from '@/components/FreeTrialBanner';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';
import { isFreeTrialSheetEligible, markFreeTrialSheetShown } from '@/utils/freeTrialStorage';

interface FreeTrialBottomSheetProps {
  userId: string | undefined;
}

/**
 * One-time (per account, ever) bottom sheet shown shortly after the first
 * app open post-signup, offering the free trial. Mounted once, high in the
 * app tree (MainApp) - stays a no-op render until eligibility is confirmed,
 * then opens itself and marks itself as shown so it never reappears.
 */
const FreeTrialBottomSheet = ({ userId }: FreeTrialBottomSheetProps) => {
  const { loading, eligibleForTrial } = useFreeTrialOffer(userId);
  const [open, setOpen] = useState(false);
  const [everShown, setEverShown] = useState(false);

  useEffect(() => {
    if (loading || everShown || !userId) return;
    if (!eligibleForTrial) return;
    if (!isFreeTrialSheetEligible(userId)) return;

    // Small delay so this doesn't compete with whatever else renders on the
    // very first frame after login.
    const timer = setTimeout(() => {
      setOpen(true);
      setEverShown(true);
      markFreeTrialSheetShown(userId);
    }, 1200);

    return () => clearTimeout(timer);
  }, [loading, eligibleForTrial, everShown, userId]);

  const close = () => setOpen(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={close}
      />
      <div
        className="relative w-full max-w-md animate-in slide-in-from-bottom duration-300 px-3 pb-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />
        <FreeTrialBanner userId={userId} dismissible onDismiss={close} />
      </div>
    </div>
  );
};

export default FreeTrialBottomSheet;

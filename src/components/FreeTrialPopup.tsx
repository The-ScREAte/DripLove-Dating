import { useEffect } from 'react';
import FreeTrialBanner from '@/components/FreeTrialBanner';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';

interface FreeTrialPopupProps {
  userId: string | undefined;
  onClose: () => void;
}

/**
 * Free-trial offer modal. Drawn by the popup host; WHEN it appears (first after 10 min on the app,
 * then every 3 days / 21 days after a trial ended, never over another popup) is decided by the
 * coordinator - see src/popups/registry.tsx.
 */
const FreeTrialPopup = ({ userId, onClose }: FreeTrialPopupProps) => {
  const { loading, eligibleForTrial } = useFreeTrialOffer(userId);
  const notOffered = !loading && !eligibleForTrial;

  // Eligibility can flip between request and display (the store stops offering a trial):
  // never leave an empty backdrop on screen.
  useEffect(() => {
    if (notOffered) onClose();
  }, [notOffered, onClose]);

  if (loading || !eligibleForTrial) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center px-3" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative w-full max-w-md animate-in zoom-in-95 fade-in duration-300">
        <FreeTrialBanner userId={userId} dismissible onDismiss={onClose} />
      </div>
    </div>
  );
};

export default FreeTrialPopup;

/**
 * Dynamic Rating Dialog Component
 * Shows platform-specific rating interface - triggered on third match
 * Preloads native rating modal for instant display
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getRatingData, 
  markRatingShown, 
  markUserHasRated,
  incrementDismissCount 
} from '@/utils/ratingStorage';
import { 
  detectPlatform, 
  openRatingInterface,
  isRatingAvailable,
  type PlatformType 
} from '@/utils/ratingPlatform';
import { preloadNativeRating, isRatingPreloaded } from '@/services/appRatingService';

interface RatingDialogProps {
  /** Force show the dialog (for testing or when triggered by match) */
  show?: boolean;
  /** Callback when dialog closes */
  onClose?: () => void;
  /** Called when user completes rating */
  onRatingComplete?: (rating: number, platform: PlatformType) => void;
}

const RatingDialog: React.FC<RatingDialogProps> = ({ 
  show = false,
  onClose,
  onRatingComplete 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNativeReady, setIsNativeReady] = useState(false);
  const { toast } = useToast();
  const platform = useMemo(() => detectPlatform(), []);
  const ratingDataRef = useRef(getRatingData());
  const isWeb = platform === 'web';

  // Preload native rating as soon as dialog is about to show
  const doPreload = useCallback(async () => {
    if (!isWeb && !isRatingPreloaded()) {
      await preloadNativeRating();
    }
    setIsNativeReady(true);
  }, [isWeb]);

  useEffect(() => {
    if (show && isRatingAvailable()) {
      if (!ratingDataRef.current.hasRated) {
        // Start preloading immediately before opening dialog
        doPreload();
        setIsOpen(true);
        markRatingShown();
      }
    }
  }, [show, doPreload]);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const handleStarClick = (rating: number) => {
    setSelectedRating(rating);
  };

  const handleRateNow = async () => {
    if (isWeb && selectedRating === 0) {
      toast({
        title: "Please select a rating",
        description: "Tap the stars to rate your experience",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // For native platforms (iOS/Android), close dialog first then request review
      // Native modal is already preloaded for instant display
      if (!isWeb) {
        // Close our dialog first
        setIsOpen(false);
        onClose?.();

        // Small delay to ensure dialog is fully closed, then show native modal
        // Native modal is preloaded so it will appear instantly
        await new Promise<void>((resolve) => {
          requestAnimationFrame(async () => {
            try {
              await openRatingInterface();
              resolve();
            } catch (e) {
              resolve(); // Resolve even on error to continue flow
            }
          });
        });

        // Mark as rated
        markUserHasRated(platform);
        
        // Call callback
        if (onRatingComplete) {
          onRatingComplete(5, platform);
        }
      } else {
        // Web flow - submit rating directly
        await openRatingInterface(selectedRating);
        
        // Mark as rated
        markUserHasRated(platform);
        
        // Call callback
        if (onRatingComplete) {
          onRatingComplete(selectedRating, platform);
        }
        
        handleClose();
      }
    } catch (error) {
      // Don't show error for native platforms - the modal might not show due to rate limits
      if (platform === 'web') {
        toast({
          title: "Something went wrong",
          description: "Please try again later",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaybeLater = () => {
    incrementDismissCount();
    handleClose();
  };

  // Allow closing but record as dismiss
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      incrementDismissCount();
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md bg-black border border-pink-500/50 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="space-y-3 pt-2">
          <DialogTitle className="text-xl font-semibold text-center text-white">
            Rate DripLove
          </DialogTitle>
          <DialogDescription className="text-center text-gray-300 leading-relaxed">
            Your feedback helps us improve DripLove.<br />
            <span className="font-semibold text-pink-400">RATE US TO BE A PRIORITY!</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Star Rating - Only show for web */}
          {isWeb && (
            <div className="flex justify-center gap-3 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleStarClick(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110 active:scale-95 p-1"
                  aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoveredRating || selectedRating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-600'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleRateNow}
              disabled={isSubmitting || (isWeb && selectedRating === 0)}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-medium py-5"
            >
              {isSubmitting ? (
                'Please wait...'
              ) : (
                isWeb ? 'Submit Rating' : 'Rate Now'
              )}
            </Button>
            
            {/* Maybe Later button - always visible */}
            <Button
              variant="ghost"
              onClick={handleMaybeLater}
              className="w-full text-gray-400 hover:text-gray-200 hover:bg-neutral-800"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RatingDialog;

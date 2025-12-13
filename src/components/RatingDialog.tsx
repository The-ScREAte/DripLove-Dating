/**
 * Dynamic Rating Dialog Component
 * Shows platform-specific rating interface - triggered on second match
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Star, X } from 'lucide-react';
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
  const { toast } = useToast();
  const platform = detectPlatform();

  useEffect(() => {
    if (show && isRatingAvailable()) {
      const data = getRatingData();
      if (!data.hasRated) {
        setIsOpen(true);
        markRatingShown();
      }
    }
  }, [show]);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const handleStarClick = (rating: number) => {
    setSelectedRating(rating);
  };

  const handleRateNow = async () => {
    if (platform === 'web' && selectedRating === 0) {
      toast({
        title: "Please select a rating",
        description: "Tap the stars to rate your experience",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // For web, pass the selected rating; for iOS/Android, no rating needed
      const ratingToPass = platform === 'web' ? selectedRating : undefined;
      await openRatingInterface(ratingToPass);

      // Mark as rated
      markUserHasRated(platform);

      // Call callback
      if (onRatingComplete) {
        onRatingComplete(selectedRating || 5, platform);
      }

      handleClose();
    } catch (error) {
      console.error('[RatingDialog] Error submitting rating:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaybeLater = () => {
    incrementDismissCount();
    handleClose();
  };

  // Don't allow closing by clicking outside - user must choose an action
  const handleOpenChange = (open: boolean) => {
    // Prevent closing unless user explicitly clicks a button
    return;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
        hideCloseButton={true}
      >
        <DialogHeader className="space-y-3 pt-2">
          <DialogTitle className="text-xl font-semibold text-center text-gray-900">
            Rate DripLove
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600 leading-relaxed">
            Your feedback helps us improve DripLove.<br />
            <span className="font-semibold text-pink-600">RATE US TO BE A PRIORITY!</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Star Rating - Only show for web */}
          {platform === 'web' && (
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
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Action Button */}
          <div>
            <Button
              onClick={handleRateNow}
              disabled={isSubmitting || (platform === 'web' && selectedRating === 0)}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-medium py-5"
            >
              {isSubmitting ? (
                'Please wait...'
              ) : (
                platform === 'web' ? 'Submit Rating' : 'Rate Now'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RatingDialog;

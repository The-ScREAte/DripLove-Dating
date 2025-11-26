/**
 * Dynamic Rating Dialog Component
 * Shows platform-specific rating interface with smooth animations
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Star, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getRatingData, 
  shouldShowRatingPopup, 
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
  /** Time in ms after login/app start before showing (default: 120000 = 2 minutes) */
  initialDelay?: number;
  /** Force show the dialog (for testing) */
  forceShow?: boolean;
  /** Called when user completes rating */
  onRatingComplete?: (rating: number, platform: PlatformType) => void;
}

const RatingDialog: React.FC<RatingDialogProps> = ({ 
  initialDelay = 120000, // 2 minutes
  forceShow = false,
  onRatingComplete 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const platform = detectPlatform();

  useEffect(() => {
    // Check if we should show the rating dialog
    const checkAndShowDialog = () => {
      // Don't show if rating is not available
      if (!isRatingAvailable() && !forceShow) {
        return;
      }

      // Check storage conditions
      if (!shouldShowRatingPopup() && !forceShow) {
        return;
      }

      // Show after initial delay
      const timer = setTimeout(() => {
        setIsOpen(true);
        markRatingShown();
      }, initialDelay);

      return () => clearTimeout(timer);
    };

    checkAndShowDialog();
  }, [initialDelay, forceShow]);

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

      // Show success message
      toast({
        title: "Thank you! ❤️",
        description: platform === 'web' 
          ? "Your feedback helps us improve DripLove"
          : "Thank you for rating DripLove!",
      });

      // Call callback
      if (onRatingComplete) {
        onRatingComplete(selectedRating || 5, platform);
      }

      setIsOpen(false);
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
    setIsOpen(false);
  };

  // Don't allow closing by clicking outside - user must choose an action
  const handleOpenChange = (open: boolean) => {
    // Prevent closing unless user explicitly clicks a button
    return;
  };

  // Platform-specific messages
  const getMessage = () => {
    switch (platform) {
      case 'ios':
        return "Your feedback helps us improve DripLove for everyone";
      case 'android':
        return "Your feedback helps us improve DripLove for everyone";
      case 'web':
        return "Your feedback helps us improve DripLove for everyone";
      default:
        return "Your feedback helps us improve DripLove for everyone";
    }
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

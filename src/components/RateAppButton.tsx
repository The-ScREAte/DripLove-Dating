/**
 * Rate App Button Component
 * Button for manual rating from profile page
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { detectPlatform, openRatingInterface, type PlatformType } from '@/utils/ratingPlatform';
import { markUserHasRated } from '@/utils/ratingStorage';

interface RateAppButtonProps {
  className?: string;
  onRatingComplete?: (rating: number, platform: PlatformType) => void;
}

const RateAppButton: React.FC<RateAppButtonProps> = ({ className, onRatingComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const platform = detectPlatform();

  const handleButtonClick = () => {
    if (platform === 'web') {
      // Show web rating dialog
      setIsOpen(true);
    } else {
      // Directly open native rating for iOS/Android
      handleNativeRating();
    }
  };

  const handleNativeRating = async () => {
    setIsSubmitting(true);
    try {
      await openRatingInterface();
      markUserHasRated(platform);

      if (onRatingComplete) {
        onRatingComplete(5, platform); // Assume 5 stars for native
      }
    } catch (error) {
      console.error('[RateAppButton] Error opening rating:', error);
      toast({
        title: "Unable to open rating",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWebRating = async () => {
    if (selectedRating === 0) {
      toast({
        title: "Please select a rating",
        description: "Tap the stars to rate your experience",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await openRatingInterface(selectedRating);
      markUserHasRated('web');
      
      toast({
        title: "Thank you! ❤️",
        description: "Your feedback helps us improve DripLove",
      });

      if (onRatingComplete) {
        onRatingComplete(selectedRating, 'web');
      }

      setIsOpen(false);
      setSelectedRating(0);
    } catch (error) {
      console.error('[RateAppButton] Error submitting web rating:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleButtonClick}
        disabled={isSubmitting}
        variant="outline"
        className={`flex items-center justify-center space-x-2 border-yellow-400 text-yellow-600 hover:bg-yellow-50 ${className}`}
      >
        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
        <span>{isSubmitting ? 'Opening...' : 'Rate DripLove'}</span>
      </Button>

      {/* Web Rating Dialog */}
      {platform === 'web' && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-xl font-semibold text-center text-gray-900">
                Rate DripLove
              </DialogTitle>
              <DialogDescription className="text-center text-gray-600">
                How would you rate your experience?
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              {/* Star Rating */}
              <div className="flex justify-center gap-3 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setSelectedRating(star)}
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

              {/* Submit Button */}
              <Button
                onClick={handleWebRating}
                disabled={isSubmitting || selectedRating === 0}
                className="w-full bg-pink-600 hover:bg-pink-700 text-white font-medium py-5"
              >
                {isSubmitting ? 'Please wait...' : 'Submit Rating'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default RateAppButton;

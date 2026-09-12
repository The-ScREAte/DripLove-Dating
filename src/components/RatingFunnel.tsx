/**
 * Rating funnel - shown 3s after a match screen closes (see
 * ratingFunnelStorage.ts for the full eligibility/cooldown rules).
 *
 * Step 1 (prompt): "Enjoying DripLove?" -> Not Really / Yes!
 *   - Yes!: calls the native review prompt immediately (no delay), grants
 *     the 24h 1.5x visibility boost, and permanently records on the account
 *     (profiles.has_rated_app) that this user has responded - the funnel
 *     never shows again on any device from that point on.
 *   - Not Really: shows the feedback step below; NOT permanent - the funnel
 *     is eligible to ask again after a cooldown, since a single "not now"
 *     shouldn't be the only chance a user ever gets.
 * Step 2 (feedback): internal feedback card shown when the user picks "Not Really"
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, MessageSquareHeart } from 'lucide-react';
import { openRatingInterface, activateVisibilityBoost, markHasRatedAppInDb } from '@/utils/ratingPlatform';
import { markRatingFunnelNotNow, markRatingFunnelRespondedYes } from '@/utils/ratingFunnelStorage';

type FunnelStep = 'prompt' | 'feedback';

interface RatingFunnelProps {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
}

const RatingFunnel: React.FC<RatingFunnelProps> = ({ open, onClose, userId }) => {
  const [step, setStep] = useState<FunnelStep>('prompt');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Reset to the first step once the dialog has fully closed, so a stray
  // re-open (e.g. React re-render) never resumes mid-flow.
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setTimeout(() => {
        setStep('prompt');
        setFeedbackText('');
      }, 300);
    }
  };

  const handleNotReally = () => {
    // Not a permanent no - just backs off for a while. The user's mind can
    // change, and a single "not now" shouldn't be the only chance they ever
    // get to be asked again.
    markRatingFunnelNotNow();
    setStep('feedback');
  };

  const handleYes = () => {
    // Everything below is fired off in the background, not awaited - on
    // Android in particular, the underlying Play Core call the native plugin
    // makes (requestReviewFlow -> launchReviewFlow) doesn't resolve until
    // the ENTIRE native review flow has finished, which can take a moment.
    // Awaiting that here would leave OUR OWN "Enjoying DripLove?" dialog
    // sitting on screen the whole time. Instead: close our dialog the
    // instant "Yes" is tapped (no perceptible delay in our own UI), then
    // fire the native call - the OS's own review sheet, if it decides to
    // show one, is a separate system-level layer that appears independently
    // of whatever our React dialog is doing.
    handleOpenChange(false);

    openRatingInterface(5).catch((error) => {
      console.error('[RatingFunnel] Native review error:', error);
    });

    // "Yes" is the one real, permanent signal we get - record it on the
    // account itself (not just this device) so no other device or a
    // reinstall ever asks again, and apply the visibility boost reward.
    markRatingFunnelRespondedYes();
    if (userId) {
      void markHasRatedAppInDb(userId);
    }
    void activateVisibilityBoost(24, 1.5);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('app_feedback' as any).insert({
          user_id: user.id,
          message: feedbackText.trim(),
          source: 'rating_funnel',
        });
      }
    } catch (error) {
      console.error('[RatingFunnel] Error saving feedback:', error);
    } finally {
      toast({ title: 'Thank you!', description: 'We appreciate your feedback.' });
      setIsSubmitting(false);
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[calc(100%-2.5rem)] sm:max-w-sm bg-neutral-950 border border-white/10 text-white rounded-2xl shadow-2xl shadow-black/50 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'prompt' && (
          <>
            <DialogHeader className="space-y-3 pt-1">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10 ring-1 ring-pink-500/30">
                <Sparkles className="h-6 w-6 text-pink-400" />
              </div>
              <DialogTitle className="text-lg font-semibold text-center text-white">
                Enjoying DripLove?
              </DialogTitle>
              <DialogDescription className="text-center text-gray-300 leading-relaxed">
                In return for your support of the DripLove community, we'll optimize
                your profile visibility for the next 24 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="pt-5 flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNotReally}
                className="flex-1 rounded-full bg-transparent border-white/15 text-gray-200 hover:bg-white/5 hover:text-white"
              >
                Not Really
              </Button>
              <Button
                size="sm"
                onClick={handleYes}
                className="flex-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold hover:opacity-90"
              >
                Yes!
              </Button>
            </div>
          </>
        )}

        {step === 'feedback' && (
          <>
            <DialogHeader className="space-y-3 pt-1">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/15">
                <MessageSquareHeart className="h-6 w-6 text-gray-300" />
              </div>
              <DialogTitle className="text-lg font-semibold text-center text-white">
                We're sorry to hear that.
              </DialogTitle>
              <DialogDescription className="text-center text-gray-300 leading-relaxed">
                DripLove is built on your experience. How can we make the app better for you?
              </DialogDescription>
            </DialogHeader>
            <div className="pt-5 space-y-3">
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Tell us what's not working..."
                className="bg-white/5 border-white/15 text-white placeholder:text-gray-500 min-h-[100px] focus-visible:ring-pink-500/40"
                autoFocus
              />
              <Button
                onClick={handleSubmitFeedback}
                disabled={isSubmitting || !feedbackText.trim()}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RatingFunnel;

/**
 * Rating funnel
 * Shown once, ever, 3s after the user closes their first-ever match screen.
 *
 * Step 1 (prompt): "Enjoying DripLove?" -> Not Really / Yes! (Yes! opens the
 *   native review prompt directly and grants the 24h 1.5x visibility boost)
 * Step 2 (feedback): internal feedback card shown when the user picks "Not Really"
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, MessageSquareHeart } from 'lucide-react';
import { openRatingInterface, activateVisibilityBoost } from '@/utils/ratingPlatform';

type FunnelStep = 'prompt' | 'feedback';

interface RatingFunnelProps {
  open: boolean;
  onClose: () => void;
}

const RatingFunnel: React.FC<RatingFunnelProps> = ({ open, onClose }) => {
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

  const handleNotReally = () => setStep('feedback');

  const handleYes = async () => {
    try {
      await openRatingInterface(5);
    } catch (error) {
      console.error('[RatingFunnel] Native review error:', error);
    } finally {
      // Neither iOS nor Android report whether the user actually rated -
      // the boost rewards engaging with the prompt, per product spec.
      activateVisibilityBoost(24, 1.5);
      handleOpenChange(false);
    }
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
        className="sm:max-w-sm bg-neutral-950 border border-white/10 text-white rounded-2xl shadow-2xl shadow-black/50 p-6"
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
                onClick={handleNotReally}
                className="flex-1 bg-transparent border-white/15 text-gray-200 hover:bg-white/5 hover:text-white"
              >
                Not Really
              </Button>
              <Button
                onClick={handleYes}
                className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold hover:opacity-90"
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

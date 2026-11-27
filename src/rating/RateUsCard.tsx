/**
 * "Love DripLove?" card for Profile -> Settings. User-initiated, so it opens
 * the store's write-review page (never the in-app-review API - Google says to
 * redirect to the store for button-triggered rating, Apple says link to the
 * write-review page). No reward is offered or implied.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MessageCircleHeart, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { canOpenStoreReview, openStoreReviewPage } from './storeLinks';
import { mutateRatingState } from './ratingMoments';
import { trackRating } from './ratingAnalytics';
import FeedbackSheet from './FeedbackSheet';
import { useHasRated } from './useHasRated';
import './rating.css';

const RateUsCard = ({ className = '' }: { className?: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const canRate = canOpenStoreReview();
  const { rated, ready, markRated } = useHasRated();

  useEffect(() => {
    if (ready && !rated) trackRating('rate_card_viewed');
  }, [ready, rated]);

  const rate = async () => {
    if (opening) return;
    setOpening(true);
    const ok = await openStoreReviewPage();
    setOpening(false);
    if (!ok) {
      trackRating('store_page_failed');
      toast({ title: t('rating.rateFailed'), variant: 'destructive' });
      return;
    }
    trackRating('store_page_opened');
    // The user is going to rate on their own: stop asking, on every device.
    mutateRatingState((s) => ({ ...s, storeOpenedAt: Date.now(), hasRated: true }));
    markRated();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ has_rated_app: true, rated_app_at: new Date().toISOString() })
          .eq('id', user.id);
      }
    } catch {
      // best effort
    }
  };

  // Not known yet (the account check is still answering): show nothing rather than flash the card at someone who rated.
  if (!ready) return null;

  // Already rated: no star card, just a small thank-you - the feedback line stays available.
  if (rated) {
    return (
      <div className={`rounded-card border border-pink-500/20 bg-black p-4 text-white ${className}`}>
        <div className="flex flex-col items-center gap-2 text-center">
          <Heart className="h-6 w-6 fill-pink-500 text-pink-500" aria-hidden="true" />
          <p className="dl-heading">{t('rating.thanksTitle', 'Thanks for rating DripLove')}</p>
          <p className="text-sm text-white/65">{t('rating.thanksBody', 'You help more people find real love.')}</p>
          <Button
            variant="quiet"
            size="md"
            className="mt-1 w-full text-white/80"
            onClick={() => {
              trackRating('feedback_opened');
              setFeedbackOpen(true);
            }}
          >
            <MessageCircleHeart />
            {t('rating.feedbackCta')}
          </Button>
        </div>
        <FeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      </div>
    );
  }

  return (
    <div className={`dl-rate-glow rounded-card border border-pink-500/25 bg-black p-4 text-white ${className}`}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="dl-rate-star" style={{ ['--i' as string]: i }}>
              <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
            </span>
          ))}
        </div>
        <div>
          <p className="dl-heading">{t('rating.title')}</p>
          <p className="mt-1 text-sm text-white/65">{t('rating.body')}</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          {canRate && (
            <Button variant="primary" size="md" className="w-full" loading={opening} onClick={rate}>
              <Star className="fill-current" />
              {t('rating.rateCta')}
            </Button>
          )}
          <Button
            variant="quiet"
            size="md"
            className="w-full text-white/80"
            onClick={() => {
              trackRating('feedback_opened');
              setFeedbackOpen(true);
            }}
          >
            <MessageCircleHeart />
            {t('rating.feedbackCta')}
          </Button>
        </div>
      </div>
      <FeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
};

export default RateUsCard;

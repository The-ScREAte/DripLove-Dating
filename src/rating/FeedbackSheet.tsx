/**
 * Private feedback sheet. Always available from Profile - it is NOT a gate in
 * front of rating (store rules), just a clean way to tell the team what to fix.
 * Posts to the existing app_feedback table (no schema change).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { trackRating } from './ratingAnalytics';

const CATEGORIES = ['matches', 'chat', 'photos', 'payments', 'bug', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

interface FeedbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FeedbackSheet = ({ open, onOpenChange }: FeedbackSheetProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [category, setCategory] = useState<Category>('other');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('not signed in');
      const { error } = await supabase.from('app_feedback').insert({
        user_id: user.id,
        message: `[${category}] ${message}`.slice(0, 2000),
        source: 'profile_feedback',
      });
      if (error) throw error;
      trackRating('feedback_sent', { category });
      toast({ title: t('rating.feedbackThanks') });
      setText('');
      onOpenChange(false);
    } catch {
      toast({ title: t('rating.feedbackError'), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto border-white/10 bg-neutral-950 text-white pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-white">{t('rating.feedbackTitle')}</SheetTitle>
          <SheetDescription className="text-white/60">{t('rating.feedbackSubtitle')}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('rating.feedbackTitle')}>
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
              {t(`rating.cat_${c}`)}
            </Chip>
          ))}
        </div>
        <Textarea
          tone="dark"
          className="mt-4 min-h-[120px]"
          value={text}
          maxLength={1800}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('rating.feedbackPlaceholder')}
        />
        <Button
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          loading={sending}
          disabled={!text.trim()}
          onClick={send}
        >
          {t('rating.feedbackSend')}
        </Button>
      </SheetContent>
    </Sheet>
  );
};

export default FeedbackSheet;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { PhotoExamples } from './Illustrations';

interface PhotoTipsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user taps the primary button - opens the file picker. */
  onContinue: () => void;
  maxPhotos: number;
}

/**
 * "Best profile photo tips" - a one-time sheet before the first upload (and
 * reachable from a small link afterwards). App-made illustrations, so nothing
 * extra downloads on slow connections.
 */
const PhotoTipsSheet = ({ open, onOpenChange, onContinue, maxPhotos }: PhotoTipsSheetProps) => {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="ob-root max-h-[92dvh] overflow-y-auto rounded-t-3xl border-white/10 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-7 sm:mx-auto sm:max-w-lg"
        style={{ background: '#14141a', color: 'var(--ob-text)' }}
      >
        <SheetTitle className="text-center text-xl font-bold text-white">{t('onboarding.tips.title')}</SheetTitle>
        <SheetDescription className="sr-only">{t('onboarding.tips.subtitle', { max: maxPhotos })}</SheetDescription>

        <div className="mt-5">
          <PhotoExamples />
        </div>

        <Button
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          onClick={() => {
            onOpenChange(false);
            onContinue();
          }}
        >
          {t('onboarding.tips.cta')}
        </Button>
      </SheetContent>
    </Sheet>
  );
};

export default PhotoTipsSheet;

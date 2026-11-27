import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircleHeart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from './IcebreakerSheet';
import './icebreaker.css';

export interface IcebreakerToastPayload {
  name: string;
  photoUrl?: string | null;
}

/**
 * A gentle in-app heads-up that someone broke the ice. Drawn by the popup coordinator (tier
 * 'transactional' - never over typing / a swipe / a call), so it can't collide with other popups.
 */
export const IcebreakerToast: React.FC<{ payload?: IcebreakerToastPayload; onView: () => void; onClose: () => void }> = ({ payload, onView, onClose }) => {
  const { t } = useTranslation();
  const name = payload?.name || t('icebreaker.someone', 'Someone');
  return (
    <div className="ice-toast" role="status" aria-live="polite">
      <Avatar name={name} photoUrl={payload?.photoUrl} size={40} />
      <div className="ice-toast-text">
        <p className="ice-toast-title" dir="auto">
          <MessageCircleHeart className="h-4 w-4" aria-hidden="true" />
          {t('icebreaker.toast.title', '{{name}} broke the ice', { name })}
        </p>
        <p className="ice-toast-sub">{t('icebreaker.toast.body', 'Open to read their message')}</p>
      </div>
      <Button variant="primary" size="sm" onClick={onView}>
        {t('icebreaker.toast.view', 'View')}
      </Button>
      <button type="button" className="ice-toast-x dl-focus" onClick={onClose} aria-label={t('common.close', 'Close')}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default IcebreakerToast;

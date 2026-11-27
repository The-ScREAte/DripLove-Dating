import React, { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, MessageCircleHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getCachedStatus,
  loadQuota,
  loadStatus,
  subscribeStatus,
  useIcebreakerAvailable,
  useIcebreakerQuota,
} from '@/services/icebreaker';
import { icebreakerAction } from '@/utils/icebreaker';
import { ChancesPill } from './ChancesPill';
import { getIcebreakerHandlers, openIcebreaker, type IcebreakerTarget } from './store';
import './icebreaker.css';

interface Props {
  target: IcebreakerTarget;
  /** 'card' = the big call to action inside the Break the ice card; 'pill' = compact, floats on a photo caption. */
  variant: 'card' | 'pill';
  isOwnProfile?: boolean;
  className?: string;
}

/**
 * One "Break the ice" button for every screen. It decides its own state (send / sent / say hi /
 * upgrade / hidden) from the shared status + quota, and hides itself completely when the backend
 * migration isn't applied yet.
 */
export const IcebreakerButton: React.FC<Props> = ({ target, variant, isOwnProfile, className }) => {
  const { t } = useTranslation();
  const available = useIcebreakerAvailable();
  const quota = useIcebreakerQuota();
  const status = useSyncExternalStore(
    subscribeStatus,
    () => getCachedStatus(target.id),
    () => null
  );

  useEffect(() => {
    if (isOwnProfile || !target.id || available === false) return;
    void loadQuota();
    void loadStatus(target.id);
  }, [target.id, isOwnProfile, available]);

  const action = icebreakerAction({
    available,
    isOwnProfile,
    matched: !!status?.matched,
    pending: !!status?.pending,
    quota,
  });
  if (action === 'hidden') return null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (action === 'sent') return;
    if (action === 'say_hi') {
      getIcebreakerHandlers().openChat(status?.matchId);
      return;
    }
    openIcebreaker(target);
  };

  const label =
    action === 'sent'
      ? t('icebreaker.sentLabel', 'Icebreaker sent')
      : action === 'say_hi'
        ? t('icebreaker.sayHi', 'Say hi')
        : t('icebreaker.title', 'Break the ice');
  const Icon = action === 'sent' ? Check : action === 'upgrade' ? Lock : MessageCircleHeart;

  if (variant === 'pill') {
    return (
      <Button
        variant="overlay"
        size="sm"
        className={`ice-pill ${action === 'sent' ? 'ice-pill-sent' : ''} ${className || ''}`}
        onClick={onClick}
        onPointerDown={stop}
        onTouchStart={stop}
        disabled={action === 'sent'}
        aria-label={label}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </Button>
    );
  }

  return (
    <div className={`ice-cta ${className || ''}`} onPointerDown={stop} onTouchStart={stop}>
      <Button
        variant={action === 'sent' ? 'soft' : 'primary'}
        size="lg"
        className="w-full"
        onClick={onClick}
        disabled={action === 'sent'}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span>{label}</span>
      </Button>
      {action !== 'sent' && <ChancesPill quota={quota} />}
    </div>
  );
};

export default IcebreakerButton;

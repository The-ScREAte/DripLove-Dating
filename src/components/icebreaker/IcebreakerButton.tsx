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
import { chancesDisplay, icebreakerAction } from '@/utils/icebreaker';
import { useChances } from './useChances';
import { getIcebreakerHandlers, openIcebreaker, type IcebreakerTarget } from './store';
import './icebreaker.css';

interface Props {
  target: IcebreakerTarget;
  isOwnProfile?: boolean;
  className?: string;
  /** Render even when the backend migration isn't applied yet (the popup then runs in copy mode). */
  alwaysShow?: boolean;
  /** Smaller, centred pill for use inside a card (instead of a full-width bar). */
  compact?: boolean;
}

/**
 * One "Break the ice" button for every screen. It decides its own state (send / sent / say hi /
 * upgrade / hidden) from the shared status + quota, and hides itself completely when the backend
 * migration isn't applied yet.
 */
export const IcebreakerButton: React.FC<Props> = ({ target, isOwnProfile, className, alwaysShow, compact }) => {
  const { t } = useTranslation();
  const available = useIcebreakerAvailable();
  const quota = useIcebreakerQuota();
  const shown = useChances();
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
    available: alwaysShow ? true : available,
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
      ? t('icebreaker.sentLabel', 'Hi sent')
      : action === 'say_hi'
        ? t('icebreaker.sayHi', 'Say hi')
        : t('icebreaker.sheet.send', 'Say hi first');
  const d = chancesDisplay(shown);
  const badgeCount = action === 'sent' || action === 'say_hi' ? null : d.kind === 'left' ? d.count : d.kind === 'none' ? 0 : null;
  const badge =
    badgeCount === null ? null : (
      <span className="ice-badge" data-empty={badgeCount === 0 ? 'true' : undefined} role="status" aria-label={t('icebreaker.chances.left', { count: badgeCount, defaultValue_one: '{{count}} chance left', defaultValue_other: '{{count}} chances left' })}>
        {badgeCount}
      </span>
    );
  const Icon = action === 'sent' ? Check : action === 'upgrade' ? Lock : MessageCircleHeart;

  return (
    <div className={`ice-cta ${className || ''}`} data-compact={compact ? 'true' : undefined} onPointerDown={stop} onTouchStart={stop}>
      <div className="ice-wrap">
        <Button
          variant={action === 'sent' ? 'soft' : 'primary'}
          size={compact ? 'sm' : 'lg'}
          className={compact ? 'h-10 px-5 text-[15px] font-semibold [&_svg]:size-4' : 'w-full'}
          style={compact ? { minHeight: 0 } : undefined}
          onClick={onClick}
          disabled={action === 'sent'}
        >
          <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
          <span>{label}</span>
        </Button>
        {badge}
      </div>
    </div>
  );
};

export default IcebreakerButton;

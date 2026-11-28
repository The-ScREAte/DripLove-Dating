import React, { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Heart, Lock, MessageCircle } from 'lucide-react';
import { getCachedStatus, loadQuota, loadStatus, subscribeStatus, useIcebreakerQuota } from '@/services/icebreaker';
import { chancesDisplay, formatRenews, icebreakerAction, msUntil } from '@/utils/icebreaker';
import { useChances } from './useChances';
import { getIcebreakerHandlers, openIcebreaker, type IcebreakerTarget } from './store';
import './icebreaker.css';


// The small line under "Break the ice" - a few light, playful nudges instead of one fixed sentence. Picked per person so
// the same profile always shows the same line, and different profiles feel different.
const INLINE_HINTS = ['You never know', 'Shoot your shot', 'Make the first move', 'One hello can change everything', 'Go on, say hi'];
const hintIndex = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % INLINE_HINTS.length;
};

/**
 * "Break the ice" at the top of a profile's expanded info: ONE bubble with the chat icon, "Break the ice" and, as a
 * smaller second line inside it, "Be the first to say hi", plus the chances left. Once you're talking (a match, or a
 * hello that opened the chat) it becomes a small "Open chat" pill. Hidden on your own profile.
 */
export const IcebreakerInline: React.FC<{ target: IcebreakerTarget; isOwnProfile?: boolean; className?: string }> = ({ target, isOwnProfile, className = '' }) => {
  const { t } = useTranslation();
  const quota = useIcebreakerQuota();
  const shown = useChances();
  const status = useSyncExternalStore(subscribeStatus, () => getCachedStatus(target.id), () => null);

  useEffect(() => {
    if (isOwnProfile || !target.id) return;
    void loadQuota();
    void loadStatus(target.id);
  }, [target.id, isOwnProfile]);

  const action = icebreakerAction({ available: true, isOwnProfile, matched: !!status?.matched, pending: !!status?.pending, quota });
  if (action === 'hidden' || !target.id) return null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const guard = { onPointerDown: stop, onTouchStart: stop };

  // Already talking: just open that chat.
  if (action === 'say_hi') {
    return (
      <button
        type="button"
        className={`ice-pill dl-focus ${className}`.trim()}
        {...guard}
        onClick={(e) => {
          e.stopPropagation();
          getIcebreakerHandlers().openChat(status?.matchId ?? null);
        }}
      >
        <span className="ice-pill-icon" aria-hidden="true"><MessageCircle /></span>
        <span>{t('icebreaker.inline.openChat', 'Open chat')}</span>
      </button>
    );
  }

  // A hello without a chat to open (older backend / silent send): a quiet confirmation.
  if (action === 'sent') {
    return (
      <span className={`ice-pill is-quiet ${className}`.trim()} role="status" {...guard}>
        <span className="ice-pill-icon" aria-hidden="true"><Check /></span>
        <span>{t('icebreaker.inline.sent', 'Hi sent')}</span>
      </span>
    );
  }

  const renewing = action === 'renewing';
  const d = chancesDisplay(shown);
  const count = d.kind === 'left' ? d.count : d.kind === 'none' ? 0 : null;
  const label = t('icebreaker.inline.label', 'Break the ice');
  const sub = renewing
    ? quota?.resetsAt && msUntil(quota.resetsAt) > 0
      ? t('icebreaker.inline.renews', 'New chances in {{time}}', { time: formatRenews(msUntil(quota.resetsAt)) })
      : t('icebreaker.inline.usedUp', 'All used this week')
    : t(`icebreaker.inline.hints.${hintIndex(target.id)}`, INLINE_HINTS[hintIndex(target.id)]);
  const chances = count === null ? '' : t('icebreaker.chances.left', { count, defaultValue_one: '{{count}} chance left', defaultValue_other: '{{count}} chances left' });

  return (
    <button
      type="button"
      className={`ice-bubble dl-focus ${className}`.trim()}
      data-empty={renewing ? 'true' : undefined}
      aria-label={[label, sub, chances].filter(Boolean).join(', ')}
      {...guard}
      onClick={(e) => {
        e.stopPropagation();
        openIcebreaker(target);
      }}
    >
      <span className="ice-bubble-icon" aria-hidden="true">{renewing ? <Lock /> : <MessageCircle />}</span>
      <span className="ice-bubble-text" aria-hidden="true">
        <span className="ice-bubble-title">{label}</span>
        <span className="ice-bubble-sub">{sub}</span>
      </span>
      {count !== null && (
        <span className="ice-bubble-count" aria-hidden="true">
          <Heart />
          {count}
        </span>
      )}
    </button>
  );
};

export default IcebreakerInline;

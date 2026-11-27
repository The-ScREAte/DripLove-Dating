import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MessageCircleHeart } from 'lucide-react';
import { useIcebreakerAvailable, useIcebreakerInbox } from '@/services/icebreaker';
import { Avatar } from './IcebreakerSheet';
import { openIcebreakerInbox } from './store';
import './icebreaker.css';

/**
 * Pinned at the very top of the Chat list: "Icebreakers - N waiting for you" with a stack of the
 * senders' avatars. Renders nothing when there are none (or the backend isn't there yet).
 */
export const IcebreakerRow: React.FC = () => {
  const { t } = useTranslation();
  const available = useIcebreakerAvailable();
  const { items } = useIcebreakerInbox();
  if (available === false || items.length === 0) return null;
  const shown = items.slice(0, 3);
  return (
    <button type="button" className="ice-row dl-focus dl-press" onClick={openIcebreakerInbox} aria-label={t('icebreaker.row.aria', 'Open icebreakers, {{count}} waiting', { count: items.length })}>
      <span className="ice-row-icon" aria-hidden="true">
        <MessageCircleHeart />
      </span>
      <span className="ice-row-text">
        <span className="ice-row-title">{t('icebreaker.inbox.title', 'Icebreakers')}</span>
        <span className="ice-row-sub">{t('icebreaker.row.sub', '{{count}} waiting for you', { count: items.length })}</span>
      </span>
      <span className="ice-row-stack" aria-hidden="true">
        {shown.map((i) => (
          <Avatar key={i.id} name={i.firstName} photoUrl={i.photoUrl} size={30} />
        ))}
      </span>
      <span className="ice-row-badge" aria-hidden="true">
        {items.length > 9 ? '9+' : items.length}
      </span>
      <ChevronRight className="ice-row-chev" aria-hidden="true" />
    </button>
  );
};

export default IcebreakerRow;

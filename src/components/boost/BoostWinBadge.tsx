import React from 'react';
import { useTranslation } from 'react-i18next';
import { useBoostWin } from '@/services/boost';
import { BoostBolt } from './BoostBolt';
import './boost.css';

/**
 * "Boost got you this": shown on a person who liked me / wrote to me while I was boosted.
 *  card  -> pill over the top-left of a photo (Liked Me grid)
 *  row   -> compact pill beside a name (Chat list)
 *  dot   -> just the bolt in a small disc (avatar corner)
 * Renders nothing when there is no such win (or no backend).
 */
export const BoostWinBadge: React.FC<{ userId: string | null | undefined; variant?: 'card' | 'row' | 'dot'; className?: string }> = ({
  userId,
  variant = 'row',
  className,
}) => {
  const { t } = useTranslation();
  const win = useBoostWin(userId);
  if (!win) return null;
  const full = t('boost.win.badge', 'Boost got you this');
  if (variant === 'dot') {
    return (
      <span className={`dl-boost-win-dot ${className || ''}`} role="img" aria-label={full} title={full}>
        <BoostBolt size={10} tone="white" />
      </span>
    );
  }
  return (
    <span className={`dl-boost-win dl-boost-win-${variant} ${className || ''}`} title={full} aria-label={full} role="img">
      <BoostBolt size={variant === 'card' ? 11 : 10} tone="white" />
      <span aria-hidden="true">{variant === 'card' ? full : t('boost.win.short', 'Boost')}</span>
    </span>
  );
};

export default BoostWinBadge;

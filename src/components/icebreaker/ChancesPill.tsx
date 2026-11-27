import React from 'react';
import { useTranslation } from 'react-i18next';
import { chancesDisplay, type IcebreakerQuota } from '@/utils/icebreaker';

/**
 * "How many chances do I have?" - the user sees chances, not quota numbers:
 * "3 chances left" / "2 of 3 free chances left" / "No chances left - go Premium" / "Unlimited chances".
 * Renders nothing until the quota is known.
 */
export const ChancesPill = ({ quota, className = '' }: { quota: IcebreakerQuota | null; className?: string }) => {
  const { t } = useTranslation();
  const d = chancesDisplay(quota);
  if (d.kind === 'unknown') return null;
  let text = '';
  switch (d.kind) {
    case 'unlimited':
      text = t('icebreaker.chances.unlimited', 'Unlimited chances');
      break;
    case 'none':
      text = t('icebreaker.chances.none', 'No chances left - go Premium');
      break;
    case 'left':
      text = t('icebreaker.chances.left', { count: d.count, defaultValue_one: '{{count}} chance left', defaultValue_other: '{{count}} chances left' });
      break;
    case 'of':
      text = t('icebreaker.chances.of', '{{remaining}} of {{limit}} free chances left', { remaining: d.count, limit: d.limit });
      break;
  }
  return (
    <span className={`ice-quota ${d.kind === 'none' ? 'ice-quota-empty' : ''} ${className}`.trim()} aria-live="polite">
      {text}
    </span>
  );
};

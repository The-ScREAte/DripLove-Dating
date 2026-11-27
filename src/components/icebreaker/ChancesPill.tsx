import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { chancesDisplay, type IcebreakerQuota } from '@/utils/icebreaker';

/**
 * How many first hellos are left: a small heart and a number, nothing else on screen
 * (free = 4 in total, premium = 10 a day - never written out). Screen readers get a full sentence.
 * Renders nothing until the quota is known.
 */
export const ChancesPill = ({ quota, className = '' }: { quota: IcebreakerQuota | null; className?: string }) => {
  const { t } = useTranslation();
  const d = chancesDisplay(quota);
  if (d.kind === 'unknown') return null;
  const count = d.kind === 'left' ? d.count : 0;
  const label =
    d.kind === 'left'
      ? t('icebreaker.chances.left', { count, defaultValue_one: '{{count}} chance left', defaultValue_other: '{{count}} chances left' })
      : t('icebreaker.chances.none', 'No chances left');
  return (
    <span className={`ice-quota ${d.kind === 'none' ? 'ice-quota-empty' : ''} ${className}`.trim()} role="status" aria-label={label} title={label}>
      <Heart className="ice-quota-heart" aria-hidden="true" />
      <span aria-hidden="true">{count}</span>
    </span>
  );
};

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Heart, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HoppingLogo from '@/components/HoppingLogo';

/**
 * Card-shaped skeleton shown while Discover loads its first deck (or refills
 * an empty one). Same silhouette as the resting card - flush top, rounded
 * bottom, name / location / chips block at the bottom - so when the real card
 * arrives nothing jumps. The brand logo hops quietly in the middle.
 */
export const DiscoverSkeleton: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="relative h-full w-full overflow-hidden" role="status" aria-live="polite">
      {/* The wrapper does the stretching: .dl-skeleton sets position:relative, which beats the
          `absolute inset-0` utility and used to collapse this card to 0px tall (an empty black screen). */}
      <div className="absolute inset-0">
        <div className="dl-skeleton dl-skeleton-card h-full w-full" style={{ borderRadius: '0 0 22px 22px' }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <HoppingLogo size={64} />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
        <div className="dl-skeleton h-7 w-48" />
        <div className="dl-skeleton h-4 w-36" />
        <div className="flex gap-2">
          <div className="dl-skeleton h-8 w-16 rounded-full" />
          <div className="dl-skeleton h-8 w-20 rounded-full" />
          <div className="dl-skeleton h-8 w-24 rounded-full" />
        </div>
      </div>
      <span className="sr-only">{t('discover.findingMatches')}</span>
    </div>
  );
};

interface DiscoverEmptyStateProps {
  /** 'exhausted' = seen everyone; 'error' = the refresh itself failed. */
  mode: 'exhausted' | 'error';
  isSignMatch: boolean;
  isPremium: boolean;
  trialEligible: boolean;
  onRefresh: () => void;
  onAdjustFilters: () => void;
  onPlayGames: () => void;
  onUpgrade: () => void;
}

/**
 * One calm message with ONE clear action (Refresh). Everything else is quiet
 * text links underneath - no walls of instructions, no competing buttons.
 */
export const DiscoverEmptyState: React.FC<DiscoverEmptyStateProps> = ({
  mode,
  isSignMatch,
  isPremium,
  trialEligible,
  onRefresh,
  onAdjustFilters,
  onPlayGames,
  onUpgrade,
}) => {
  const { t } = useTranslation();
  const isError = mode === 'error';
  const title = isError
    ? t('discover.refreshFailedTitle')
    : isSignMatch
      ? t('discover.emptySignMatchTitle')
      : t('discover.noMoreProfiles');
  const description = isError
    ? t('discover.refreshFailedDesc')
    : isSignMatch
      ? t('discover.emptySignMatchDesc')
      : t('discover.noProfilesDescription');
  const Icon = isError ? WifiOff : Heart;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto px-6">
      <div className="dl-pop flex w-full max-w-xs flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand-ink">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="dl-heading text-white">{title}</h2>
        <p className="dl-body text-white/70">{description}</p>

        <Button variant="primary" size="md" className="mt-2 w-full" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('discover.refresh')}
        </Button>

        <div className="flex items-center gap-4 pt-1 text-sm">
          <Button variant="quiet" size="sm" className="text-white/70" onClick={onAdjustFilters}>
            {t('discover.adjustFilters')}
          </Button>
          <span className="h-3 w-px bg-white/20" aria-hidden="true" />
          <Button variant="quiet" size="sm" className="text-white/70" onClick={onPlayGames}>
            {t('discover.playGames')}
          </Button>
        </div>

        {!isPremium && (
          <Button variant="soft" size="sm" onClick={onUpgrade}>
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            {trialEligible ? t('discover.tryPremiumFree') : t('discover.upgradeForMoreCountriesButton')}
          </Button>
        )}
      </div>
    </div>
  );
};

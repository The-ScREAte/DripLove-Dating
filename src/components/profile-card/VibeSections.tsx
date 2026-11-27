import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Gem, Music2, Sparkles } from 'lucide-react';
import { getVibe, hasShared, sharedVibe, vibeLabel } from '@/constants/vibe';
import { useViewerVibe } from '@/utils/viewerVibe';
import { ProfileSection, TraitChips } from './ProfileSection';
import type { ProfileCardData } from './types';

const MAX_SHARED_CHIPS = 4;

/** "You both like ..." - only what you share, max 4 chips + "+N". Hidden when nothing is shared or it's your own card. */
export const SharedWithYou: React.FC<{ profile: ProfileCardData }> = ({ profile }) => {
  const { t } = useTranslation();
  const viewer = useViewerVibe();
  const shared = useMemo(
    () => (viewer.id && profile.id && viewer.id === profile.id ? null : sharedVibe(viewer, profile)),
    [viewer, profile],
  );
  if (!shared || !hasShared(shared)) return null;
  const tr = (key: string, fallback: string) => t(key, fallback);
  const items = [
    ...shared.interests.map((i) => `✨ ${i}`),
    ...shared.values.map((v) => `💗 ${vibeLabel('values', v, tr)}`),
    ...shared.genres.map((g) => `🎵 ${vibeLabel('genres', g, tr)}`),
    ...shared.artists.map((a) => `🎤 ${a}`),
  ];
  const shown = items.slice(0, MAX_SHARED_CHIPS);
  const extra = items.length - shown.length;
  const musicShared = shared.genres.length + shared.artists.length > 0;
  return (
    <ProfileSection title={t('vibe.sharedTitle', 'You both like')} icon={<Sparkles />}>
      <TraitChips items={extra > 0 ? [...shown, t('vibe.more', { count: extra, defaultValue: '+{{count}}' })] : shown} />
      {musicShared && (
        <p className="mt-3 text-[13px] leading-snug text-white/70">
          🎵 {t('vibe.musicMatch', 'Music match - you have taste in common')}
        </p>
      )}
    </ProfileSection>
  );
};

/** The person's relationship values and music genres (read-only), from the favorites jsonb. */
export const VibeProfileSections: React.FC<{ profile: ProfileCardData }> = ({ profile }) => {
  const { t } = useTranslation();
  const vibe = useMemo(() => getVibe(profile.favorites), [profile.favorites]);
  const tr = (key: string, fallback: string) => t(key, fallback);
  return (
    <>
      {vibe.values.length > 0 && (
        <ProfileSection title={t('vibe.valuesTitle', 'What matters most')} icon={<Gem />}>
          <TraitChips items={vibe.values.map((v) => vibeLabel('values', v, tr))} />
        </ProfileSection>
      )}
      {vibe.genres.length > 0 && (
        <ProfileSection title={t('vibe.musicTitle', 'Music taste')} icon={<Music2 />}>
          <TraitChips items={vibe.genres.map((g) => vibeLabel('genres', g, tr))} />
        </ProfileSection>
      )}
    </>
  );
};

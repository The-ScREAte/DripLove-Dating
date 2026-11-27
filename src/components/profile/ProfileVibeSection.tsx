import React from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FavoriteEntry, parseFavorites } from '@/constants/favorites';
import { GENRE_OPTIONS, MAX_GENRES, MAX_VALUES, VALUE_OPTIONS, getVibe, vibeLabel, withVibe } from '@/constants/vibe';

interface ProfileVibeSectionProps {
  editedProfile: { favorites?: unknown };
  profile: { favorites?: unknown } | null | undefined;
  isEditing: boolean;
  onFavoritesChange: (favorites: FavoriteEntry[]) => void;
}

const toggle = (list: string[], id: string, max: number) =>
  list.includes(id) ? list.filter((v) => v !== id) : list.length >= max ? list : [...list, id];

/**
 * What the person values in a relationship + their music genres - the same data the sign-up
 * "vibe" screens collect (stored in the reserved Vibe entry of `favorites`, no schema change),
 * so onboarding and the Profile tab always agree. Feeds matching.
 */
const ProfileVibeSection = ({ editedProfile, profile, isEditing, onFavoritesChange }: ProfileVibeSectionProps) => {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => t(key, fallback);
  const source = isEditing ? editedProfile.favorites : profile?.favorites;
  const vibe = getVibe(source);

  const update = (next: { values?: string[]; genres?: string[] }) =>
    onFavoritesChange(withVibe(parseFavorites(editedProfile.favorites), next));

  const group = (
    kind: 'values' | 'genres',
    title: string,
    options: { id: string; emoji: string }[],
    selected: string[],
    max: number,
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-white">
        {title} ({selected.length}/{max})
      </Label>
      {isEditing ? (
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <Chip
                key={o.id}
                selected={on}
                disabled={!on && selected.length >= max}
                onClick={() => update({ [kind]: toggle(selected, o.id, max) })}
              >
                <span aria-hidden="true">{o.emoji}</span>
                {vibeLabel(kind, o.id, tr)}
              </Chip>
            );
          })}
        </div>
      ) : selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <Badge key={id} variant="secondary" className="h-6 border-pink-500/20 bg-neutral-800 px-2 py-0 text-xs text-white">
              {options.find((o) => o.id === id)?.emoji} {vibeLabel(kind, id, tr)}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/50">{t('profile.vibe.empty', 'Tap Edit to add - it helps us find better matches.')}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {group('values', t('profile.vibe.values', 'What matters most to you'), VALUE_OPTIONS, vibe.values, MAX_VALUES)}
      {group('genres', t('profile.vibe.genres', 'Music you love'), GENRE_OPTIONS, vibe.genres, MAX_GENRES)}
    </div>
  );
};

export default ProfileVibeSection;

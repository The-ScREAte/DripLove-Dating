
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import FavoritesEditor from '../FavoritesEditor';
import { FavoriteEntry, parseFavorites } from '@/constants/favorites';

interface FavoritesSectionProps {
  editedProfile: { favorites?: unknown };
  profile: { favorites?: unknown } | null | undefined;
  isEditing: boolean;
  onFavoritesChange: (favorites: FavoriteEntry[]) => void;
}

const FavoritesSection = ({ editedProfile, profile, isEditing, onFavoritesChange }: FavoritesSectionProps) => {
  const { t } = useTranslation();

  return (
        <div className="space-y-1.5">
          <Label htmlFor="favorites" className="text-xs text-white">{t('profile.chooseFavorites')}</Label>
          <FavoritesEditor
            favorites={parseFavorites(isEditing ? editedProfile.favorites : profile?.favorites)}
            onFavoritesChange={onFavoritesChange}
            disabled={!isEditing}
          />
        </div>
  );
};

export default FavoritesSection;

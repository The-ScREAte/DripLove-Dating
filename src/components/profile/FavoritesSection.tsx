
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="bg-black border-pink-500/30">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm text-white">{t('profile.favorites')}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="favorites" className="text-xs text-gray-200">{t('profile.chooseFavorites')}</Label>
          <FavoritesEditor
            favorites={parseFavorites(isEditing ? editedProfile.favorites : profile?.favorites)}
            onFavoritesChange={onFavoritesChange}
            disabled={!isEditing}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default FavoritesSection;

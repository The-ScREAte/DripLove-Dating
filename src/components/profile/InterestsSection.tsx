
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import InterestsEditor from '../InterestsEditor';

interface InterestsSectionProps {
  editedProfile: any;
  profile: any;
  isEditing: boolean;
  onInterestsChange: (interests: string[]) => void;
}

const InterestsSection = ({ editedProfile, profile, isEditing, onInterestsChange }: InterestsSectionProps) => {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.interests')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="interests">{t('profile.chooseInterests')}</Label>
          <InterestsEditor
            interests={isEditing ? editedProfile.interests || [] : profile?.interests || []}
            onInterestsChange={onInterestsChange}
            disabled={!isEditing}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default InterestsSection;

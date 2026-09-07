
import React from 'react';
import { useTranslation } from 'react-i18next';
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
        <div className="space-y-2">
          <Label htmlFor="interests" className="text-gray-200">{t('profile.chooseInterests')}</Label>
          <InterestsEditor
            interests={isEditing ? editedProfile.interests || [] : profile?.interests || []}
            onInterestsChange={onInterestsChange}
            disabled={!isEditing}
          />
        </div>
  );
};

export default InterestsSection;

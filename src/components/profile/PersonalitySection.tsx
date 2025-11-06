import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface PersonalitySectionProps {
  editedProfile: any;
  isEditing: boolean;
  onSliderChange: (name: string, value: number[]) => void;
}

const PersonalitySection = ({ editedProfile, isEditing, onSliderChange }: PersonalitySectionProps) => {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.personality')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <Label htmlFor="introvert_extrovert">
              {t('profile.personalityTraits.introvertExtrovert')}: {editedProfile.introvert_extrovert}%
            </Label>
            <div className="mt-2">
              <Slider
                id="introvert_extrovert"
                name="introvert_extrovert"
                value={[editedProfile.introvert_extrovert]}
                onValueChange={(value) => onSliderChange('introvert_extrovert', value)}
                disabled={!isEditing}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>{t('profile.personalityTraits.introvert')}</span>
                <span>{t('profile.personalityTraits.extrovert')}</span>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="spontaneous_planner">
              {t('profile.personalityTraits.spontaneousPlanner')}: {editedProfile.spontaneous_planner}%
            </Label>
            <div className="mt-2">
              <Slider
                id="spontaneous_planner"
                name="spontaneous_planner"
                value={[editedProfile.spontaneous_planner]}
                onValueChange={(value) => onSliderChange('spontaneous_planner', value)}
                disabled={!isEditing}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>{t('profile.personalityTraits.spontaneous')}</span>
                <span>{t('profile.personalityTraits.planner')}</span>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="messy_organized">
              {t('profile.personalityTraits.messyOrganized')}: {editedProfile.messy_organized}%
            </Label>
            <div className="mt-2">
              <Slider
                id="messy_organized"
                name="messy_organized"
                value={[editedProfile.messy_organized]}
                onValueChange={(value) => onSliderChange('messy_organized', value)}
                disabled={!isEditing}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>{t('profile.personalityTraits.messy')}</span>
                <span>{t('profile.personalityTraits.organized')}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PersonalitySection;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import ChipSelect from './ChipSelect';
import { COMMUNICATION_STYLE_OPTIONS, LOVE_STYLE_OPTIONS } from '@/constants/profileTraits';

interface PersonalitySectionProps {
  editedProfile: any;
  isEditing: boolean;
  onSliderChange: (name: string, value: number[]) => void;
  onCommunicationStyleToggle: (value: string) => void;
  onLoveStyleToggle: (value: string) => void;
}

const PersonalitySection = ({ editedProfile, isEditing, onSliderChange, onCommunicationStyleToggle, onLoveStyleToggle }: PersonalitySectionProps) => {
  const { t } = useTranslation();
  
  return (
        <div className="space-y-6">
          <div>
            <Label htmlFor="introvert_extrovert" className="text-gray-200">
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
              <div className="flex justify-between text-sm text-gray-400 mt-1">
                <span>{t('profile.personalityTraits.introvert')}</span>
                <span>{t('profile.personalityTraits.extrovert')}</span>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="spontaneous_planner" className="text-gray-200">
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
              <div className="flex justify-between text-sm text-gray-400 mt-1">
                <span>{t('profile.personalityTraits.spontaneous')}</span>
                <span>{t('profile.personalityTraits.planner')}</span>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="messy_organized" className="text-gray-200">
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
              <div className="flex justify-between text-sm text-gray-400 mt-1">
                <span>{t('profile.personalityTraits.messy')}</span>
                <span>{t('profile.personalityTraits.organized')}</span>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-gray-200 mb-1.5 block">{t('profile.communicationStyle', 'Communication style')}</Label>
            <ChipSelect
              options={COMMUNICATION_STYLE_OPTIONS}
              selected={Array.isArray(editedProfile.communication_style) ? editedProfile.communication_style : []}
              onToggle={onCommunicationStyleToggle}
              disabled={!isEditing}
              accent="blue"
            />
          </div>

          <div>
            <Label className="text-gray-200 mb-1.5 block">{t('profile.loveStyle', 'Love style')}</Label>
            <ChipSelect
              options={LOVE_STYLE_OPTIONS}
              selected={Array.isArray(editedProfile.love_style) ? editedProfile.love_style : []}
              onToggle={onLoveStyleToggle}
              disabled={!isEditing}
              accent="pink"
            />
          </div>
        </div>
  );
};

export default PersonalitySection;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PreferencesSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onSliderChange: (name: string, value: number[]) => void;
  onSelectChange: (name: string, value: string) => void;
  onAgeRangeChange?: (range: number[]) => void;
}

const PreferencesSection = ({ editedProfile, isEditing, onSliderChange, onSelectChange, onAgeRangeChange }: PreferencesSectionProps) => {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.preferences')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gender">{t('profile.gender')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('gender', value)} value={editedProfile.gender}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('profile.genderOptions.male')}</SelectItem>
                  <SelectItem value="female">{t('profile.genderOptions.female')}</SelectItem>
                  <SelectItem value="other">{t('profile.genderOptions.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="preference">{t('profile.lookingFor')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('preference', value)} value={editedProfile.preference}>
                <SelectTrigger id="preference" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('profile.genderOptions.male')}</SelectItem>
                  <SelectItem value="female">{t('profile.genderOptions.female')}</SelectItem>
                  <SelectItem value="everyone">{t('profile.genderOptions.both')}</SelectItem>
                  </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Age Range Preference */}
          <div className="space-y-3">
            <Label>{t('profile.ageRangeForMatches')}</Label>
            <div className="px-3">
              <div className="relative">
                <Slider
                  value={[editedProfile.min_age || 18, editedProfile.max_age || 99]}
                  onValueChange={onAgeRangeChange || (() => {})}
                  max={99}
                  min={18}
                  step={1}
                  className="w-full"
                  disabled={!isEditing}
                />
                {/* Visual enhancement for better UX */}
                <div className="absolute -top-8 left-0 right-0 flex justify-between pointer-events-none">
                  <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded" style={{ 
                    left: `${((editedProfile.min_age || 18) - 18) / (99 - 18) * 100}%`,
                    position: 'absolute',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none'
                  }}>
                    {editedProfile.min_age || 18}
                  </div>
                  <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded" style={{ 
                    left: `${((editedProfile.max_age || 99) - 18) / (99 - 18) * 100}%`,
                    position: 'absolute',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none'
                  }}>
                    {editedProfile.max_age || 99}
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{t('profile.ageYears', { age: 18 })}</span>
                <span className="font-medium">
                  {t('profile.ageRange', { min: editedProfile.min_age || 18, max: editedProfile.max_age || 99 })}
                </span>
                <span>{t('profile.ageYears', { age: 99 })}</span>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              {t('profile.ageRangeDescription')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PreferencesSection;

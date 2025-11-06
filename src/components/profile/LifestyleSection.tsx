
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LifestyleSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onSelectChange: (name: string, value: string) => void;
}

const LifestyleSection = ({ editedProfile, isEditing, onSelectChange }: LifestyleSectionProps) => {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.lifestyle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="relationship_intent">{t('profile.relationshipIntent')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('relationship_intent', value)} value={editedProfile.relationship_intent}>
                <SelectTrigger id="relationship_intent" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">{t('profile.casual')}</SelectItem>
                  <SelectItem value="serious">{t('profile.serious')}</SelectItem>
                  <SelectItem value="open_to_anything">{t('profile.openToAnything')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="smoking">{t('profile.smoking')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('smoking', value)} value={editedProfile.smoking}>
                <SelectTrigger id="smoking" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">{t('common.yes')}</SelectItem>
                  <SelectItem value="no">{t('common.no')}</SelectItem>
                  <SelectItem value="socially">{t('profile.socially')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="drinking">{t('profile.drinking')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('drinking', value)} value={editedProfile.drinking}>
                <SelectTrigger id="drinking" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">{t('common.yes')}</SelectItem>
                  <SelectItem value="no">{t('common.no')}</SelectItem>
                  <SelectItem value="socially">{t('profile.socially')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exercise_level">{t('profile.exercise')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('exercise_level', value)} value={editedProfile.exercise_level}>
                <SelectTrigger id="exercise_level" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('profile.exerciseOptions.active')}</SelectItem>
                  <SelectItem value="moderate">{t('profile.exerciseOptions.moderate')}</SelectItem>
                  <SelectItem value="inactive">{t('profile.exerciseOptions.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="sleeping_schedule">{t('profile.sleepingSchedule')}</Label>
            <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('sleeping_schedule', value)} value={editedProfile.sleeping_schedule}>
              <SelectTrigger id="sleeping_schedule" className="w-full">
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="early_bird">{t('profile.sleepOptions.earlyBird')}</SelectItem>
                <SelectItem value="night_owl">{t('profile.sleepOptions.nightOwl')}</SelectItem>
                <SelectItem value="flexible">{t('profile.sleepOptions.flexible')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LifestyleSection;

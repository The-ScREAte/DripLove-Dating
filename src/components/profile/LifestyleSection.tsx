
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

const selectTriggerClass = "w-full bg-black/40 border-pink-500/30 text-white";
const selectContentClass = "bg-black border-pink-500/30";
const selectItemClass = "text-white focus:bg-pink-500/15 focus:text-white";

const LifestyleSection = ({ editedProfile, isEditing, onSelectChange }: LifestyleSectionProps) => {
  const { t } = useTranslation();

  return (
    <Card className="bg-black border-pink-500/30">
      <CardHeader>
        <CardTitle className="text-white">{t('profile.lifestyle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="relationship_intent" className="text-gray-200">{t('profile.relationshipIntent')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('relationship_intent', value)} value={editedProfile.relationship_intent}>
                <SelectTrigger id="relationship_intent" className={selectTriggerClass}>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem className={selectItemClass} value="casual">{t('profile.casual')}</SelectItem>
                  <SelectItem className={selectItemClass} value="serious">{t('profile.serious')}</SelectItem>
                  <SelectItem className={selectItemClass} value="open_to_anything">{t('profile.openToAnything')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="smoking" className="text-gray-200">{t('profile.smoking')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('smoking', value)} value={editedProfile.smoking}>
                <SelectTrigger id="smoking" className={selectTriggerClass}>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem className={selectItemClass} value="yes">{t('common.yes')}</SelectItem>
                  <SelectItem className={selectItemClass} value="no">{t('common.no')}</SelectItem>
                  <SelectItem className={selectItemClass} value="socially">{t('profile.socially')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="drinking" className="text-gray-200">{t('profile.drinking')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('drinking', value)} value={editedProfile.drinking}>
                <SelectTrigger id="drinking" className={selectTriggerClass}>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem className={selectItemClass} value="yes">{t('common.yes')}</SelectItem>
                  <SelectItem className={selectItemClass} value="no">{t('common.no')}</SelectItem>
                  <SelectItem className={selectItemClass} value="socially">{t('profile.socially')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exercise_level" className="text-gray-200">{t('profile.exercise')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('exercise_level', value)} value={editedProfile.exercise_level}>
                <SelectTrigger id="exercise_level" className={selectTriggerClass}>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem className={selectItemClass} value="active">{t('profile.exerciseOptions.active')}</SelectItem>
                  <SelectItem className={selectItemClass} value="moderate">{t('profile.exerciseOptions.moderate')}</SelectItem>
                  <SelectItem className={selectItemClass} value="inactive">{t('profile.exerciseOptions.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="sleeping_schedule" className="text-gray-200">{t('profile.sleepingSchedule')}</Label>
            <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('sleeping_schedule', value)} value={editedProfile.sleeping_schedule}>
              <SelectTrigger id="sleeping_schedule" className={selectTriggerClass}>
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                <SelectItem className={selectItemClass} value="early_bird">{t('profile.sleepOptions.earlyBird')}</SelectItem>
                <SelectItem className={selectItemClass} value="night_owl">{t('profile.sleepOptions.nightOwl')}</SelectItem>
                <SelectItem className={selectItemClass} value="flexible">{t('profile.sleepOptions.flexible')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LifestyleSection;


import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import { Label } from '@/components/ui/label';

interface WorkEducationSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const selectTriggerClass = "w-full bg-black/40 border-pink-500/30 text-white";
const selectContentClass = "bg-black border-pink-500/30";
const selectItemClass = "text-white focus:bg-pink-500/15 focus:text-white";
const inputClass = "w-full mt-2 bg-black/40 border-pink-500/30 text-white placeholder:text-white/40 disabled:bg-black/30 disabled:border-pink-500/10 disabled:text-white/60";

const WorkEducationSection = ({ editedProfile, isEditing, onInputChange }: WorkEducationSectionProps) => {
  const { t } = useTranslation();

  return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="occupation" className="text-white">{t('profile.occupation')}</Label>
              <Select
                value={editedProfile.occupation}
                onValueChange={value => onInputChange({
                  target: { name: 'occupation', value }
                } as any)}
                disabled={!isEditing}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue placeholder={t('profile.selectOccupation')} />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  {occupationOptions.map(option => (
                    <SelectItem key={option} value={option} className={selectItemClass}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editedProfile.occupation === 'Other' && (
                <Input
                  type="text"
                  id="occupationCustom"
                  name="occupationCustom"
                  value={editedProfile.occupationCustom || ''}
                  onChange={e => onInputChange({
                    target: { name: 'occupationCustom', value: e.target.value }
                  } as any)}
                  disabled={!isEditing}
                  className={inputClass}
                  placeholder={t('profile.enterOccupation')}
                />
              )}
            </div>
            <div>
              <Label htmlFor="industry" className="text-white">{t('profile.industry')}</Label>
              <Select
                value={editedProfile.industry}
                onValueChange={value => onInputChange({
                  target: { name: 'industry', value }
                } as any)}
                disabled={!isEditing}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue placeholder={t('profile.selectIndustry')} />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  {industryOptions.map(option => (
                    <SelectItem key={option} value={option} className={selectItemClass}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editedProfile.industry === 'Other' && (
                <Input
                  type="text"
                  id="industryCustom"
                  name="industryCustom"
                  value={editedProfile.industryCustom || ''}
                  onChange={e => onInputChange({
                    target: { name: 'industryCustom', value: e.target.value }
                  } as any)}
                  disabled={!isEditing}
                  className={inputClass}
                  placeholder={t('profile.enterIndustry')}
                />
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="education_level" className="text-white">{t('profile.education')}</Label>
            <Select
              value={editedProfile.education_level}
              onValueChange={value => onInputChange({
                target: { name: 'education_level', value }
              } as React.ChangeEvent<HTMLInputElement>)}
              disabled={!isEditing}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder={t('profile.selectEducation')} />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                <SelectItem value="No Formal Education" className={selectItemClass}>No Formal Education</SelectItem>
                <SelectItem value="Primary School" className={selectItemClass}>Primary School</SelectItem>
                <SelectItem value="Junior High School" className={selectItemClass}>Junior High / Middle School</SelectItem>
                <SelectItem value="High School" className={selectItemClass}>{t('profile.educationOptions.highSchool')}</SelectItem>
                <SelectItem value="Vocational/Trade School" className={selectItemClass}>Vocational / Trade School</SelectItem>
                <SelectItem value="Some College" className={selectItemClass}>{t('profile.educationOptions.someCollege')}</SelectItem>
                <SelectItem value="Associate Degree" className={selectItemClass}>{t('profile.educationOptions.associate')}</SelectItem>
                <SelectItem value="Bachelor's Degree" className={selectItemClass}>{t('profile.educationOptions.bachelors')}</SelectItem>
                <SelectItem value="Postgraduate Diploma" className={selectItemClass}>Postgraduate Diploma</SelectItem>
                <SelectItem value="Master's Degree" className={selectItemClass}>{t('profile.educationOptions.masters')}</SelectItem>
                <SelectItem value="Doctorate" className={selectItemClass}>{t('profile.educationOptions.doctorate')}</SelectItem>
                <SelectItem value="Professional Degree" className={selectItemClass}>Professional Degree (MD, JD, etc.)</SelectItem>
                <SelectItem value="Self-Taught" className={selectItemClass}>Self-Taught / Autodidact</SelectItem>
                <SelectItem value="Currently Studying" className={selectItemClass}>Currently Studying</SelectItem>
                <SelectItem value="Other" className={selectItemClass}>{t('profile.educationOptions.other')}</SelectItem>
              </SelectContent>
            </Select>
            {editedProfile.education_level === 'Other' && (
              <Input
                type="text"
                id="education_level_custom"
                name="education_level_custom"
                value={editedProfile.education_level_custom || ''}
                onChange={e => onInputChange({
                  target: { name: 'education_level_custom', value: e.target.value }
                } as React.ChangeEvent<HTMLInputElement>)}
                disabled={!isEditing}
                className={inputClass}
                placeholder={t('profile.enterEducation')}
              />
            )}
          </div>
        </div>
  );
};

export default WorkEducationSection;

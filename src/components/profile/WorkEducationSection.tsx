
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import { Label } from '@/components/ui/label';

interface WorkEducationSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const WorkEducationSection = ({ editedProfile, isEditing, onInputChange }: WorkEducationSectionProps) => {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.workEducation')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="occupation">{t('profile.occupation')}</Label>
              <Select
                value={editedProfile.occupation}
                onValueChange={value => onInputChange({
                  target: { name: 'occupation', value }
                } as any)}
                disabled={!isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('profile.selectOccupation')} />
                </SelectTrigger>
                <SelectContent>
                  {occupationOptions.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="text"
                id="occupationCustom"
                name="occupationCustom"
                value={editedProfile.occupationCustom || ''}
                onChange={e => onInputChange({
                  target: { name: 'occupation', value: e.target.value }
                } as any)}
                disabled={!isEditing}
                className="w-full mt-2"
                placeholder={t('profile.enterOccupation')}
              />
            </div>
            <div>
              <Label htmlFor="industry">{t('profile.industry')}</Label>
              <Select
                value={editedProfile.industry}
                onValueChange={value => onInputChange({
                  target: { name: 'industry', value }
                } as any)}
                disabled={!isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('profile.selectIndustry')} />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="text"
                id="industryCustom"
                name="industryCustom"
                value={editedProfile.industryCustom || ''}
                onChange={e => onInputChange({
                  target: { name: 'industry', value: e.target.value }
                } as any)}
                disabled={!isEditing}
                className="w-full mt-2"
                placeholder={t('profile.enterIndustry')}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="education_level">{t('profile.education')}</Label>
            <Select
              value={editedProfile.education_level}
              onValueChange={value => onInputChange({
                target: { name: 'education_level', value }
              } as React.ChangeEvent<HTMLInputElement>)}
              disabled={!isEditing}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('profile.selectEducation')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="High School">{t('profile.educationOptions.highSchool')}</SelectItem>
                <SelectItem value="Some College">{t('profile.educationOptions.someCollege')}</SelectItem>
                <SelectItem value="Associate Degree">{t('profile.educationOptions.associate')}</SelectItem>
                <SelectItem value="Bachelor's Degree">{t('profile.educationOptions.bachelors')}</SelectItem>
                <SelectItem value="Master's Degree">{t('profile.educationOptions.masters')}</SelectItem>
                <SelectItem value="Doctorate">{t('profile.educationOptions.doctorate')}</SelectItem>
                <SelectItem value="Other">{t('profile.educationOptions.other')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              id="education_level_custom"
              name="education_level_custom"
              value={editedProfile.education_level_custom || ''}
              onChange={e => onInputChange({
                target: { name: 'education_level', value: e.target.value }
              } as React.ChangeEvent<HTMLInputElement>)}
              disabled={!isEditing}
              className="w-full mt-2"
              placeholder={t('profile.enterEducation')}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkEducationSection;

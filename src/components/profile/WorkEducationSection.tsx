
import React from 'react';
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Work & Education</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="occupation">Occupation</Label>
              <Select
                value={editedProfile.occupation}
                onValueChange={value => onInputChange({
                  target: { name: 'occupation', value }
                } as any)}
                disabled={!isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select or type your occupation" />
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
                placeholder="Or enter your occupation"
              />
            </div>
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Select
                value={editedProfile.industry}
                onValueChange={value => onInputChange({
                  target: { name: 'industry', value }
                } as any)}
                disabled={!isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select or type your industry" />
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
                placeholder="Or enter your industry"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="education_level">Education Level</Label>
            <Select
              value={editedProfile.education_level}
              onValueChange={value => onInputChange({
                target: { name: 'education_level', value }
              } as React.ChangeEvent<HTMLInputElement>)}
              disabled={!isEditing}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select your education level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="High School">High School</SelectItem>
                <SelectItem value="Some College">Some College</SelectItem>
                <SelectItem value="Associate Degree">Associate Degree</SelectItem>
                <SelectItem value="Bachelor's Degree">Bachelor's Degree</SelectItem>
                <SelectItem value="Master's Degree">Master's Degree</SelectItem>
                <SelectItem value="Doctorate">Doctorate</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
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
              placeholder="Or enter your education level"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkEducationSection;

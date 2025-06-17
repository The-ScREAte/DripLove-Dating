
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
              <Input
                type="text"
                id="occupation"
                name="occupation"
                value={editedProfile.occupation}
                onChange={onInputChange}
                disabled={!isEditing}
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input
                type="text"
                id="industry"
                name="industry"
                value={editedProfile.industry}
                onChange={onInputChange}
                disabled={!isEditing}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="education_level">Education Level</Label>
            <Input
              type="text"
              id="education_level"
              name="education_level"
              value={editedProfile.education_level}
              onChange={onInputChange}
              disabled={!isEditing}
              className="w-full"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkEducationSection;

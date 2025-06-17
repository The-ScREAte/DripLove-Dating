
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface PersonalitySectionProps {
  editedProfile: any;
  isEditing: boolean;
  onSliderChange: (name: string, value: number[]) => void;
}

const PersonalitySection = ({ editedProfile, isEditing, onSliderChange }: PersonalitySectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personality</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <Label htmlFor="introvert_extrovert">
              Introvert vs Extrovert: {editedProfile.introvert_extrovert}%
            </Label>
            <div className="mt-2">
              <Slider
                id="introvert_extrovert"
                name="introvert_extrovert"
                defaultValue={[editedProfile.introvert_extrovert]}
                onValueChange={(value) => onSliderChange('introvert_extrovert', value)}
                disabled={!isEditing}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>Introvert</span>
                <span>Extrovert</span>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="spontaneous_planner">
              Spontaneous vs Planner: {editedProfile.spontaneous_planner}%
            </Label>
            <div className="mt-2">
              <Slider
                id="spontaneous_planner"
                name="spontaneous_planner"
                defaultValue={[editedProfile.spontaneous_planner]}
                onValueChange={(value) => onSliderChange('spontaneous_planner', value)}
                disabled={!isEditing}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>Spontaneous</span>
                <span>Planner</span>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="messy_organized">
              Messy vs Organized: {editedProfile.messy_organized}%
            </Label>
            <div className="mt-2">
              <Slider
                id="messy_organized"
                name="messy_organized"
                defaultValue={[editedProfile.messy_organized]}
                onValueChange={(value) => onSliderChange('messy_organized', value)}
                disabled={!isEditing}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>Messy</span>
                <span>Organized</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PersonalitySection;

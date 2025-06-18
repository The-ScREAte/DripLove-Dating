import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PreferencesSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onSliderChange: (name: string, value: number[]) => void;
  onSelectChange: (name: string, value: string) => void;
}

const PreferencesSection = ({ editedProfile, isEditing, onSliderChange, onSelectChange }: PreferencesSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="distance_preference">Distance Preference: {editedProfile.distance_preference} km</Label>
            <div className="mt-2">
              <Slider
                id="distance_preference"
                name="distance_preference"
                value={[editedProfile.distance_preference]}
                onValueChange={(value) => onSliderChange('distance_preference', value)}
                max={200}
                step={1}
                disabled={!isEditing}
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gender">Gender</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('gender', value)} value={editedProfile.gender}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="preference">Preference</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('preference', value)} value={editedProfile.preference}>
                <SelectTrigger id="preference" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="everyone">Both</SelectItem>
                  </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PreferencesSection;

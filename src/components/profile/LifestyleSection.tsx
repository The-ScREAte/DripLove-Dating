
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LifestyleSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onSelectChange: (name: string, value: string) => void;
}

const LifestyleSection = ({ editedProfile, isEditing, onSelectChange }: LifestyleSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifestyle</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="relationship_intent">Relationship Intent</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('relationship_intent', value)} value={editedProfile.relationship_intent}>
                <SelectTrigger id="relationship_intent" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="serious">Serious</SelectItem>
                  <SelectItem value="open_to_anything">Open to Anything</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="smoking">Smoking</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('smoking', value)} value={editedProfile.smoking}>
                <SelectTrigger id="smoking" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="socially">Socially</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="drinking">Drinking</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('drinking', value)} value={editedProfile.drinking}>
                <SelectTrigger id="drinking" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="socially">Socially</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exercise_level">Exercise Level</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('exercise_level', value)} value={editedProfile.exercise_level}>
                <SelectTrigger id="exercise_level" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="sleeping_schedule">Sleeping Schedule</Label>
            <Select disabled={!isEditing} onValueChange={(value) => onSelectChange('sleeping_schedule', value)} value={editedProfile.sleeping_schedule}>
              <SelectTrigger id="sleeping_schedule" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="early_bird">Early Bird</SelectItem>
                <SelectItem value="night_owl">Night Owl</SelectItem>
                <SelectItem value="flexible">Flexible</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LifestyleSection;

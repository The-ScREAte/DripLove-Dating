
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import InterestsEditor from '../InterestsEditor';

interface InterestsSectionProps {
  editedProfile: any;
  profile: any;
  isEditing: boolean;
  onInterestsChange: (interests: string[]) => void;
}

const InterestsSection = ({ editedProfile, profile, isEditing, onInterestsChange }: InterestsSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interests</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="interests">Choose your interests</Label>
          <InterestsEditor
            interests={isEditing ? editedProfile.interests || [] : profile?.interests || []}
            onInterestsChange={onInterestsChange}
            disabled={!isEditing}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default InterestsSection;

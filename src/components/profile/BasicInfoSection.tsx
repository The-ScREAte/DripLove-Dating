
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sanitizeName, sanitizeBio } from '@/utils/inputSanitization';

interface BasicInfoSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const handleSecureInputChange = (
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
) => {
  const { name, value } = e.target;
  let sanitizedValue = value;
  
  // Apply basic sanitization - remove only dangerous scripts, allow normal text
  if (name === 'first_name' || name === 'last_name') {
    // More permissive name validation - allow numbers, unicode chars, common punctuation
    sanitizedValue = value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>?/gm, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
      .slice(0, 50);
  } else if (name === 'bio') {
    sanitizedValue = sanitizeBio(value);
  }
  
  // Create new event with sanitized value
  const sanitizedEvent = {
    ...e,
    target: {
      ...e.target,
      value: sanitizedValue
    }
  } as React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
  
  onInputChange(sanitizedEvent);
};

const BasicInfoSection = ({ editedProfile, isEditing, onInputChange }: BasicInfoSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">First Name</Label>
              <Input
                type="text"
                id="first_name"
                name="first_name"
                value={editedProfile.first_name}
                onChange={(e) => handleSecureInputChange(e, onInputChange)}
                disabled={!isEditing}
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                type="text"
                id="last_name"
                name="last_name"
                value={editedProfile.last_name}
                onChange={(e) => handleSecureInputChange(e, onInputChange)}
                disabled={!isEditing}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              name="bio"
              value={editedProfile.bio}
              onChange={(e) => handleSecureInputChange(e, onInputChange)}
              disabled={!isEditing}
              className="w-full min-h-[100px] resize-none"
              placeholder="Tell us about yourself..."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BasicInfoSection;

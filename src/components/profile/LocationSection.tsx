
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LocationSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const LocationSection = ({ editedProfile, isEditing, onInputChange }: LocationSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Location Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                type="text"
                id="city"
                name="city"
                value={editedProfile.city}
                onChange={onInputChange}
                disabled={!isEditing}
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                type="text"
                id="country"
                name="country"
                value={editedProfile.country}
                onChange={onInputChange}
                disabled={!isEditing}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="zip_code">Zip Code</Label>
            <Input
              type="text"
              id="zip_code"
              name="zip_code"
              value={editedProfile.zip_code}
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

export default LocationSection;

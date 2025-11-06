
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import LocationInput from '@/components/forms/LocationInput';

interface LocationSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onLocationChange?: (location: {
    country: string;
    countryCode: string;
    city: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
    isCustomCity?: boolean;
  }) => void;
  onDistanceChange?: (distance: number[]) => void;
}

const LocationSection = ({ 
  editedProfile, 
  isEditing, 
  onInputChange, 
  onLocationChange,
  onDistanceChange 
}: LocationSectionProps) => {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.locationAndPreferences')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {isEditing && onLocationChange ? (
            <LocationInput
              country={editedProfile.country || ''}
              city={editedProfile.city || ''}
              zipCode={editedProfile.zip_code || ''}
              onLocationChange={onLocationChange}
              required={false}
            />
          ) : (
            // Display mode
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">{t('profile.city')}</Label>
                  <Input
                    type="text"
                    id="city"
                    name="city"
                    value={editedProfile.city || ''}
                    onChange={onInputChange}
                    disabled={!isEditing}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label htmlFor="country">{t('profile.country')}</Label>
                  <Input
                    type="text"
                    id="country"
                    name="country"
                    value={editedProfile.country || ''}
                    onChange={onInputChange}
                    disabled={!isEditing}
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="zip_code">{t('profile.zipCode')}</Label>
                <Input
                  type="text"
                  id="zip_code"
                  name="zip_code"
                  value={editedProfile.zip_code || ''}
                  onChange={onInputChange}
                  disabled={!isEditing}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Distance Preference */}
          <div className="space-y-3">
            <Label>{t('profile.maxDistance')}</Label>
            <div className="px-3">
            <Slider
                value={[editedProfile.max_distance || 50]}
                onValueChange={onDistanceChange || (() => {})}
                max={500}
                min={1}
                step={5}
                className="w-full"
                disabled={!isEditing}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1 km</span>
                <span className="font-medium">{editedProfile.max_distance || 50} km</span>
                <span>500 km</span>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Set how far you're willing to match with other users. 
              Smaller distances mean more local matches.
            </div>
          </div>

          {/* Location Status - Only show warnings when location is not available */}
          {editedProfile.city && !editedProfile.latitude && (
            <div className="p-3 bg-orange-50 rounded-lg">
              <div className="text-sm text-orange-800 font-medium">
                ⚠️ Approximate Location
              </div>
              <div className="text-xs text-orange-600">
                Your city isn't in our database. You'll still get matches based on country/region.
              </div>
            </div>
          )}

          {!editedProfile.city && (
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="text-sm text-red-800 font-medium">
                ⚠️ Location Required
              </div>
              <div className="text-xs text-red-600">
                Please add your city to enable location-based matching.
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationSection;

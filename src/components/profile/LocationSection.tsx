import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Crown, ChevronRight } from 'lucide-react';
import LocationInput from '@/components/forms/LocationInput';
import UnlockCountriesDialog from './UnlockCountriesDialog';
import { getCountriesList } from '@/constants/locationData';

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
  onSelectChange?: (name: string, value: string) => void;
  onAgeRangeChange?: (range: number[]) => void;
  isPremium?: boolean;
  userId?: string;
  onUnlockedCountriesChange?: (countries: string[]) => void;
}

const LocationSection = ({ 
  editedProfile, 
  isEditing, 
  onInputChange, 
  onLocationChange,
  onDistanceChange,
  onSelectChange,
  onAgeRangeChange,
  isPremium,
  userId,
  onUnlockedCountriesChange
}: LocationSectionProps) => {
  const { t } = useTranslation();
  const [showCountryDialog, setShowCountryDialog] = useState(false);
  const unlockedCountries = editedProfile.unlocked_countries || [];

  const getCountryName = (code: string) => {
    const countries = getCountriesList();
    const country = countries.find(c => c.code === code);
    return country?.name || code;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.locationAndPreferences')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Gender and Looking For Preferences */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gender">{t('profile.gender')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange?.('gender', value)} value={editedProfile.gender}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('profile.genderOptions.male')}</SelectItem>
                  <SelectItem value="female">{t('profile.genderOptions.female')}</SelectItem>
                  <SelectItem value="other">{t('profile.genderOptions.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="preference">{t('profile.lookingFor')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange?.('preference', value)} value={editedProfile.preference}>
                <SelectTrigger id="preference" className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('profile.genderOptions.male')}</SelectItem>
                  <SelectItem value="female">{t('profile.genderOptions.female')}</SelectItem>
                  <SelectItem value="everyone">{t('profile.genderOptions.both')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Age Range Preference */}
          <div className="space-y-3">
            <Label>{t('profile.ageRangeForMatches')}</Label>
            <div className="px-3">
              <div className="relative">
                <Slider
                  value={[editedProfile.min_age || 18, editedProfile.max_age || 99]}
                  onValueChange={onAgeRangeChange || (() => {})}
                  max={99}
                  min={18}
                  step={1}
                  className="w-full"
                  disabled={!isEditing}
                />
                {/* Visual enhancement for better UX */}
                <div className="absolute -top-8 left-0 right-0 flex justify-between pointer-events-none">
                  <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded" style={{ 
                    left: `${((editedProfile.min_age || 18) - 18) / (99 - 18) * 100}%`,
                    position: 'absolute',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none'
                  }}>
                    {editedProfile.min_age || 18}
                  </div>
                  <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded" style={{ 
                    left: `${((editedProfile.max_age || 99) - 18) / (99 - 18) * 100}%`,
                    position: 'absolute',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none'
                  }}>
                    {editedProfile.max_age || 99}
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{t('profile.ageYears', { age: 18 })}</span>
                <span className="font-medium">
                  {t('profile.ageRange', { min: editedProfile.min_age || 18, max: editedProfile.max_age || 99 })}
                </span>
                <span>{t('profile.ageYears', { age: 99 })}</span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {t('profile.ageRangeDescription')}
            </div>
          </div>

          {/* Location Section */}
          {isEditing && onLocationChange ? (
            <LocationInput
              country={editedProfile.country || ''}
              city={editedProfile.city || ''}
              zipCode={editedProfile.zip_code || ''}
              countryCode={editedProfile.country_code || ''}
              onLocationChange={onLocationChange}
              required={false}
              isProfileEdit={true}
              isPremium={isPremium}
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
                value={[editedProfile.max_distance || 250]}
                onValueChange={onDistanceChange || (() => {})}
                max={500}
                min={1}
                step={5}
                className="w-full"
                disabled={!isEditing}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1 km</span>
                <span className="font-medium">{editedProfile.max_distance || 250} km</span>
                <span>500 km</span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {t('profile.maxDistanceDescription')}
            </div>
          </div>

          {/* Premium Country Unlock Feature */}
          {isPremium && userId && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <Label className="font-medium">{t('profile.unlockCountries')}</Label>
                <Crown className="w-4 h-4 text-yellow-500" />
              </div>
              
              <div className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground mb-3">
                  {t('profile.unlockCountriesInfo')}
                </p>
                
                {/* Show currently unlocked countries */}
                {unlockedCountries.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      {t('profile.currentlyUnlocked')}:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {unlockedCountries.map((code: string) => (
                        <span 
                          key={code}
                          className="px-2 py-1 bg-primary/20 text-primary text-sm rounded-full"
                        >
                          {getCountryName(code)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCountryDialog(true)}
                  className="w-full flex items-center justify-between"
                  disabled={!isEditing}
                >
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    {unlockedCountries.length > 0 
                      ? t('profile.manageCountries') 
                      : t('profile.selectCountries')}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {unlockedCountries.length}/3
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </Button>
              </div>
            </div>
          )}

          {/* Location Status - Only show warnings when location is not available */}
          {editedProfile.city && !editedProfile.latitude && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
              <div className="text-sm text-orange-800 dark:text-orange-200 font-medium">
                ⚠️ {t('profile.approximateLocation')}
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-300">
                {t('profile.approximateLocationDescription')}
              </div>
            </div>
          )}

          {!editedProfile.city && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
              <div className="text-sm text-red-800 dark:text-red-200 font-medium">
                ⚠️ {t('profile.locationRequired')}
              </div>
              <div className="text-xs text-red-600 dark:text-red-300">
                {t('profile.locationRequiredDescription')}
              </div>
            </div>
          )}
        </div>
      </CardContent>

      {/* Country Unlock Dialog */}
      {isPremium && userId && (
        <UnlockCountriesDialog
          isOpen={showCountryDialog}
          onClose={() => setShowCountryDialog(false)}
          userId={userId}
          currentCountry={editedProfile.country || ''}
          currentCountryCode={editedProfile.country_code || ''}
          unlockedCountries={unlockedCountries}
          onSave={(countries) => {
            if (onUnlockedCountriesChange) {
              onUnlockedCountriesChange(countries);
            }
          }}
        />
      )}
    </Card>
  );
};

export default LocationSection;

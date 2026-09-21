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
import { getDistanceUnitLabel, toDisplayDistance, fromDisplayDistance } from '@/utils/distanceUnits';

// Must match FREE_USER_MAX_DISTANCE_KM / PREMIUM_USER_MAX_DISTANCE_KM in
// DiscoverPage.tsx (the values that actually gate the discovery query) and
// the chk_max_distance DB constraint's outer bound (5000km). The radius is
// always additionally bounded by the user's own country - a larger radius
// never spills into a neighbouring country.
const FREE_MAX_DISTANCE_KM = 600;
const PREMIUM_MAX_DISTANCE_KM = 5000;

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
  onUpgradeClick?: () => void;
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
  onUnlockedCountriesChange,
  onUpgradeClick
}: LocationSectionProps) => {
  const { t } = useTranslation();
  const [showCountryDialog, setShowCountryDialog] = useState(false);
  const unlockedCountries = editedProfile.unlocked_countries || [];
  const distanceMax = isPremium ? PREMIUM_MAX_DISTANCE_KM : FREE_MAX_DISTANCE_KM;

  const getCountryName = (code: string) => {
    const countries = getCountriesList();
    const country = countries.find(c => c.code === code);
    return country?.name || code;
  };

  return (
    <div className="space-y-6">
      {/* Matching Preferences Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          {t('profile.matchingPreferences')}
        </h3>
        
        {/* Gender and Looking For Preferences */}
        <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gender" className="text-white">{t('profile.gender')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange?.('gender', value)} value={editedProfile.gender}>
                <SelectTrigger id="gender" className="w-full bg-black/40 border-pink-500/30 text-white">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent className="bg-black border-pink-500/30">
                  <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="male">{t('profile.genderOptions.male')}</SelectItem>
                  <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="female">{t('profile.genderOptions.female')}</SelectItem>
                  <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="other">{t('profile.genderOptions.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="preference" className="text-white">{t('profile.lookingFor')}</Label>
              <Select disabled={!isEditing} onValueChange={(value) => onSelectChange?.('preference', value)} value={editedProfile.preference}>
                <SelectTrigger id="preference" className="w-full bg-black/40 border-pink-500/30 text-white">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent className="bg-black border-pink-500/30">
                  <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="male">{t('profile.genderOptions.male')}</SelectItem>
                  <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="female">{t('profile.genderOptions.female')}</SelectItem>
                  <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="everyone">{t('profile.genderOptions.both')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Age Range Preference */}
          <div className="space-y-3">
            <Label className="text-white">{t('profile.ageRangeForMatches')}</Label>
            <div className="px-3">
              <Slider
                value={[editedProfile.min_age || 18, editedProfile.max_age || 75]}
                onValueChange={onAgeRangeChange || (() => {})}
                max={75}
                min={18}
                step={1}
                className="w-full"
                disabled={!isEditing}
              />
              <div className="flex justify-between text-xs text-white mt-1">
                <span>{t('profile.ageYears', { age: 18 })}</span>
                <span className="font-medium">
                  {editedProfile.min_age || 18} - {(editedProfile.max_age || 75) >= 75 ? '75+' : `${editedProfile.max_age} years`}
                </span>
                <span>75+</span>
              </div>
            </div>
          </div>
      </div>

      {/* Location Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          {t('profile.location')}
        </h3>
        
        {/* Always show LocationInput for country availability feature, but disable editing when not in edit mode */}
        <LocationInput
          country={editedProfile.country || ''}
          city={editedProfile.city || ''}
          zipCode={editedProfile.zip_code || ''}
          countryCode={editedProfile.country_code || ''}
          onLocationChange={onLocationChange || (() => {})}
          required={false}
          isProfileEdit={true}
          isPremium={isPremium}
          disabled={!isEditing}
        />

        {/* Distance Preference */}
        <div className="space-y-3">
          <Label className="text-white">What max distance do you want to see people?</Label>
          <div className="px-3">
          <Slider
              value={[toDisplayDistance(Math.min(editedProfile.max_distance || 250, distanceMax))]}
              onValueChange={(v) => {
                if (!onDistanceChange) return;
                const km = Math.min(Math.max(1, fromDisplayDistance(v[0])), distanceMax);
                onDistanceChange([km]);
              }}
              max={toDisplayDistance(distanceMax)}
              min={1}
              step={5}
              className="w-full"
              disabled={!isEditing}
            />
            <div className="flex justify-between text-xs text-white mt-1">
              <span>1 {getDistanceUnitLabel()}</span>
              <span className="font-medium">{toDisplayDistance(Math.min(editedProfile.max_distance || 250, distanceMax))} {getDistanceUnitLabel()}</span>
              <span>{toDisplayDistance(distanceMax)} {getDistanceUnitLabel()}</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Always stays inside your own country.
            </p>
          </div>
          {!isPremium && (
            <p className="text-xs text-yellow-200/80 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              Go Premium for more distance.
            </p>
          )}
        </div>
      </div>

      {/* Premium Country Unlock Feature - Show for Premium users */}
      {isPremium && userId && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-pink-400" />
            <Label className="font-medium text-white">{t('profile.unlockCountries')}</Label>
            <Crown className="w-4 h-4 text-yellow-500" />
          </div>

          <div className="p-4 bg-black rounded-lg border border-pink-500/20">
            <p className="text-sm text-white mb-3">
              {t('profile.unlockCountriesInfo')}
            </p>

            {/* Show currently unlocked countries */}
            {unlockedCountries.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-white mb-1">
                  {t('profile.currentlyUnlocked')}:
                </div>
                <div className="flex flex-wrap gap-2">
                  {unlockedCountries.map((code: string) => (
                    <span
                      key={code}
                      className="px-2 py-1 bg-pink-500/20 text-pink-300 text-sm rounded-full"
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
              className="h-8 px-3 text-xs flex items-center justify-between gap-3 bg-white border-pink-500/30 text-black hover:bg-neutral-200 hover:text-black"
              disabled={!isEditing}
            >
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                {unlockedCountries.length > 0
                  ? t('profile.manageCountries')
                  : t('profile.selectCountries')}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-black">
                  {unlockedCountries.length}/3
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Button>
          </div>
        </div>
      )}

      {/* Premium Upsell for Free Users */}
      {!isPremium && (
        <button
          type="button"
          onClick={() => onUpgradeClick?.()}
          className="w-full flex items-start gap-3 p-3 bg-black rounded-lg border border-yellow-500/30 text-sm text-left transition-colors hover:bg-yellow-500/5"
        >
          <div className="p-2 bg-yellow-500/15 rounded-full">
            <Globe className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              Love without borders
              <Crown className="w-4 h-4 text-yellow-500" />
            </p>
            <p className="text-xs text-white">
              Go Premium to unlock up to 3 extra countries beyond your own.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-yellow-500/70 shrink-0 mt-1" />
        </button>
      )}

      {/* Location Status - Only show warnings when location is not available */}
      {editedProfile.city && !editedProfile.latitude && (
        <div className="p-3 bg-black rounded-lg border border-orange-500/30">
          <div className="text-sm text-orange-300 font-medium">
            ⚠️ {t('profile.approximateLocation')}
          </div>
          <div className="text-xs text-orange-200/80">
            {t('profile.approximateLocationDescription')}
          </div>
        </div>
      )}

      {!editedProfile.city && (
        <div className="p-3 bg-black rounded-lg border border-red-500/30">
          <div className="text-sm text-red-300 font-medium">
            ⚠️ {t('profile.locationRequired')}
          </div>
          <div className="text-xs text-red-200/80">
            {t('profile.locationRequiredDescription')}
          </div>
        </div>
      )}

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
    </div>
  );
};

export default LocationSection;

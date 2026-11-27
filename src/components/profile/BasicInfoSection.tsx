
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sanitizeBio } from '@/utils/inputSanitization';
import { calculateAgeOrNull } from '@/utils/dateUtils';

interface BasicInfoSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

// 137cm (4'6") to 213cm (7'0") covers the practical range for a height picker.
const HEIGHT_OPTIONS_CM = Array.from({ length: 213 - 137 + 1 }, (_, i) => 137 + i);

const formatHeight = (cm: number) => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
};
const BasicInfoSection = ({ editedProfile, isEditing, onInputChange }: BasicInfoSectionProps) => {
  const { t } = useTranslation();
  
  const age = calculateAgeOrNull(editedProfile.date_of_birth);
  
  return (
        <div className="space-y-5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="first_name" className="text-white">{t('profile.firstName')}</Label>
              <Input tone="dark"
                type="text"
                id="first_name"
                name="first_name"
                value={editedProfile.first_name || ''}
                onChange={(e) => {
                  // Only sanitize for security (remove scripts/HTML) but preserve spaces for names
                  const basicSanitized = e.target.value
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<[^>]*>?/gm, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+\s*=/gi, '')
                    .slice(0, 50);
                  
                  onInputChange({
                    ...e,
                    target: {
                      ...e.target,
                      name: 'first_name',
                      value: basicSanitized
                    }
                  });
                }}
                disabled={!isEditing}
                className="w-full disabled:text-white/60"
              />
            </div>
            <div>
              <Label htmlFor="last_name" className="text-white">{t('profile.lastName')}</Label>
              <Input tone="dark"
                type="text"
                id="last_name"
                name="last_name"
                value={editedProfile.last_name || ''}
                onChange={(e) => {
                  // Only sanitize for security (remove scripts/HTML) but preserve spaces for names
                  const basicSanitized = e.target.value
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<[^>]*>?/gm, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+\s*=/gi, '')
                    .slice(0, 50);
                  
                  onInputChange({
                    ...e,
                    target: {
                      ...e.target,
                      name: 'last_name',
                      value: basicSanitized
                    }
                  });
                }}
                disabled={!isEditing}
                className="w-full disabled:text-white/60"
              />
            </div>
          </div>

          {/* Date of Birth and Age Display */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date_of_birth" className="text-white">{t('profile.dateOfBirth', 'Date of Birth')}</Label>
              <Input tone="dark"
                type="date"
                id="date_of_birth"
                name="date_of_birth"
                value={editedProfile.date_of_birth || ''}
                disabled={true}
                className="w-full bg-black/30 border-pink-500/10 text-white/60 cursor-not-allowed"
              />
            </div>
            <div>
              <Label htmlFor="age" className="text-white">{t('profile.age', 'Age')}</Label>
              <Input tone="dark"
                type="text"
                id="age"
                name="age"
                value={age ? `${age} years old` : 'Not set'}
                disabled={true}
                className="w-full bg-black/30 border-pink-500/10 text-white/60 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="height" className="text-white">{t('profile.height', 'Height')}</Label>
            <Select
              value={editedProfile.height_cm ? String(editedProfile.height_cm) : undefined}
              onValueChange={(value) => onInputChange({
                target: { name: 'height_cm', value: Number(value) }
              } as any)}
              disabled={!isEditing}
            >
              <SelectTrigger tone="dark" id="height" className="w-full disabled:text-white/60">
                <SelectValue placeholder={t('profile.selectHeight', 'Select your height')} />
              </SelectTrigger>
              <SelectContent className="bg-black border-pink-500/30 max-h-72">
                {HEIGHT_OPTIONS_CM.map((cm) => (
                  <SelectItem key={cm} value={String(cm)} className="text-white focus:bg-pink-500/15 focus:text-white">
                    {formatHeight(cm)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="bio" className="text-white">{t('profile.bio')}</Label>
            <Textarea tone="dark"
              id="bio"
              name="bio"
              value={editedProfile.bio || ''}
              onChange={(e) => {
                // Only sanitize for security (remove scripts/HTML) but preserve spaces
                const basicSanitized = sanitizeBio(e.target.value);                
                onInputChange({
                  ...e,
                  target: {
                    ...e.target,
                    name: 'bio',
                    value: basicSanitized
                  }
                });
              }}
              disabled={!isEditing}
              className="w-full min-h-[100px] resize-none disabled:text-white/60"
              placeholder={t('profile.bioPlaceholder')}
            />
            <p className="text-xs text-white/60 mt-1">
              {t('profile.dobChangeNote', 'Note: Change of Date of Birth: Contact admin and be ready to provide proof of date change.')}
            </p>
          </div>
        </div>
  );
};

export default BasicInfoSection;

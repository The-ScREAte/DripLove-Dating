
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sanitizeName, sanitizeBio } from '@/utils/inputSanitization';
import { containsBadWords } from '@/utils/textModeration';

interface BasicInfoSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const getSanitizedValue = (name: string, value: string) => {
  let sanitizedValue = value;
  if (name === 'first_name' || name === 'last_name') {
    sanitizedValue = value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>?/gm, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
      .slice(0, 50);
  } else if (name === 'bio') {
    sanitizedValue = sanitizeBio(value);
    // Only check for bad words when the user finishes typing (not on every keystroke)
    // This prevents clearing the bio while they're still typing
  }
  return sanitizedValue;
};

const BasicInfoSection = ({ editedProfile, isEditing, onInputChange }: BasicInfoSectionProps) => {
  const { t } = useTranslation();
  
  // Calculate age from date of birth
  const calculateAge = (dateOfBirth: string | null | undefined): number | null => {
    if (!dateOfBirth) return null;
    try {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  };
  
  const age = calculateAge(editedProfile.date_of_birth);
  
  return (
    <Card className="bg-black border-pink-500/30">
      <CardHeader>
        <CardTitle className="text-white">{t('profile.basicInfo')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="first_name" className="text-gray-200">{t('profile.firstName')}</Label>
              <Input
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
                className="w-full bg-black/40 border-pink-500/30 text-white placeholder:text-gray-500 disabled:bg-black/30 disabled:border-pink-500/10 disabled:text-gray-400"
              />
            </div>
            <div>
              <Label htmlFor="last_name" className="text-gray-200">{t('profile.lastName')}</Label>
              <Input
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
                className="w-full bg-black/40 border-pink-500/30 text-white placeholder:text-gray-500 disabled:bg-black/30 disabled:border-pink-500/10 disabled:text-gray-400"
              />
            </div>
          </div>

          {/* Date of Birth and Age Display */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date_of_birth" className="text-gray-200">{t('profile.dateOfBirth', 'Date of Birth')}</Label>
              <Input
                type="date"
                id="date_of_birth"
                name="date_of_birth"
                value={editedProfile.date_of_birth || ''}
                disabled={true}
                className="w-full bg-black/30 border-pink-500/10 text-gray-400 cursor-not-allowed"
              />
            </div>
            <div>
              <Label htmlFor="age" className="text-gray-200">{t('profile.age', 'Age')}</Label>
              <Input
                type="text"
                id="age"
                name="age"
                value={age ? `${age} years old` : 'Not set'}
                disabled={true}
                className="w-full bg-black/30 border-pink-500/10 text-gray-400 cursor-not-allowed"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bio" className="text-gray-200">{t('profile.bio')}</Label>
            <Textarea
              id="bio"
              name="bio"
              value={editedProfile.bio || ''}
              onChange={(e) => {
                // Only sanitize for security (remove scripts/HTML) but preserve spaces
                const basicSanitized = e.target.value
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/<[^>]*>?/gm, '')
                  .replace(/javascript:/gi, '')
                  .replace(/on\w+\s*=/gi, '')
                  .replace(/data:/gi, '')
                  .replace(/vbscript:/gi, '')
                  .replace(/[<>]/g, '')
                  .slice(0, 500);
                
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
              className="w-full min-h-[100px] resize-none bg-black/40 border-pink-500/30 text-white placeholder:text-gray-500 disabled:bg-black/30 disabled:border-pink-500/10 disabled:text-gray-400"
              placeholder={t('profile.bioPlaceholder')}
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('profile.dobChangeNote', 'Note: Change of Date of Birth: Contact admin and be ready to provide proof of date change.')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BasicInfoSection;

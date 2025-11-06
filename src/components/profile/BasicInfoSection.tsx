
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
  // ...existing code...
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.basicInfo')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">{t('profile.firstName')}</Label>
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
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="last_name">{t('profile.lastName')}</Label>
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
                className="w-full"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bio">{t('profile.bio')}</Label>
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
              className="w-full min-h-[100px] resize-none"
              placeholder={t('profile.bioPlaceholder')}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BasicInfoSection;

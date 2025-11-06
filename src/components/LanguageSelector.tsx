import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  isEditing: boolean;
  showLabel?: boolean;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  value, 
  onChange, 
  isEditing,
  showLabel = true 
}) => {
  const { t } = useTranslation();
  
  const languages = [
    { code: 'en', name: t('languages.english'), flag: '🇺🇸' },
    { code: 'fr', name: t('languages.french'), flag: '🇫🇷' },
    { code: 'de', name: t('languages.german'), flag: '🇩🇪' },
    { code: 'zh', name: t('languages.chinese'), flag: '🇨🇳' },
    { code: 'sw', name: t('languages.swahili'), flag: '🇰🇪' },
    { code: 'pt', name: t('languages.portuguese'), flag: '🇵🇹' },
    { code: 'ar', name: t('languages.arabic'), flag: '🇸🇦' },
  ];

  const currentLanguage = languages.find(lang => lang.code === value) || languages[0];

  return (
    <div className="space-y-2">
      {showLabel && (
        <Label className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          {t('profile.language')}
        </Label>
      )}
      {/* Always show selector - users should be able to change language anytime */}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue>
            <span className="flex items-center gap-2">
              <span>{currentLanguage.flag}</span>
              <span>{currentLanguage.name}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="flex items-center gap-2">
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default LanguageSelector;

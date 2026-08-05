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
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'de', name: 'Deutsch' },
    { code: 'zh', name: '中文' },
    { code: 'sw', name: 'Kiswahili' },
    { code: 'pt', name: 'Português' },
    { code: 'ar', name: 'العربية' },
  ];

  const currentLanguage = languages.find(lang => lang.code === value) || languages[0];

  return (
    <div className="space-y-2">
      {showLabel && (
        <Label className="flex items-center gap-2 text-gray-200">
          <Globe className="w-4 h-4" />
          {t('profile.language')}
        </Label>
      )}
      {/* Always show selector - users should be able to change language anytime */}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={`bg-black/40 border-pink-500/30 text-white ${showLabel ? "w-full" : "w-auto min-w-[80px] h-8 text-xs px-2"}`}>
          <SelectValue>
            <span className="flex items-center gap-1.5">
              <Globe className={showLabel ? "w-4 h-4" : "w-3 h-3"} />
              <span className="uppercase font-medium text-xs">{currentLanguage.code}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-black border-pink-500/30">
          {languages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code} className="text-white focus:bg-pink-500/15 focus:text-white">
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span className="uppercase font-medium">{lang.code}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default LanguageSelector;

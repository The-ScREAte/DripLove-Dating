import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';

interface GlobalLanguageSelectorProps {
  variant?: 'default' | 'welcome';
  userId?: string;
}

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

const GlobalLanguageSelector: React.FC<GlobalLanguageSelectorProps> = ({ 
  variant = 'default', 
  userId 
}) => {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);

  useEffect(() => {
    setCurrentLanguage(i18n.language);
  }, [i18n.language]);

  const handleLanguageChange = async (languageCode: string) => {
    try {
      // Change language in i18n
      await i18n.changeLanguage(languageCode);
      setCurrentLanguage(languageCode);

      // Save to sessionStorage for non-authenticated users
      sessionStorage.setItem('preferredLanguage', languageCode);

      // Save to database if user is authenticated
      if (userId) {
        await supabase
          .from('profiles')
          .update({ preferred_language: languageCode })
          .eq('id', userId);
        
        console.log('Language preference saved to database:', languageCode);
      }
    } catch (error) {
      console.error('Error changing language:', error);
    }
  };

  const currentLang = languages.find(lang => lang.code === currentLanguage) || languages[0];

  if (variant === 'welcome') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center space-x-1 text-white hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer text-sm font-bold">
            <Globe className="h-4 w-4" />
            <span>{currentLang.flag}</span>
            <span className="uppercase">{currentLang.code}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {languages.map((language) => (
            <DropdownMenuItem
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={`cursor-pointer ${
                currentLanguage === language.code ? 'bg-purple-100' : ''
              }`}
            >
              <span className="mr-2">{language.flag}</span>
              <span className="uppercase">{language.code}</span>
              {currentLanguage === language.code && (
                <span className="ml-auto text-purple-600">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200">
          <Globe className="h-5 w-5" />
          <span>{currentLang.flag}</span>
          <span className="uppercase">{currentLang.code}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={`cursor-pointer ${
              currentLanguage === language.code ? 'bg-purple-100' : ''
            }`}
          >
            <span className="mr-2">{language.flag}</span>
            <span className="uppercase">{language.code}</span>
            {currentLanguage === language.code && (
              <span className="ml-auto text-purple-600">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default GlobalLanguageSelector;

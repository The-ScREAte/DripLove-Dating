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
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'zh', name: '中文' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'pt', name: 'Português' },
  { code: 'ar', name: 'العربية' },
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
            <span className="uppercase">{currentLang.code}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {languages.map((language) => (
            <DropdownMenuItem
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={`cursor-pointer ${
                currentLanguage === language.code ? 'bg-pink-500/20' : ''
              }`}
            >
              <span className="uppercase">{language.code}</span>
              {currentLanguage === language.code && (
                <span className="ml-auto text-pink-400">✓</span>
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
        <button className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-muted/50 transition-colors text-xs opacity-60 hover:opacity-100">
          <Globe className="h-3 w-3" />
          <span className="uppercase text-[10px] font-medium">{currentLang.code}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={`cursor-pointer text-xs ${
              currentLanguage === language.code ? 'bg-pink-500/20' : ''
            }`}
          >
            <span className="uppercase text-[10px]">{language.code}</span>
            {currentLanguage === language.code && (
              <span className="ml-auto text-pink-400">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default GlobalLanguageSelector;

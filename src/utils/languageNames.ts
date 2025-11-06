export const getLanguageName = (code: string | null | undefined): string | null => {
  if (!code) return null;
  
  const languageNames: Record<string, string> = {
    'en': 'English',
    'fr': 'Français',
    'de': 'Deutsch',
    'zh': '中文',
    'sw': 'Kiswahili',
    'pt': 'Português',
    'ar': 'العربية'
  };
  
  return languageNames[code] || null;
};

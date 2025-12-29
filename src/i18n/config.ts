import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';
import zh from './locales/zh.json';
import sw from './locales/sw.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';

// Language resources
const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  de: { translation: de },
  zh: { translation: zh },
  sw: { translation: sw },
  pt: { translation: pt },
  ar: { translation: ar },
};

// Get the appropriate default language based on device settings
const getDefaultLanguage = (): string => {
  // Check sessionStorage first for user's explicit choice
  const savedLanguage = sessionStorage.getItem('preferredLanguage');
  if (savedLanguage) return savedLanguage;
  
  // Get device language
  const deviceLanguage = navigator.language || (navigator as any).languages?.[0] || 'en';
  const languageCode = deviceLanguage.split('-')[0].toLowerCase();
  
  // Only these languages auto-set from device.
  // Everything else defaults to English.
  const autoSetLanguages = ['fr', 'es', 'zh', 'pt'];
  
  // For French, Spanish, Chinese, Portuguese - use device language
  if (autoSetLanguages.includes(languageCode)) {
    return languageCode;
  }
  
  // For Swahili, Arabic, and other African languages, default to English
  // User can manually switch to their preferred language
  return 'en';
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    lng: getDefaultLanguage(), // Use intelligent default language detection
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['querystring', 'sessionStorage', 'localStorage'],
      caches: ['sessionStorage', 'localStorage'],
      lookupQuerystring: 'lang',
      lookupSessionStorage: 'preferredLanguage',
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;

// Map countries to languages
export const countryToLanguage: { [key: string]: string } = {
  // English
  'United States': 'en',
  'United Kingdom': 'en',
  'Canada': 'en',
  'Australia': 'en',
  'New Zealand': 'en',
  'Ireland': 'en',
  'South Africa': 'en',
  'Nigeria': 'en',
  'Ghana': 'en',
  'India': 'en',
  
  // French
  'France': 'fr',
  'Belgium': 'fr',
  'Switzerland': 'fr',
  'Luxembourg': 'fr',
  'Monaco': 'fr',
  'Senegal': 'fr',
  'Ivory Coast': 'fr',
  'Cameroon': 'fr',
  'Mali': 'fr',
  'Burkina Faso': 'fr',
  'Niger': 'fr',
  'Benin': 'fr',
  'Togo': 'fr',
  'Guinea': 'fr',
  'Rwanda': 'fr',
  'Burundi': 'fr',
  'Chad': 'fr',
  'Central African Republic': 'fr',
  'Republic of the Congo': 'fr',
  'Democratic Republic of the Congo': 'fr',
  'Gabon': 'fr',
  'Equatorial Guinea': 'fr',
  'Djibouti': 'fr',
  'Madagascar': 'fr',
  'Comoros': 'fr',
  'Seychelles': 'fr',
  
  // German
  'Germany': 'de',
  'Austria': 'de',
  'Liechtenstein': 'de',
  
  // Chinese
  'China': 'zh',
  'Taiwan': 'zh',
  'Singapore': 'zh',
  'Hong Kong': 'zh',
  'Macau': 'zh',
  
  // Swahili
  'Kenya': 'sw',
  'Tanzania': 'sw',
  'Uganda': 'sw',
  
  // Portuguese
  'Portugal': 'pt',
  'Brazil': 'pt',
  'Angola': 'pt',
  'Mozambique': 'pt',
  'Cape Verde': 'pt',
  'Guinea-Bissau': 'pt',
  'São Tomé and Príncipe': 'pt',
  'Timor-Leste': 'pt',
  
  // Arabic
  'Saudi Arabia': 'ar',
  'United Arab Emirates': 'ar',
  'Egypt': 'ar',
  'Morocco': 'ar',
  'Algeria': 'ar',
  'Tunisia': 'ar',
  'Libya': 'ar',
  'Jordan': 'ar',
  'Lebanon': 'ar',
  'Syria': 'ar',
  'Iraq': 'ar',
  'Kuwait': 'ar',
  'Bahrain': 'ar',
  'Qatar': 'ar',
  'Oman': 'ar',
  'Yemen': 'ar',
  'Palestine': 'ar',
  'Sudan': 'ar',
  'Mauritania': 'ar',
};

// Get language based on country
export const getLanguageForCountry = (country: string): string => {
  return countryToLanguage[country] || 'en';
};

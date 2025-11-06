import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import en from './locales/en.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import zh from './locales/zh.json';
import sw from './locales/sw.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';

// Language resources
const resources = {
  en: { translation: en },
  fr: { translation: fr },
  de: { translation: de },
  zh: { translation: zh },
  sw: { translation: sw },
  pt: { translation: pt },
  ar: { translation: ar },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    lng: sessionStorage.getItem('preferredLanguage') || 'en', // Check sessionStorage first
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['querystring', 'sessionStorage', 'localStorage', 'navigator'],
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

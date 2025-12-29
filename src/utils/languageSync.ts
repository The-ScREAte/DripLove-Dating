import i18n from '@/i18n/config';
import { supabase } from '@/integrations/supabase/client';
import { getLanguageForCountry } from '@/i18n/config';

/**
 * Detect and set language based on device language or region
 * For African languages (Swahili, etc.), defaults to English - user can manually switch
 * For major international languages (French, German, Chinese, Portuguese, Arabic), auto-detect
 */
export const detectDeviceLanguage = () => {
  // Respect explicit user choice (set by GlobalLanguageSelector)
  const savedLanguage = sessionStorage.getItem('preferredLanguage');
  if (savedLanguage) return savedLanguage;

  // Get device language (e.g., 'en-US', 'fr-FR', 'ar-SA')
  const deviceLanguage = navigator.language || navigator.languages?.[0] || 'en';
  
  // Extract the language code (e.g., 'en' from 'en-US')
  const languageCode = deviceLanguage.split('-')[0].toLowerCase();
  
  // Only these languages auto-detect from device.
  // Everything else defaults to English.
  const autoDetectLanguages = ['en', 'fr', 'es', 'zh', 'pt'];
  
  // African languages and Arabic should default to English until user switches
  // Swahili (sw), Arabic (ar), and other languages will default to English
  if (autoDetectLanguages.includes(languageCode)) {
    return languageCode;
  }
  
  // For all other languages (including Swahili and Arabic), default to English
  return 'en';
};

/**
 * Save current language to user's profile in database
 */
export const saveLanguageToProfile = async (userId: string) => {
  try {
    const currentLanguage = i18n.language;
    
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_language: currentLanguage })
      .eq('id', userId);
    
    if (error) {
      console.error('Error saving language to profile:', error);
    }
  } catch (error) {
    console.error('Exception saving language:', error);
  }
};

/**
 * Load user's saved language preference from database and apply it
 */
export const loadUserLanguage = async (userId: string) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error loading user language:', error);
      return;
    }
    
    if (profile?.preferred_language) {
      await i18n.changeLanguage(profile.preferred_language);
    }
  } catch (error) {
    console.error('Exception loading user language:', error);
  }
};

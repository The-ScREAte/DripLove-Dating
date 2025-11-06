import i18n from '@/i18n/config';
import { supabase } from '@/integrations/supabase/client';
import { getLanguageForCountry } from '@/i18n/config';

/**
 * Detect and set language based on device language or region
 */
export const detectDeviceLanguage = () => {
  // Get device language (e.g., 'en-US', 'fr-FR', 'ar-SA')
  const deviceLanguage = navigator.language || navigator.languages?.[0] || 'en';
  
  // Extract the language code (e.g., 'en' from 'en-US')
  const languageCode = deviceLanguage.split('-')[0];
  
  // Supported languages in the app
  const supportedLanguages = ['en', 'fr', 'de', 'zh', 'sw', 'pt', 'ar'];
  
  // Use the detected language if supported, otherwise default to 'en'
  const detectedLanguage = supportedLanguages.includes(languageCode) ? languageCode : 'en';
  
  return detectedLanguage;
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
    } else {
      console.log('✅ Language saved to profile:', currentLanguage);
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
      console.log('✅ User language loaded:', profile.preferred_language);
    }
  } catch (error) {
    console.error('Exception loading user language:', error);
  }
};

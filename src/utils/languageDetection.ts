import i18n, { countryToLanguage } from '@/i18n/config';

/**
 * Detect user's preferred language based on multiple factors
 * Priority:
 * 1. Database saved preference (for authenticated users)
 * 2. Session storage (for current session)
 * 3. Geographic location/IP
 * 4. Browser language
 * 5. Default to English
 */

export async function detectAndSetLanguage(userId?: string): Promise<string> {
  try {
    // 1. If user is authenticated, their DB preference is already loaded by MainApp
    if (userId) {
      const currentLang = i18n.language;
      if (currentLang && currentLang !== 'en') {
        console.log('Using user DB language preference:', currentLang);
        return currentLang;
      }
    }

    // 2. Check session storage (for non-authenticated users)
    const sessionLanguage = sessionStorage.getItem('preferredLanguage');
    if (sessionLanguage) {
      console.log('Using session language preference:', sessionLanguage);
      await i18n.changeLanguage(sessionLanguage);
      return sessionLanguage;
    }

    // 3. Try to detect from geographic location (IP-based)
    const geoLanguage = await detectLanguageFromLocation();
    if (geoLanguage) {
      console.log('Using geo-detected language:', geoLanguage);
      await i18n.changeLanguage(geoLanguage);
      sessionStorage.setItem('preferredLanguage', geoLanguage);
      return geoLanguage;
    }

    // 4. Fall back to browser language
    const browserLang = detectBrowserLanguage();
    if (browserLang) {
      console.log('Using browser language:', browserLang);
      await i18n.changeLanguage(browserLang);
      sessionStorage.setItem('preferredLanguage', browserLang);
      return browserLang;
    }

    // 5. Default to English
    console.log('Defaulting to English');
    await i18n.changeLanguage('en');
    return 'en';
  } catch (error) {
    console.error('Error detecting language:', error);
    return 'en';
  }
}

/**
 * Detect language from user's geographic location using IP
 */
async function detectLanguageFromLocation(): Promise<string | null> {
  try {
    // Try to get country from IP using a free geolocation API
    const response = await fetch('https://ipapi.co/json/', {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const country = data.country_name;
    
    if (country && countryToLanguage[country]) {
      return countryToLanguage[country];
    }
    
    return null;
  } catch (error) {
    console.log('Could not detect location:', error);
    return null;
  }
}

/**
 * Detect language from browser settings
 */
function detectBrowserLanguage(): string | null {
  const supportedLanguages = ['en', 'fr', 'de', 'zh', 'sw', 'pt', 'ar'];
  
  // Get browser language
  const browserLang = navigator.language || (navigator as any).userLanguage;
  
  if (!browserLang) return null;
  
  // Extract language code (e.g., 'en-US' -> 'en')
  const langCode = browserLang.split('-')[0].toLowerCase();
  
  // Check if it's a supported language
  if (supportedLanguages.includes(langCode)) {
    return langCode;
  }
  
  return null;
}

/**
 * Save language preference to database for authenticated users
 */
export async function saveLanguageToDatabase(
  userId: string,
  languageCode: string
): Promise<boolean> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_language: languageCode })
      .eq('id', userId);
    
    if (error) {
      console.error('Error saving language to database:', error);
      return false;
    }
    
    console.log('Language preference saved to database:', languageCode);
    return true;
  } catch (error) {
    console.error('Error saving language to database:', error);
    return false;
  }
}

/**
 * Load user's saved language preference from database
 */
export async function loadUserLanguagePreference(userId: string): Promise<string | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const { data, error } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('id', userId)
      .single();
    
    if (error || !data) {
      console.error('Error loading language preference:', error);
      return null;
    }
    
    return data.preferred_language || null;
  } catch (error) {
    console.error('Error loading language preference:', error);
    return null;
  }
}

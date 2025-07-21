/**
 * OAuth Configuration for Mobile App Deep Linking
 * Handles Google OAuth redirects for iOS and Android
 */

export const OAUTH_CONFIG = {
  // Custom URL scheme for your app
  customScheme: 'driplove',
  
  // OAuth redirect URIs for mobile
  redirectUris: {
    google: 'driplove://auth/callback/google',
    apple: 'driplove://auth/callback/apple',
    // Add other providers as needed
  },
  
  // Supabase redirect configuration
  supabaseRedirectUri: 'driplove://auth/callback',
  
  // Web fallback for development/testing
  webRedirectUri: process.env.NODE_ENV === 'development' 
    ? 'http://localhost:8081/auth/callback'
    : 'https://yourapp.com/auth/callback'
};

/**
 * Get the appropriate redirect URI based on platform
 */
export const getRedirectUri = (provider: 'google' | 'apple' = 'google') => {
  // Check if running in mobile app context
  const isMobile = window.location.protocol === 'capacitor:' || 
                   window.location.protocol === 'file:' ||
                   /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    return OAUTH_CONFIG.redirectUris[provider];
  }
  
  // Fallback to web redirect for browser/development
  return OAUTH_CONFIG.webRedirectUri;
};

/**
 * Configure Supabase Auth with proper mobile redirects
 */
export const getSupabaseAuthConfig = () => {
  const isMobile = window.location.protocol === 'capacitor:' || 
                   window.location.protocol === 'file:';
  
  return {
    redirectTo: isMobile ? OAUTH_CONFIG.supabaseRedirectUri : OAUTH_CONFIG.webRedirectUri,
    queryParams: {
      // Ensure proper mobile flow
      prompt: 'select_account',
    }
  };
};

/**
 * OAuth Configuration for Mobile App Deep Linking
 * Handles Google OAuth redirects for iOS and Android
 */

export const OAUTH_CONFIG = {
  // Custom URL scheme for your app
  customScheme: 'driplove',
  
  // OAuth redirect URIs for mobile
  redirectUris: {
    google: 'driplove://auth/callback',
    apple: 'driplove://auth/callback',
    // Add other providers as needed
  },
  
  // Supabase redirect configuration
  supabaseRedirectUri: 'driplove://auth/callback',
  
  // Web fallback for development/testing
  webRedirectUri: typeof window !== 'undefined' && window.location.origin 
    ? `${window.location.origin}/auth/callback`
    : 'https://fef6ab36-77bc-4046-b6f5-fc5b2ad8c182.lovableproject.com/auth/callback',
    
  // Localhost development override
  localhostRedirectUri: 'http://localhost:8080/auth/callback'
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
  
  // Check for localhost development
  if (typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return OAUTH_CONFIG.localhostRedirectUri;
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
  
  // Check for localhost development
  const isLocalhost = typeof window !== 'undefined' && 
                     (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  let redirectTo = OAUTH_CONFIG.webRedirectUri;
  
  if (isMobile) {
    redirectTo = OAUTH_CONFIG.supabaseRedirectUri;
  } else if (isLocalhost) {
    redirectTo = OAUTH_CONFIG.localhostRedirectUri;
  }
  
  return {
    redirectTo,
    queryParams: {
      // Ensure proper mobile flow
      prompt: 'select_account',
    }
  };
};

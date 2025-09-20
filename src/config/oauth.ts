/**
 * OAuth Configuration for Mobile App Deep Linking
 * Handles Google OAuth redirects for iOS and Android
 * 
 * IMPORTANT FOR APPLE SIGN IN:
 * You MUST add these URLs to Apple Developer Console > Sign In with Apple > Website URLs:
 * 
 * REQUIRED URLS TO ADD IN APPLE DEVELOPER CONSOLE:
 * 1. https://tgjsyyihabsovironesw.supabase.co/auth/v1/callback (Supabase Auth - CRITICAL)
 * 2. https://fef6ab36-77bc-4046-b6f5-fc5b2ad8c182.lovableproject.com/auth/callback (Lovable hosting)
 * 3. http://localhost:5173/auth/callback (Development)
 * 4. http://localhost:8080/auth/callback (Alternative dev port)
 * 
 * WITHOUT THESE URLs IN APPLE DEVELOPER CONSOLE, APPLE SIGN IN WILL FAIL!
 */

import { isMobileApp, isLocalhost } from '@/utils/platformUtils';

export const OAUTH_CONFIG = {
  // Custom URL scheme for your app
  customScheme: 'driplove',
  
  // OAuth redirect URIs for mobile
  redirectUris: {
    google: 'driplove://auth/callback',
    apple: 'driplove://auth/callback',
    // Add other providers as needed
  },
  
  // Web redirect URIs for development and production
  webRedirectUris: {
    google: typeof window !== 'undefined' && window.location.origin 
      ? `${window.location.origin}/auth/callback`
      : 'https://fef6ab36-77bc-4046-b6f5-fc5b2ad8c182.lovableproject.com/auth/callback',
    apple: typeof window !== 'undefined' && window.location.origin 
      ? `${window.location.origin}/auth/callback`  
      : 'https://fef6ab36-77bc-4046-b6f5-fc5b2ad8c182.lovableproject.com/auth/callback'
  },
  
  // Password reset redirect URI for mobile
  passwordResetUri: 'driplove://reset-password',
  
  // Email confirmation redirect URI for mobile
  emailConfirmUri: 'driplove://auth/confirm',
  
  // Supabase redirect configuration
  supabaseRedirectUri: 'driplove://auth/callback',
  
  // Web fallback for development/testing
  webRedirectUri: typeof window !== 'undefined' && window.location.origin 
    ? `${window.location.origin}/auth/callback`
    : 'https://fef6ab36-77bc-4046-b6f5-fc5b2ad8c182.lovableproject.com/auth/callback',
    
  // Localhost development override (will be dynamically determined)
  localhostRedirectUri: typeof window !== 'undefined' && window.location.origin
    ? `${window.location.origin}/auth/callback`
    : 'http://localhost:8080/auth/callback'
};

/**
 * Get the appropriate redirect URI based on platform
 */
export const getRedirectUri = (provider: 'google' | 'apple' = 'google') => {
  if (isMobileApp()) {
    return OAUTH_CONFIG.redirectUris[provider];
  }
  
  if (isLocalhost()) {
    return OAUTH_CONFIG.localhostRedirectUri;
  }
  
  // Use provider-specific web redirect
  return OAUTH_CONFIG.webRedirectUris[provider] || OAUTH_CONFIG.webRedirectUri;
};

/**
 * Get the appropriate password reset redirect URI based on platform
 */
export const getPasswordResetRedirectUri = () => {
  // Always prioritize localhost detection
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Use the current origin and port dynamically
    return `${window.location.origin}/reset-password`;
  }

  // Mobile app detection (Capacitor, file protocol, or custom scheme)
  if (isMobileApp()) {
    return OAUTH_CONFIG.passwordResetUri;
  }

  // Default for web/production
  return `${window.location.origin}/reset-password`;
};

/**
 * Get the appropriate email confirmation redirect URI based on platform
 */
export const getEmailConfirmRedirectUri = () => {
  // Always prioritize localhost detection
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Use the current origin and port dynamically
    return `${window.location.origin}/auth/confirm`;
  }

  // Mobile app detection (Capacitor, file protocol, or custom scheme)
  if (isMobileApp()) {
    return OAUTH_CONFIG.emailConfirmUri;
  }

  // Default for web/production
  return `${window.location.origin}/auth/confirm`;
};

/**
 * Configure Supabase Auth with proper mobile redirects
 */
export const getSupabaseAuthConfig = () => {
  let redirectTo = OAUTH_CONFIG.webRedirectUri;
  
  if (isMobileApp()) {
    redirectTo = OAUTH_CONFIG.supabaseRedirectUri;
  } else if (isLocalhost()) {
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

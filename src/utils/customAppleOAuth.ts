/**
 * Custom Apple OAuth Web Flow using Apple's JS SDK
 * 
 * This implements Apple Sign-In for web browsers using Apple's official JS SDK:
 * 1. Uses the Services ID (com.driplove.dating.signin) for web OAuth
 * 2. Uses Apple's JS SDK for proper web authentication
 * 3. Exchanges the Apple ID token for a Supabase session using signInWithIdToken
 * 
 * This allows us to keep Supabase configured for native (App ID) while supporting web.
 */

import { supabase } from '@/integrations/supabase/client';

// Apple JS SDK types
declare global {
  interface Window {
    AppleID: {
      auth: {
        init: (config: any) => void;
        signIn: (config?: any) => Promise<any>;
      };
    };
  }
}

/**
 * Load Apple's JS SDK dynamically with retry logic
 */
async function loadAppleJSSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded and properly initialized
    if (window.AppleID?.auth?.init) {
      console.log('🍎 Apple JS SDK already loaded');
      resolve();
      return;
    }

    // Create script element
    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('🍎 Apple JS SDK script loaded, waiting for initialization...');
      
      // Wait a bit for the SDK to fully initialize
      let attempts = 0;
      const maxAttempts = 10;
      
      const checkInit = () => {
        attempts++;
        if (window.AppleID?.auth?.init) {
          console.log('🍎 Apple JS SDK fully initialized');
          resolve();
        } else if (attempts < maxAttempts) {
          console.log(`🍎 Waiting for Apple SDK initialization... (${attempts}/${maxAttempts})`);
          setTimeout(checkInit, 100);
        } else {
          console.error('🍎 Apple JS SDK failed to initialize properly');
          reject(new Error('Apple JS SDK failed to initialize'));
        }
      };
      
      checkInit();
    };
    
    script.onerror = () => {
      console.error('🍎 Failed to load Apple JS SDK script');
      reject(new Error('Failed to load Apple JS SDK'));
    };
    
    document.head.appendChild(script);
  });
}

/**
 * Get Apple Sign-In configuration
 */
function getAppleSignInConfig() {
  const servicesId = (import.meta.env?.VITE_APPLE_SERVICES_ID as string) || 'com.driplove.dating.signin';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
  
  return {
    clientId: servicesId,
    scope: 'name email',
    redirectURI: `${origin}/auth/apple-callback`,
    state: generateState(),
    nonce: generateNonce(),
    usePopup: true // Use popup instead of redirect for better UX
  };
}

/**
 * Generate a cryptographically secure nonce for Apple OAuth
 */
function generateNonce(length = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);
  
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  
  return result;
}

/**
 * Generate a cryptographically secure state parameter
 */
function generateState(): string {
  return generateNonce(32);
}

/**
 * FINAL SOLUTION: Simple Apple OAuth redirect (no SDK needed)
 */
export async function startCustomAppleOAuth(): Promise<never> {
  console.log('🍎 Starting simple Apple OAuth redirect');
  
  const servicesId = (import.meta.env?.VITE_APPLE_SERVICES_ID as string) || 'com.driplove.dating.signin';
  const origin = window.location.origin;
  const state = generateState();
  
  // Store state for verification in callback
  sessionStorage.setItem('apple_oauth_state', state);
  
  // Use production URL for Apple OAuth (Apple doesn't allow localhost)
  const isLocalhost = origin.includes('localhost');
  const redirectUri = isLocalhost 
    ? 'https://fef6ab36-77bc-4046-b6f5-fc5b2ad8c182.lovableproject.com/auth/apple-callback'
    : `${origin}/auth/apple-callback`;
  
  // Create Apple OAuth URL without name/email scopes (avoids form_post requirement)
  const authUrl = `https://appleid.apple.com/auth/authorize?` + 
    `client_id=${encodeURIComponent(servicesId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `response_mode=query&` +
    `state=${encodeURIComponent(state)}`;
  
  console.log('🍎 Redirecting to Apple with URL:', {
    servicesId,
    redirectUri,
    state: state.substring(0, 8) + '...',
    useEdgeFunction: !origin.includes('localhost')
  });
  
  // Simple redirect - no complex SDK needed
  window.location.href = authUrl;
  
  // This never executes
  throw new Error('Redirect should have happened');
}

/**
 * Fallback: Simple Apple OAuth redirect flow
 */
async function startAppleRedirectFlow(): Promise<never> {
  console.log('🍎 Starting Apple redirect flow fallback');
  
  const servicesId = (import.meta.env?.VITE_APPLE_SERVICES_ID as string) || 'com.driplove.dating.signin';
  const origin = window.location.origin;
  const state = generateState();
  const nonce = generateNonce();
  
  // Store for verification
  sessionStorage.setItem('apple_oauth_state', state);
  sessionStorage.setItem('apple_oauth_nonce', nonce);
  
  // Build Apple OAuth URL manually (this should work more reliably)
  const params = new URLSearchParams({
    client_id: servicesId,
    redirect_uri: `${origin}/auth/apple-callback`,
    response_type: 'code id_token',
    response_mode: 'fragment',  // Use fragment instead of form_post for frontend handling
    scope: 'name email',
    state: state,
    nonce: nonce
  });
  
  const authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  
  console.log('🍎 Redirecting to Apple OAuth:', {
    clientId: servicesId,
    redirectUri: `${origin}/auth/apple-callback`,
    authUrl: authUrl.substring(0, 100) + '...'
  });
  
  // Redirect to Apple (this never returns)
  window.location.href = authUrl;
  
  // TypeScript requires a return, but this never executes
  throw new Error('Redirect should have happened');
}

/**
 * Process Apple Sign-In response and create Supabase session
 */
async function processAppleSignInResponse(response: any): Promise<{
  user: any;
  profile: any;
  needsProfileCompletion: boolean;
}> {
  console.log('🍎 Processing Apple Sign-In response');
  
  if (!response || !response.authorization || !response.authorization.id_token) {
    throw new Error('Invalid Apple Sign-In response - no ID token');
  }
  
  const idToken = response.authorization.id_token;
  
  // Exchange Apple ID token for Supabase session
  console.log('🍎 Exchanging Apple ID token for Supabase session');
  
  const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken
  });
  
  if (supabaseError) {
    console.error('🍎 Supabase signInWithIdToken error:', supabaseError);
    throw supabaseError;
  }
  
  if (!data.user) {
    throw new Error('No user returned from Supabase after Apple sign-in');
  }
  
  console.log('🍎 Successfully authenticated with Supabase:', data.user.id);
  
  // Check if user profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_admin, account_status, first_name, last_name')
    .eq('id', data.user.id)
    .single();
  
  if (profileError || !profile) {
    console.log('🍎 No profile found - needs completion');
    return { 
      user: data.user, 
      profile: null,
      needsProfileCompletion: true 
    };
  }
  
  // Check account status
  if (profile.account_status === 'blocked') {
    await supabase.auth.signOut();
    throw new Error('Account is blocked');
  }
  
  if (profile.account_status === 'on_hold') {
    await supabase.auth.signOut();
    throw new Error('Account is on hold');
  }
  
  // Save profile ID to session
  sessionStorage.setItem('profile_id', profile.id);
  
  // Check if profile needs completion
  const needsCompletion = !profile.first_name || !profile.last_name;
  
  return { 
    user: data.user, 
    profile: profile,
    needsProfileCompletion: needsCompletion 
  };
}

/**
 * Handle the Apple OAuth callback with query parameters
 */
export async function handleCustomAppleCallback(): Promise<{
  user: any;
  profile: any;
  needsProfileCompletion: boolean;
}> {
  console.log('🍎 Handling Apple OAuth Callback (query parameters)');
  
  try {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    console.log('🍎 Callback parameters:', {
      hasCode: !!code,
      hasState: !!state,
      error: error,
      currentUrl: window.location.href
    });
    
    // Check for errors
    if (error) {
      throw new Error(`Apple OAuth error: ${error}`);
    }
    
    if (!code) {
      throw new Error('No authorization code received from Apple');
    }
    
    // Verify state
    const storedState = sessionStorage.getItem('apple_oauth_state');
    if (!state || state !== storedState) {
      throw new Error('Invalid state parameter');
    }
    
    // Clean up stored state
    sessionStorage.removeItem('apple_oauth_state');
    
    // Use Supabase to handle the authorization code
    console.log('🍎 Processing authorization code with Supabase...');
    
    // Check if we're on production callback (redirect from Apple)
    const currentOrigin = window.location.origin;
    const isProductionCallback = currentOrigin.includes('lovableproject.com');
    
    if (isProductionCallback) {
      // We're on production - redirect back to localhost with the code
      console.log('🍎 Production callback detected, redirecting to localhost...');
      const localhostUrl = `http://localhost:8081/auth/apple-callback?code=${code}&state=${state}`;
      window.location.href = localhostUrl;
      throw new Error('Redirecting to localhost');
    }
    
    // We're on localhost - process normally with Supabase
    const supabaseCallbackUrl = `${currentOrigin}/auth/callback?code=${code}&state=${state}`;
    
    // Redirect to the regular Supabase callback handler
    console.log('🍎 Redirecting to Supabase callback handler:', supabaseCallbackUrl);
    window.location.href = supabaseCallbackUrl;
    
    // This never executes since we redirect
    throw new Error('Redirect to Supabase callback should have happened');
    
  } catch (err: any) {
    console.error('🍎 Apple OAuth callback error:', err);
    
    // Clean up on error
    sessionStorage.removeItem('apple_oauth_state');
    
    throw err;
  }
}

/**
 * Check if we're currently handling an Apple OAuth callback
 */
export function isAppleCallback(): boolean {
  if (typeof window === 'undefined') return false;
  
  return window.location.pathname === '/auth/apple-callback' || 
         (window.location.hash.includes('id_token') && window.location.hash.includes('state'));
}
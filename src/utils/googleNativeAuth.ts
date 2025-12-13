/**
 * Native Google Sign-In for Android
 * Uses @southdevs/capacitor-google-auth for true in-app authentication
 * No browser/webview - uses Google's native Sign-In UI
 */

import { GoogleAuth } from '@southdevs/capacitor-google-auth';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

// Track initialization state to prevent redundant initializations
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Initialize Google Auth plugin
export const initializeGoogleAuth = async (): Promise<void> => {
  // Skip if already initialized
  if (isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Use native config on Android (reads client ID from strings.xml)
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    initializationPromise = new Promise<void>((resolve) => {
      try {
        GoogleAuth.initialize({
          // Do not pass clientId on Android; plugin reads @string/server_client_id
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
        isInitialized = true;
        console.log('✅ Google Auth initialized');
        resolve();
      } catch (err) {
        console.warn('Google Auth initialization failed:', err);
        // Don't set isInitialized - allow retry
        initializationPromise = null;
        resolve(); // Still resolve so sign-in can attempt
      }
    });
    return initializationPromise;
  }
};

/**
 * Sign in with native Google Auth (Android only)
 * This opens Google's native sign-in UI - no browser/webview
 * Uses ONLY ID token (same as iOS Apple Sign-In)
 */
export const signInWithGoogleNative = async () => {
  try {
    // Ensure Google Auth is initialized
    await initializeGoogleAuth();

    console.log('📱 Starting native Google Sign-In...');

    // This opens Google's native picker - stays entirely in your app!
    const googleUser = await GoogleAuth.signIn({
      scopes: ['profile', 'email']
    });
    
    console.log('📱 Google Sign-In response received');
    
    const idToken = googleUser.authentication?.idToken;
    
    if (!idToken) {
      console.error('❌ No ID token in response:', JSON.stringify(googleUser, null, 2));
      throw new Error('No ID token received from Google');
    }

    console.log('✅ Google Sign-In successful, got ID token');

    // Sign in to Supabase using ONLY ID token (same as iOS Apple Sign-In)
    // DO NOT pass access_token - it causes audience validation issues
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      console.error('❌ Supabase sign-in error:', error);
      throw error;
    }
    
    console.log('✅ Supabase authentication successful');
    
    // Fast path: Check if user has a profile with minimal fields
    // This dramatically improves Android performance by reducing query complexity
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, bio, date_of_birth, city, country, account_status')
      .eq('id', data.user.id)
      .maybeSingle();

    // Quick account status check (blocks if account is restricted)
    if (profile?.account_status === 'blocked') {
      await supabase.auth.signOut();
      throw new Error('Account is blocked');
    }

    if (profile?.account_status === 'on_hold') {
      await supabase.auth.signOut();
      throw new Error('Account is on hold');
    }

    // Determine if profile needs completion
    const needsProfileCompletion = !profile || 
      !profile.first_name || 
      profile.first_name === 'User' ||
      !profile.bio || 
      profile.date_of_birth === '1990-01-01' ||
      !profile.city || 
      profile.city === 'Unknown' ||
      !profile.country;

    return {
      user: data.user,
      session: data.session,
      profile,
      needsProfileCompletion
    };

  } catch (err: any) {
    console.error('❌ Native Google Sign-In error:', err);
    
    // Handle user cancellation gracefully
    if (err.error === 'popup_closed_by_user' || 
        err.message?.includes('cancel') || 
        err.message?.includes('Cancel') ||
        err.code === 'SIGN_IN_CANCELLED' ||
        err.code === '12501') { // Google Sign-In cancelled error code
      throw new Error('Sign-in cancelled');
    }
    
    // Re-throw with more context for debugging
    if (err.message) {
      throw err;
    }
    throw new Error(`Google Sign-In failed: ${JSON.stringify(err)}`);
  }
};

/**
 * Check if native Google Auth is available (Android only)
 */
export const isNativeGoogleAuthAvailable = () => {
  const platform = Capacitor.getPlatform();
  return Capacitor.isNativePlatform() && platform === 'android';
};

/**
 * Sign out from Google Auth
 */
export const signOutGoogleNative = async () => {
  try {
    await GoogleAuth.signOut();
    console.log('✅ Signed out from Google');
  } catch (err) {
    console.error('❌ Google sign-out error:', err);
  }
};

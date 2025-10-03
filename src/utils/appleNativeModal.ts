import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { getAppleClientId } from '@/config/oauth';

/**
 * Generate a secure nonce for Apple Sign-In
 */
function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Native Apple Sign-In Modal (NO Safari, NO Browser, ONLY Modal)
 * Works around Capacitor plugin limitation that forces App ID instead of Services ID
 */
export async function signInWithAppleNativeModal() {
  try {
    // Only work on iOS native platform
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      throw new Error('Native Apple Sign-In modal is only available on iOS');
    }

    console.log('[Apple Native Modal] Starting native Apple Sign-In modal...');

    // Show native Apple modal - plugin will use App ID (com.driplove.dating) as audience
    // Remove nonce to avoid nonce mismatch issues with Supabase
    const result = await SignInWithApple.authorize({
      clientId: 'com.driplove.dating', // Use App ID since plugin ignores Services ID
      redirectURI: 'https://tgjsyyihabsovironesw.supabase.co/auth/v1/callback',
      scopes: 'email name',
      state: 'signin'
      // nonce: generateNonce() // Remove this - causes nonce mismatch with Supabase
    });

    console.log('[Apple Native Modal] Apple authorization result:', result);

    if (!result.response || !result.response.identityToken) {
      throw new Error('No identity token received from Apple');
    }

    const { identityToken } = result.response;

    // Use signInWithIdToken with the App ID token
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken
    });

    if (error) {
      console.error('[Apple Native Modal] Supabase auth error:', error);
      throw error;
    }

    if (!data.user) {
      throw new Error('No user returned from Supabase after Apple sign-in');
    }

    console.log('[Apple Native Modal] Successfully authenticated with Supabase:', data.user.id);

    // Check if user profile exists (same as Google OAuth flow)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_admin, account_status, first_name, last_name')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      // User doesn't have a profile - they need to complete profile creation
      // DO NOT create profile here - let them complete the form first
      console.log('[Apple Native Modal] No profile found - needs completion');
      return { 
        user: data.user, 
        profile: null,
        needsProfileCompletion: true 
      };
    }

    // User has existing profile - check account status
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

    // Return existing profile
    return { 
      user: data.user, 
      profile: profile,
      needsProfileCompletion: needsCompletion 
    };

  } catch (err: any) {
    console.error('[Apple Native Modal] Error:', err);
    
    // Handle user cancellation gracefully
    if (err.message?.includes('canceled') || err.message?.includes('cancelled')) {
      throw new Error('Apple Sign-In was cancelled');
    }
    
    throw err;
  }
}

/**
 * Check if native Apple Sign-In is available
 */
export function isAppleSignInAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/**
 * Fallback for non-iOS platforms - use Google OAuth style
 */
export async function signInWithAppleFallback() {
  const { getRedirectUri } = await import('@/config/oauth');
  const redirectTo = getRedirectUri('apple');
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo,
      queryParams: {
        prompt: 'select_account',
      }
    }
  });

  if (error) {
    throw error;
  }

  return { data, error: null };
}
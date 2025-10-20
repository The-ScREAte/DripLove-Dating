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

    // Extract name from Apple response if available (only on first sign up)
    let firstName = '';
    let lastName = '';
    if (result.response.givenName || result.response.familyName) {
      firstName = result.response.givenName || '';
      lastName = result.response.familyName || '';
      console.log('[Apple Native Modal] Extracted name from Apple:', { firstName, lastName });
    }

    // Check if user profile exists (same as Google OAuth flow)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_admin, account_status, first_name, last_name')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      // User doesn't have a profile - save name to user_metadata and let them complete profile
      // DO NOT create profile here - user needs to go through full profile completion with moderation
      console.log('[Apple Native Modal] No profile found - needs completion');
      
      // Save name to user_metadata so it can be pre-filled in profile completion form
      if (firstName || lastName) {
        await supabase.auth.updateUser({
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        });
        console.log('[Apple Native Modal] Saved Apple name to user_metadata');
      }
      
      return { 
        user: { ...data.user, user_metadata: { ...data.user.user_metadata, first_name: firstName, last_name: lastName } },
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
 * Fallback for non-iOS platforms - use custom Apple OAuth with Services ID
 */
export async function signInWithAppleFallback(): Promise<never> {
  console.log('🍎 Starting Custom Apple OAuth for Web (Services ID)');
  
  // Use our custom Apple OAuth flow that uses the Services ID
  const { startCustomAppleOAuth } = await import('@/utils/customAppleOAuth');
  
  // This will redirect to Apple OAuth (never returns)
  return await startCustomAppleOAuth();
}
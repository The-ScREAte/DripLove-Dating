/**
 * Native Google Sign-In for iOS
 * Uses Safari View Controller with proper deep link handling
 * Pattern modeled after Apple Sign-In native flow
 */

import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { getRedirectUri } from '@/config/oauth';
import { handleOAuthRedirect } from '@/utils/oauthCallbackHandler';

/**
 * Sign in with Google on iOS using Safari View Controller
 * This implements a robust flow similar to Apple's native approach
 */
export const signInWithGoogleIOS = async (): Promise<{
  user: any;
  session: any;
  profile: any;
  needsProfileCompletion: boolean;
}> => {
  // Only work on iOS native platform
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    throw new Error('iOS Google Sign-In is only available on iOS');
  }

  console.log('[iOS Google] Starting Google Sign-In via Safari View Controller...');

  return new Promise(async (resolve, reject) => {
    let hasProcessedAuth = false;
    let appUrlListener: any = null;
    let authSubscription: any = null;

    const cleanup = () => {
      if (appUrlListener) {
        appUrlListener.remove();
        appUrlListener = null;
      }
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }
      Browser.removeAllListeners();
    };

    const processAuthSuccess = async (session: any) => {
      if (hasProcessedAuth) return;
      hasProcessedAuth = true;

      console.log('[iOS Google] Processing auth success...');

      try {
        // Close browser first
        try {
          await Browser.close();
        } catch (e) {
          // Browser may already be closed
        }
        cleanup();

        // Small delay to ensure browser is fully closed
        await new Promise(r => setTimeout(r, 150));

        // Check profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, bio, date_of_birth, city, country, account_status')
          .eq('id', session.user.id)
          .maybeSingle();

        // Check account status
        if (profile?.account_status === 'blocked') {
          await supabase.auth.signOut();
          reject(new Error('Account is blocked'));
          return;
        }

        if (profile?.account_status === 'on_hold') {
          await supabase.auth.signOut();
          reject(new Error('Account is on hold'));
          return;
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

        console.log('[iOS Google] Auth completed successfully');

        resolve({
          user: session.user,
          session,
          profile,
          needsProfileCompletion
        });
      } catch (err) {
        console.error('[iOS Google] Error processing auth:', err);
        reject(err);
      }
    };

    const handleDeepLink = async (url: string) => {
      console.log('[iOS Google] Deep link received:', url);
      
      // Check if this is an OAuth callback
      const isOAuthCallback = 
        url.startsWith('driplove://auth') ||
        url.includes('?code=') ||
        url.includes('access_token=') ||
        url.includes('auth/callback');
        
      if (!isOAuthCallback) {
        console.log('[iOS Google] Not an OAuth callback, ignoring');
        return;
      }

      if (hasProcessedAuth) {
        console.log('[iOS Google] Already processed, ignoring duplicate');
        return;
      }

      console.log('[iOS Google] Processing OAuth callback from deep link...');

      try {
        // Close browser immediately
        try {
          await Browser.close();
        } catch (e) {
          // Browser may already be closed
        }

        // Delegate to the shared handler so we support both:
        // - implicit flow (#access_token=...)
        // - PKCE code flow (?code=...)
        const result = await handleOAuthRedirect(url);
        if (result?.session) {
          await processAuthSuccess(result.session);
          return;
        }

        cleanup();
        reject(new Error('No session established from OAuth callback'));
      } catch (err: any) {
        console.error('[iOS Google] Error handling deep link:', err);
        cleanup();
        reject(err);
      }
    };

    try {
      // Set up deep link listener BEFORE opening browser
      // This is the key difference - we listen for appUrlOpen events
      appUrlListener = await App.addListener('appUrlOpen', async (event: { url: string }) => {
        console.log('[iOS Google] appUrlOpen event:', event.url);
        await handleDeepLink(event.url);
      });

      // Also set up auth state listener as backup
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[iOS Google] Auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session && !hasProcessedAuth) {
          await processAuthSuccess(session);
        }
      });
      authSubscription = subscription;

      // Generate OAuth URL with deep link redirect
      const redirectTo = getRedirectUri('google');
      console.log('[iOS Google] Redirect URI:', redirectTo);
      
      const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
          skipBrowserRedirect: true,
        }
      });

      if (oauthError || !oauthData?.url) {
        cleanup();
        throw new Error(oauthError?.message || 'Failed to generate OAuth URL');
      }

      // Handle browser finished event (user closed browser manually)
      Browser.addListener('browserFinished', async () => {
        console.log('[iOS Google] Browser finished event');
        
        // Don't treat as cancelled if auth was already processed
        if (hasProcessedAuth) return;

        // Give deep link handler a moment to process
        await new Promise(r => setTimeout(r, 1000));

        if (hasProcessedAuth) return;

        // Check one more time if we got a session (fallback)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await processAuthSuccess(session);
          return;
        }

        cleanup();
        reject(new Error('Sign-in cancelled'));
      });

      // Open Safari View Controller
      console.log('[iOS Google] Opening Safari View Controller with URL:', oauthData.url);
      await Browser.open({
        url: oauthData.url,
        presentationStyle: 'popover',
        toolbarColor: '#000000',
      });

      console.log('[iOS Google] Safari View Controller opened');

    } catch (err: any) {
      cleanup();
      console.error('[iOS Google] Error:', err);
      
      if (err.message?.includes('cancel')) {
        reject(new Error('Sign-in cancelled'));
      } else {
        reject(err);
      }
    }
  });
};

/**
 * Check if iOS Google Auth is available
 */
export const isIOSGoogleAuthAvailable = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
};

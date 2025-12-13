/**
 * Native Google Sign-In for iOS
 * Uses Safari View Controller with improved deep link handling
 * Pattern modeled after Apple Sign-In native modal flow
 */

import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { getRedirectUri } from '@/config/oauth';

/**
 * Sign in with Google on iOS using Safari View Controller
 * This implements a more robust flow similar to Apple's native approach
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
    let authSubscription: any = null;
    let hasProcessedAuth = false;
    let browserOpenTime: number;

    const cleanup = () => {
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
        await Browser.close().catch(() => {});
        cleanup();

        // Small delay to ensure browser is fully closed
        await new Promise(r => setTimeout(r, 100));

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

    try {
      // Set up auth state listener BEFORE opening browser
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[iOS Google] Auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
          await processAuthSuccess(session);
        }
      });
      authSubscription = subscription;

      // Generate OAuth URL
      const redirectTo = getRedirectUri('google');
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

      // Handle browser finished event (user closed browser)
      Browser.addListener('browserFinished', async () => {
        console.log('[iOS Google] Browser finished event');
        
        // Don't treat as cancelled if auth was already processed
        if (hasProcessedAuth) return;

        // Give deep link a moment to process
        await new Promise(r => setTimeout(r, 800));

        if (hasProcessedAuth) return;

        // Check one more time if we got a session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await processAuthSuccess(session);
          return;
        }

        cleanup();
        reject(new Error('Sign-in cancelled'));
      });

      // Open Safari View Controller
      browserOpenTime = Date.now();
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

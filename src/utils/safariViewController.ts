/**
 * Apple Sign In with Safari View Controller (iOS only)
 */
import { supabase } from '@/integrations/supabase/client';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

interface OAuthOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  onComplete?: () => void;
}

export const openAppleSignInWithSafariViewController = async (
  redirectTo: string,
  options: OAuthOptions = {}
) => {
  try {
    // Request sign-in URL from Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo,
        flowType: 'pkce', // PKCE flow for mobile
        queryParams: { prompt: 'select_account' }
      } as any
    });

    if (error) {
      console.error('[Apple OAuth] Error:', error);
      options.onError?.(error);
      return;
    }

    if (!data?.url) {
      const err = new Error('No OAuth URL received from Supabase');
      console.error(err);
      options.onError?.(err);
      return;
    }

    // Listen for the deep-link callback from Apple
    const listener = App.addListener('appUrlOpen', async (event: any) => {
      try {
        const url: string = event?.url || '';
        console.log('[Apple OAuth] appUrlOpen received:', url);

        if (url.startsWith('driplove://auth/callback')) {
          // Extract token hash from the callback
          const hashIndex = url.indexOf('#');
          if (hashIndex > -1) {
            const hash = url.substring(hashIndex + 1);
            const params = new URLSearchParams(hash);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');

            if (access_token && refresh_token) {
              console.log('[Apple OAuth] Setting Supabase session from deep-link');
              const { error: setError } = await supabase.auth.setSession({
                access_token,
                refresh_token,
              } as any);

              if (setError) {
                console.error('[Apple OAuth] Session error:', setError);
                options.onError?.(setError);
              } else {
                console.log('[Apple OAuth] ✅ Session established successfully');
                options.onSuccess?.({ access_token, refresh_token });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Apple OAuth] Error handling callback:', err);
        options.onError?.(err);
      } finally {
        listener.remove();
        options.onComplete?.();
        try { await Browser.close(); } catch (e) { /* ignore */ }
      }
    });

    // Open the OAuth URL in Safari View Controller
    console.log('[Apple OAuth] Opening Safari View Controller (Browser):', data.url);
    await Browser.open({ url: data.url });

  } catch (err) {
    console.error('[Apple OAuth] Fatal error:', err);
    options.onError?.(err);
  }
};

/**
 * Cleanup Safari VC listeners (best-effort). AuthForm expects this export.
 */
export const cleanupSafariViewController = () => {
  try {
    // Remove any Browser listeners if available
    try { (Browser as any).removeAllListeners?.(); } catch (e) { /* ignore */ }
    // Remove any App listeners if available
    try { (App as any).removeAllListeners?.(); } catch (e) { /* ignore */ }
  } catch (err) {
    // ignore cleanup errors
    console.log('cleanupSafariViewController error:', err);
  }
};

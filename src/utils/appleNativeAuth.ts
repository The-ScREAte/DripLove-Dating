import { supabase } from '@/integrations/supabase/client';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

/**
 * Sign in with Apple using Safari View Controller (Capacitor Browser) and PKCE.
 * - Forces a web PKCE flow (prevents native ASAuthorization modal)
 * - Opens Apple login in-app (Safari VC)
 * - On deep link, closes the Browser and reads the session via supabase.auth.getSession()
 */
export async function signInWithAppleNative() {
  const { getRedirectUri, getAppleClientId } = await import('@/config/oauth');

  const redirectTo = getRedirectUri('apple'); // e.g. driplove://auth/callback
  const servicesId = getAppleClientId();

  // Debug info saved for runtime inspection
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('apple_client_id_in_use', String(servicesId));
      window.sessionStorage.setItem('apple_signin_method', 'safari_view_controller');
    }
  } catch (e) {
    // ignore
  }

  console.log('[Apple SVC] Starting apple OAuth with redirectTo:', redirectTo);

  // Add a deep-link listener to close the Browser and allow Supabase to finish
  // the PKCE exchange server-side. We will then read the session via getSession().
  const listener = await App.addListener('appUrlOpen', async (data: any) => {
    try {
      if (!data?.url || !data.url.startsWith(redirectTo)) return;
      console.log('[Apple SVC] Deep link received:', data.url);

      // Close the Safari VC if it's open
      try { await Browser.close(); } catch (e) { /* ignore */ }

  // Small delay to let Supabase finish its exchange, then delegate to the
  // shared OAuth redirect handler which mirrors the web Google flow. This
  // ensures both Google and Apple redirects use identical session hydration
  // logic (parse fragment, getSessionFromUrl, setSession, getSession).
      const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

      try {
        // Poll for an existing session (tight retries for up to ~1.5s)
        let sessionData: any = null;
        let sessionError: any = null;
        for (let i = 0; i < 6; i++) {
          const res = await supabase.auth.getSession();
          sessionData = res?.data ?? null;
          sessionError = res?.error ?? null;
          if (sessionError) {
            console.error('[Apple SVC] supabase.getSession error:', sessionError);
            break;
          }
          if (sessionData && sessionData.session) break;
          await wait(250);
        }

        if (sessionData && sessionData.session) {
          console.log('[Apple SVC] Session after redirect (fast path):', sessionData);
        } else {
          try {
            const { handleOAuthRedirect } = await import('@/utils/oauthCallbackHandler');
            const res = await handleOAuthRedirect(data.url);
            console.log('[Apple SVC] handleOAuthRedirect result:', res);
          } catch (e) {
            console.error('[Apple SVC] handleOAuthRedirect failed:', e);
          }
        }
      } catch (e) {
        console.error('[Apple SVC] Failed fetching session after redirect:', e);
      }
    } finally {
      try { listener.remove(); } catch (e) { /* ignore */ }
    }
  });

  try {
    // Request a PKCE-based OAuth URL from Supabase (forces web flow)
    const oauthOptions = { redirectTo, flowType: 'pkce' };
    console.log('[Apple SVC] Supabase OAuth options:', oauthOptions);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo,
        flowType: 'pkce'
      }
    } as any);

    if (error) {
      try { listener.remove(); } catch (e) { /* ignore */ }
      throw error;
    }

    const redirectUrl = (data && (data.url || (data as any).data?.url)) || null;
    if (!redirectUrl) {
      console.warn('[Apple SVC] No redirect URL returned from Supabase:', data);
      return { data, error };
    }

    // Open the Apple login page inside Safari VC
    try {
      await Browser.open({
        url: redirectUrl,
        presentationStyle: 'fullscreen',
        toolbarColor: '#000000'
      });
    } catch (openErr) {
      console.error('[Apple SVC] Failed to open Browser, falling back to navigation:', openErr);
      if (typeof window !== 'undefined') window.location.href = redirectUrl;
    }

    return { data, error };
  } catch (err) {
    try { listener.remove(); } catch (e) { /* ignore */ }
    console.error('[Apple SVC] Error starting Apple in-app OAuth flow:', err);
    throw err;
  }
}

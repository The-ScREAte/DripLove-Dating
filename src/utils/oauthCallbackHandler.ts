import { supabase } from '@/integrations/supabase/client';

/**
 * Shared OAuth callback handler used by the web /auth/callback page and
 * by the in-app Safari View Controller (Apple) deep-link. It attempts to:
 * 1. Parse access/refresh tokens from a URL fragment (if provided) and call setSession
 * 2. Let Supabase parse the URL via getSessionFromUrl (if available)
 * 3. Always call getSession() to obtain the hydrated session
 * 4. Query the profiles table and return profile/user/session info
 */
export async function handleOAuthRedirect(url?: string) {
  try {
    // Step A: If a URL with fragment was provided, try setting session from fragment
    if (url) {
      try {
        const fragment = url.split('#')[1] || '';
        const params = new URLSearchParams(fragment);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token) {
          console.log('[OAuthHandler] Found tokens in fragment; calling supabase.auth.setSession');
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token } as any);
          if (error) {
            console.warn('[OAuthHandler] setSession returned error:', error);
          } else {
            console.log('[OAuthHandler] setSession success:', data);
          }
        }
      } catch (e) {
        console.warn('[OAuthHandler] Failed to set session from fragment:', e);
      }

      // Step B: If getSessionFromUrl is provided by the client, try it as it can
      // parse provider callback fragments/queries that setSession may not handle.
      try {
        if ((supabase.auth as any).getSessionFromUrl) {
          const { data, error } = await (supabase.auth as any).getSessionFromUrl({ url });
          if (error) {
            console.warn('[OAuthHandler] getSessionFromUrl returned error:', error);
          } else {
            console.log('[OAuthHandler] getSessionFromUrl success:', data);
          }
        }
      } catch (e) {
        console.warn('[OAuthHandler] getSessionFromUrl failed:', e);
      }
    }

    // Step C: Always try to get session from client with optimized retry logic
    async function tryGetSession(retries = 3, delayMs = 150) {
      for (let i = 0; i < retries; i++) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn('[OAuthHandler] getSession returned error:', sessionError);
          throw sessionError;
        }
        if (sessionData?.session) {
          return sessionData;
        }

        // Only wait if we're going to retry
        if (i < retries - 1) {
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }

      // Final attempt with diagnostics
      const { data: finalData, error: finalError } = await supabase.auth.getSession();
      if (finalError) console.warn('[OAuthHandler] final getSession error:', finalError);
      if (!finalData?.session && typeof window !== 'undefined') {
        console.warn('[OAuthHandler] No session found. URL:', window.location.href);
      }
      return finalData;
    }

    const sessionData = await tryGetSession(3, 150);
    if (!sessionData?.session) {
      throw new Error('No session available after OAuth redirect');
    }

    const user = sessionData.session.user;

    // Step D: Ensure profile exists and return profile info (matching OAuthCallback)
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_admin, account_status, first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    // If no profile exists for an OAuth user, create a minimal profile record so
    // the rest of the app (profile completion flow) can operate normally.
    if (!profile) {
      try {
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
        const firstName = fullName.split(' ')[0] || '';
        const lastName = fullName.split(' ').slice(1).join(' ') || '';

        const { data: inserted, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            first_name: firstName || null,
            last_name: lastName || null,
            date_of_birth: '1990-01-01',
            country: null,
            city: null,
            gender: null,
            preference: 'both',
            relationship_intent: 'not-sure',
            occupation: null,
            industry: null,
            education_level: null,
            account_status: 'active',
            is_admin: false,
            terms_accepted: false
          })
          .select()
          .single();

        if (insertError) {
          console.error('[OAuthHandler] Failed creating profile for user:', user.id, insertError);
        } else {
          profile = inserted;
          console.log('[OAuthHandler] Created minimal profile for OAuth user:', user.id);
        }
      } catch (e) {
        console.error('[OAuthHandler] Exception creating profile for user:', user.id, e);
      }
    }

    // Persist the profile into sessionStorage so native redirects (Capacitor
    // deep links) and the initial app landing page can read it immediately
    // without waiting for a DB read. This avoids a race where the app queries
    // `profiles` before the newly inserted profile has fully propagated.
    try {
      if (typeof window !== 'undefined' && profile) {
        try {
          sessionStorage.setItem('oauth_profile', JSON.stringify(profile));
        } catch (e) {
          console.warn('[OAuthHandler] Could not write oauth_profile to sessionStorage:', e);
        }
      }
    } catch (e) {
      // Ignore storage errors on platforms without a window/sessionStorage
    }

    return {
      session: sessionData.session,
      user,
      profile: profile || null,
    };
  } catch (err) {
    console.error('[OAuthHandler] Error handling OAuth redirect:', err);
    throw err;
  }
}

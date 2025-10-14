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
  let sessionData: any = null;
  
  try {
    // Step A: Check for authorization code flow (Apple OAuth) first
    if (url) {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');
      
      if (error) {
        console.error('[OAuthHandler] OAuth provider returned error:', error);
        throw new Error(`OAuth error: ${error}`);
      }

      if (code) {
        console.log('[OAuthHandler] Found authorization code, letting Supabase exchange it');
        try {
          // Let Supabase handle the authorization code exchange
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.warn('[OAuthHandler] Code exchange error:', exchangeError);
            // Continue to other methods if this fails
          } else if (data?.session) {
            console.log('[OAuthHandler] Successfully exchanged code for session:', data.session.user.id);
            // Continue processing with the new session
            sessionData = { session: data.session };
          }
        } catch (e) {
          console.warn('[OAuthHandler] Code exchange failed:', e);
          // Continue to other methods
        }
      }

      // Step B: Try token-based flow (fragment)
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

      // Step C: If getSessionFromUrl is provided by the client, try it as it can
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

    // Step C: Always try to get session from client (covers cookie/session cases)
    // Some providers and environments (mobile webviews, cookie policies) can
    // cause a short delay before the session is available. Retry a few times
    // and log diagnostics if we still don't have a session.
    async function tryGetSession(retries = 3, delayMs = 500) {
      for (let i = 0; i < retries; i++) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn('[OAuthHandler] getSession returned error:', sessionError);
          // If there's an error, still break out to avoid masking it later
          throw sessionError;
        }
        if (sessionData?.session) {
          return sessionData;
        }

        // not available yet — wait and retry
        await new Promise((res) => setTimeout(res, delayMs));
      }

      // Final attempt to gather diagnostics before throwing
      try {
        const { data: finalData, error: finalError } = await supabase.auth.getSession();
        if (finalError) console.warn('[OAuthHandler] final getSession error:', finalError);
        console.warn('[OAuthHandler] No session after retries. Diagnostics:');
        try {
          if (typeof window !== 'undefined') {
            console.warn('[OAuthHandler] window.location.href =', window.location.href);
            console.warn('[OAuthHandler] window.location.search =', window.location.search);
            console.warn('[OAuthHandler] window.location.hash =', window.location.hash);
            try {
              console.warn('[OAuthHandler] document.cookie =', document.cookie);
            } catch (e) {
              console.warn('[OAuthHandler] document.cookie inaccessible:', e);
            }
          }
        } catch (e) {
          console.warn('[OAuthHandler] Diagnostics collection failed:', e);
        }

        return finalData;
      } catch (e) {
        console.warn('[OAuthHandler] final diagnostic getSession failed:', e);
        return null;
      }
    }

    // Try to get session if we don't already have it from code exchange
    if (!sessionData) {
      sessionData = await tryGetSession(4, 500);
    }
    
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

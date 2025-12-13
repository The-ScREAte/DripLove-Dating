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
    let sessionData: any = null;

    // Step 0: If URL has an auth code (?code=...), exchange it for a session (PKCE flow)
    // Supabase commonly uses the code flow on mobile/web now.
    if (url) {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        const errorParam = urlObj.searchParams.get('error') || urlObj.searchParams.get('error_description');

        if (errorParam) {
          throw new Error(errorParam);
        }

        if (code) {
          console.log('[OAuthHandler] Exchanging OAuth code for session');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn('[OAuthHandler] exchangeCodeForSession error:', error);
          } else if (data?.session) {
            sessionData = data;
            console.log('[OAuthHandler] Session established via code exchange');
          }
        }
      } catch (e) {
        // If URL parsing fails, fall back to token parsing + getSession.
      }
    }

    // Step A: If URL has tokens in fragment, set session immediately (fastest path)
    if (url) {
      const fragment = url.split('#')[1] || '';
      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token) {
        console.log('[OAuthHandler] Setting session from URL tokens');
        const { data, error } = await supabase.auth.setSession({ 
          access_token, 
          refresh_token: refresh_token || '' 
        });
        
        if (error) {
          console.warn('[OAuthHandler] setSession error:', error);
        } else if (data?.session) {
          sessionData = data;
          console.log('[OAuthHandler] Session set successfully');
        }
      }
    }

    // Step B: If we don't have session yet, try getSession (no retries needed if tokens were set)
    if (!sessionData?.session) {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[OAuthHandler] getSession error:', error);
        throw error;
      }
      sessionData = data;
    }
    if (!sessionData?.session) {
      throw new Error('No session available after OAuth redirect');
    }

    const user = sessionData.session.user;

    // Step C: Fetch or create profile asynchronously (don't block redirect)
    // We'll do a quick check and create if needed, but won't wait for all retries
    const profilePromise = (async () => {
      try {
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, is_admin, account_status, first_name, last_name, preferred_language')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.warn('[OAuthHandler] Profile fetch error:', profileError);
          return null;
        }

        // Create profile if it doesn't exist
        if (!profile) {
          const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
          const firstName = fullName.split(' ')[0] || '';
          const lastName = fullName.split(' ').slice(1).join(' ') || '';

          const { data: inserted } = await supabase
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
              account_status: 'active',
              is_admin: false,
              terms_accepted: false
            })
            .select()
            .maybeSingle();

          profile = inserted;
          console.log('[OAuthHandler] Created profile for OAuth user:', user.id);
        }

        // Cache profile in sessionStorage
        if (typeof window !== 'undefined' && profile) {
          sessionStorage.setItem('oauth_profile', JSON.stringify(profile));
        }

        return profile;
      } catch (e) {
        console.error('[OAuthHandler] Profile operation failed:', e);
        return null;
      }
    })();

    // Wait for profile but with a timeout to prevent blocking
    const profile = await Promise.race([
      profilePromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
    ]);

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

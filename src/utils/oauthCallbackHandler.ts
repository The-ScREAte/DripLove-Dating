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

    // Step A: If URL has tokens in fragment, set session immediately (fastest path)
    if (url) {
      const fragment = url.split('#')[1] || '';
      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token) {
        const { data, error } = await supabase.auth.setSession({ 
          access_token, 
          refresh_token: refresh_token || '' 
        });
        
        if (error) {
          console.warn('[OAuthHandler] setSession error:', error);
        } else if (data?.session) {
          sessionData = data;
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

    // Step C: Check if profile exists - same pattern as Apple/Android native
    let profile = null;
    let needsProfileCompletion = true;
    
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, is_admin, account_status, first_name, last_name, preferred_language')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.warn('[OAuthHandler] Profile fetch error:', profileError);
      } else if (data) {
        profile = data;
        
        // Cache profile in sessionStorage
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('oauth_profile', JSON.stringify(profile));
          sessionStorage.setItem('profile_id', profile.id);
        }
        
        // Check if profile needs completion (same logic as native flows)
        needsProfileCompletion = !profile.first_name || !profile.last_name;
      } else {
        needsProfileCompletion = true;
      }
    } catch (e) {
      console.error('[OAuthHandler] Profile fetch failed:', e);
      needsProfileCompletion = true;
    }

    return {
      session: sessionData.session,
      user,
      profile: profile || null,
      needsProfileCompletion
    };
  } catch (err) {
    console.error('[OAuthHandler] Error handling OAuth redirect:', err);
    throw err;
  }
}

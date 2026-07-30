import { supabase } from '@/integrations/supabase/client';

const PROFILE_COMPLETION_REQUIRED_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'country',
  'city',
  'gender',
  'preference',
  'relationship_intent',
  'occupation',
  'industry',
  'education_level',
] as const;

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
    let callbackCode: string | null = null;

    // Step A: If URL has tokens in fragment, set session immediately (fastest path)
    if (url) {
      const parsed = new URL(url);
      const fragment = parsed.hash?.replace(/^#/, '') || '';
      const params = new URLSearchParams(fragment);
      callbackCode = parsed.searchParams.get('code') || params.get('code');
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

    // Step B: For PKCE web callbacks, exchange auth code for a session.
    if (!sessionData?.session && callbackCode) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(callbackCode);
      if (error) {
        console.warn('[OAuthHandler] exchangeCodeForSession error:', error);
      } else if (data?.session) {
        sessionData = data;
      }
    }

    // Step C: If we don't have session yet, try getSession.
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

  // Step D: Check if profile exists - same pattern as Apple/Android native
    let profile = null;
    let needsProfileCompletion = true;
    
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, is_admin, account_status, preferred_language, first_name, last_name, date_of_birth, country, city, gender, preference, relationship_intent, occupation, industry, education_level')
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
        
        // Check if profile needs completion using the same required fields as Index routing.
        needsProfileCompletion = PROFILE_COMPLETION_REQUIRED_FIELDS.some((field) => !data[field]);
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

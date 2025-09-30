import { supabase } from '@/integrations/supabase/client';

export async function signInWithAppleNative() {
  try {
    // Dynamically import the Capacitor plugin so web builds don't fail when it's not installed
    const appleModule = await import('@capacitor-community/apple-sign-in').catch(() => null);

    if (!appleModule || !appleModule.SignInWithApple) {
      throw new Error('Native Apple Sign-In plugin is not available. Please install @capacitor-community/apple-sign-in and run npx cap sync ios, then test on a device.');
    }

    const { SignInWithApple } = appleModule as any;

    // Use Services ID (clientId) so Supabase accepts the id_token's audience (aud)
    // The Services ID must be configured in Apple Developer Console and use the Supabase callback
    // (see src/config/oauth.ts for required URLs).
    const [{ SUPABASE_URL }, { getAppleClientId }] = await Promise.all([
      import('@/integrations/supabase/client'),
      import('@/config/oauth')
    ]);

    const appleClientId = getAppleClientId();
    // Debug: log which Services ID/clientId we will pass to Apple and Supabase (dev only)
    try {
      console.log('[Apple Native] using clientId:', appleClientId);
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('apple_client_id_in_use', String(appleClientId));
      }
    } catch (e) {
      // ignore storage errors
    }

    const resp = await SignInWithApple.authorize({
      clientId: appleClientId,
      redirectURI: `${SUPABASE_URL}/auth/v1/callback`,
      scopes: ['email', 'name']
    });

    // The plugin's response shape can vary across versions / platforms.
    // Common shapes observed in logs:
    // - { identityToken: '...' }
    // - { response: { identityToken: '...' } }
    // - { response: { authorization: { identityToken: '...' } } }
    // - { id_token: '...' }
    // We try several fallbacks so native and simulator variants are handled.
    const anyResp: any = resp || {};
    const identityToken =
      anyResp.identityToken ||
      anyResp.identity_token ||
      anyResp.id_token ||
      anyResp.response?.identityToken ||
      anyResp.response?.identity_token ||
      anyResp.response?.id_token ||
      anyResp.response?.authorization?.identityToken ||
      anyResp.response?.authorization?.id_token ||
      null;

    // Helpful debug info (avoid printing full tokens in production)
    try {
      const safe = { hasIdentityToken: !!identityToken, respShape: Object.keys(anyResp).slice(0, 10) };
      console.log('[Apple Native] authorize response summary:', safe);
    } catch (e) {
      // ignore
    }

    if (!identityToken) {
      // Provide an actionable error message for common causes.
      throw new Error(
        'No identity token returned from Apple. Common causes: running on Simulator without an iCloud account, missing Sign in with Apple capability, or provisioning profile not updated. Test on a real device with an Apple ID signed in and ensure the App ID has Sign in with Apple enabled.'
      );
    }

    // Decode the id_token payload safely (no token printed) to inspect the `aud` claim.
    const decodeJwt = (jwt: string) => {
      try {
        const parts = jwt.split('.');
        if (parts.length < 2) return null;
        const payload = parts[1];
        let jsonStr = '';
        if (typeof atob === 'function') {
          // browser environment
          const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
          // Percent-decode to handle UTF-8
          jsonStr = decodeURIComponent(decoded.split('').map(c => '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        } else if (typeof Buffer !== 'undefined') {
          jsonStr = Buffer.from(payload, 'base64').toString('utf8');
        } else {
          return null;
        }
        return JSON.parse(jsonStr);
      } catch (e) {
        return null;
      }
    };

    try {
      const payload = decodeJwt(identityToken);
      if (payload) {
        const safeSummary = {
          aud: payload.aud,
          iss: payload.iss,
          sub: payload.sub,
          exp: payload.exp,
          iat: payload.iat,
        };
        console.log('[Apple Native] id_token payload summary:', safeSummary);
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem('apple_id_token_payload', JSON.stringify(safeSummary));
          }
        } catch (e) {
          // ignore storage errors
        }
      } else {
        console.log('[Apple Native] id_token payload could not be decoded');
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.removeItem('apple_id_token_payload');
          }
        } catch (e) { }
      }
    } catch (e) {
      console.log('[Apple Native] Error decoding id_token payload', e);
    }

    // Supabase JS client varies by version. Prefer signInWithIdToken if available.
    // Use a permissive any-cast to avoid type issues across versions.
    const authAny: any = supabase.auth as any;

    let result: any;

  const SERVICES_ID = getAppleClientId();

    if (typeof authAny.signInWithIdToken === 'function') {
      result = await authAny.signInWithIdToken({ provider: 'apple', token: identityToken, clientId: SERVICES_ID });
    } else if (typeof authAny.signInWithProvider === 'function') {
      // Some older client APIs accept id_token and clientId in the provider call
      result = await authAny.signInWithProvider('apple', { id_token: identityToken, clientId: SERVICES_ID });
    } else {
      throw new Error('Supabase client missing signInWithIdToken API. Update your Supabase client or adjust this helper.');
    }

    if (result?.error) {
      console.error('[Apple Native] Supabase error:', result.error);

      // Persist a safe summary of the Supabase error for debugging in dev builds.
      try {
        const safeErr = {
          status: result.error?.status ?? null,
          message: result.error?.message ?? result.error?.error_description ?? result.error?.description ?? JSON.stringify(result.error),
        };
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('apple_supabase_error', JSON.stringify(safeErr));
        }
      } catch (e) {
        // ignore
      }

      // Common cause: audience (aud) mismatch between id_token and Supabase Services ID
      if (result?.error?.status === 400) {
        throw new Error('Supabase rejected the Apple id_token (400). Likely cause: id_token audience does not match your Supabase Services ID. Ensure the clientId passed to SignInWithApple.authorize is your Services ID (com.driplove.dating.signin) and that the Services ID has the proper redirect URI configured in Apple Developer Console.');
      }

      throw result.error;
    }

    return result.data ?? result;
  } catch (err) {
    console.error('[Apple Native] Error:', err);
    throw err;
  }
}

import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logPlatformInfo } from '@/utils/platformUtils';

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const useMobileOAuth = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Early return if Capacitor is not available (web environment)
    if (!Capacitor.isNativePlatform()) {
      return; // Only run on mobile
    }

    logPlatformInfo();

    // iOS can deliver the same deep link multiple times (e.g., via getLaunchUrl() and appUrlOpen).
    // For PKCE, repeating the same callback will fail because Supabase removes the code_verifier
    // after the first successful exchange.
    const handledKeys = new Set<string>();

    const BROWSER_OPEN_FLAG_KEY = 'driplove:inapp_browser_open';
    const BROWSER_LAST_CLOSE_KEY = 'driplove:inapp_browser_last_close_key';

    const getStorage = () => {
      try {
        return localStorage;
      } catch {
        return null;
      }
    };

    const safeCloseBrowser = async (dedupeKey: string) => {
      // Capacitor iOS can deliver the same deep link multiple times.
      // Only attempt to close the in-app browser once per deep-link event.
      if (handledKeys.has(dedupeKey)) return;
      handledKeys.add(dedupeKey);

      const storage = getStorage();
      const lastCloseKey = storage?.getItem(BROWSER_LAST_CLOSE_KEY) || '';
      if (lastCloseKey === dedupeKey) return;

      // Only attempt Browser.close() if we previously opened it.
      // This prevents Capacitor from emitting noisy "No active window to close!" errors.
      const browserWasOpened = (storage?.getItem(BROWSER_OPEN_FLAG_KEY) || '') === '1';
      if (!browserWasOpened) {
        storage?.setItem(BROWSER_LAST_CLOSE_KEY, dedupeKey);
        return;
      }

      try {
        await Browser.close();

        storage?.setItem(BROWSER_OPEN_FLAG_KEY, '0');
        storage?.setItem(BROWSER_LAST_CLOSE_KEY, dedupeKey);
      } catch (e: any) {
        const message =
          (typeof e === 'string' ? e : e?.message || e?.errorMessage || '')?.toString?.() || '';
        // Capacitor Browser can throw this when there is nothing to close; treat as a no-op.
        if (message.toLowerCase().includes('no active window to close')) {
          storage?.setItem(BROWSER_OPEN_FLAG_KEY, '0');
          storage?.setItem(BROWSER_LAST_CLOSE_KEY, dedupeKey);
          return;
        }
        // Swallow any other close errors as well; closing the browser is a best-effort cleanup.
        storage?.setItem(BROWSER_OPEN_FLAG_KEY, '0');
        storage?.setItem(BROWSER_LAST_CLOSE_KEY, dedupeKey);
      }
    };

    const handleAppUrlOpen = async (event: { url: string }) => {
      try {
        // Persist for post-mortem debugging (iOS external Safari handoff can be flaky)
        localStorage.setItem('debug:last_deeplink_url', event.url);
        localStorage.setItem('debug:last_deeplink_at', new Date().toISOString());
      } catch {
        // ignore storage failures
      }
      
      // ✅ Ignore non-app URLs
      if (!event.url.startsWith('driplove://')) return;

      // Normalize to make URL parsing more reliable (some iOS flows can return `driplove://#...`)
      let normalizedUrl = event.url;
      if (normalizedUrl.startsWith('driplove://#') || normalizedUrl.startsWith('driplove://?')) {
        normalizedUrl = normalizedUrl.replace('driplove://', 'driplove:///');
      }
      
      // ✅ Handle password reset deep link first (specific path)
      if (event.url.startsWith('driplove://reset-password')) {
        try {
          // Extract the URL parameters for password reset
          const url = new URL(normalizedUrl);
          const fragment = url.hash || url.search;
          
          
          if (fragment.includes('access_token=') && fragment.includes('type=recovery')) {
            // Parse the recovery tokens from the fragment
            const params = new URLSearchParams(fragment.replace('#', '').replace('?', ''));
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            const type = params.get('type');
            
            if (type === 'recovery' && access_token && refresh_token) {
              // Set the session for password recovery
              const { data, error } = await supabase.auth.setSession({
                access_token,
                refresh_token
              });
              
              if (error) {
                console.error('[Mobile OAuth] Recovery session error:', error);
                toast({
                  title: "Password Reset Error",
                  description: "Invalid or expired reset link. Please request a new one.",
                  variant: "destructive",
                });
                navigate('/');
                return;
              }
              
              
              // Navigate to reset password page
              navigate('/reset-password');
              
              toast({
                title: "Reset Link Verified",
                description: "You can now set your new password.",
              });
            } else {
              console.error('[Mobile OAuth] Missing recovery tokens in reset link');
              toast({
                title: "Password Reset Error",
                description: "Invalid reset link format. Please request a new one.",
                variant: "destructive",
              });
              navigate('/');
            }
          } else if (fragment.includes('error=')) {
            // Handle password reset error
            const params = new URLSearchParams(fragment.replace('#', '').replace('?', ''));
            const error = params.get('error');
            const error_description = params.get('error_description');
            
            console.error('[Mobile OAuth] Password reset error:', error, error_description);
            toast({
              title: "Password Reset Error",
              description: error_description || error || "Password reset failed",
              variant: "destructive",
            });
            navigate('/');
          } else {
            // Handle simple reset password deep link without tokens (shouldn't happen with Supabase)
            navigate('/reset-password');
          }
        } catch (error) {
          console.error('[Mobile OAuth] Error processing password reset deep link:', error);
          toast({
            title: "Password Reset Error",
            description: "Failed to process password reset link.",
            variant: "destructive",
          });
          navigate('/');
        }
        return; // Exit after handling reset
      }

      // ✅ Handle Paystack deep link callback
      // Supabase Edge Function paystack-redirect uses: driplove://payment/callback?status=...&reference=...&payment_type=...
      try {
        const url = new URL(normalizedUrl);
        const route = url.host
          ? `/${url.host}${url.pathname || ''}`
          : url.pathname;

        if (route === '/payment/callback') {
          const params = new URLSearchParams(url.search);
          const status = params.get('status') || 'unknown';
          const reference = params.get('reference') || params.get('trxref') || params.get('tx_ref') || '';
          const payment_type = params.get('payment_type') || 'subscription';

          // Route into the existing payment success page; it handles successful/failed/cancelled.
          navigate(
            `/payment-success?status=${encodeURIComponent(status)}` +
              `&reference=${encodeURIComponent(reference)}` +
              `&payment_type=${encodeURIComponent(payment_type)}`
          );
          return;
        }
      } catch {
        // ignore parse errors and continue
      }
      
      // ✅ Handle OAuth callback (Accept BOTH patterns)
      //    driplove://auth/callback (preferred/explicit)
      //    driplove:// (fallback - iOS strips path sometimes)

        try {
          // Extract params from the callback URL.
          // Some iOS flows can return `driplove://#...` (no host/path) which may not parse.
          // Normalize to `driplove:///#...` when needed.
          const url = new URL(normalizedUrl);
          const raw = url.hash || url.search || '';

          const params = new URLSearchParams(raw.replace(/^#|\?/, ''));

          // ✅ PKCE/code flow callback
          const code = params.get('code');
          const state = params.get('state');

          // Determine which deep link route we are on.
          // Note: custom scheme uses host as the first path segment (e.g. driplove://auth/callback => host=auth, pathname=/callback)
          const route = url.host
            ? `/${url.host}${url.pathname || ''}`
            : url.pathname;

          const isAuthCallbackRoute = route === '/auth/callback' || event.url.startsWith('driplove://auth/callback');

          // Close Safari View Controller if it's open (best-effort).
          // Dedupe is important because iOS can deliver the same callback twice.
          if (isAuthCallbackRoute) {
            await safeCloseBrowser(`browser:close:${event.url}`);
          }

          // ✅ Implicit token flow callback
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          const expires_in = params.get('expires_in');
          const token_type = params.get('token_type');

          if (access_token) {
            // Set the session manually (refresh_token may be null depending on provider)
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || undefined,
            });
              
              if (error) {
                console.error('[useMobileOAuth] ❌ Session error:', error);
                // Silent error handling
                toast({
                  title: "Authentication Error",
                  description: error.message,
                  variant: "destructive",
                });
                navigate('/');
                return;
              }
              
              if (data.session?.user) {
                // Check if user profile exists
                const { data: profile, error: profileError } = await supabase
                  .from('profiles')
                  .select('id, is_admin, account_status, first_name, last_name')
                  .eq('id', data.session.user.id)
                  .single();

                if (profileError || !profile) {
                  // User doesn't have a profile - redirect to profile completion
                  navigate('/complete-profile');
                  return;
                }

                // Check account status
                if (profile.account_status === 'blocked') {
                  await supabase.auth.signOut();
                  toast({
                    title: "Account Blocked",
                    description: "Your account has been blocked.",
                    variant: "destructive",
                  });
                  navigate('/');
                  return;
                }

                if (profile.account_status === 'on_hold') {
                  await supabase.auth.signOut();
                  toast({
                    title: "Account On Hold",
                    description: "Your account is on hold. Please contact support.",
                    variant: "destructive",
                  });
                  navigate('/');
                  return;
                }

                // Save profile ID to session
                sessionStorage.setItem('profile_id', profile.id);

                // Check if profile is complete
                const isProfileComplete = profile.first_name && profile.last_name;

                if (!isProfileComplete) {
                  navigate('/complete-profile');
                  return;
                }

                // Successful login
                toast({
                  title: "Welcome back!",
                  description: "You've been successfully logged in.",
                });

                navigate('/');
            } else {
              console.error('[useMobileOAuth] ❌ No user in session data');
            }
            return;
          }

          // Only attempt PKCE code exchange if this looks like a real OAuth callback.
          // This prevents false positives from other deep links (e.g. payment providers using a `code` query param).
          if (code && (state || isAuthCallbackRoute)) {
            const oauthKey = `oauth:pkce:${code}`;

            // Dedupe: iOS can trigger the same callback multiple times.
            if (handledKeys.has(oauthKey)) {
              return;
            }
            handledKeys.add(oauthKey);

            // If we already have a session, don't try to exchange again.
            // (This also covers the case where the first handler already completed the exchange.)
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session?.user) {
                navigate('/');
                return;
              }
            } catch {
              // ignore; proceed with exchange
            }

            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              console.error('[useMobileOAuth] ❌ Code exchange error:', error);

              const message = (error as any)?.message?.toString?.() || '';
              const lower = message.toLowerCase();
              const isCodeVerifierError =
                (lower.includes('code') && lower.includes('verifier')) ||
                lower.includes('both auth code and code verifier');

              // If the exchange fails due to a missing verifier but a session exists anyway,
              // treat it as a duplicate callback and continue silently.
              if (isCodeVerifierError) {
                try {
                  const { data: sessionData } = await supabase.auth.getSession();
                  if (sessionData.session?.user) {
                    navigate('/');
                    return;
                  }
                } catch {
                  // ignore
                }
              }

              toast({
                title: isCodeVerifierError ? 'Session Expired' : 'Authentication Error',
                description: isCodeVerifierError ? 'Please try signing in again.' : message,
                variant: 'destructive',
              });
              navigate('/');
              return;
            }

            if (!data.session?.user) {
              console.error('[useMobileOAuth] ❌ No user after code exchange');
              toast({
                title: "Authentication Error",
                description: "Session creation failed. Please try again.",
                variant: "destructive",
              });
              navigate('/');
              return;
            }


            // Continue with existing profile logic
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id, is_admin, account_status, first_name, last_name')
              .eq('id', data.session.user.id)
              .single();


            if (profileError || !profile) {
              navigate('/complete-profile');
              return;
            }

            if (profile.account_status === 'blocked') {
              await supabase.auth.signOut();
              toast({
                title: "Account Blocked",
                description: "Your account has been blocked.",
                variant: "destructive",
              });
              navigate('/');
              return;
            }

            if (profile.account_status === 'on_hold') {
              await supabase.auth.signOut();
              toast({
                title: "Account On Hold",
                description: "Your account is on hold. Please contact support.",
                variant: "destructive",
              });
              navigate('/');
              return;
            }

            sessionStorage.setItem('profile_id', profile.id);
            const isProfileComplete = profile.first_name && profile.last_name;
            if (!isProfileComplete) {
              navigate('/complete-profile');
              return;
            }

            toast({
              title: "Welcome back!",
              description: "You've been successfully logged in.",
            });
            navigate('/');
            return;
          }

          // If we have a `code` parameter but it does NOT look like an OAuth callback, ignore it.
          // This avoids showing OAuth errors during payment/cancel flows.
          if (code && !(state || isAuthCallbackRoute)) {
            // Try to route the deep link into the SPA if it points to a known page.
            // Example: driplove://payment-success?... or other app routes.
            if (route && route !== '/') {
              const target = `${route}${url.search || ''}${url.hash || ''}`;
              navigate(target);
            }
            return;
          }

          const oauthError = params.get('error');
          const oauthErrorDescription = params.get('error_description');

          if (oauthError || oauthErrorDescription) {
            console.error('[useMobileOAuth] OAuth error:', oauthError, oauthErrorDescription);
            toast({
              title: "Authentication Error",
              description: oauthErrorDescription || oauthError || "OAuth failed",
              variant: "destructive",
            });
            navigate('/');
          } else {
          }
        } catch (error) {
          console.error('[useMobileOAuth] ❌ Exception processing callback:', error);
          // Silent error handling
          toast({
            title: "Authentication Error",
            description: "Failed to process authentication callback.",
            variant: "destructive",
          });
          navigate('/');
        }
    };

    // On iOS (and sometimes Android), the app can be cold-started via a deep link.
    // In that case the URL may be available via getLaunchUrl() before any listeners fire.
    // We must process it so OAuth completion doesn't get missed.
    (async () => {
      try {
        if (typeof App.getLaunchUrl === 'function') {
          const launch = await App.getLaunchUrl();
          if (launch?.url) {
            await handleAppUrlOpen({ url: launch.url });
          }
        }
      } catch (e) {
      }
    })();

    // Add the app URL listener and store it for cleanup.
    // Depending on Capacitor version/platform, addListener may return either
    // a handle directly or a Promise that resolves to a handle.
    let appUrlListener: { remove: () => void | Promise<void> } | null = null;
    try {
      const maybe = App.addListener('appUrlOpen', handleAppUrlOpen) as any;
      if (maybe && typeof maybe.then === 'function') {
        maybe
          .then((handle: any) => {
            appUrlListener = handle;
          })
          .catch((e: any) => {
            console.error('[useMobileOAuth] Failed to add appUrlOpen listener:', e);
          });
      } else {
        appUrlListener = maybe;
      }
    } catch (e) {
      console.error('[useMobileOAuth] Failed to add appUrlOpen listener:', e);
    }

    // ✅ Cleanup: Remove ONLY our listener, not all app listeners
    return () => {
      try {
        void appUrlListener?.remove?.();
      } catch {
        // ignore
      }
    };
  }, [toast, navigate]);
};
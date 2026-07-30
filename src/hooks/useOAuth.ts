import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getRedirectUri } from '@/config/oauth';
import { Capacitor } from '@capacitor/core';

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
 * Centralized OAuth hook - THE SINGLE SOURCE OF TRUTH for OAuth initiation
 * Used by both AuthForm and WelcomeScreen to avoid duplication
 * 
 * ✅ Handles ALL OAuth providers (Google, Apple)
 * ✅ Handles ALL platforms (iOS, Android, Web)
 * ✅ Delegates mobile completion to useMobileOAuth
 */
export const useOAuth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  /**
   * Start OAuth flow for any provider
   * This is the ONLY function that should initiate OAuth in the entire app
   */
  const startOAuth = async (provider: 'google' | 'apple') => {
    try {
      setOauthLoading(provider);
      const redirectTo = getRedirectUri();

      // ═══════════════════════════════════════════════════════════
      // iOS GOOGLE OAUTH - Safari View Controller + Deep Link
      // ═══════════════════════════════════════════════════════════
      if (provider === 'google' && isNative && platform === 'ios') {
        try {
          
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
            console.error('[useOAuth iOS Google] Failed to generate OAuth URL:', oauthError);
            throw new Error(oauthError?.message || 'Failed to generate OAuth URL');
          }

          const { Browser } = await import('@capacitor/browser');
          try {
            localStorage.setItem('driplove:inapp_browser_open', '1');
          } catch {
            // ignore storage failures
          }
          await Browser.open({ 
            url: oauthData.url,
            presentationStyle: 'popover',
            toolbarColor: '#000000',
          });

          // We clear the local loading state here – the rest of the flow
          // (deep link callback, session creation, navigation) is handled
          // entirely inside useMobileOAuth.
          setOauthLoading(null);
          return;

        } catch (err: any) {
          console.error('[useOAuth iOS Google] ❌ Error:', err);
          toast({
            title: 'Authentication Error',
            description: err?.message || 'Failed to open Google Sign-In',
            variant: 'destructive',
          });
          setOauthLoading(null);
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // ANDROID GOOGLE OAUTH - Native Google Sign-In
      // ═══════════════════════════════════════════════════════════
      if (provider === 'google' && isNative && platform === 'android') {
        try {
          const { signInWithGoogleNative, isNativeGoogleAuthAvailable } = await import('@/utils/googleNativeAuth');
          const canUseNative = isNativeGoogleAuthAvailable();
          
          if (!canUseNative) {
            throw new Error('Native Google Sign-In is not available on this device');
          }

          // signInWithGoogleNative throws on error and returns user/profile data on success
          const result = await signInWithGoogleNative();
          setOauthLoading(null);
          
          // Check profile completeness using helper result
          const needsProfileCompletion = result.needsProfileCompletion;

          if (needsProfileCompletion) {
            navigate('/complete-profile');
          } else {
            navigate('/');
          }
        } catch (err: any) {
          console.error('[useOAuth Android Google] ❌ Error:', err);
          toast({
            title: 'Authentication Error',
            description: err?.message || 'Failed to sign in with Google',
            variant: 'destructive',
          });
          setOauthLoading(null);
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // WEB GOOGLE OAUTH - Popup Window
      // ═══════════════════════════════════════════════════════════
      if (provider === 'google' && !isNative) {
        try {
          
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
            throw new Error(oauthError?.message || 'Failed to generate OAuth URL');
          }

          // Open popup and handle via postMessage
          const popup = window.open(oauthData.url, 'oauth', 'width=500,height=600');
          
          if (!popup) {
            throw new Error('Popup blocked. Please allow popups for this site.');
          }

          let isHandled = false;
          let timeoutId: number | null = null;
          let pollIntervalId: number | null = null;

          const cleanup = () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('focus', handleWindowFocus);
            if (timeoutId) {
              window.clearTimeout(timeoutId);
              timeoutId = null;
            }
            if (pollIntervalId) {
              window.clearInterval(pollIntervalId);
              pollIntervalId = null;
            }
          };

          const waitForSession = async (maxWaitMs = 8000, intervalMs = 200) => {
            const startedAt = Date.now();
            while (Date.now() - startedAt < maxWaitMs) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) return session;
              await new Promise((resolve) => setTimeout(resolve, intervalMs));
            }
            return null;
          };

          const routeAfterAuth = async (preferredNeedsCompletion?: boolean): Promise<boolean> => {
            try {
              const session = await waitForSession();
              if (!session?.user) return false;

              let needsProfileCompletion = preferredNeedsCompletion;

              // Always verify against profile when not explicitly known to be incomplete.
              if (needsProfileCompletion !== true) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('first_name, last_name, date_of_birth, country, city, gender, preference, relationship_intent, occupation, industry, education_level')
                  .eq('id', session.user.id)
                  .maybeSingle();

                needsProfileCompletion = PROFILE_COMPLETION_REQUIRED_FIELDS.some((field) => !profile?.[field]);
              }

              isHandled = true;
              cleanup();
              setOauthLoading(null);
              navigate(needsProfileCompletion ? '/complete-profile' : '/');
              return true;
            } catch {
              return false;
            }
          };

          const recoverAndRouteFromSession = async (): Promise<boolean> => {
            return routeAfterAuth();
          };

          // Set up message listener to complete routing when OAuth callback finishes.
          timeoutId = window.setTimeout(() => {
            if (!isHandled) {
              void recoverAndRouteFromSession();
            }
            if (!isHandled) {
              cleanup();
              setOauthLoading(null);
            }
          }, 5 * 60 * 1000);

          // Aggressive fallback for browsers/incognito where popup postMessage/focus events are inconsistent.
          // Poll session state briefly and route as soon as auth lands.
          pollIntervalId = window.setInterval(() => {
            if (isHandled) return;
            void recoverAndRouteFromSession();

            // If popup is closed and we're still not authenticated, stop polling but keep timeout fallback.
            try {
              if (popup.closed && !isHandled && pollIntervalId) {
                window.clearInterval(pollIntervalId);
                pollIntervalId = null;
              }
            } catch {
              // Ignore cross-window access issues.
            }
          }, 500);

          const handleMessage = (event: MessageEvent) => {
            if (isHandled) return;
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === 'oauth_complete') {
              if (event.data?.success === false) {
                isHandled = true;
                cleanup();
                setOauthLoading(null);
                toast({
                  title: 'Authentication Error',
                  description: event.data?.error || 'Failed to complete sign in. Please try again.',
                  variant: 'destructive',
                });
                return;
              }

              void routeAfterAuth(event.data?.needsProfileCompletion === true ? true : undefined);
            }
          };

          const handleWindowFocus = () => {
            if (isHandled) return;
            void recoverAndRouteFromSession();
          };

          window.addEventListener('message', handleMessage);
          window.addEventListener('focus', handleWindowFocus);
          
        } catch (err: any) {
          console.error('[useOAuth Web Google] ❌ Error:', err);
          toast({
            title: 'Authentication Error',
            description: err?.message || 'Failed to open Google Sign-In',
            variant: 'destructive',
          });
          setOauthLoading(null);
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // APPLE OAUTH - All Platforms
      // ═══════════════════════════════════════════════════════════
      if (provider === 'apple') {
        try {
          // iOS native Apple Sign-In
          if (isNative && platform === 'ios') {
            const { signInWithAppleNativeModal, isAppleSignInAvailable } = await import('@/utils/appleNativeModal');
            
            if (!isAppleSignInAvailable()) {
              throw new Error('Apple Sign-In is not available on this device');
            }

            // signInWithAppleNativeModal throws on error and returns user/profile data on success
            const result = await signInWithAppleNativeModal();
            setOauthLoading(null);

            const needsProfileCompletion = result.needsProfileCompletion;

            if (needsProfileCompletion) {
              navigate('/complete-profile');
            } else {
              navigate('/');
            }
          } 
          // Web Apple Sign-In
          else {
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'apple',
              options: {
                redirectTo,
                skipBrowserRedirect: !isNative,
              }
            });

            if (error) throw error;

            if (!isNative && data?.url) {
              window.location.href = data.url;
            }
          }
        } catch (err: any) {
          console.error('[useOAuth Apple] ❌ Error:', err);
          toast({
            title: 'Authentication Error',
            description: err?.message || 'Failed to sign in with Apple',
            variant: 'destructive',
          });
          setOauthLoading(null);
        }
        return;
      }

    } catch (error: any) {
      console.error(`[useOAuth] Unexpected error for ${provider}:`, error);
      toast({
        title: 'Authentication Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
      setOauthLoading(null);
    }
  };

  return {
    startOAuth,
    oauthLoading,
    setOauthLoading,
  };
};

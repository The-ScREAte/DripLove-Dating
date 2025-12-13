import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getRedirectUri } from '@/config/oauth';
import { Capacitor } from '@capacitor/core';

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

      console.log(`[useOAuth] Starting ${provider} OAuth for platform: ${platform}`);
      console.log(`[useOAuth] Redirect URI: ${redirectTo}`);

      // ═══════════════════════════════════════════════════════════
      // iOS GOOGLE OAUTH - Safari View Controller + Deep Link
      // ═══════════════════════════════════════════════════════════
      if (provider === 'google' && isNative && platform === 'ios') {
        try {
          console.log('[useOAuth iOS Google] Generating OAuth URL...');
          
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

          console.log('[useOAuth iOS Google] ✅ OAuth URL generated');
          console.log('[useOAuth iOS Google] 📱 Opening Safari View Controller...');

          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ 
            url: oauthData.url,
            presentationStyle: 'popover',
            toolbarColor: '#000000',
          });

          console.log('[useOAuth iOS Google] ✅ Safari View Controller opened');
          console.log('[useOAuth iOS Google] 🔄 Delegating to useMobileOAuth');

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

          console.log('[useOAuth Android Google] ✅ Success');
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
          console.log('[useOAuth Web Google] Opening popup...');
          
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

          // Popup flow is handled by OAuthCallback component via postMessage
          // No further action needed here - loading state will be cleared by callback
          
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
            console.log('[useOAuth Apple iOS] ✅ Success');
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

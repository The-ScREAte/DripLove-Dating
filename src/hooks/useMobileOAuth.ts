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
      
      // ✅ Handle password reset deep link first (specific path)
      if (event.url.startsWith('driplove://reset-password')) {
        try {
          // Extract the URL parameters for password reset
          const url = new URL(event.url);
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
      
      // ✅ Handle OAuth callback (Accept BOTH patterns)
      //    driplove://auth/callback (preferred/explicit)
      //    driplove:// (fallback - iOS strips path sometimes)
      
      // Close Safari View Controller if it's open
        try {
          if (Browser) {
            await Browser.close();
          }
        } catch (e) {
          // ignore
        }
        
        try {
          // Extract params from the callback URL.
          // Some iOS flows can return `driplove://#...` (no host/path) which may not parse.
          // Normalize to `driplove:///#...` when needed.
          let callbackUrl = event.url;
          if (callbackUrl.startsWith('driplove://#') || callbackUrl.startsWith('driplove://?')) {
            callbackUrl = callbackUrl.replace('driplove://', 'driplove:///');
          }

          const url = new URL(callbackUrl);
          const raw = url.hash || url.search || '';

          const params = new URLSearchParams(raw.replace(/^#|\?/, ''));

          // ✅ PKCE/code flow callback
          const code = params.get('code');

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

          if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              console.error('[useMobileOAuth] ❌ Code exchange error:', error);
              
              // Handle PKCE code_verifier lost error gracefully
              // This happens when the app is killed during OAuth flow or Safari session expires
              const isCodeVerifierError = error.message?.toLowerCase().includes('code') && 
                                          error.message?.toLowerCase().includes('verifier');
              
              toast({
                title: isCodeVerifierError ? "Session Expired" : "Authentication Error",
                description: isCodeVerifierError 
                  ? "Please try signing in again." 
                  : error.message,
                variant: "destructive",
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
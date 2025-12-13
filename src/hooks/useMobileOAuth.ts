import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logPlatformInfo } from '@/utils/platformUtils';

// Conditionally import Capacitor modules for mobile
let App: any = null;
let Capacitor: any = null;
let Browser: any = null;

try {
  // Try to import Capacitor modules - they will only be available on mobile
  const capacitorApp = require('@capacitor/app');
  const capacitorCore = require('@capacitor/core');
  const capacitorBrowser = require('@capacitor/browser');
  App = capacitorApp.App;
  Capacitor = capacitorCore.Capacitor;
  Browser = capacitorBrowser.Browser;
} catch (error) {
  // Capacitor modules not available (running on web)
}

export const useMobileOAuth = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Early return if Capacitor is not available (web environment)
    if (!Capacitor || !App || !Capacitor.isNativePlatform()) {
      return; // Only run on mobile
    }

    logPlatformInfo();

    const handleAppUrlOpen = async (event: { url: string }) => {
      console.log('[useMobileOAuth] 🔗 Deep link received:', event.url);
      
      // Handle OAuth callback from Supabase (Google / Apple)
      // Supabase may redirect to either driplove://auth/callback or just driplove://
      // We must also avoid hijacking password reset links (driplove://reset-password)
      const isOAuthCallback = (
        (event.url.startsWith('driplove://auth/callback') || event.url === 'driplove://') &&
        !event.url.startsWith('driplove://reset-password')
      );

      if (isOAuthCallback) {
        console.log('[useMobileOAuth] ✅ OAuth callback detected!');
        
        // Close Safari View Controller if it's open
        try {
          if (Browser) {
            console.log('[useMobileOAuth] Closing Safari View Controller...');
            await Browser.close();
            console.log('[useMobileOAuth] Safari View Controller closed');
          }
        } catch (e) {
          console.log('[useMobileOAuth] Browser may already be closed:', e);
        }
        
        try {
          // Extract the fragment from the URL
          const url = new URL(event.url);
          const fragment = url.hash || url.search;
          console.log('[useMobileOAuth] Fragment:', fragment);
          
          if (fragment.includes('access_token=')) {
            console.log('[useMobileOAuth] Found access_token in fragment');
            // Parse the OAuth tokens from the fragment
            const params = new URLSearchParams(fragment.replace('#', '').replace('?', ''));
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            const expires_in = params.get('expires_in');
            const token_type = params.get('token_type');
            
            console.log('[useMobileOAuth] Parsed tokens:', {
              has_access_token: !!access_token,
              has_refresh_token: !!refresh_token,
              expires_in,
              token_type
            });
            
            if (access_token && refresh_token) {
              console.log('[useMobileOAuth] Setting session with tokens...');
              // Set the session manually
              const { data, error } = await supabase.auth.setSession({
                access_token,
                refresh_token
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
              
              console.log('[useMobileOAuth] ✅ Session set successfully');
              
              if (data.session?.user) {
                console.log('[useMobileOAuth] User session created:', data.session.user.id);
                // Check if user profile exists
                const { data: profile, error: profileError } = await supabase
                  .from('profiles')
                  .select('id, is_admin, account_status, first_name, last_name')
                  .eq('id', data.session.user.id)
                  .single();

                console.log('[useMobileOAuth] Profile lookup result:', { profile, profileError });

                if (profileError || !profile) {
                  console.log('[useMobileOAuth] No profile found, redirecting to profile completion');
                  // User doesn't have a profile - redirect to profile completion
                  navigate('/complete-profile');
                  return;
                }

                // Check account status
                if (profile.account_status === 'blocked') {
                  console.log('[useMobileOAuth] Account blocked, signing out');
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
                  console.log('[useMobileOAuth] Account on hold, signing out');
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
                console.log('[useMobileOAuth] Profile ID saved to session');

                // Check if profile is complete
                const isProfileComplete = profile.first_name && profile.last_name;

                if (!isProfileComplete) {
                  console.log('[useMobileOAuth] Profile incomplete, redirecting to completion');
                  navigate('/complete-profile');
                  return;
                }

                // Successful login
                console.log('[useMobileOAuth] ✅ Login successful, redirecting to home');
                toast({
                  title: "Welcome back!",
                  description: "You've been successfully logged in.",
                });

                navigate('/');
              } else {
                console.error('[useMobileOAuth] ❌ No user in session data');
              }
            } else {
              console.error('[useMobileOAuth] ❌ Missing access_token or refresh_token');
              // Silent error handling
              toast({
                title: "Authentication Error",
                description: "Failed to get authentication tokens.",
                variant: "destructive",
              });
              navigate('/');
            }
          } else if (fragment.includes('error=')) {
            console.log('[useMobileOAuth] Error in fragment');
            // Handle OAuth error
            const params = new URLSearchParams(fragment.replace('#', '').replace('?', ''));
            const error = params.get('error');
            const error_description = params.get('error_description');
            
            console.error('[useMobileOAuth] OAuth error:', error, error_description);
            // Silent error handling
            toast({
              title: "Authentication Error",
              description: error_description || error || "OAuth failed",
              variant: "destructive",
            });
            navigate('/');
          } else {
            console.log('[useMobileOAuth] ⚠️ No access_token or error in fragment');
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
      }
      
      // Handle password reset deep link
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
      }
    };

    // Add the app URL listener and store it for cleanup
    const appUrlListener = App.addListener('appUrlOpen', handleAppUrlOpen);

    // ✅ Cleanup: Remove ONLY our listener, not all app listeners
    return () => {
      appUrlListener.remove(); // Scoped removal - safe
    };
  }, [toast, navigate]);
};
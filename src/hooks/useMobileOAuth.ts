import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logPlatformInfo } from '@/utils/platformUtils';

// Conditionally import Capacitor modules for mobile
let App: any = null;
let Capacitor: any = null;

try {
  // Try to import Capacitor modules - they will only be available on mobile
  const capacitorApp = require('@capacitor/app');
  const capacitorCore = require('@capacitor/core');
  App = capacitorApp.App;
  Capacitor = capacitorCore.Capacitor;
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
      // Handle OAuth callback
      if (event.url.startsWith('driplove://auth/callback')) {
        
        try {
          // Extract the fragment from the URL
          const url = new URL(event.url);
          const fragment = url.hash || url.search;
          
          if (fragment.includes('access_token=')) {
            // Parse the OAuth tokens from the fragment
            const params = new URLSearchParams(fragment.replace('#', '').replace('?', ''));
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            const expires_in = params.get('expires_in');
            const token_type = params.get('token_type');
            
            if (access_token && refresh_token) {
              // Set the session manually
              const { data, error } = await supabase.auth.setSession({
                access_token,
                refresh_token
              });
              
              if (error) {
                console.error('[Mobile OAuth] Session error:', error);
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
              }
            } else {
              console.error('[Mobile OAuth] Missing tokens in callback');
              toast({
                title: "Authentication Error",
                description: "Failed to get authentication tokens.",
                variant: "destructive",
              });
              navigate('/');
            }
          } else if (fragment.includes('error=')) {
            // Handle OAuth error
            const params = new URLSearchParams(fragment.replace('#', '').replace('?', ''));
            const error = params.get('error');
            const error_description = params.get('error_description');
            
            console.error('[Mobile OAuth] OAuth error:', error, error_description);
            toast({
              title: "Authentication Error",
              description: error_description || error || "OAuth failed",
              variant: "destructive",
            });
            navigate('/');
          }
        } catch (error) {
          console.error('[Mobile OAuth] Error processing callback:', error);
          toast({
            title: "Authentication Error",
            description: "Failed to process authentication callback.",
            variant: "destructive",
          });
          navigate('/');
        }
      }
      
      // Handle password reset deep link
      else if (event.url.startsWith('driplove://reset-password')) {
        
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

    // Add the listener
    App.addListener('appUrlOpen', handleAppUrlOpen);

    // Cleanup
    return () => {
      App.removeAllListeners();
    };
  }, [toast, navigate]);
};
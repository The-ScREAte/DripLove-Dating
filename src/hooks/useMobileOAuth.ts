import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export const useMobileOAuth = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return; // Only run on mobile
    }

    const handleAppUrlOpen = async (event: { url: string }) => {
      console.log('[Mobile OAuth] App opened with URL:', event.url);
      
      if (event.url.startsWith('driplove://auth/callback')) {
        console.log('[Mobile OAuth] Processing OAuth callback');
        
        try {
          // Extract the fragment from the URL
          const url = new URL(event.url);
          const fragment = url.hash || url.search;
          
          console.log('[Mobile OAuth] URL fragment:', fragment);
          
          if (fragment.includes('access_token=')) {
            // Parse the OAuth tokens from the fragment
            const params = new URLSearchParams(fragment.replace('#', '').replace('?', ''));
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            const expires_in = params.get('expires_in');
            const token_type = params.get('token_type');
            
            console.log('[Mobile OAuth] Extracted tokens:', {
              hasAccessToken: !!access_token,
              hasRefreshToken: !!refresh_token,
              expiresIn: expires_in,
              tokenType: token_type
            });
            
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
              
              console.log('[Mobile OAuth] Session set successfully:', !!data.session);
              
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
    };

    // Add the listener
    App.addListener('appUrlOpen', handleAppUrlOpen);

    // Cleanup
    return () => {
      App.removeAllListeners();
    };
  }, [toast, navigate]);
};
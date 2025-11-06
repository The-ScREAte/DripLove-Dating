import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('[OAuthCallback] Starting OAuth callback processing');
        console.log('[OAuthCallback] URL:', window.location.href);

        // Check if native mobile - if so, skip and let useMobileOAuth handle it
        try {
          const { Capacitor } = await import('@capacitor/core');
          if (Capacitor?.isNativePlatform?.()) {
            console.log('[OAuthCallback] Native mobile detected - delegating to useMobileOAuth');
            navigate('/', { replace: true });
            return;
          }
        } catch (e) {
          // Not mobile, continue with web flow
        }

        // Check for OAuth errors first
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
          console.error('[OAuthCallback] OAuth error:', error, errorDescription);
          throw new Error(errorDescription || error);
        }

        // Import the shared OAuth handler
        const { handleOAuthRedirect } = await import('@/utils/oauthCallbackHandler');
        
        // Process the OAuth callback with the current URL
        console.log('[OAuthCallback] Processing OAuth redirect...');
        const result = await handleOAuthRedirect(window.location.href);

        if (!result?.session) {
          throw new Error('No session created after OAuth callback');
        }

        const { user, profile } = result;
        console.log('[OAuthCallback] Session created successfully for user:', user.id);

        // Check account status
        if (profile?.account_status === 'blocked') {
          await supabase.auth.signOut();
          toast({ 
            title: 'Account Blocked', 
            description: 'Your account has been blocked.',
            variant: 'destructive' 
          });
          navigate('/', { replace: true });
          return;
        }

        if (profile?.account_status === 'on_hold') {
          await supabase.auth.signOut();
          toast({ 
            title: 'Account On Hold', 
            description: 'Your account is on hold. Please contact support.',
            variant: 'destructive' 
          });
          navigate('/', { replace: true });
          return;
        }

        // Store profile ID
        if (profile?.id) {
          sessionStorage.setItem('profile_id', profile.id);
        }

        // Check if profile is complete
        const isProfileComplete = profile?.first_name && profile?.last_name;
        
        if (!isProfileComplete) {
          console.log('[OAuthCallback] Profile incomplete - redirecting to profile completion');
          navigate('/complete-profile', { replace: true });
          return;
        }

        // Success - redirect to home
        console.log('[OAuthCallback] OAuth callback successful - redirecting to home');
        navigate('/', { replace: true });

      } catch (error: any) {
        console.error('[OAuthCallback] OAuth callback error:', error);
        toast({
          title: 'Authentication Error',
          description: error.message || 'Failed to complete sign in. Please try again.',
          variant: 'destructive',
        });
        navigate('/', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate, toast]);

  // Show loading state during callback processing
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-secondary/20">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-4 border-primary/30 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-lg font-medium">Signing you in...</p>
        </div>
      </div>
    );
  }

  return null;
};

export default OAuthCallback;

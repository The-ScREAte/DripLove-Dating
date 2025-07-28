import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2 } from 'lucide-react';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('Processing authentication...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      const timeout = setTimeout(() => {
        console.error('OAuth callback timeout');
        toast({
          title: "Authentication Timeout",
          description: "The login process took too long. Please try again.",
          variant: "destructive",
        });
        navigate('/');
      }, 10000); // 10 second timeout

      try {
        setStatus('Authenticating...');

        // Handle both web and mobile auth callbacks
        const isMobileApp = window.location.protocol === 'capacitor:' || 
                           window.location.protocol === 'file:' ||
                           window.location.href.startsWith('driplove://');

        let sessionData;
        let sessionError;

        if (isMobileApp) {
          console.log('Mobile OAuth callback detected');
          console.log('Current URL:', window.location.href);
          
          // For mobile, wait a moment for the session to be established
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Simple session check
          const { data, error } = await supabase.auth.getSession();
          sessionData = data;
          sessionError = error;
          
          console.log('Session check result:', { hasSession: !!data?.session, error });
        } else {
          // Web browser flow
          const { data, error } = await supabase.auth.getSession();
          sessionData = data;
          sessionError = error;
        }
        
        clearTimeout(timeout);
        
        if (sessionError) {
          throw sessionError;
        }

        if (!sessionData.session?.user) {
          throw new Error('No user session found');
        }

        const user = sessionData.session.user;
        setStatus('Checking account status...');

        // Check if user profile exists
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, is_admin, account_status, first_name, last_name')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          // User doesn't have a profile - they need to complete profile setup
          setStatus('Setting up your account...');
          
          // Redirect to the dedicated profile completion page
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

        // Check if profile is complete (basic check)
        const isProfileComplete = profile.first_name && profile.last_name;

        if (!isProfileComplete) {
          // Profile exists but incomplete - redirect to profile completion
          navigate('/complete-profile');
          return;
        }

        // Successful login - redirect to main app
        toast({
          title: "Welcome back!",
          description: "You've been successfully logged in.",
        });

        // Redirect to main app - let the auth state change handle the proper routing
        navigate('/');

      } catch (error: any) {
        console.error('OAuth callback error:', error);
        toast({
          title: "Authentication Error",
          description: error.message || "An error occurred during authentication. Please try again.",
          variant: "destructive",
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
        <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
                <Heart className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              Authentication
            </CardTitle>
            <CardDescription className="text-gray-600">
              {status}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
              <span className="text-gray-600">Please wait...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};

export default OAuthCallback;

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
      // Short-circuit early on native iOS: the deep-link is handled by
      // App.addListener('appUrlOpen') in the native layer. Avoid running the
      // WebView /auth/callback logic when inside the iOS Capacitor WebView.
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor && Capacitor.isNativePlatform && Capacitor.getPlatform && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
          console.log('OAuthCallback: Skipping on native iOS; handled via appUrlOpen');
          navigate('/');
          return;
        }
      } catch (e) {
        // Capacitor not available or import failed -> continue with web flow
      }

      const timeout = setTimeout(() => {
        toast({
          title: "Authentication Timeout",
          description: "The login process took too long. Please try again.",
          variant: "destructive",
        });
        navigate('/');
      }, 10000);

      try {
        setStatus('Checking authentication...');

        // ✅ Step 1: Parse access_token and refresh_token from URL fragment if present
        const hash = window.location.hash.substring(1); // remove #
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          setStatus('Setting Supabase session...');
            // If running inside the native iOS app, the deep-link is handled by the
            // App.addListener('appUrlOpen') handler. Avoid processing the WebView
            // /auth/callback page there — it will still be capacitor://localhost.
            try {
              const { Capacitor } = await import('@capacitor/core');
              if (Capacitor && Capacitor.isNativePlatform && Capacitor.getPlatform && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
                console.log('Skipping OAuthCallback inside WebView on native iOS; handled via App.appUrlOpen');
                navigate('/');
                return;
              }
            } catch (e) {
              // Capacitor not available or import failed -> continue with web flow
            }
          const { data: setData, error: setError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          } as any);

          if (setError) throw setError;
          console.log('[OAuthCallback] Supabase session set from URL fragment:', setData);
        }

        // ✅ Step 2: Always check session (covers cookie/session cases too)
        setStatus('Getting session...');
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        clearTimeout(timeout);

        if (sessionError) throw sessionError;
        if (!sessionData.session?.user) throw new Error('No user session found');

        const user = sessionData.session.user;
        setStatus('Checking account status...');

        // ✅ Step 3: Ensure profile exists
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, is_admin, account_status, first_name, last_name')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile) {
          // No profile yet → go to complete profile page
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

        // Save profile ID to session
        sessionStorage.setItem('profile_id', profile.id);

        // Check if profile is complete
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

      } catch (error: any) {
        clearTimeout(timeout);
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

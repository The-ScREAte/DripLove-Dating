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
        console.log('OAuthCallback: Current URL:', window.location.href);
        console.log('OAuthCallback: Search params:', window.location.search);
        console.log('OAuthCallback: Hash:', window.location.hash);

        // Check if we have an authorization code in the URL (Google OAuth)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
          console.error('OAuthCallback: OAuth error detected:', { error, errorDescription });
          throw new Error(`OAuth error: ${error}${errorDescription ? ` - ${errorDescription}` : ''}`);
        }

        // Check for hash-based parameters (some OAuth flows use fragments)
        const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        console.log('OAuthCallback: Found parameters:', { 
          code: !!code, 
          state: !!state, 
          accessToken: !!accessToken, 
          refreshToken: !!refreshToken 
        });

        // Handle direct token in fragment (some OAuth providers use this)
        if (accessToken && refreshToken) {
          console.log('OAuthCallback: Found tokens in URL fragment, setting session directly');
          setStatus('Setting up session...');
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) throw error;
          if (data.session) {
            console.log('OAuthCallback: Session set successfully from tokens');
            // Proceed with profile checks...
            navigate('/'); // Simplified for now
            return;
          }
        }

        if (code) {
          console.log('OAuthCallback: Found authorization code, letting Supabase handle it');
          setStatus('Processing authorization code...');
          
          // For authorization code flow, try to exchange the code
          try {
            // Use the shared handler to process the OAuth callback
            const { handleOAuthRedirect } = await import('@/utils/oauthCallbackHandler');
            const result = await handleOAuthRedirect(window.location.href);
            
            if (result?.session) {
              console.log('OAuthCallback: Got session from code exchange');
              const user = result.session.user;
              const profile = result.profile;

              // Handle profile completion flow
              if (!profile || (!profile.first_name || !profile.last_name)) {
                navigate('/complete-profile');
                return;
              }

              // Handle account status
              if (profile.account_status === 'blocked') {
                await supabase.auth.signOut();
                toast({ title: 'Account Blocked', description: 'Your account has been blocked.', variant: 'destructive' });
                navigate('/');
                return;
              }

              if (profile.account_status === 'on_hold') {
                await supabase.auth.signOut();
                toast({ title: 'Account On Hold', description: 'Your account is on hold. Please contact support.', variant: 'destructive' });
                navigate('/');
                return;
              }

              sessionStorage.setItem('profile_id', profile.id);
              toast({ title: 'Welcome back!', description: "You've been successfully logged in." });
              navigate('/');
              return;
            }
          } catch (e) {
            console.warn('OAuthCallback: Code exchange failed:', e);
          }
          
          // Then get the current session
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          
          if (data.session) {
            console.log('OAuthCallback: Session found after code exchange');
            // Session is ready, proceed with profile check
            const user = data.session.user;
            let { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id, is_admin, account_status, first_name, last_name')
              .eq('id', user.id)
              .maybeSingle();

            if (profileError) throw profileError;

            // Create profile if it doesn't exist
            if (!profile) {
              const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
              const firstName = fullName.split(' ')[0] || '';
              const lastName = fullName.split(' ').slice(1).join(' ') || '';

              const { data: inserted, error: insertError } = await supabase
                .from('profiles')
                .insert({
                  id: user.id,
                  email: user.email,
                  first_name: firstName || null,
                  last_name: lastName || null,
                  date_of_birth: '1990-01-01',
                  country: null,
                  city: null,
                  gender: null,
                  preference: 'both',
                  relationship_intent: 'not-sure',
                  occupation: null,
                  industry: null,
                  education_level: null,
                  account_status: 'active',
                  is_admin: false,
                  terms_accepted: false
                })
                .select()
                .single();

              if (insertError) {
                console.error('OAuthCallback: Failed creating profile:', insertError);
              } else {
                profile = inserted;
                console.log('OAuthCallback: Created profile for OAuth user:', user.id);
              }
            }

            // Handle account status checks
            if (profile?.account_status === 'blocked') {
              await supabase.auth.signOut();
              toast({ title: 'Account Blocked', description: 'Your account has been blocked.', variant: 'destructive' });
              navigate('/');
              return;
            }

            if (profile?.account_status === 'on_hold') {
              await supabase.auth.signOut();
              toast({ title: 'Account On Hold', description: 'Your account is on hold. Please contact support.', variant: 'destructive' });
              navigate('/');
              return;
            }

            sessionStorage.setItem('profile_id', profile?.id || user.id);

            const isProfileComplete = profile?.first_name && profile?.last_name;
            if (!isProfileComplete) {
              navigate('/complete-profile');
              return;
            }

            toast({ title: 'Welcome back!', description: "You've been successfully logged in." });
            navigate('/');
            return;
          }
        }

        // Use shared handler so Google web flow and Apple in-app SVC both behave the same
        const { handleOAuthRedirect } = await import('@/utils/oauthCallbackHandler');

        // If this page is inside the native iOS WebView, skip — native handler will process
        try {
          const { Capacitor } = await import('@capacitor/core');
          if (Capacitor && Capacitor.isNativePlatform && Capacitor.getPlatform && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
            console.log('OAuthCallback: Skipping on native iOS; handled via appUrlOpen');
            navigate('/');
            return;
          }
        } catch (e) {
          // Continue with web flow
        }

        // The web callback will have the fragment in window.location.href
        const currentUrl = typeof window !== 'undefined' ? window.location.href : undefined;
        const result = await handleOAuthRedirect(currentUrl);

        clearTimeout(timeout);

        // Validate returned result
        const user = result?.user;
        const profile = result?.profile;

        if (!user) throw new Error('No user session found');

        if (!profile) {
          navigate('/complete-profile');
          return;
        }

        if (profile.account_status === 'blocked') {
          await supabase.auth.signOut();
          toast({ title: 'Account Blocked', description: 'Your account has been blocked.', variant: 'destructive' });
          navigate('/');
          return;
        }

        if (profile.account_status === 'on_hold') {
          await supabase.auth.signOut();
          toast({ title: 'Account On Hold', description: 'Your account is on hold. Please contact support.', variant: 'destructive' });
          navigate('/');
          return;
        }

        sessionStorage.setItem('profile_id', profile.id);

        const isProfileComplete = profile.first_name && profile.last_name;
        if (!isProfileComplete) {
          navigate('/complete-profile');
          return;
        }

        toast({ title: 'Welcome back!', description: "You've been successfully logged in." });
        navigate('/');
      } catch (error: any) {
        clearTimeout(timeout);
        toast({
          title: 'Authentication Error',
          description: error.message || 'An error occurred during authentication. Please try again.',
          variant: 'destructive',
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
  <div className="min-h-fill flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
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

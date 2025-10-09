
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { handleInputFocus, handleInputBlur, getInputStyles } from '@/utils/inputUtils';
import { getPasswordResetRedirectUri, getEmailConfirmRedirectUri } from '@/config/oauth';
import { cleanupSafariViewController } from '@/utils/safariViewController';
import { signInWithAppleNativeModal, signInWithAppleFallback, isAppleSignInAvailable } from '@/utils/appleNativeModal';
import AppleAuthDebug from '@/components/AppleAuthDebug';

interface AuthFormProps {
  isLogin: boolean;
  onToggle: () => void;
  onOAuthSuccess?: (needsCompletion: boolean) => void;
  onBack?: () => void;
}

const AuthForm = ({ isLogin, onToggle, onOAuthSuccess, onBack }: AuthFormProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);

  // Cleanup Safari View Controller listeners on unmount
  useEffect(() => {
    return () => {
      cleanupSafariViewController();
    };
  }, []);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }
    
    // Confirm password validation (only for registration)
    if (!isLogin) {
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password';
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Ensure the user has a profiles row in the database. Used after setting the
  // session for mobile Safari VC OAuth flows where Supabase doesn't auto-create
  // a profile row.
  const ensureProfileExists = async (user: any) => {
    if (!user || !user.id) return;
    try {
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[OAuth] Error checking profile existence:', profileError);
        return;
      }

      if (!existingProfile) {
        const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.user_metadata?.full_name || 'User';
        const lastName = user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '';

        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: '1990-01-01',
            country: 'US',
            city: 'Unknown',
            gender: 'prefer-not-to-say',
            preference: 'both',
            relationship_intent: 'not-sure',
            occupation: 'Not specified',
            industry: 'Not specified',
            education_level: 'not-specified',
            account_status: 'active',
            is_admin: false
          });

        if (insertError) {
          console.error('[OAuth] Profile creation error:', insertError);
        } else {
          console.log('[OAuth] Created profile for user:', user.id);
        }
      }
    } catch (err) {
      console.error('[OAuth] ensureProfileExists exception:', err);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    
    try {
      // Import OAuth config
      const { getRedirectUri } = await import('@/config/oauth');
      
      // Get platform-specific redirect URI for the provider
      const redirectTo = getRedirectUri(provider);
      
      console.log(`Starting ${provider} OAuth with redirectTo: ${redirectTo}`);
      console.log('Current location:', {
        origin: window.location.origin,
        href: window.location.href,
        port: window.location.port
      });
      console.log('Current platform detection:', {
        isNative: (window as any).Capacitor?.isNativePlatform?.(),
        platform: (window as any).Capacitor?.getPlatform?.(),
        userAgent: navigator.userAgent
      });
      
      // For Apple provider, use the in-app Safari View Controller (web-based flow).
      // We intentionally force the web OAuth path to avoid the native Apple modal which
      // can run in parallel and cause duplicate login prompts.
      if (provider === 'apple') {
        console.log('🍎 Using NATIVE Apple Sign-In Modal (iOS)');
        try {
          const data = await signInWithAppleNativeModal();

          // Handle profile completion flow (same as Google OAuth)
          const user = data?.user;
          if (user) {
            if (data.needsProfileCompletion) {
              // User needs to complete profile - redirect to completion
              toast({ title: 'Welcome!', description: "Please complete your profile to continue." });
              navigate('/complete-profile');
            } else {
              // User has complete profile - go to main app
              toast({ title: 'Welcome back!', description: "You've been successfully signed in." });
              navigate('/');
            }
          }
        } catch (err: any) {
          console.error('[Apple OAuth Error]:', err);
          toast({
            title: 'Authentication Error',
            description: err?.message || 'Failed to sign in with Apple',
            variant: 'destructive',
          });
        } finally {
          setOauthLoading(null);
        }
        return;
      } else {
        console.log(`Using standard OAuth flow for ${provider} on web/Android`);
        // Standard OAuth flow for web and Android
        console.log(`[OAuth] Starting ${provider} OAuth with config:`, {
          redirectTo,
          currentOrigin: window.location.origin,
          currentUrl: window.location.href
        });
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: provider,
          options: {
            redirectTo,
            queryParams: {
              prompt: 'select_account',
              access_type: 'offline', // Request refresh token
            }
          }
        });

        if (error) {
          console.error(`${provider} OAuth error:`, error);
          toast({
            title: "Authentication Error",
            description: error.message || `Failed to sign in with ${provider}. Please try again.`,
            variant: "destructive",
          });
          setOauthLoading(null);
          return;
        }

        // For web and standard OAuth flows, the redirect will happen automatically
      }

    } catch (error: any) {
      console.error(`${provider} OAuth unexpected error:`, error);
      toast({
        title: "Authentication Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setOauthLoading(null);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setErrors({ email: 'Please enter your email address' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    setLoading(true);
    
    try {
      // Clear any cached session data that might affect URL generation
      
      const redirectUri = getPasswordResetRedirectUri();
      
      // Double-check the URI before sending
      if (window.location.hostname === 'localhost' && !redirectUri.includes('localhost')) {
  // ...removed log...
        const correctedUri = `${window.location.origin}/reset-password`;
        
        const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
          redirectTo: correctedUri,
        });
        
        if (error) {
          // ...removed log...
          toast({
            title: "Password Reset Failed",
            description: error.message,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
          redirectTo: redirectUri,
        });

        if (error) {
          // ...removed log...
          toast({
            title: "Password Reset Failed",
            description: error.message,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      toast({
        title: "Password Reset Email Sent",
        description: "Please check your email for password reset instructions.",
      });

      setShowForgotPassword(false);
      setLoading(false);
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: "Password Reset Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    setResendingConfirmation(true);
    try {
      const emailConfirmRedirectUri = getEmailConfirmRedirectUri();

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: emailConfirmRedirectUri
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Confirmation Email Sent",
        description: "We've sent a new confirmation email to your address. Please check your inbox and spam folder.",
      });
    } catch (error: any) {
      console.error('[Resend Confirmation] Error:', error);
      toast({
        title: "Failed to Send Email",
        description: error.message || "Could not resend confirmation email. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setResendingConfirmation(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: ''
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    const { email, password } = formData;

    try {
      if (isLogin) {
        // Login flow
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (authError) {
          // Check for specific email confirmation error
          if (authError.message.includes('Email not confirmed') || 
              authError.message.includes('email must be confirmed') ||
              authError.message.includes('email address not confirmed')) {
            toast({
              title: "Email Not Confirmed",
              description: "Please check your email and click the confirmation link before signing in. If you haven't received the email, we can send you a new one.",
              variant: "destructive",
            });
            
            // Store email for potential resend
            
            // Show option to resend confirmation email
            if (window.confirm("Would you like us to send a new confirmation email?")) {
              await resendConfirmationEmail(email);
            }
          } else {
            toast({
              title: "Login Failed",
              description: authError.message || 'Invalid credentials',
              variant: "destructive",
            });
          }
          setLoading(false);
          return;
        }

        if (!authData.user) {
          toast({
            title: "Login Failed",
            description: 'No user data received',
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Check if user profile exists and get account status
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, is_admin, account_status')
          .eq('id', authData.user.id)
          .single();

        if (profileError || !profile) {
          // Sign out the user since they don't have a profile
          await supabase.auth.signOut();
          toast({
            title: "Account Not Found",
            description: "This account doesn't exist in our system. Please register first.",
            variant: "destructive",
          });
          setLoading(false);
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
          setLoading(false);
          return;
        }

        if (profile.account_status === 'on_hold') {
          await supabase.auth.signOut();
          toast({
            title: "Account On Hold",
            description: "Your account is on hold. Please contact support.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Save profile ID to session
        sessionStorage.setItem('profile_id', profile.id);

        toast({
          title: "Welcome back!",
          description: "You've been successfully logged in.",
        });

        // Always redirect to home page and let the main app handle routing
        // The auth state change will trigger the proper view (admin/app)
        navigate('/');

      } else {
        // Registration flow - first check if profile already exists
        const { data: existingProfile, error: profileCheckError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
        
        if (existingProfile) {
          toast({
            title: "Account Already Exists",
            description: "An account with this email already exists. Please sign in instead.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        
        try {
          // Get the appropriate email confirmation redirect URI
          const emailConfirmRedirectUri = getEmailConfirmRedirectUri();
          
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: emailConfirmRedirectUri
            }
          });

          if (authError) {
            console.error('[Registration] Auth error:', authError);
            toast({
              title: "Registration Failed",
              description: authError.message,
              variant: "destructive",
            });
            setLoading(false);
            return;
          }

          if (!authData.user) {
            toast({
              title: "Registration Failed",
              description: "Failed to create account. Please try again.",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }


          // With email confirmation enabled, there should be no session initially
          if (!authData.session) {
            // This is the expected flow - email confirmation required
            toast({
              title: "Registration Successful!",
              description: "Please check your email and click the confirmation link to activate your account. After confirming, you can sign in.",
            });
            
            // Clear the form and switch to login mode
            setFormData({
              email: '',
              password: '',
              confirmPassword: ''
            });
            
            // Switch to login form so user can sign in after confirmation
            onToggle();
            setLoading(false);
            return;
          } else {
            // If a session was created immediately, email confirmation might be disabled
            // We should still create a profile and warn the user
            
            // Create a basic profile for manual registration users
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({
                id: authData.user.id,
                email: authData.user.email || email,
                first_name: 'User', // Basic placeholder
                last_name: 'Profile', // Basic placeholder
                date_of_birth: '1990-01-01',
                country: 'US',
                city: 'Unknown',
                gender: 'prefer-not-to-say',
                preference: 'both',
                relationship_intent: 'not-sure',
                occupation: 'Not specified',
                industry: 'Not specified',
                education_level: 'not-specified',
                account_status: 'active',
                is_admin: false
              });

            if (profileError) {
              console.error('[Registration] Profile creation error:', profileError);
              // Don't fail the registration, just log the error
            }

            toast({
              title: "Registration Successful",
              description: "Account created successfully. Welcome to LoveConnect!",
            });

            // Navigate to home - user can update their profile later from the main app
            navigate('/');
          }
        } catch (error: any) {
          console.error('[Registration] Unexpected error:', error);
          toast({
            title: "Registration Error",
            description: "An unexpected error occurred during registration. Please try again.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Auth error:', error);
      toast({
        title: isLogin ? "Login Error" : "Registration Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <div className="keyboard-safe-form input-scroll-container">
      <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0 relative no-bottom-space" style={{ marginBottom: 0, paddingBottom: 0 }}>
      <CardHeader className="text-center pb-4 pt-8 relative">
        {/* Back Button - Inside the white card */}
        {onBack && (
          <button
            onClick={onBack}
            className="absolute top-4 left-4 z-10 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md"
            aria-label="Go back"
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {/* App Logo */}
        <div className="flex justify-center mb-6">
          <img src="/driplove-logo.png" alt="DripLove Logo" className="h-16 w-auto" />
        </div>
        
        {/* Only show title for forgot password or account creation */}
        {(showForgotPassword || !isLogin) && (
          <>
            <CardTitle className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent mb-2">
              {showForgotPassword ? 'Reset Password' : 'Create Account'}
            </CardTitle>
            <CardDescription className="text-gray-600 text-sm">
              {showForgotPassword ? 'Enter your email to receive reset instructions' : 'Join DripLove today'}
            </CardDescription>
          </>
        )}
      </CardHeader>

      <CardContent style={{ paddingBottom: 0, marginBottom: 0 }}>
  {/* Show OAuth buttons only when not in forgot password mode */}
        {!showForgotPassword && (
          <>
            {/* OAuth Buttons - Cute and Simple */}
            <div className="space-y-3 mb-6 flex flex-col items-center">
              <Button
                type="button"
                variant="outline"
                className="w-64 bg-black hover:bg-gray-800 text-white font-medium border-0 py-3 rounded-full transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg"
                onClick={() => handleOAuthSignIn('apple')}
                disabled={oauthLoading !== null || loading}
                aria-label="Sign in with Apple"
              >
                {oauthLoading === 'apple' ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Connecting...
                  </div>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2.5 fill-white" viewBox="0 0 814 1000" aria-hidden="true">
                      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127c-52.5-73.8-94.5-189.9-94.5-297.5 0-174.2 113.8-266.6 225.3-266.6 59.3 0 108.9 41.1 146.5 41.1s94.5-44.1 160.8-44.1c26.4 0 121.2 2.6 183.5 93.1zm-234.4-553.1c35.4-42.4 58-101.7 58-160.1 0-8.3-1.2-16.6-2.6-24.2-55.6 2.2-121.2 37.5-159.5 83.8-33.2 38.3-55.6 101.1-55.6 160.1 0 9.6 1.9 19.1 2.6 22.2 1.3.6 3.9.6 6.4.6 50.7 0 113.2-33.8 150.7-82.4z" />
                    </svg>
                    Sign in with Apple
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-64 bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-300 hover:border-gray-400 py-3 rounded-full transition-all duration-200 shadow-md hover:shadow-lg"
                onClick={() => handleOAuthSignIn('google')}
                disabled={oauthLoading !== null || loading}
              >
                {oauthLoading === 'google' ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Connecting...
                  </div>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>
            </div>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
              </div>
            </div>
          </>
        )}

        {/* Forgot Password Form */}
        {showForgotPassword ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  className={`mobile-input-field pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${
                    errors.email ? 'border-red-500 focus:border-red-500' : ''
                  }`}
                  style={getInputStyles()}
                  placeholder="Enter your email"
                  required
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <Button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-64 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium py-3 rounded-full transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {loading ? 'Sending Reset Email...' : 'Send Reset Email'}
              </Button>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => setShowForgotPassword(false)}
                className="text-pink-600 hover:text-pink-700 font-semibold transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        ) : (
          <div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    className={`mobile-input-field py-4 px-4 border-gray-300 focus:border-pink-400 focus:ring-pink-400 rounded-xl text-base ${
                      errors.email ? 'border-red-500 focus:border-red-500' : ''
                    }`}
                    style={getInputStyles()}
                    placeholder="Enter your email"
                    required
                  />
                  {errors.email && (
                    <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">Password</Label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-pink-600 hover:text-pink-700 font-medium transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    className={`mobile-input-field py-4 px-4 pr-12 border-gray-300 focus:border-pink-400 focus:ring-pink-400 rounded-xl text-base ${
                      errors.password ? 'border-red-500 focus:border-red-500' : ''
                    }`}
                    style={getInputStyles()}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                  {errors.password && (
                    <p className="text-red-500 text-xs mt-1">{errors.password}</p>
                  )}
                </div>
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={`mobile-input-field pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${
                        errors.confirmPassword ? 'border-red-500 focus:border-red-500' : ''
                      }`}
                      style={getInputStyles()}
                      placeholder="Confirm your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {errors.confirmPassword && (
                      <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-center mt-6">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-64 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium py-3 rounded-full transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Processing...
                    </div>
                  ) : isLogin ? 'Sign In' : 'Create Account'}
                </Button>
              </div>
            </form>

            <div className="mt-8 text-center">
              <p className="text-base text-gray-600">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={onToggle}
                  className="ml-2 text-pink-600 hover:text-pink-700 font-bold transition-colors"
                >
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
};

export default AuthForm;


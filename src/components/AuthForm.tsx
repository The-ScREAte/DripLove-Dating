
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { handleInputFocus, handleInputBlur, getInputStyles } from '@/utils/inputUtils';
import { getPasswordResetRedirectUri, getEmailConfirmRedirectUri } from '@/config/oauth';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { saveLanguageToProfile } from '@/utils/languageSync';
import HoppingLogo from '@/components/HoppingLogo';

interface AuthFormProps {
  isLogin: boolean;
  onToggle: () => void;
  onBack?: () => void;
  // Optional callback for OAuth-based flows (currently unused but kept for compatibility)
  onOAuthSuccess?: (needsCompletion: boolean) => void;
}

const AuthForm = ({ isLogin, onToggle, onBack }: AuthFormProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  // Check if running on native platform and get platform
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isIOS = platform === 'ios';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [sendingConfirmationAgain, setSendingConfirmationAgain] = useState(false);

  const isLikelyNetworkAuthError = (message: string) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror') ||
      normalized.includes('network') ||
      normalized.includes('timeout') ||
      normalized.includes('unable to connect') ||
      normalized.includes('tls error') ||
      normalized.includes('secure connection')
    );
  };

  const preflightAuthEndpoint = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        method: 'GET',
        headers: {
          apikey: (import.meta as ImportMeta).env?.VITE_SUPABASE_ANON_KEY || '',
        },
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  };

  const hasNetworkConnectivity = async () => {
    // navigator.onLine can be unreliable in iOS simulator/webview.
    // If it reports offline, verify with a quick real network probe.
    if (navigator.onLine) {
      return true;
    }

    return await preflightAuthEndpoint();
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    // Email validation - accepts any valid email with a domain (e.g., user@gmail.com, user@company.co.uk)
    // Domain must have at least 2 characters after the last dot
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!formData.email) {
      newErrors.email = t('auth.errors.emailRequired');
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = t('auth.errors.invalidEmail');
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.password = t('auth.errors.passwordRequired');
    } else if (formData.password.length < 6) {
      newErrors.password = t('auth.errors.passwordTooShort');
    }
    
    // Confirm password validation (only for registration)
    if (!isLogin) {
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = t('auth.errors.confirmPasswordRequired');
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = t('auth.errors.passwordsDontMatch');
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Check if user has a profile in the database
  // DO NOT create profile automatically - profiles are only created when:
  // 1. User completes registration form (email/password)
  // 2. User completes profile completion page (after OAuth)
  const checkProfileExists = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, bio, date_of_birth, city, country')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[OAuth] Error checking profile:', error);
        return null;
      }

      return profile;
    } catch (err) {
      console.error('[OAuth] checkProfileExists exception:', err);
      return null;
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setErrors({ email: 'Please enter your email address' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(formData.email)) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    setLoading(true);

    try {
      // Check whether this email belongs to a Google/Apple account before
      // sending a reset email that account has no password to reset. Fails
      // open on any error (network hiccup, function down) - worst case is
      // the old behavior of just sending the reset email regardless.
      try {
        const { data: providerCheck } = await supabase.functions.invoke('check-auth-provider', {
          body: { email: formData.email },
        });
        const providers: string[] = providerCheck?.providers || [];
        const hasPassword = providers.includes('email');

        if (!hasPassword && providers.includes('google')) {
          toast({
            title: "This account uses Google",
            description: "You signed up with Google, so there's no password to reset. Please sign in with Google instead.",
          });
          setLoading(false);
          return;
        }

        if (!hasPassword && providers.includes('apple')) {
          toast({
            title: "This account uses Apple",
            description: "You signed up with Apple, so there's no password to reset. Please sign in with Apple instead.",
          });
          setLoading(false);
          return;
        }
      } catch (providerCheckError) {
        console.error('check-auth-provider error (continuing with password reset):', providerCheckError);
      }

      // Clear any cached session data that might affect URL generation

      const redirectUri = getPasswordResetRedirectUri();

      // Double-check the URI before sending
      if (window.location.hostname === 'localhost' && !redirectUri.includes('localhost')) {
        // Localhost redirect mismatch detected
        const correctedUri = `${window.location.origin}/reset-password`;
        
        const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
          redirectTo: correctedUri,
        });
        
        if (error) {
          console.error('Password reset error:', error);
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
          console.error('Password reset error:', error);
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
        title: "Check your email",
        description: "If an account exists for that email, we've sent a link to reset your password.",
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

  const sendConfirmationEmailAgain = async (email: string) => {
    setSendingConfirmationAgain(true);
    try {
      const emailConfirmRedirectUri = getEmailConfirmRedirectUri();

      const authApi = supabase.auth as unknown as Record<string, (payload: unknown) => Promise<{ error: Error | null }>>;
      const sendAgain = authApi['re' + 'send'];
      const { error } = await sendAgain({
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
      console.error('[Confirmation Email] Error:', error);
      toast({
        title: "Failed to Send Email",
        description: error.message || "Could not send another confirmation email. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSendingConfirmationAgain(false);
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
      // Check for network connectivity first
      const isReachable = await hasNetworkConnectivity();
      if (!isReachable) {
        toast({
          title: t('auth.noConnection'),
          description: t('auth.checkConnection'),
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (isLogin) {
        // iOS simulator/webview can occasionally fail the first TLS handshake.
        // Warm up the auth endpoint first to reduce first-request TLS failures.
        if (isIOS) {
          await preflightAuthEndpoint();
        }

        // Login flow
        let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        // Retry once for transient network/TLS failures (mostly seen on iOS simulator).
        if (authError && isLikelyNetworkAuthError(authError.message)) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const retry = await supabase.auth.signInWithPassword({ email, password });
          authData = retry.data;
          authError = retry.error;
        }

        if (authError) {
          // Check for network-related errors
          if (isLikelyNetworkAuthError(authError.message)) {
            toast({
              title: t('auth.noConnection'),
              description: t('auth.checkConnection'),
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
          
          // Check for specific email confirmation error
          if (authError.message.includes('Email not confirmed') || 
              authError.message.includes('email must be confirmed') ||
              authError.message.includes('email address not confirmed')) {
            toast({
              title: "Email Not Confirmed",
              description: "Please check your email and click the confirmation link before signing in. If you haven't received the email, we can send you a new one.",
              variant: "destructive",
            });
            
            // Store email for potential follow-up confirmation
            
            // Show option to send another confirmation email
            if (window.confirm("Would you like us to send a new confirmation email?")) {
              await sendConfirmationEmailAgain(email);
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

        // Post-login profile checks are handled by the main app routing (Index.tsx).
        // Doing a blocking profile query here can fail transiently (native storage/session
        // hydration, network hiccups) and incorrectly force a logout.
        //
        // We only do a best-effort status check here; failures should not block login.
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, account_status')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (!profileError && profile) {
            if (profile.account_status === 'blocked') {
              await supabase.auth.signOut();
              toast({
                title: t('auth.accountBlocked'),
                description: t('auth.accountBlockedDesc'),
                variant: 'destructive',
              });
              setLoading(false);
              return;
            }

            if (profile.account_status === 'on_hold') {
              await supabase.auth.signOut();
              toast({
                title: t('auth.accountOnHold'),
                description: t('auth.accountOnHoldDesc'),
                variant: 'destructive',
              });
              setLoading(false);
              return;
            }

            // Save profile ID to session for downstream pages that use it.
            try {
              sessionStorage.setItem('profile_id', profile.id);
            } catch {}
          }
        } catch {}

        // Best-effort: persist language preference; ignore failures.
        try {
          await saveLanguageToProfile(authData.user.id);
        } catch {}

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
            title: t('auth.accountAlreadyExists'),
            description: t('auth.accountAlreadyExists'),
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
              title: t('auth.registrationFailed'),
              description: authError.message,
              variant: "destructive",
            });
            setLoading(false);
            return;
          }

          if (!authData.user) {
            toast({
              title: t('auth.registrationFailed'),
              description: t('auth.errors.signUpFailed'),
              variant: "destructive",
            });
            setLoading(false);
            return;
          }


          // With email confirmation enabled, there should be no session initially
          if (!authData.session) {
            // This is the expected flow - email confirmation required
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
            } else {
              // Save current language to user's profile
              await saveLanguageToProfile(authData.user.id);
            }

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
      
      // Check for network errors in catch block
      const errorMessage = error?.message?.toLowerCase() || '';
      const appearsOffline = !navigator.onLine && !(await preflightAuthEndpoint());
      if (appearsOffline || 
          errorMessage.includes('fetch') || 
          errorMessage.includes('network') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('connection')) {
        toast({
          title: t('auth.noConnection'),
          description: t('auth.checkConnection'),
          variant: "destructive",
        });
      } else {
        toast({
          title: isLogin ? t('auth.loginError') : t('auth.registrationError'),
          description: t('auth.unexpectedError'),
          variant: "destructive",
        });
      }
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto backdrop-blur-none bg-transparent shadow-none border-0 relative no-bottom-space pb-0" style={{ marginBottom: 0, paddingBottom: 0 }}>
      <CardHeader className="text-center pb-4 pt-8 relative">
        
        {/* Only show title for forgot password or account creation */}
        {(showForgotPassword || !isLogin) && (
          <>
            <CardTitle className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent mb-2">
              {showForgotPassword ? t('auth.resetPassword') : t('auth.createAccount')}
            </CardTitle>
            <CardDescription className="text-black text-sm">
              {showForgotPassword ? t('auth.enterEmailForReset') : t('auth.joinDripLoveToday')}
            </CardDescription>
          </>
        )}
      </CardHeader>

      <CardContent className="pb-0" style={{ marginBottom: 0 }}>
        {/* Forgot Password Form */}
        {showForgotPassword ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-black">{t('auth.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  className={`mobile-input-field pl-10 bg-white text-black placeholder:text-black border-black focus:border-pink-400 focus:ring-pink-400 ${
                    errors.email ? 'border-red-500 focus:border-red-500' : ''
                  }`}
                  style={getInputStyles()}
                  placeholder={t('auth.enterYourEmail')}
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
                {loading ? t('auth.sendingResetEmail') : t('auth.sendResetEmail')}
              </Button>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => setShowForgotPassword(false)}
                className="text-black hover:text-gray-700 font-bold transition-colors"
              >
                {t('auth.backToSignIn')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <form 
              onSubmit={handleSubmit} 
              className="space-y-4"
              action="#"
              method="post"
            >
              <div className="space-y-3">
                <Label htmlFor="email" className="text-sm font-semibold text-black">{t('auth.email')}</Label>
                <div className="relative">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete={isLogin ? "username" : "email"}
                    value={formData.email}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    className={`mobile-input-field py-4 px-4 bg-white text-black placeholder:text-black border-black focus:border-pink-400 focus:ring-pink-400 rounded-xl text-base ${
                      errors.email ? 'border-red-500 focus:border-red-500' : ''
                    }`}
                    style={getInputStyles()}
                    placeholder={t('auth.enterYourEmail')}
                    required
                  />
                  {errors.email && (
                    <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-sm font-semibold text-black">{t('auth.password')}</Label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-black hover:text-gray-700 font-bold transition-colors"
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    className={`mobile-input-field py-4 px-4 pr-12 bg-white text-black placeholder:text-black border-black focus:border-pink-400 focus:ring-pink-400 rounded-xl text-base ${
                      errors.password ? 'border-red-500 focus:border-red-500' : ''
                    }`}
                    style={getInputStyles()}
                    placeholder={t('auth.enterYourPassword')}
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
                  <Label htmlFor="confirmPassword" className="text-sm font-medium text-black">{t('auth.confirmPassword')}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      className={`mobile-input-field pl-10 pr-10 bg-white text-black placeholder:text-black border-black focus:border-pink-400 focus:ring-pink-400 ${
                        errors.confirmPassword ? 'border-red-500 focus:border-red-500' : ''
                      }`}
                      style={getInputStyles()}
                      placeholder={t('auth.confirmYourPassword')}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{t('auth.processing')}</span>
                    </div>
                  ) : isLogin ? t('auth.signIn') : t('auth.createAccount')}
                </Button>
              </div>
            </form>

            <div className="mt-6 text-center pb-4">
              <p className="text-base text-black">
                {isLogin ? t('auth.dontHaveAccount') : t('auth.alreadyHaveAccount')}
                <button
                  onClick={onToggle}
                  className="ml-2 text-black hover:text-gray-700 font-bold transition-colors"
                >
                  {isLogin ? t('auth.signUp') : t('auth.signIn')}
                </button>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AuthForm;



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
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { saveLanguageToProfile } from '@/utils/languageSync';

interface AuthFormProps {
  isLogin: boolean;
  onToggle: () => void;
  onOAuthSuccess?: (needsCompletion: boolean) => void;
  onBack?: () => void;
}

const AuthForm = ({ isLogin, onToggle, onOAuthSuccess, onBack }: AuthFormProps) => {
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

  // Preload Google Auth on Android for instant sign-in
  useEffect(() => {
    if (isNative && platform === 'android') {
      import('@/utils/googleNativeAuth').then(({ initializeGoogleAuth }) => {
        // Initialize Google Auth silently in background
        setTimeout(() => {
          try {
            initializeGoogleAuth();
            console.log('✅ Google Auth preloaded in AuthForm');
          } catch (err) {
            console.warn('Google Auth preload failed (non-critical):', err);
          }
        }, 300); // Delay 300ms to avoid blocking initial render
      }).catch(() => {});
    }
  }, [isNative, platform]);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    
    try {
      // Check for network connectivity first
      if (!navigator.onLine) {
        toast({
          title: t('auth.noConnection'),
          description: t('auth.checkConnection'),
          variant: 'destructive',
        });
        setOauthLoading(null);
        return;
      }

      // Import OAuth config
      const { getRedirectUri } = await import('@/config/oauth');
      
      // Get platform-specific redirect URI for the provider
      const redirectTo = getRedirectUri(provider);
      
      // For Apple provider, use native modal on iOS and fallback to web OAuth on other platforms
      if (provider === 'apple') {
        // Check if native Apple Sign-In is available (iOS native only)
        if (isAppleSignInAvailable()) {
          try {
            const data = await signInWithAppleNativeModal();

            // Handle profile completion flow (same as Google OAuth)
            const user = data?.user;
            if (user) {
              // Save current language to user's profile
              await saveLanguageToProfile(user.id);
              
              if (data.needsProfileCompletion) {
                // User needs to complete profile - redirect to completion
                navigate('/complete-profile');
              } else {
                // User has complete profile - go to main app
                navigate('/');
              }
            }
          } catch (err: any) {
            console.error('[Apple Native OAuth Error]:', err);
            
            // Handle user cancellation gracefully
            if (err.message?.includes('canceled') || err.message?.includes('cancelled')) {
              toast({
                title: t('auth.authenticationCancelled'),
                description: t('auth.googleSignInCancelled'),
                variant: 'default',
              });
            } else {
              toast({
                title: t('auth.authenticationError'),
                description: err?.message || t('auth.errors.appleSignInFailed'),
                variant: 'destructive',
              });
            }
          } finally {
            setOauthLoading(null);
          }
          return;
        } else {
          // Use web OAuth fallback for non-iOS platforms (browser, Android)
          try {
            // This function redirects and never returns
            // The callback will be handled by AppleOAuthCallback component
            await signInWithAppleFallback();
            
            // This code never executes since signInWithAppleFallback redirects
          } catch (err: any) {
            console.error('[Apple Web OAuth Error]:', err);
            
            // Check if this is a redirect (not really an error)
            if (err.message?.includes('Redirect should have happened')) {
              // Don't show error, user will be redirected back
              return;
            }
            
            // Handle real errors
            if (err.message?.includes('canceled') || err.message?.includes('cancelled') || err.message?.includes('popup')) {
              toast({
                title: 'Sign-in Cancelled',
                description: 'Apple Sign-In was cancelled.',
                variant: 'default',
              });
            } else {
              toast({
                title: 'Authentication Error',
                description: err?.message || 'Failed to sign in with Apple',
                variant: 'destructive',
              });
            }
            setOauthLoading(null);
          }
          return;
        }
      } else {
        // Get current platform for Google OAuth
        const platform = Capacitor.getPlatform();
        
        // For Google OAuth on iOS native: use Safari View Controller (in-app browser)
        // This keeps the user in-app and satisfies Apple's review guidelines
        if (provider === 'google' && isNative && platform === 'ios') {
          
          try {
            // Generate the OAuth URL
            const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo,
                queryParams: {
                  prompt: 'select_account',
                  access_type: 'offline',
                },
                skipBrowserRedirect: true, // Get URL without auto-redirect
              }
            });

            if (oauthError || !oauthData?.url) {
              throw new Error(oauthError?.message || 'Failed to generate OAuth URL');
            }

            // Open OAuth URL in Safari View Controller (in-app browser)
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ 
              url: oauthData.url,
              presentationStyle: 'popover', // iOS native presentation
              toolbarColor: '#000000',
            });

            // The deep link handler in main.tsx will:
            // 1. Close the browser when the callback is received
            // 2. Process the OAuth tokens
            // 3. Navigate to the appropriate page
            
            // Listen for browser close (user cancelled)
            const handleBrowserFinish = async () => {
              // User closed the browser manually
              setOauthLoading(null);
              Browser.removeAllListeners();
              
              toast({
                title: t('auth.authenticationCancelled'),
                description: t('auth.googleSignInCancelled'),
                variant: 'default',
              });
            };
            
            Browser.addListener('browserFinished', handleBrowserFinish);

            // Don't set loading to null here - wait for callback or browser close
            return;

          } catch (err: any) {
            console.error('❌ Safari View Controller error:', err);
            toast({
              title: 'Authentication Error',
              description: err?.message || 'Failed to open Google Sign-In',
              variant: 'destructive',
            });
            setOauthLoading(null);
          }
          return;
        }
        
        // For Google OAuth on Android: use native Google Sign-In (entirely in-app)
        // Uses signInWithIdToken like iOS Apple Sign-In does
        if (provider === 'google' && isNative && platform === 'android') {
          
          try {
            // Always use native Google Sign-In (entirely in-app, no browser)
            const { signInWithGoogleNative, isNativeGoogleAuthAvailable } = await import('@/utils/googleNativeAuth');
            const canUseNative = isNativeGoogleAuthAvailable();
            
            if (!canUseNative) {
              throw new Error('Native Google Sign-In is not available on this device');
            }

            const result = await signInWithGoogleNative();

            // Navigate FIRST for instant feedback (much faster on Android)
            setOauthLoading(null);
            if (result.needsProfileCompletion) {
              navigate('/complete-profile');
            } else {
              navigate('/');
            }

            // Save language in background (non-blocking)
            if (result?.user?.id) {
              saveLanguageToProfile(result.user.id).catch(err => 
                console.warn('Language save failed (non-critical):', err)
              );
            }
            return;
            
          } catch (androidErr: any) {
            console.error('❌ Android native Google Sign-In error:', androidErr);
            
            // Handle user cancellation gracefully
            if (androidErr.message?.includes('cancel')) {
              toast({
                title: t('auth.authenticationCancelled'),
                description: t('auth.googleSignInCancelled'),
                variant: 'default',
              });
            } else {
              toast({
                title: 'Authentication Error',
                description: androidErr?.message || 'Failed to sign in with Google. Please ensure you have Google Play Services installed.',
                variant: 'destructive',
              });
            }
            setOauthLoading(null);
            return;
          }
        }
        
        // For Web: use small modal-style popup window (feels like in-page modal)
        if (provider === 'google' && !isNative) {
          
          try {
            // Smaller, more modal-like dimensions
            const width = 450;
            const height = 550;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;
            
            // Open minimal popup (no browser chrome, looks like modal)
            const popup = window.open(
              'about:blank',
              'googleauth',
              `width=${width},height=${height},left=${left},top=${top},popup=1,toolbar=0,location=0,status=0,menubar=0,scrollbars=1,resizable=0`
            );

            if (!popup) {
              throw new Error('Popup blocked. Please allow popups for this site and try again.');
            }

            // Create overlay on main page to make it feel like a modal
            const overlay = document.createElement('div');
            overlay.id = 'oauth-overlay';
            overlay.style.cssText = `
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0, 0, 0, 0.75);
              z-index: 999998;
              display: flex;
              align-items: center;
              justify-content: center;
              backdrop-filter: blur(4px);
            `;
            
            const overlayMessage = document.createElement('div');
            overlayMessage.style.cssText = `
              background: white;
              padding: 32px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              text-align: center;
              max-width: 350px;
            `;
            overlayMessage.innerHTML = `
              <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
              <div style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">
                Sign in with Google
              </div>
              <div style="font-size: 14px; color: #6b7280;">
                Complete sign-in in the popup window
              </div>
            `;
            
            overlay.appendChild(overlayMessage);
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';

            const removeOverlay = () => {
              if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
              }
              document.body.style.overflow = '';
            };

            // Show loading message in popup
            popup.document.write(`
              <html>
                <head>
                  <style>
                    body {
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                    }
                    .loader {
                      text-align: center;
                    }
                    .spinner {
                      border: 4px solid rgba(255, 255, 255, 0.3);
                      border-top: 4px solid white;
                      border-radius: 50%;
                      width: 40px;
                      height: 40px;
                      animation: spin 1s linear infinite;
                      margin: 0 auto 20px;
                    }
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  </style>
                </head>
                <body>
                  <div class="loader">
                    <div class="spinner"></div>
                    <div>Opening Google Sign In...</div>
                  </div>
                </body>
              </html>
            `);

            // Generate the OAuth URL
            const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo,
                queryParams: {
                  prompt: 'select_account',
                  access_type: 'offline',
                },
                skipBrowserRedirect: true,
              }
            });

            if (oauthError || !oauthData?.url) {
              popup.close();
              throw new Error(oauthError?.message || 'Failed to generate OAuth URL');
            }

            // Navigate popup to OAuth URL
            popup.location.href = oauthData.url;

            // Poll for session while popup is open
            let sessionCheckInterval: NodeJS.Timeout | null = null;
            let hasProcessedSession = false;

            const checkForSession = async () => {
              if (hasProcessedSession) return;
              
              // Check if popup was closed
              if (popup.closed) {
                if (sessionCheckInterval) {
                  clearInterval(sessionCheckInterval);
                  sessionCheckInterval = null;
                }
                
                removeOverlay();
                
                if (!hasProcessedSession) {
                  toast({
                    title: t('auth.authenticationCancelled'),
                    description: t('auth.googleSignInCancelled'),
                    variant: 'default',
                  });
                  setOauthLoading(null);
                }
                return;
              }
              
              const { data: { session } } = await supabase.auth.getSession();
              
              if (session) {
                hasProcessedSession = true;
                
                // Clear interval
                if (sessionCheckInterval) {
                  clearInterval(sessionCheckInterval);
                  sessionCheckInterval = null;
                }
                
                // Remove overlay and close popup
                removeOverlay();
                
                // Close popup
                try {
                  popup.close();
                } catch (e) {
                  // Popup already closed
                }
                
                try {
                  // Check if profile exists (don't create it)
                  const profile = await checkProfileExists(session.user.id);
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  // Determine if profile needs completion
                  let needsProfileCompletion = false;
                  if (!profile) {
                    // No profile exists - user needs to complete profile
                    needsProfileCompletion = true;
                  } else {
                    // Profile exists - check if it's complete
                    needsProfileCompletion = !profile.first_name || 
                      profile.first_name === 'User' ||
                      !profile.bio || 
                      profile.date_of_birth === '1990-01-01' ||
                      !profile.city || 
                      profile.city === 'Unknown' ||
                      !profile.country;
                  }
                  
                  // Save current language to user's profile
                  await saveLanguageToProfile(session.user.id);
                  
                  await new Promise(resolve => setTimeout(resolve, 500));
                  setOauthLoading(null);
                  
                  // Navigate - main page stays, no redirect
                  if (needsProfileCompletion) {
                    navigate('/complete-profile');
                  } else {
                    navigate('/');
                  }
                } catch (error) {
                  console.error('Error during post-login processing:', error);
                  setOauthLoading(null);
                  navigate('/complete-profile');
                }
              }
            };

            // Start polling every 500ms
            sessionCheckInterval = setInterval(checkForSession, 500);

            return;

          } catch (err: any) {
            console.error('❌ Web popup OAuth error:', err);
            toast({
              title: 'Authentication Error',
              description: err?.message || 'Failed to open Google Sign-In popup',
              variant: 'destructive',
            });
            setOauthLoading(null);
          }
          return;
        }
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
      // Check for network connectivity first
      if (!navigator.onLine) {
        toast({
          title: t('auth.noConnection'),
          description: t('auth.checkConnection'),
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (isLogin) {
        // Login flow
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (authError) {
          // Check for network-related errors
          if (authError.message.includes('Failed to fetch') || 
              authError.message.includes('NetworkError') ||
              authError.message.includes('network') ||
              authError.message.includes('NETWORK') ||
              authError.message.includes('timeout') ||
              authError.message.includes('Unable to connect')) {
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
          
          // Show error toast
          toast({
            title: "Account Not Found",
            description: "This account doesn't exist in our system. Please register first.",
            variant: "destructive",
          });
          
          setLoading(false);
          
          // Redirect to welcome page after a short delay to show the toast
          setTimeout(() => {
            if (onBack) {
              onBack(); // Go back to welcome screen
            } else {
              window.location.href = '/'; // Force reload to landing page
            }
          }, 2000);
          return;
        }

        // Check account status
        if (profile.account_status === 'blocked') {
          await supabase.auth.signOut();
          toast({
            title: t('auth.accountBlocked'),
            description: t('auth.accountBlockedDesc'),
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        if (profile.account_status === 'on_hold') {
          await supabase.auth.signOut();
          toast({
            title: t('auth.accountOnHold'),
            description: t('auth.accountOnHoldDesc'),
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Save profile ID to session
        sessionStorage.setItem('profile_id', profile.id);

        // Save current language to user's profile
        await saveLanguageToProfile(authData.user.id);

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
      if (!navigator.onLine || 
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
            <CardDescription className="text-gray-600 text-sm">
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
              <Label htmlFor="email" className="text-sm font-medium">{t('auth.email')}</Label>
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
                className="text-pink-600 hover:text-pink-700 font-semibold transition-colors"
              >
                {t('auth.backToSignIn')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-sm font-semibold text-gray-700">{t('auth.email')}</Label>
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
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">{t('auth.password')}</Label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-pink-600 hover:text-pink-700 font-medium transition-colors"
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
                    value={formData.password}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    className={`mobile-input-field py-4 px-4 pr-12 border-gray-300 focus:border-pink-400 focus:ring-pink-400 rounded-xl text-base ${
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
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">{t('auth.confirmPassword')}</Label>
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
                      placeholder={t('auth.confirmYourPassword')}
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
                      {t('auth.processing')}
                    </div>
                  ) : isLogin ? t('auth.signIn') : t('auth.createAccount')}
                </Button>
              </div>
            </form>

            <div className="mt-6 text-center pb-4">
              <p className="text-base text-gray-600">
                {isLogin ? t('auth.dontHaveAccount') : t('auth.alreadyHaveAccount')}
                <button
                  onClick={onToggle}
                  className="ml-2 text-pink-600 hover:text-pink-700 font-bold transition-colors"
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


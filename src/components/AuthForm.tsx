
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { handleInputFocus, handleInputBlur, getInputStyles } from '@/utils/inputUtils';

interface AuthFormProps {
  isLogin: boolean;
  onToggle: () => void;
  onOAuthSuccess?: (needsCompletion: boolean) => void;
}

const AuthForm = ({ isLogin, onToggle, onOAuthSuccess }: AuthFormProps) => {
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
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

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

  const handleOAuthSignIn = async (provider: 'google') => {
    setOauthLoading(provider);
    
    try {
      // Import OAuth config
      const { getSupabaseAuthConfig } = await import('@/config/oauth');
      const authConfig = getSupabaseAuthConfig();
      
      console.log('OAuth config:', authConfig);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: authConfig
      });

      if (error) {
        console.error('OAuth error:', error);
        toast({
          title: "Authentication Error",
          description: error.message,
          variant: "destructive",
        });
        setOauthLoading(null);
        return;
      }

      // For mobile and web, the OAuth flow will redirect automatically
      console.log('OAuth initiated successfully, redirecting...');

    } catch (error: any) {
      console.error('OAuth error:', error);
      toast({
        title: "Authentication Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setOauthLoading(null);
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
    
    if (loading) return; // Prevent duplicate submissions
    
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

        if (authError || !authData.user) {
          toast({
            title: "Login Failed",
            description: authError?.message || 'Invalid credentials',
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
          // Try to create a basic profile for existing auth users
          const { error: createProfileError } = await supabase
            .from('profiles')
            .insert({
              id: authData.user.id,
              email: authData.user.email || '',
              first_name: 'User',
              last_name: 'Profile',
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
          
          if (createProfileError) {
            console.error('Failed to create profile:', createProfileError);
            await supabase.auth.signOut();
            toast({
              title: "Account Setup Failed",
              description: "Unable to set up your account. Please try registering again.",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
          
          // Use the newly created profile
          const newProfile = {
            id: authData.user.id,
            is_admin: false,
            account_status: 'active'
          };
          
          // Save profile ID to session
          sessionStorage.setItem('profile_id', newProfile.id);
          
          toast({
            title: "Welcome!",
            description: "Account setup completed successfully.",
          });
          
          navigate('/');
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
        // Registration flow
        const redirectUrl = `${window.location.origin}/`;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl
          }
        });

        if (authError) {
          // Handle specific case of user already registered
          if (authError.message.includes('User already registered')) {
            toast({
              title: "Account Already Exists",
              description: "An account with this email already exists. Please try logging in instead.",
              variant: "destructive",
            });
            // Switch to login mode
            onToggle();
          } else {
            toast({
              title: "Registration Failed",
              description: authError.message,
              variant: "destructive",
            });
          }
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

        // Check if email confirmation is required
        if (!authData.session) {
          // Even without a session, create the profile so user can login after email confirmation
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: authData.user.id,
              email: authData.user.email || email,
              first_name: 'User',
              last_name: 'Profile',
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
            console.error('Profile creation error:', profileError);
            // Don't fail the registration - user can still confirm email and login
          }

          toast({
            title: "Registration Successful",
            description: "Please check your email to confirm your account before signing in.",
          });
          setLoading(false);
          return;
        }

        // Create a basic profile for manual registration users
        // This allows them to skip the profile completion flow (which is only for Google OAuth)
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
          console.error('Profile creation error:', profileError);
          toast({
            title: "Registration Error",
            description: "Failed to create profile. Please try again.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        toast({
          title: "Registration Successful",
          description: "Account created successfully. Welcome to LoveConnect!",
        });

        // Navigate to home - user can update their profile later from the main app
        navigate('/');

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
    <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0">
      <CardHeader className="text-center pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
            <Heart className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </CardTitle>
        <CardDescription className="text-gray-600">
          {isLogin ? 'Sign in to your account' : 'Join LoveConnect today'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* OAuth Buttons */}
        <div className="space-y-3 mb-6">
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium border-2 border-gray-200 hover:border-gray-300 py-3 rounded-lg transition-all duration-200"
            onClick={() => handleOAuthSignIn('google')}
            disabled={oauthLoading !== null || loading}
          >
            {oauthLoading === 'google' ? (
              'Connecting...'
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
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

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${
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

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                className={`pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${
                  errors.password ? 'border-red-500 focus:border-red-500' : ''
                }`}
                style={getInputStyles()}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                  className={`pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${
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

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200"
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              onClick={onToggle}
              className="ml-2 text-pink-600 hover:text-pink-700 font-semibold transition-colors"
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuthForm;


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null);

  const handleOAuthSignIn = async (provider: 'google') => {
    setOauthLoading(provider);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        // Don't override redirectTo - let Supabase handle the callback
        // This will default to: https://tgjisyvihabsovironesw.supabase.co/auth/v1/callback
      });

      if (error) {
        toast({
          title: "Authentication Error",
          description: error.message,
          variant: "destructive",
        });
        setOauthLoading(null);
        return;
      }

      // OAuth will redirect to the callback URL, so we don't need to handle success here
      // The main app will handle the session when the user returns
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
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { email, password } = formData;

    try {
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

      // Check account status and show appropriate messages
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

      setLoading(false);
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        title: "Login Error",
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
                className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                placeholder="Enter your email"
                required
              />
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
                className="pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
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
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
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


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
  onAuthSuccess: (user: any) => void;
}

const AuthForm = ({ onAuthSuccess }: AuthFormProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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

      // Check account status
      if (profile.account_status === 'on_hold') {
        await supabase.auth.signOut();
        toast({
          title: "Account on Hold",
          description: "Your account is on hold. Please contact support.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

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

      // Save profile ID to session
      sessionStorage.setItem('profile_id', profile.id);

      toast({
        title: "Welcome back!",
        description: "You've been successfully logged in.",
      });

      onAuthSuccess(authData.user);
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
          Welcome Back
        </CardTitle>
        <CardDescription className="text-gray-600">
          Sign in to your account
        </CardDescription>
      </CardHeader>

      <CardContent>
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
                className="pl-10 pr-10 border-gray-200 focus:border-pink-400 focus: ring-pink-400"
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
            {loading ? 'Processing...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?
            <button
              onClick={() => navigate('/register')}
              className="ml-2 text-pink-600 hover:text-pink-700 font-semibold transition-colors"
            >
              Sign Up
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuthForm;

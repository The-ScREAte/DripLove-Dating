import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle } from 'lucide-react';

const InfluencerSetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCodeInfo, setPromoCodeInfo] = useState<{ code: string; ownerName: string } | null>(null);
  
  const token = searchParams.get('token');
  const promoCodeId = searchParams.get('id');

  useEffect(() => {
    // Validate token and get promo code info
    const validateToken = async () => {
      if (!token || !promoCodeId) {
        setError('Invalid or missing link. Please request a new password setup link.');
        return;
      }

      try {
        // Fetch promo code to verify it exists and token matches
        const { data, error: fetchError } = await supabase
          .from('promo_codes')
          .select('id, code, owner_name, password_hash, status')
          .eq('id', promoCodeId)
          .single();

        if (fetchError || !data) {
          setError('Invalid link. The promo code does not exist.');
          return;
        }

        // Check if password is already set AND status is active (fully configured)
        if (data.password_hash && data.password_hash !== token && data.status === 'active') {
          setError('Password has already been set. Please use the login page.');
          return;
        }

        // If status is pending_password, allow resetting even if password was changed
        // This fixes the case where password was set but status wasn't updated
        if (data.status !== 'pending_password' && data.password_hash !== token) {
          setError('Invalid or expired token. Please request a new password setup link.');
          return;
        }

        setPromoCodeInfo({ code: data.code, ownerName: data.owner_name });
      } catch (err) {
        console.error('Error validating token:', err);
        setError('Something went wrong. Please try again later.');
      }
    };

    validateToken();
  }, [token, promoCodeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Update the password and status in the database
      // Note: We only check the ID, not the token, to allow status updates even if password was already changed
      const { error: updateError, data: updateData } = await supabase
        .from('promo_codes')
        .update({ 
          password_hash: password,
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', promoCodeId)
        .select();

      if (updateError) {
        throw updateError;
      }

      if (!updateData || updateData.length === 0) {
        throw new Error('Failed to update promo code. Please contact support.');
      }

      setSuccess(true);
      toast({ title: 'Success', description: 'Your password has been set successfully!' });
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/influencer');
      }, 3000);
    } catch (err) {
      console.error('Error setting password:', err);
      toast({ title: 'Error', description: 'Failed to set password. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Invalid Link</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => navigate('/influencer')} variant="outline">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Password Set Successfully!</h2>
            <p className="text-gray-600 mb-4">
              You can now login to your influencer portal using your promo code and password.
            </p>
            <p className="text-sm text-gray-500">Redirecting to login...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!promoCodeInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl">Set Your Password</CardTitle>
          <CardDescription>
            Welcome, <span className="font-semibold">{promoCodeInfo.ownerName}</span>!<br />
            Create a secure password for your influencer account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center mb-4">
              <p className="text-sm text-gray-600">Your Promo Code</p>
              <p className="text-xl font-bold text-pink-600">{promoCodeInfo.code}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-sm text-red-500">Passwords do not match</p>
            )}

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              disabled={loading || password !== confirmPassword || password.length < 6}
            >
              {loading ? 'Setting Password...' : 'Set Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default InfluencerSetPassword;

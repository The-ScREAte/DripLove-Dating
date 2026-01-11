import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Gift, 
  LogIn, 
  LogOut, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Percent,
  Clock,
  CheckCircle,
  Crown,
  Wallet,
  Eye,
  EyeOff
} from 'lucide-react';

interface InfluencerSession {
  promo_code_id: string;
  code: string;
  owner_name: string;
  email?: string;
  percentage_cut: number;
  commission_duration: number;
  status: string;
  total_signups: number;
  total_subscribers: number;
  total_commission: number;
  total_commission_usd: number;
  has_pending_payout: boolean;
}

const InfluencerPortal = () => {
  const { toast } = useToast();
  const [session, setSession] = useState<InfluencerSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Login form state
  const [promoCode, setPromoCode] = useState('');
  const [password, setPassword] = useState('');
  
  // Dashboard state
  const [payoutAmount, setPayoutAmount] = useState('');
  const [requestingPayout, setRequestingPayout] = useState(false);

  // Check for existing session on mount (display-only, no auto-refresh with credentials)
  useEffect(() => {
    const savedSession = localStorage.getItem('influencer_session');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        // Only restore the session display data - no password stored
        // User will see cached data but needs to refresh/re-login for updates
        if (parsed.promo_code_id && parsed.code && parsed.owner_name) {
          setSession({
            promo_code_id: parsed.promo_code_id,
            code: parsed.code,
            owner_name: parsed.owner_name,
            email: parsed.email,
            percentage_cut: parsed.percentage_cut || 0,
            commission_duration: parsed.commission_duration || 0,
            status: parsed.status || 'active',
            total_signups: parsed.total_signups || 0,
            total_subscribers: parsed.total_subscribers || 0,
            total_commission: parsed.total_commission || 0,
            total_commission_usd: parsed.total_commission_usd || 0,
            has_pending_payout: parsed.has_pending_payout || false
          });
        }
      } catch (e) {
        localStorage.removeItem('influencer_session');
      }
    }
  }, []);

  // Update local session data from API response (no credentials stored)
  const updateSessionFromResult = (result: any) => {
    const sessionData: InfluencerSession = {
      promo_code_id: result.promo_code_id,
      code: result.code,
      owner_name: result.owner_name,
      email: result.email,
      percentage_cut: result.percentage_cut,
      commission_duration: result.commission_duration,
      status: result.status,
      total_signups: result.total_signups,
      total_subscribers: result.total_subscribers,
      total_commission: result.total_commission || 0,
      total_commission_usd: result.total_commission_usd || 0,
      has_pending_payout: result.has_pending_payout
    };
    
    setSession(sessionData);
    // Store session data WITHOUT password - secure storage
    localStorage.setItem('influencer_session', JSON.stringify(sessionData));
    return sessionData;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!promoCode.trim() || !password.trim()) {
      toast({ 
        title: 'Error', 
        description: 'Please enter promo code and password', 
        variant: 'destructive' 
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('influencer_login', {
        code_input: promoCode.trim(),
        password_input: password
      });

      if (error) throw error;

      const result = data as any;
      
      if (result.success) {
        updateSessionFromResult(result);
        
        toast({ title: 'Welcome!', description: `Logged in as ${result.owner_name}` });
      } else {
        toast({ 
          title: 'Login Failed', 
          description: result.error || 'Invalid credentials', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({ 
        title: 'Error', 
        description: 'Login failed. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setPromoCode('');
    setPassword('');
    localStorage.removeItem('influencer_session');
    toast({ title: 'Logged out', description: 'You have been logged out successfully.' });
  };

  const handleRequestPayout = async () => {
    if (!session) return;
    
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ 
        title: 'Error', 
        description: 'Please enter a valid amount', 
        variant: 'destructive' 
      });
      return;
    }

    if (amount > session.total_commission) {
      toast({ 
        title: 'Error', 
        description: 'Amount exceeds available balance', 
        variant: 'destructive' 
      });
      return;
    }

    setRequestingPayout(true);
    try {
      const { data, error } = await supabase.rpc('request_influencer_payout', {
        p_promo_code_id: session.promo_code_id,
        p_amount: amount
      });

      if (error) throw error;

      const result = data as any;
      
      if (result.success) {
        toast({ title: 'Success', description: 'Payout request submitted!' });
        setPayoutAmount('');
        // Update has_pending_payout in local state
        setSession(prev => prev ? { ...prev, has_pending_payout: true } : null);
      } else {
        toast({ 
          title: 'Error', 
          description: result.error || 'Could not submit request', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      console.error('Payout request error:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to submit payout request', 
        variant: 'destructive' 
      });
    } finally {
      setRequestingPayout(false);
    }
  };

  // Login Page
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
              <Gift className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Influencer Portal</CardTitle>
            <p className="text-gray-500 text-sm mt-2">
              Login with your promo code to view your stats and commissions
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="promoCode">Promo Code</Label>
                <Input
                  id="promoCode"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Enter your promo code"
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Logging in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Login
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <Card>
          <CardContent className="py-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Welcome back,</p>
                <h1 className="text-xl font-bold">{session.owner_name}</h1>
                {session.email && (
                  <p className="text-xs text-gray-500">{session.email}</p>
                )}
                <Badge className="mt-1 bg-pink-100 text-pink-800">
                  Code: {session.code}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Commission Info */}
        <Card className="border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50">
          <CardContent className="py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-pink-500" />
                <span className="font-medium">Commission Rate</span>
              </div>
              <span className="text-xl font-bold text-pink-600">{session.percentage_cut}%</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <span className="font-medium">Duration</span>
              </div>
              <span className="text-lg font-semibold text-purple-600">{session.commission_duration}x per user</span>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="py-4 text-center">
              <Users className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-600">{session.total_signups}</p>
              <p className="text-xs text-gray-500">Total Signups</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <Crown className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-yellow-600">{session.total_subscribers}</p>
              <p className="text-xs text-gray-500">Premium Users</p>
            </CardContent>
          </Card>
        </div>

        {/* Earnings */}
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              Total Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-green-600">
                ${session.total_commission_usd.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">
                (GHS {session.total_commission.toFixed(2)})
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Earned from {session.total_subscribers} premium subscribers
            </p>
            <div className="mt-3 p-2 bg-white/60 rounded-lg border border-green-200">
              <p className="text-xs text-green-700">
                💰 You earn <span className="font-bold">{session.percentage_cut}%</span> of each payment for up to <span className="font-bold">{session.commission_duration}</span> months per user
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Payout Request */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-purple-500" />
              Request Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {session.has_pending_payout ? (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-800">Payout Pending</p>
                  <p className="text-xs text-yellow-600">Your request is being processed</p>
                </div>
              </div>
            ) : session.total_commission > 0 ? (
              <>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="Amount to withdraw"
                    min="1"
                    max={session.total_commission}
                  />
                  <Button 
                    onClick={handleRequestPayout}
                    disabled={requestingPayout || !payoutAmount}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {requestingPayout ? 'Submitting...' : 'Request'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Available balance: ${session.total_commission_usd.toFixed(2)} (GHS {session.total_commission.toFixed(2)})
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">
                No earnings available for payout yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="py-4">
            <h3 className="font-semibold text-blue-800 mb-2">💡 Tips to Earn More</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Share your code <span className="font-bold">{session.code}</span> on social media</li>
              <li>• Encourage users to go premium for better matches</li>
              <li>• Create content about your positive experience</li>
            </ul>
          </CardContent>
        </Card>

        {/* Refresh Button */}
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => refreshSession(session.code)}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh Stats'}
        </Button>
      </div>
    </div>
  );
};

export default InfluencerPortal;

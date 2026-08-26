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

interface ReferredUser {
  first_name: string;
  last_initial: string | null;
  signup_date: string;
  is_subscribed: boolean;
}

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
  total_commission_ghs_raw?: number;
  total_paid_ghs: number;
  total_paid_usd: number;
  outstanding_ghs: number;
  outstanding_usd: number;
  exchange_rate: number;
  has_pending_payout: boolean;
}

const InfluencerPortal = () => {
  const { toast } = useToast();
  const [session, setSession] = useState<InfluencerSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sessionPassword, setSessionPassword] = useState('');
  
  // Login form state
  const [promoCode, setPromoCode] = useState('');
  const [password, setPassword] = useState('');
  
  // Dashboard state
  const [payoutAmount, setPayoutAmount] = useState('');
  const [requestingPayout, setRequestingPayout] = useState(false);

  // Referred users (who signed up with this code, and whether they've
  // subscribed yet) - fetched separately since it's not part of the
  // aggregate stats returned by influencer_login.
  const [referredUsers, setReferredUsers] = useState<ReferredUser[] | null>(null);
  const [loadingReferredUsers, setLoadingReferredUsers] = useState(false);

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
            total_commission_ghs_raw: parsed.total_commission_ghs_raw,
            total_paid_ghs: parsed.total_paid_ghs || 0,
            total_paid_usd: parsed.total_paid_usd || 0,
            outstanding_ghs: parsed.outstanding_ghs || 0,
            outstanding_usd: parsed.outstanding_usd || 0,
            exchange_rate: parsed.exchange_rate || 16,
            has_pending_payout: parsed.has_pending_payout || false
          });
        }
      } catch (e) {
        localStorage.removeItem('influencer_session');
      }
    }
  }, []);

  // Update local session data from the influencer_login RPC response. Every
  // number here (commission, paid, outstanding, and the exchange rate used to
  // derive the USD figures) comes straight from get_influencer_full_stats on
  // the server - the same function the admin dashboard now calls too, and the
  // same one request_influencer_payout validates a withdrawal amount against.
  // Previously this recomputed "paid"/"available" from a separate client-side
  // payout_requests query using a live, independently-fetched exchange rate,
  // which could drift from the server's rate and made it possible to see an
  // "available" balance the payout RPC wouldn't actually accept.
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
      total_commission: result.total_commission_ghs_raw ?? result.total_commission ?? 0,
      total_commission_usd: result.total_commission_usd ?? 0,
      total_commission_ghs_raw: result.total_commission_ghs_raw ?? result.total_commission ?? 0,
      total_paid_ghs: result.total_paid_ghs ?? 0,
      total_paid_usd: result.total_paid_usd ?? 0,
      outstanding_ghs: result.outstanding_ghs ?? 0,
      outstanding_usd: result.outstanding_usd ?? 0,
      exchange_rate: result.exchange_rate ?? 16,
      has_pending_payout: result.has_pending_payout
    };

    setSession(sessionData);
    // Store session data WITHOUT password - secure storage
    localStorage.setItem('influencer_session', JSON.stringify(sessionData));

    return sessionData;
  };

  const fetchReferredUsers = async (code: string, passwordToUse: string) => {
    setLoadingReferredUsers(true);
    try {
      const { data, error } = await supabase.rpc('get_influencer_referred_users', {
        p_code: code,
        p_password: passwordToUse,
      });

      if (error) throw error;

      const result = data as unknown as { success: boolean; referred_users?: ReferredUser[]; error?: string };
      if (result.success) {
        setReferredUsers(result.referred_users || []);
      }
    } catch (err) {
      console.error('Error fetching referred users:', err);
    } finally {
      setLoadingReferredUsers(false);
    }
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
        setSessionPassword(password);
        fetchReferredUsers(promoCode.trim(), password);

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
    setSessionPassword('');
    setReferredUsers(null);
    localStorage.removeItem('influencer_session');
    toast({ title: 'Logged out', description: 'You have been logged out successfully.' });
  };

  const refreshStats = async () => {
    if (!session) return;
    const passwordToUse = sessionPassword || password;
    if (!passwordToUse) {
      // Auto-logout and redirect to login
      handleLogout();
      toast({
        title: 'Session expired',
        description: 'Please log in again.',
        variant: 'destructive'
      });
      return;
    }

    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc('influencer_login', {
        code_input: session.code,
        password_input: passwordToUse
      });

      if (error) throw error;

      const result = data as any;
      if (result.success) {
        updateSessionFromResult(result);
        fetchReferredUsers(session.code, passwordToUse);
        toast({ title: 'Stats refreshed', description: 'Latest totals loaded.' });
      } else {
        // Auto-logout on refresh failure
        handleLogout();
        toast({
          title: 'Session expired',
          description: result.error || 'Please log in again.',
          variant: 'destructive'
        });
        return;
      }
    } catch (err) {
      console.error('Refresh error:', err);
      // Auto-logout on error
      handleLogout();
      toast({
        title: 'Session expired',
        description: 'Please log in again.',
        variant: 'destructive'
      });
      return;
    } finally {
      setRefreshing(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!session) return;

    // The payout amount is entered in USD (matching the "Available (USD)" figure
    // shown above it), but everything downstream - influencer_commissions,
    // promo_codes.total_commission_earned, and what the admin dashboard displays
    // - is denominated in GHS. Convert using the exact rate the server itself
    // computed this session's balances with, so what the user sees as
    // "available" always matches what request_influencer_payout will accept.
    const passwordToUse = sessionPassword || password;
    if (!passwordToUse) {
      toast({
        title: 'Session expired',
        description: 'Please log in again to request a payout.',
        variant: 'destructive'
      });
      handleLogout();
      return;
    }

    const amountUsd = parseFloat(payoutAmount);
    if (isNaN(amountUsd) || amountUsd <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid amount',
        variant: 'destructive'
      });
      return;
    }

    if (amountUsd > session.outstanding_usd) {
      toast({
        title: 'Error',
        description: `Amount exceeds available balance ($${session.outstanding_usd.toFixed(2)})`,
        variant: 'destructive'
      });
      return;
    }

    const amountGhs = Math.round(amountUsd * session.exchange_rate * 100) / 100;

    setRequestingPayout(true);
    try {
      const { data, error } = await supabase.rpc('request_influencer_payout', {
        p_code: session.code,
        p_password: passwordToUse,
        p_amount_ghs: amountGhs
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
      <div className="max-w-md mx-auto space-y-4 pb-20">
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshStats}
                  disabled={refreshing}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
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
            <div className="mt-3 p-2 bg-white/60 rounded-lg border border-pink-200">
              <p className="text-xs text-pink-700">
                💰 You earn <span className="font-bold">{session.percentage_cut}%</span> of each payment for up to <span className="font-bold">{session.commission_duration}</span> months per user
              </p>
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

        {/* Referred Users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              People Who Used Your Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingReferredUsers ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !referredUsers || referredUsers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-2">
                No signups yet. Share your code to get started!
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {referredUsers.map((u, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <p className="font-medium">
                        {u.first_name}{u.last_initial ? ` ${u.last_initial}.` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        Signed up {new Date(u.signup_date).toLocaleDateString()}
                      </p>
                    </div>
                    {u.is_subscribed ? (
                      <Badge className="bg-green-100 text-green-800">
                        <Crown className="w-3 h-3 mr-1" /> Subscribed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">
                        Not yet
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Earned from {session.total_subscribers} premium subscribers
            </p>
            
            {/* Financial Breakdown */}
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm p-2 bg-white/60 rounded border border-green-200">
                <span className="text-gray-600">💰 Total Earned (USD):</span>
                <span className="font-bold text-green-700">${session.total_commission_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm p-2 bg-white/60 rounded border border-blue-200">
                <span className="text-gray-600">✅ Paid Out (USD):</span>
                <span className="font-semibold text-blue-700">${session.total_paid_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm p-2 bg-white/60 rounded border border-orange-200">
                <span className="text-gray-600">💵 Available (USD):</span>
                <span className="font-bold text-orange-700">${session.outstanding_usd.toFixed(2)}</span>
              </div>
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
            ) : session.outstanding_usd > 0 ? (
              <>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="Amount to withdraw (USD)"
                    min="1"
                    max={session.outstanding_usd}
                    step="0.01"
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
                  Available to withdraw: ${session.outstanding_usd.toFixed(2)}
                </p>
                {session.total_paid_usd > 0 && (
                  <p className="text-xs text-blue-600">
                    ✓ Already paid out: ${session.total_paid_usd.toFixed(2)}
                  </p>
                )}
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

        {/* Re-login Button - since we no longer cache passwords */}
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleLogout}
        >
          Re-login to Refresh Stats
        </Button>
      </div>
    </div>
  );
};

export default InfluencerPortal;

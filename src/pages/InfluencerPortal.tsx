import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Gift,
  LogIn,
  LogOut,
  Users,
  Clock,
  Crown,
  Eye,
  EyeOff,
  RefreshCw,
  FileText
} from 'lucide-react';

interface DemographicBucket {
  label: string;
  count: number;
}

interface InfluencerSession {
  promo_code_id: string;
  code: string;
  owner_name: string;
  email?: string;
  percentage_cut: number;
  commission_duration: number;
  commission_enabled: boolean;
  show_leads_enabled: boolean;
  show_subscribers_enabled: boolean;
  show_demographics_enabled: boolean;
  terms_accepted_at: string | null;
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

const PIE_COLORS = ['#ec4899', '#a855f7', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#6366f1'];

// Pie chart (pure CSS conic-gradient, no charting library) with a
// color-keyed legend listing each category's share and raw count.
const DemographicPie = ({ title, buckets }: { title: string; buckets: DemographicBucket[] | null }) => {
  if (!buckets || buckets.length === 0) return null;
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return null;

  let cumulative = 0;
  const gradientStops = buckets
    .map((b, i) => {
      const start = (cumulative / total) * 360;
      cumulative += b.count;
      const end = (cumulative / total) * 360;
      return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}deg ${end}deg`;
    })
    .join(', ');

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-full shrink-0 shadow-sm"
          style={{ background: buckets.length > 1 ? `conic-gradient(${gradientStops})` : PIE_COLORS[0] }}
        />
        <div className="flex-1 space-y-1.5 min-w-0">
          {buckets.map((b, i) => {
            const pct = Math.round((b.count / total) * 100);
            return (
              <div key={b.label} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-gray-700 truncate flex-1">{b.label}</span>
                <span className="text-gray-400 shrink-0">{pct}%</span>
                <span className="font-medium text-gray-900 w-5 text-right shrink-0">{b.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

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

  // Terms & Conditions - forced open (non-dismissible) on first login until
  // agreed; reopenable any time afterward via the header button.
  const [showTerms, setShowTerms] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [acceptingTerms, setAcceptingTerms] = useState(false);
  const termsRequired = !!session && !session.terms_accepted_at;

  useEffect(() => {
    if (termsRequired) {
      setShowTerms(true);
      setTermsChecked(false);
    }
  }, [termsRequired]);

  // Gender/age breakdown of everyone who used this code (the leads) - fetched
  // separately since it's not part of the aggregate stats returned by
  // influencer_login. Aggregate only, no individual names - more useful to a
  // promoter than a raw name list (which just duplicated the leads count) and
  // more private for the people who signed up.
  const [genderBreakdown, setGenderBreakdown] = useState<DemographicBucket[] | null>(null);
  const [ageBreakdown, setAgeBreakdown] = useState<DemographicBucket[] | null>(null);
  const [locationBreakdown, setLocationBreakdown] = useState<DemographicBucket[] | null>(null);
  const [loadingDemographics, setLoadingDemographics] = useState(false);

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
            commission_enabled: parsed.commission_enabled ?? true,
            show_leads_enabled: parsed.show_leads_enabled ?? true,
            show_subscribers_enabled: parsed.show_subscribers_enabled ?? true,
            show_demographics_enabled: parsed.show_demographics_enabled ?? true,
            terms_accepted_at: parsed.terms_accepted_at ?? null,
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
      commission_enabled: result.commission_enabled ?? true,
      show_leads_enabled: result.show_leads_enabled ?? true,
      show_subscribers_enabled: result.show_subscribers_enabled ?? true,
      show_demographics_enabled: result.show_demographics_enabled ?? true,
      terms_accepted_at: result.terms_accepted_at ?? null,
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

  const fetchLeadDemographics = async (code: string, passwordToUse: string) => {
    setLoadingDemographics(true);
    try {
      const { data, error } = await supabase.rpc('get_influencer_lead_demographics', {
        p_code: code,
        p_password: passwordToUse,
      });

      if (error) throw error;

      const result = data as unknown as { success: boolean; gender?: DemographicBucket[]; age_groups?: DemographicBucket[]; location?: DemographicBucket[]; error?: string };
      if (result.success) {
        setGenderBreakdown(result.gender || []);
        setAgeBreakdown(result.age_groups || []);
        setLocationBreakdown(result.location || []);
      }
    } catch (err) {
      console.error('Error fetching lead demographics:', err);
    } finally {
      setLoadingDemographics(false);
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
        if (result.show_demographics_enabled ?? true) {
          fetchLeadDemographics(promoCode.trim(), password);
        }

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
    setGenderBreakdown(null);
    setAgeBreakdown(null);
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
        if (result.show_demographics_enabled ?? true) {
          fetchLeadDemographics(session.code, passwordToUse);
        }
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

  const handleAcceptTerms = async () => {
    if (!session || !termsChecked) return;
    const passwordToUse = sessionPassword || password;
    if (!passwordToUse) {
      toast({ title: 'Session expired', description: 'Please log in again.', variant: 'destructive' });
      handleLogout();
      return;
    }

    setAcceptingTerms(true);
    try {
      const { data, error } = await supabase.rpc('accept_influencer_terms', {
        p_code: session.code,
        p_password: passwordToUse,
      });

      if (error) throw error;

      const result = data as { success: boolean; terms_accepted_at?: string; error?: string };
      if (!result.success) throw new Error(result.error || 'Failed to record acceptance');

      setSession(prev => {
        if (!prev) return prev;
        const updated = { ...prev, terms_accepted_at: result.terms_accepted_at ?? new Date().toISOString() };
        localStorage.setItem('influencer_session', JSON.stringify(updated));
        return updated;
      });
      setShowTerms(false);
    } catch (err) {
      console.error('Error accepting terms:', err);
      toast({ title: 'Error', description: 'Failed to record your acceptance. Please try again.', variant: 'destructive' });
    } finally {
      setAcceptingTerms(false);
    }
  };

  // Login Page
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white text-black">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
              <Gift className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Promoter Portal</CardTitle>
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
                  className="bg-white text-black placeholder:text-black"
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
                    className="bg-white text-black placeholder:text-black"
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

  const showPerformance = session.show_leads_enabled || session.show_subscribers_enabled;
  const nothingToShow = !session.commission_enabled && !showPerformance && !session.show_demographics_enabled;

  // Dashboard
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-12">
        {/* Header */}
        <Card className="border-t-4 border-t-pink-500 overflow-hidden bg-white text-black">
          <CardContent className="py-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Welcome back,</p>
                <h1 className="text-xl font-bold text-gray-900">{session.owner_name}</h1>
                {session.email && (
                  <p className="text-xs text-gray-500">{session.email}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="bg-white border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                <LogOut className="w-4 h-4 mr-1.5" /> Log Out
              </Button>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <Badge className="font-mono text-xs bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-50">{session.code}</Badge>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTerms(true)}
                  className="h-8 text-xs bg-white border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Terms
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshStats}
                  disabled={refreshing}
                  className="h-8 text-xs bg-white border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance - leads/subscribers, whichever the admin has shared */}
        {showPerformance && (
          <Card className="bg-white text-black">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Your Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid gap-3 ${session.show_leads_enabled && session.show_subscribers_enabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {session.show_leads_enabled && (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 py-3 text-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-1.5">
                      <Users className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{session.total_signups}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Leads</p>
                  </div>
                )}
                {session.show_subscribers_enabled && (
                  <div className="rounded-lg bg-amber-50 border border-amber-100 py-3 text-center">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-1.5">
                      <Crown className="w-4 h-4 text-amber-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{session.total_subscribers}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Subscribers</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lead Demographics - who's using the code, by gender and age group.
            Aggregate only (no names) - covers every lead (all referrals),
            not just subscribers. Gated on its own admin toggle, independent
            of the plain leads count above. */}
        {session.show_demographics_enabled && (
          <Card className="bg-white text-black">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Lead Demographics</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDemographics ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : session.total_signups === 0 ? (
                <p className="text-sm text-gray-500 text-center py-2">
                  No signups yet. Share your code to get started.
                </p>
              ) : (
                <div className="space-y-5">
                  <DemographicPie title="Gender" buckets={genderBreakdown} />
                  <DemographicPie title="Age" buckets={ageBreakdown} />
                  <DemographicPie title="Location" buckets={locationBreakdown} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Earnings + Payout - only for promoters with commission activated */}
        {session.commission_enabled && (
          <Card className="bg-white text-black">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700 flex items-center justify-between">
                <span>Earnings</span>
                <span className="text-xs font-normal text-gray-500">
                  {session.percentage_cut}% for {session.commission_duration} month{session.commission_duration === 1 ? '' : 's'} per user
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm py-1.5 border-b">
                  <span className="text-gray-500">Total earned</span>
                  <span className="font-semibold text-gray-900">${session.total_commission_usd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm py-1.5 border-b">
                  <span className="text-gray-500">Paid out</span>
                  <span className="font-medium text-gray-700">${session.total_paid_usd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm py-1.5">
                  <span className="text-gray-500">Available</span>
                  <span className="font-bold text-green-600">${session.outstanding_usd.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t">
                {session.has_pending_payout ? (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">Payout request pending review</p>
                  </div>
                ) : session.outstanding_usd > 0 ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        placeholder="Amount (USD)"
                        min="1"
                        max={session.outstanding_usd}
                        step="0.01"
                        className="bg-white text-black placeholder:text-black"
                      />
                      <Button
                        onClick={handleRequestPayout}
                        disabled={requestingPayout || !payoutAmount}
                        className="bg-pink-600 hover:bg-pink-700 shrink-0"
                      >
                        {requestingPayout ? 'Submitting…' : 'Request Payout'}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">Up to ${session.outstanding_usd.toFixed(2)} available</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center">No earnings available for payout yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {nothingToShow && (
          <Card className="bg-white text-black">
            <CardContent className="py-6 text-center text-sm text-gray-500">
              Your code is active and your referrals are being tracked. Reach out to the DripLove team for more details.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Terms & Conditions - forced open (no escape/outside-click dismiss)
          on first login until agreed; a normal, freely-dismissible dialog on
          every later open via the header button. */}
      <Dialog open={showTerms} onOpenChange={(open) => { if (termsRequired && !open) return; setShowTerms(open); }}>
        <DialogContent
          className="max-h-[80dvh] flex flex-col"
          onEscapeKeyDown={(e) => { if (termsRequired) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (termsRequired) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-pink-600">
              <FileText className="w-5 h-5 text-pink-500 shrink-0" />
              <span>DripLove — Content Recording &amp; Publishing</span>
            </DialogTitle>
            <p className="text-sm text-gray-500">Terms &amp; Conditions for Promoters</p>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 text-sm text-gray-700 space-y-4">
            <p>
              Every promoter has their own style, and DripLove doesn't dictate how you create — your setup,
              environment, tone, and format are entirely up to you. If DripLove does give you specific instructions
              or talking points for a piece of content, you're expected to follow them; outside of that, create
              however works best for you.
            </p>

            <p>
              The one thing we ask is that you don't put yourself or DripLove at legal or reputational risk.
              Concretely, that means: don't make false, exaggerated, or misleading claims about the app; disclose
              sponsored or paid content the way the law requires (e.g. <strong>#ad</strong> or a verbal
              disclosure); don't feature or expose other people's personal information without their consent; and
              don't post anything that misrepresents DripLove or breaks the rules of the platform you're posting
              on.
            </p>

            <p>
              <strong>Content that creates legal exposure or seriously misrepresents DripLove may be taken down,
              and serious or repeated violations can result in removal from the program and forfeiture of pending
              compensation.</strong> Outside of that, we trust you to represent yourself and DripLove well.
            </p>

            <p className="text-xs text-gray-500 pt-2 border-t">
              These Terms &amp; Conditions are incorporated by reference into your Promoter Agreement with Screate
              LLC.
            </p>
          </div>
          <div className="pt-3 border-t space-y-3">
            {termsRequired ? (
              <>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={termsChecked} onCheckedChange={(checked) => setTermsChecked(checked === true)} className="mt-0.5" />
                  <span className="text-gray-700">I have read and agree to the Terms &amp; Conditions above.</span>
                </label>
                <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:space-x-0">
                  <Button
                    onClick={handleAcceptTerms}
                    disabled={!termsChecked || acceptingTerms}
                    className="w-full bg-pink-600 hover:bg-pink-700"
                  >
                    {acceptingTerms ? 'Saving…' : 'Agree & Continue'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  You agreed to these terms on {session.terms_accepted_at ? new Date(session.terms_accepted_at).toLocaleDateString() : '—'}.
                </p>
                <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:space-x-0">
                  <Button variant="outline" className="bg-white" onClick={() => setShowTerms(false)}>Close</Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfluencerPortal;

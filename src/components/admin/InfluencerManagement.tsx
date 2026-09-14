import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { usePromoCodeEnabled, togglePromoCodeEnabled } from '@/hooks/usePromoCodeEnabled';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  Ban,
  CheckCircle,
  XCircle,
  Clock,
  Gift,
  Percent,
  Copy,
  Link,
  ToggleLeft,
  AlertCircle,
  Wallet
} from 'lucide-react';

// Promoter setup links always point at the real production domain,
// regardless of where the admin happens to be running this page from
// (localhost, a preview deploy, etc). Using window.location.origin here
// used to bake in whatever the admin was browsing on at that moment -
// a promoter opening that link on their own phone or laptop would get
// "invalid link" (or nothing at all) since localhost/preview URLs mean
// nothing off the admin's own machine.
const PRODUCTION_APP_URL = 'https://www.driplove.love';

interface PromoCode {
  id: string;
  code: string;
  owner_name: string;
  percentage_cut: number;
  commission_duration: number;
  commission_enabled: boolean;
  show_leads_enabled: boolean;
  show_subscribers_enabled: boolean;
  show_demographics_enabled: boolean;
  status: string;
  is_active: boolean;
  total_signups: number;
  total_paid_subscribers: number;
  total_commission_earned: number;
  created_at: string;
  deleted_at: string | null;
}

interface PayoutRequest {
  id: string;
  promo_code_id: string;
  amount: number;
  status: string;
  admin_notes: string | null;
  created_at: string;
  promo_code?: PromoCode;
}

const InfluencerManagement = () => {
  const { toast } = useToast();
  const { isEnabled: promoCodeEnabled, loading: promoCodeLoading } = usePromoCodeEnabled();
  const [promoCodeToggle, setPromoCodeToggle] = useState(false);
  const [togglingPromoCode, setTogglingPromoCode] = useState(false);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPromoCode, setSelectedPromoCode] = useState<PromoCode | null>(null);
  const [detailStats, setDetailStats] = useState<any>(null);
  const [passwordSetupLink, setPasswordSetupLink] = useState<string | null>(null);
  const [payoutStats, setPayoutStats] = useState<{[key: string]: {totalPaid: number, outstanding: number, pendingRequests: number}}>({});

  // Sync local toggle state with fetched value
  useEffect(() => {
    if (!promoCodeLoading) {
      setPromoCodeToggle(promoCodeEnabled);
    }
  }, [promoCodeEnabled, promoCodeLoading]);

  const handleTogglePromoCode = async () => {
    setTogglingPromoCode(true);
    const newValue = !promoCodeToggle;
    const success = await togglePromoCodeEnabled(newValue);
    if (success) {
      setPromoCodeToggle(newValue);
      toast({ 
        title: newValue ? 'Promo Code Enabled' : 'Promo Code Disabled',
        description: newValue 
          ? 'Promo code input will now appear on registration and profile completion forms.' 
          : 'Promo code input is now hidden from all forms (Apple App Store compliant).'
      });
    } else {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    }
    setTogglingPromoCode(false);
  };
  
  // Form state
  const [formData, setFormData] = useState({
    code: '',
    ownerName: '',
    email: '',
    password: '',
    percentageCut: '20',
    commissionDuration: '1',
    commissionEnabled: true,
    showLeadsEnabled: true,
    showSubscribersEnabled: true,
    showDemographicsEnabled: true
  });

  const fetchPromoCodes = useCallback(async () => {
    try {
      // password_hash is intentionally excluded - it's no longer client-readable
      // (column-level SELECT was revoked from authenticated/anon) and isn't
      // needed here anyway.
      const { data, error } = await supabase
        .from('promo_codes')
        .select('id, code, owner_name, email, percentage_cut, commission_duration, commission_enabled, show_leads_enabled, show_subscribers_enabled, show_demographics_enabled, status, is_active, total_signups, total_paid_subscribers, total_commission_earned, created_at, deleted_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Stats (signups, subscribers, commission, payouts) come from the same
      // canonical get_influencer_full_stats RPC the influencer portal itself
      // uses, so admin and influencer-facing numbers can never drift apart.
      const codesWithStats = await Promise.all((data || []).map(async (code) => {
        const { data: stats, error: statsError } = await supabase.rpc('get_influencer_full_stats', {
          p_promo_code_id: code.id,
        });

        if (statsError || !stats) {
          console.error('Error fetching stats for promo code:', code.id, statsError);
          return { ...code, total_signups: 0, total_paid_subscribers: 0, total_commission_earned: 0 };
        }

        const s = stats as {
          total_signups: number;
          total_subscribers: number;
          total_commission_ghs: number;
          total_paid_ghs: number;
          outstanding_ghs: number;
          pending_requests: number;
        };

        setPayoutStats(prev => ({
          ...prev,
          [code.id]: {
            totalPaid: s.total_paid_ghs || 0,
            outstanding: s.outstanding_ghs || 0,
            pendingRequests: s.pending_requests || 0,
          }
        }));

        return {
          ...code,
          total_signups: s.total_signups || 0,
          total_paid_subscribers: s.total_subscribers || 0,
          total_commission_earned: s.total_commission_ghs || 0,
        };
      }));

      setPromoCodes(codesWithStats);
    } catch (error) {
      console.error('Error fetching promo codes:', error);
      toast({ title: 'Error', description: 'Failed to fetch promo codes', variant: 'destructive' });
    }
  }, [toast]);

  const fetchPayoutRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('payout_requests')
        .select(`
          *,
          promo_codes (
            code,
            owner_name
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayoutRequests(data || []);
    } catch (error) {
      console.error('Error fetching payout requests:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPromoCodes(), fetchPayoutRequests()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPromoCodes, fetchPayoutRequests]);

  const handleCreatePromoCode = async () => {
    if (!formData.code.trim() || !formData.ownerName.trim() || !formData.email.trim()) {
      toast({ title: 'Error', description: 'Please fill all required fields (code, name, email)', variant: 'destructive' });
      return;
    }

    try {
      // Check if code already exists among ACTIVE (non-deleted) codes - a
      // soft-deleted influencer's old code (deleted_at set, see handleDelete
      // below) must be reusable, matching the DB's partial unique index.
      const { data: existing } = await supabase
        .from('promo_codes')
        .select('id')
        .ilike('code', formData.code.trim())
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        toast({ title: 'Error', description: 'This promo code already exists', variant: 'destructive' });
        return;
      }

      // Generate a unique token for password setup
      const token = crypto.randomUUID();

      // Create promo code with token as temporary password_hash
      const { data: newPromoCode, error } = await supabase
        .from('promo_codes')
        .insert({
          code: formData.code.trim().toUpperCase(),
          owner_name: formData.ownerName.trim(),
          email: formData.email.trim(),
          password_hash: token, // Token will be replaced when user sets password
          percentage_cut: parseFloat(formData.percentageCut),
          commission_duration: parseInt(formData.commissionDuration),
          commission_enabled: formData.commissionEnabled,
          show_leads_enabled: formData.showLeadsEnabled,
          show_subscribers_enabled: formData.showSubscribersEnabled,
          show_demographics_enabled: formData.showDemographicsEnabled,
          status: 'pending_password',
          is_active: true
        })
        .select('id')
        .single();

      if (error) throw error;

      // Generate the password setup link for the admin to share
      const appUrl = PRODUCTION_APP_URL;
      const setupLink = `${appUrl}/influencer/set-password?id=${newPromoCode.id}&token=${encodeURIComponent(token)}`;
      setPasswordSetupLink(setupLink);

      // Best-effort - the admin can also always pull up (and re-send) this
      // link later via the "Setup Link" button while the promoter is still
      // pending_password, so a failure here isn't fatal to the creation flow.
      supabase.functions.invoke('notify-promoter-created', {
        body: { promoCodeId: newPromoCode.id },
      }).then(({ error: emailError }) => {
        if (emailError) console.error('Failed to email promoter setup link:', emailError);
      });

      toast({ title: 'Success', description: 'Promoter created! Setup link emailed to them (and shown below to share yourself).' });
      setFormData({ code: '', ownerName: '', email: '', password: '', percentageCut: '20', commissionDuration: '1', commissionEnabled: true, showLeadsEnabled: true, showSubscribersEnabled: true, showDemographicsEnabled: true });
      fetchPromoCodes();
    } catch (error) {
      console.error('Error creating promo code:', error);
      toast({ title: 'Error', description: 'Failed to create promo code', variant: 'destructive' });
    }
  };

  const [fetchingSetupLinkFor, setFetchingSetupLinkFor] = useState<string | null>(null);

  const handleGetSetupLink = async (promoCode: PromoCode) => {
    setFetchingSetupLinkFor(promoCode.id);
    try {
      const { data, error } = await supabase.rpc('admin_get_promo_setup_link', {
        p_promo_code_id: promoCode.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; token?: string; error?: string };
      if (!result.success || !result.token) {
        throw new Error(result.error || 'Failed to generate setup link');
      }

      const appUrl = PRODUCTION_APP_URL;
      setPasswordSetupLink(`${appUrl}/influencer/set-password?id=${promoCode.id}&token=${encodeURIComponent(result.token)}`);

      // Best-effort resend - the new token above was already regenerated
      // regardless of whether the email succeeds.
      supabase.functions.invoke('notify-promoter-created', {
        body: { promoCodeId: promoCode.id },
      }).then(({ error: emailError }) => {
        if (emailError) console.error('Failed to email promoter setup link:', emailError);
      });

      toast({ title: 'Setup link ready', description: 'A fresh link was generated and emailed to the promoter.' });
      fetchPromoCodes();
    } catch (error) {
      console.error('Error fetching setup link:', error);
      toast({ title: 'Error', description: 'Failed to generate setup link', variant: 'destructive' });
    } finally {
      setFetchingSetupLinkFor(null);
    }
  };

  const copySetupLink = () => {
    if (passwordSetupLink) {
      navigator.clipboard.writeText(passwordSetupLink);
      toast({ title: 'Copied!', description: 'Link copied to clipboard. Share it with the influencer.' });
    }
  };

  const closeSetupLinkDialog = () => {
    setPasswordSetupLink(null);
    setShowCreateModal(false);
  };

  const handleUpdatePromoCode = async () => {
    if (!selectedPromoCode) return;

    const newPassword = formData.password.trim();
    if (newPassword && newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    try {
      const updateData: any = {
        owner_name: formData.ownerName.trim(),
        email: formData.email.trim() || null,
        percentage_cut: parseFloat(formData.percentageCut),
        commission_duration: parseInt(formData.commissionDuration),
        commission_enabled: formData.commissionEnabled,
        show_leads_enabled: formData.showLeadsEnabled,
        show_subscribers_enabled: formData.showSubscribersEnabled,
        show_demographics_enabled: formData.showDemographicsEnabled
      };

      const { error } = await supabase
        .from('promo_codes')
        .update(updateData)
        .eq('id', selectedPromoCode.id);

      if (error) throw error;

      // Password changes go through a SECURITY DEFINER RPC that hashes with
      // bcrypt server-side - promo_codes.password_hash is never written
      // directly from the client anymore.
      if (newPassword) {
        const { data: pwResult, error: pwError } = await supabase.rpc('admin_set_influencer_password', {
          p_promo_code_id: selectedPromoCode.id,
          p_new_password: newPassword,
        });

        const result = pwResult as { success: boolean; error?: string } | null;
        if (pwError || !result?.success) {
          throw new Error(result?.error || pwError?.message || 'Failed to update password');
        }
      }

      toast({ title: 'Success', description: 'Promo code updated successfully' });
      setShowEditModal(false);
      setSelectedPromoCode(null);
      fetchPromoCodes();
    } catch (error) {
      console.error('Error updating promo code:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to update promo code', variant: 'destructive' });
    }
  };

  const handleStatusChange = async (promoCode: PromoCode, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('promo_codes')
        .update({ 
          status: newStatus,
          is_active: newStatus === 'active'
        })
        .eq('id', promoCode.id);

      if (error) throw error;

      toast({ title: 'Success', description: `Promo code ${newStatus === 'active' ? 'activated' : newStatus === 'blocked' ? 'blocked' : 'deactivated'}` });
      fetchPromoCodes();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDelete = async (promoCode: PromoCode) => {
    if (!confirm(`Are you sure you want to delete the promo code "${promoCode.code}"?`)) return;

    try {
      // Soft delete
      const { error } = await supabase
        .from('promo_codes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', promoCode.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Promo code deleted' });
      fetchPromoCodes();
    } catch (error) {
      console.error('Error deleting promo code:', error);
      toast({ title: 'Error', description: 'Failed to delete promo code', variant: 'destructive' });
    }
  };

  const handleViewDetails = async (promoCode: PromoCode) => {
    setSelectedPromoCode(promoCode);

    try {
      // Fetch detailed stats
      const [{ data: referrals }, { data: commissions }, { data: payouts }, { data: stats }] = await Promise.all([
        supabase
          .from('referrals')
          .select(`
            id,
            user_id,
            created_at,
            user_deleted_at,
            profiles (
              first_name,
              last_name,
              email
            )
          `)
          .eq('promo_code_id', promoCode.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('influencer_commissions')
          .select('*')
          .eq('promo_code_id', promoCode.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('payout_requests')
          .select('*')
          .eq('promo_code_id', promoCode.id)
          .order('created_at', { ascending: false }),
        // Authoritative totals - same RPC the influencer portal uses, so this
        // modal can never disagree with what the influencer sees.
        supabase.rpc('get_influencer_full_stats', { p_promo_code_id: promoCode.id }),
      ]);

      setDetailStats({
        referrals: referrals || [],
        commissions: commissions || [],
        payouts: payouts || [],
        stats: stats || null,
      });

      setShowDetailModal(true);
    } catch (error) {
      console.error('Error fetching details:', error);
      toast({ title: 'Error', description: 'Failed to load details', variant: 'destructive' });
    }
  };

  const handlePayoutAction = async (payoutId: string, action: 'completed' | 'rejected', notes?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('payout_requests')
        .update({
          status: action,
          admin_notes: notes || null,
          processed_by: user?.id,
          processed_at: new Date().toISOString()
        })
        .eq('id', payoutId);

      if (error) throw error;

      toast({ title: 'Success', description: `Payout ${action}` });
      fetchPayoutRequests();
      fetchPromoCodes();
      if (selectedPromoCode) {
        handleViewDetails(selectedPromoCode);
      }
    } catch (error) {
      console.error('Error processing payout:', error);
      toast({ title: 'Error', description: 'Failed to process payout', variant: 'destructive' });
    }
  };

  const openEditModal = (promoCode: PromoCode) => {
    setSelectedPromoCode(promoCode);
    setFormData({
      code: promoCode.code,
      ownerName: promoCode.owner_name,
      email: (promoCode as any).email || '',
      password: '',
      percentageCut: promoCode.percentage_cut.toString(),
      commissionDuration: promoCode.commission_duration.toString(),
      commissionEnabled: promoCode.commission_enabled,
      showLeadsEnabled: promoCode.show_leads_enabled,
      showSubscribersEnabled: promoCode.show_subscribers_enabled,
      showDemographicsEnabled: promoCode.show_demographics_enabled
    });
    setShowEditModal(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="w-3 h-3 mr-1" />Inactive</Badge>;
      case 'blocked':
        return <Badge className="bg-red-100 text-red-800"><Ban className="w-3 h-3 mr-1" />Blocked</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Gift className="w-5 h-5 text-pink-500" />
          Promoter Management
        </h2>
        <Button onClick={() => setShowCreateModal(true)} size="sm" className="h-8 px-2.5 text-xs bg-pink-500 hover:bg-pink-600">
          <Plus className="w-3.5 h-3.5 mr-1" /> New Promo Code
        </Button>
      </div>

      {/* Promo Code Toggle for Apple Compliance */}
      <Card className={promoCodeToggle ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${promoCodeToggle ? 'bg-green-100' : 'bg-amber-100'}`}>
                <ToggleLeft className={`w-5 h-5 ${promoCodeToggle ? 'text-green-600' : 'text-amber-600'}`} />
              </div>
              <div>
                <p className={`font-medium ${promoCodeToggle ? 'text-green-800' : 'text-amber-800'}`}>
                  Promo Code Input on Forms
                </p>
                <p className={`text-xs ${promoCodeToggle ? 'text-green-600' : 'text-amber-600'}`}>
                  {promoCodeToggle 
                    ? 'Visible on registration & profile completion' 
                    : 'Hidden for Apple App Store compliance'}
                </p>
              </div>
            </div>
            <Switch
              checked={promoCodeToggle}
              onCheckedChange={handleTogglePromoCode}
              disabled={togglingPromoCode || promoCodeLoading}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
            />
          </div>
          {!promoCodeToggle && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-100 p-2 rounded">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Keep disabled when submitting to Apple App Store to comply with Guideline 3.1.1</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Payouts Alert */}
      {payoutRequests.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-orange-800">
              <Clock className="w-4 h-4" />
              <span className="font-medium">{payoutRequests.length} pending payout request(s)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-pink-600">{promoCodes.length}</p>
            <p className="text-xs text-gray-500">Total Codes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-green-600">
              {promoCodes.reduce((sum, p) => sum + (p.total_signups || 0), 0)}
            </p>
            <p className="text-xs text-gray-500">Total Signups</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              GHS {promoCodes.reduce((sum, p) => sum + (p.total_commission_earned || 0), 0).toFixed(2)}
            </p>
            <p className="text-xs text-gray-500">Commission Paid</p>
          </CardContent>
        </Card>
      </div>

      {/* Promo Codes List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Promo Codes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {promoCodes.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No promo codes yet</p>
          ) : (
            promoCodes.map((promo) => (
              <div key={promo.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg">{promo.code}</p>
                    <p className="text-sm text-gray-600">{promo.owner_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getStatusBadge(promo.status)}
                    <div className="flex gap-1">
                      {!promo.commission_enabled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-300 text-gray-500">No commission</Badge>
                      )}
                      {!promo.show_leads_enabled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-300 text-gray-500">Leads hidden</Badge>
                      )}
                      {!promo.show_subscribers_enabled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-300 text-gray-500">Subscribers hidden</Badge>
                      )}
                      {!promo.show_demographics_enabled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-300 text-gray-500">Demographics hidden</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="font-semibold">{promo.commission_enabled ? `${promo.percentage_cut}%` : '—'}</p>
                    <p className="text-gray-500">Commission</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="font-semibold">{promo.commission_enabled ? `${promo.commission_duration}x` : '—'}</p>
                    <p className="text-gray-500">Duration</p>
                  </div>
                  <div className="text-center p-2 bg-blue-50 rounded">
                    <p className="font-semibold text-blue-600">{promo.total_signups}</p>
                    <p className="text-gray-500">Signups</p>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded">
                    <p className="font-semibold text-green-600">{promo.total_paid_subscribers}</p>
                    <p className="text-gray-500">Premium</p>
                  </div>
                </div>

                <div className="text-xs space-y-1">
                  {promo.commission_enabled && (
                    <div>
                      Total Earned: <span className="font-semibold text-green-600">GHS {(promo.total_commission_earned || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {promo.commission_enabled && payoutStats[promo.id] && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Paid Out:</span>
                        <span className="font-medium text-blue-600">GHS {payoutStats[promo.id].totalPaid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Outstanding:</span>
                        <span className="font-medium text-orange-600">GHS {payoutStats[promo.id].outstanding.toFixed(2)}</span>
                      </div>
                      {payoutStats[promo.id].pendingRequests > 0 && (
                        <div className="flex items-center gap-1 text-orange-600">
                          <Clock className="w-3 h-3" />
                          <span>{payoutStats[promo.id].pendingRequests} pending request(s)</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 pt-2 border-t">
                  <Button size="icon" variant="outline" className="h-7 w-7" title="View details" aria-label="View details" onClick={() => handleViewDetails(promo)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" title="Edit" aria-label="Edit" onClick={() => openEditModal(promo)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  {promo.status === 'pending_password' && (
                    <>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 text-pink-600 border-pink-200"
                        title="Resend password setup invite"
                        aria-label="Resend password setup invite"
                        onClick={() => handleGetSetupLink(promo)}
                        disabled={fetchingSetupLinkFor === promo.id}
                      >
                        {fetchingSetupLinkFor === promo.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Link className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 text-green-600"
                        title="Activate without password (code works right away, they just won't be able to log in to the portal)"
                        aria-label="Activate without password"
                        onClick={() => handleStatusChange(promo, 'active')}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  {promo.status === 'active' ? (
                    <Button size="icon" variant="outline" className="h-7 w-7" title="Deactivate" aria-label="Deactivate" onClick={() => handleStatusChange(promo, 'inactive')}>
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  ) : promo.status === 'inactive' ? (
                    <Button size="icon" variant="outline" className="h-7 w-7" title="Activate" aria-label="Activate" onClick={() => handleStatusChange(promo, 'active')}>
                      <CheckCircle className="w-3.5 h-3.5" />
                    </Button>
                  ) : promo.status === 'blocked' ? (
                    <Button size="icon" variant="outline" className="h-7 w-7 text-green-600" title="Unblock" aria-label="Unblock" onClick={() => handleStatusChange(promo, 'active')}>
                      <CheckCircle className="w-3.5 h-3.5" />
                    </Button>
                  ) : null}
                  <Button size="icon" variant="outline" className="h-7 w-7 text-orange-600" title="Block" aria-label="Block" onClick={() => handleStatusChange(promo, 'blocked')}>
                    <Ban className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7 text-red-600" title="Delete" aria-label="Delete" onClick={() => handleDelete(promo)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md w-[calc(100%-3rem)] max-h-[80vh] overflow-y-auto px-5">
          <DialogHeader>
            <DialogTitle>Create New Promo Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Promo Code *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="e.g., PROMO20"
              />
            </div>
            <div>
              <Label>Promoter Name *</Label>
              <Input
                value={formData.ownerName}
                onChange={(e) => setFormData(prev => ({ ...prev, ownerName: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="promoter@email.com"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Activate Promo Percentage</p>
                <p className="text-xs text-gray-500">
                  On: this promoter earns commission and sees earnings/payout in their portal.
                  Off: their code is still tracked for leads &amp; subscribers only.
                </p>
              </div>
              <Switch
                checked={formData.commissionEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, commissionEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>

            {formData.commissionEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Commission % *</Label>
                  <Input
                    type="number"
                    value={formData.percentageCut}
                    onChange={(e) => setFormData(prev => ({ ...prev, percentageCut: e.target.value }))}
                    min="1"
                    max="100"
                  />
                </div>
                <div>
                  <Label>Months Available *</Label>
                  <Select
                    value={formData.commissionDuration}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, commissionDuration: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 month (one-time)</SelectItem>
                      <SelectItem value="2">2 months</SelectItem>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Show Leads to Promoter</p>
                <p className="text-xs text-gray-500">
                  On: they can see their signup count and the list of people who used their code.
                  Off: hidden from their portal (you still see it here as admin).
                </p>
              </div>
              <Switch
                checked={formData.showLeadsEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showLeadsEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Show Subscribers to Promoter</p>
                <p className="text-xs text-gray-500">
                  On: they can see how many of their referrals went premium.
                  Off: hidden from their portal (you still see it here as admin).
                </p>
              </div>
              <Switch
                checked={formData.showSubscribersEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showSubscribersEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Show Lead Demographics</p>
                <p className="text-xs text-gray-500">
                  On: they can see a gender/age breakdown of their leads.
                  Off: hidden from their portal (you still see it here as admin).
                </p>
              </div>
              <Switch
                checked={formData.showDemographicsEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showDemographicsEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:space-x-0">
            <Button size="sm" variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreatePromoCode} className="bg-pink-500 hover:bg-pink-600">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Promo Code: {selectedPromoCode?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Promoter Name *</Label>
              <Input
                value={formData.ownerName}
                onChange={(e) => setFormData(prev => ({ ...prev, ownerName: e.target.value }))}
              />
            </div>
            <div>
              <Label>Email (Optional)</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="promoter@email.com"
              />
            </div>
            <div>
              <Label>New Password (leave empty to keep current)</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Enter new password"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Activate Promo Percentage</p>
                <p className="text-xs text-gray-500">
                  On: this promoter earns commission and sees earnings/payout in their portal.
                  Off: their code is still tracked for leads &amp; subscribers only.
                </p>
              </div>
              <Switch
                checked={formData.commissionEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, commissionEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>

            {formData.commissionEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Commission %</Label>
                  <Input
                    type="number"
                    value={formData.percentageCut}
                    onChange={(e) => setFormData(prev => ({ ...prev, percentageCut: e.target.value }))}
                    min="1"
                    max="100"
                  />
                </div>
                <div>
                  <Label>Months Available</Label>
                  <Select
                    value={formData.commissionDuration}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, commissionDuration: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 month (one-time)</SelectItem>
                      <SelectItem value="2">2 months</SelectItem>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Show Leads to Promoter</p>
                <p className="text-xs text-gray-500">
                  On: they can see their signup count and the list of people who used their code.
                  Off: hidden from their portal (you still see it here as admin).
                </p>
              </div>
              <Switch
                checked={formData.showLeadsEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showLeadsEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Show Subscribers to Promoter</p>
                <p className="text-xs text-gray-500">
                  On: they can see how many of their referrals went premium.
                  Off: hidden from their portal (you still see it here as admin).
                </p>
              </div>
              <Switch
                checked={formData.showSubscribersEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showSubscribersEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Show Lead Demographics</p>
                <p className="text-xs text-gray-500">
                  On: they can see a gender/age breakdown of their leads.
                  Off: hidden from their portal (you still see it here as admin).
                </p>
              </div>
              <Switch
                checked={formData.showDemographicsEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showDemographicsEnabled: checked }))}
              className="h-5 w-9 data-[state=checked]:bg-pink-500 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:space-x-0">
            <Button size="sm" variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleUpdatePromoCode} className="bg-pink-500 hover:bg-pink-600">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPromoCode?.code} - {selectedPromoCode?.owner_name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedPromoCode && detailStats && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{detailStats.referrals.length}</p>
                  <p className="text-xs text-gray-500">Total Signups</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-600">{selectedPromoCode.total_paid_subscribers}</p>
                  <p className="text-xs text-gray-500">Premium Users</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center col-span-2">
                  <p className="text-2xl font-bold text-gray-600">
                    {detailStats.referrals.filter((r: any) => r.user_deleted_at).length}
                  </p>
                  <p className="text-xs text-gray-500">Deleted Leads (still counted in Total Signups)</p>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="border rounded-lg p-3 bg-gradient-to-br from-green-50 to-emerald-50">
                <h4 className="font-semibold text-sm mb-3 text-green-800">Financial Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Commission Earned:</span>
                    <span className="font-bold text-green-700">
                      GHS {Number(detailStats.stats?.total_commission_ghs || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Paid Out:</span>
                    <span className="font-semibold text-blue-600">
                      GHS {Number(detailStats.stats?.total_paid_ghs || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-green-200">
                    <span className="font-medium text-gray-700">Outstanding Balance:</span>
                    <span className="font-bold text-orange-600">
                      GHS {Number(detailStats.stats?.outstanding_ghs || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payout Requests */}
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Payout Requests
                  {detailStats.payouts.filter((p: any) => p.status === 'pending').length > 0 && (
                    <Badge className="bg-orange-100 text-orange-800">
                      {detailStats.payouts.filter((p: any) => p.status === 'pending').length} Pending
                    </Badge>
                  )}
                </h4>
                {detailStats.payouts.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">No payout requests yet</p>
                ) : (
                  <div className="space-y-2">
                    {detailStats.payouts.map((payout: any) => (
                      <div key={payout.id} className="border rounded p-3 text-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-lg">GHS {Number(payout.amount).toFixed(2)}</span>
                          <Badge 
                            variant={payout.status === 'pending' ? 'outline' : payout.status === 'completed' ? 'default' : 'destructive'}
                            className={
                              payout.status === 'pending' ? 'bg-orange-100 text-orange-800' :
                              payout.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }
                          >
                            {payout.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                            {payout.status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                            {payout.status === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
                            {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          Requested: {new Date(payout.created_at).toLocaleString()}
                        </p>
                        {payout.processed_at && (
                          <p className="text-xs text-gray-500">
                            Processed: {new Date(payout.processed_at).toLocaleString()}
                          </p>
                        )}
                        {payout.admin_notes && (
                          <p className="text-xs text-gray-600 mt-1 italic">Note: {payout.admin_notes}</p>
                        )}
                        {payout.status === 'pending' && (
                          <div className="flex items-center gap-1 mt-2">
                            <Button size="icon" className="h-7 w-7 bg-green-500 hover:bg-green-600" title="Approve & Mark Paid" onClick={() => handlePayoutAction(payout.id, 'completed')}>
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-7 w-7" title="Reject" onClick={() => handlePayoutAction(payout.id, 'rejected')}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Commission History */}
              <div>
                <h4 className="font-semibold text-sm mb-2">Commission History</h4>
                {detailStats.commissions.length === 0 ? (
                  <p className="text-sm text-gray-500">No commissions yet</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {detailStats.commissions.slice(0, 10).map((comm: any) => (
                      <div key={comm.id} className="flex justify-between text-xs border-b py-1">
                        <span>Payment #{comm.deduction_number}</span>
                        <span className="text-green-600">GHS {Number(comm.commission_amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Referred Users */}
              <div>
                <h4 className="font-semibold text-sm mb-2">Referred Users ({detailStats.referrals.length})</h4>
                {detailStats.referrals.length === 0 ? (
                  <p className="text-sm text-gray-500">No referrals yet</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {detailStats.referrals.slice(0, 10).map((ref: any) => (
                      <div key={ref.id} className="flex justify-between items-center text-xs border-b py-1.5 gap-2">
                        {ref.user_deleted_at ? (
                          <span className="flex items-center gap-1.5 text-gray-500">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-300">Account deleted</Badge>
                            <span className="text-gray-400">
                              on {new Date(ref.user_deleted_at).toLocaleDateString()}
                            </span>
                          </span>
                        ) : (
                          <span>{ref.profiles?.first_name} {ref.profiles?.last_name}</span>
                        )}
                        <span className="text-gray-500 shrink-0">Signed up {new Date(ref.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Setup Link Dialog */}
      <Dialog open={!!passwordSetupLink} onOpenChange={() => setPasswordSetupLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-pink-500" />
              Password Setup Link
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Share this link with the influencer. They will use it to set their password and access their portal.
            </p>
            <div className="p-3 bg-gray-100 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Setup Link</p>
              <p className="text-sm font-mono break-all select-all">{passwordSetupLink}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={copySetupLink} className="flex-1 bg-pink-500 hover:bg-pink-600">
                <Copy className="w-4 h-4 mr-2" /> Copy Link
              </Button>
              <Button variant="outline" onClick={closeSetupLinkDialog}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfluencerManagement;

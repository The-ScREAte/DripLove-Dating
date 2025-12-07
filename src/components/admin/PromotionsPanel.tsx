import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Plus, 
  Trash2, 
  Users, 
  Crown, 
  DollarSign, 
  Percent,
  Tag,
  TrendingUp
} from 'lucide-react';

interface PromoCode {
  id: string;
  code: string;
  owner_name: string;
  percentage_cut: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PromoStats {
  code: string;
  owner_name: string;
  percentage_cut: number;
  is_active: boolean;
  total_registrations: number;
  total_premium_users: number;
  total_commission: number;
}

interface PromotionsPanelProps {
  premiumPrice: number;
}

const PromotionsPanel = ({ premiumPrice }: PromotionsPanelProps) => {
  const { toast } = useToast();
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoStats, setPromoStats] = useState<PromoStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newPercentageCut, setNewPercentageCut] = useState('20');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPromoCodes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPromoCodes(data || []);
    } catch (error) {
      console.error('Error fetching promo codes:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch promo codes',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const fetchPromoStats = useCallback(async () => {
    try {
      // Get all promo codes with their stats
      const { data: codes, error: codesError } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (codesError) throw codesError;

      // Get registration counts for each promo code
      const statsPromises = (codes || []).map(async (code) => {
        // Count users who registered with this promo code
        const { count: registrationCount, error: regError } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('promo_code_used', code.code);

        if (regError) console.error('Error counting registrations:', regError);

        // Count premium users who used this promo code (first month only - checking if they have an active subscription)
        const { data: premiumUsers, error: premiumError } = await supabase
          .from('profiles')
          .select(`
            id,
            user_subscriptions!inner(plan_name, status, payment_method)
          `)
          .eq('promo_code_used', code.code)
          .eq('user_subscriptions.plan_name', 'premium')
          .eq('user_subscriptions.status', 'active');

        if (premiumError) console.error('Error counting premium users:', premiumError);

        const premiumCount = premiumUsers?.length || 0;
        const commission = premiumCount * premiumPrice * (code.percentage_cut / 100);

        return {
          code: code.code,
          owner_name: code.owner_name,
          percentage_cut: code.percentage_cut,
          is_active: code.is_active,
          total_registrations: registrationCount || 0,
          total_premium_users: premiumCount,
          total_commission: commission
        };
      });

      const stats = await Promise.all(statsPromises);
      setPromoStats(stats);
    } catch (error) {
      console.error('Error fetching promo stats:', error);
    }
  }, [premiumPrice]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPromoCodes(), fetchPromoStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPromoCodes, fetchPromoStats]);

  const handleCreatePromoCode = async () => {
    if (!newCode.trim() || !newOwnerName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase
        .from('promo_codes')
        .insert({
          code: newCode.toUpperCase().trim(),
          owner_name: newOwnerName.trim(),
          percentage_cut: parseFloat(newPercentageCut) || 20
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Promo code "${newCode.toUpperCase()}" created successfully`
      });

      setNewCode('');
      setNewOwnerName('');
      setNewPercentageCut('20');
      setShowCreateForm(false);
      await Promise.all([fetchPromoCodes(), fetchPromoStats()]);
    } catch (error: any) {
      console.error('Error creating promo code:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create promo code',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    setTogglingId(id);
    try {
      const { error } = await supabase
        .from('promo_codes')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Promo code ${!currentStatus ? 'activated' : 'deactivated'}`
      });

      await Promise.all([fetchPromoCodes(), fetchPromoStats()]);
    } catch (error) {
      console.error('Error toggling promo code:', error);
      toast({
        title: 'Error',
        description: 'Failed to update promo code',
        variant: 'destructive'
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeletePromoCode = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promo code?')) return;

    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Promo code deleted successfully'
      });

      await Promise.all([fetchPromoCodes(), fetchPromoStats()]);
    } catch (error) {
      console.error('Error deleting promo code:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete promo code',
        variant: 'destructive'
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Calculate totals
  const totalRegistrations = promoStats.reduce((sum, s) => sum + s.total_registrations, 0);
  const totalPremiumUsers = promoStats.reduce((sum, s) => sum + s.total_premium_users, 0);
  const totalCommission = promoStats.reduce((sum, s) => sum + s.total_commission, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Tag className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-600 font-medium">Active Codes</p>
                <p className="text-2xl font-bold text-blue-800">
                  {promoCodes.filter(p => p.is_active).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-600 font-medium">Total Signups</p>
                <p className="text-2xl font-bold text-green-800">{totalRegistrations}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-purple-600 font-medium">Premium Conversions</p>
                <p className="text-2xl font-bold text-purple-800">{totalPremiumUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500 rounded-lg">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-yellow-600 font-medium">Total Commission Due</p>
                <p className="text-2xl font-bold text-yellow-800">${totalCommission.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create New Promo Code */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Promo Code Management
          </CardTitle>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Code
          </Button>
        </CardHeader>
        <CardContent>
          {showCreateForm && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <h4 className="font-semibold mb-4 text-gray-700">Create New Promo Code</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Promo Code *
                  </label>
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="e.g., DEAN2025"
                    className="uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Influencer Name *
                  </label>
                  <Input
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    placeholder="e.g., Dean Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Commission % *
                  </label>
                  <Input
                    type="number"
                    value={newPercentageCut}
                    onChange={(e) => setNewPercentageCut(e.target.value)}
                    min="0"
                    max="100"
                    placeholder="20"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    onClick={handleCreatePromoCode}
                    disabled={creating}
                    className="bg-green-500 hover:bg-green-600"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Promo Codes Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Code</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Influencer</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Commission</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Signups</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Premium</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Earnings</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promoStats.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No promo codes yet. Create one to get started!
                    </td>
                  </tr>
                ) : (
                  promoStats.map((stat) => {
                    const promoCode = promoCodes.find(p => p.code === stat.code);
                    if (!promoCode) return null;

                    return (
                      <tr key={promoCode.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="font-mono font-bold">
                            {stat.code}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {stat.owner_name}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className="bg-purple-100 text-purple-700">
                            <Percent className="w-3 h-3 mr-1" />
                            {stat.percentage_cut}%
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="flex items-center justify-center gap-1 text-blue-600 font-medium">
                            <Users className="w-4 h-4" />
                            {stat.total_registrations}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="flex items-center justify-center gap-1 text-purple-600 font-medium">
                            <Crown className="w-4 h-4" />
                            {stat.total_premium_users}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="flex items-center justify-center gap-1 text-green-600 font-bold">
                            <DollarSign className="w-4 h-4" />
                            {stat.total_commission.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={stat.is_active}
                              onCheckedChange={() => handleToggleActive(promoCode.id, stat.is_active)}
                              disabled={togglingId === promoCode.id}
                            />
                            <span className={`text-xs font-medium ${stat.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                              {stat.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePromoCode(promoCode.id)}
                            disabled={deletingId === promoCode.id}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Commission Breakdown */}
      {promoStats.some(s => s.total_commission > 0) && (
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <TrendingUp className="w-5 h-5" />
              Payout Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {promoStats
                .filter(s => s.total_commission > 0)
                .map((stat) => (
                  <div key={stat.code} className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                    <div>
                      <span className="font-medium text-gray-800">{stat.owner_name}</span>
                      <span className="text-sm text-gray-500 ml-2">({stat.code})</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        {stat.total_premium_users} × ${premiumPrice} × {stat.percentage_cut}%
                      </p>
                      <p className="text-lg font-bold text-green-600">
                        ${stat.total_commission.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PromotionsPanel;

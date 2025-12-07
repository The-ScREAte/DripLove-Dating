import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Gift, 
  Plus, 
  Trash2, 
  Users, 
  Crown, 
  DollarSign,
  RefreshCw,
  Percent
} from 'lucide-react';

interface PromoCode {
  id: string;
  code: string;
  owner_name: string;
  percentage_cut: number;
  is_active: boolean;
  created_at: string;
  // Calculated stats
  total_signups: number;
  premium_signups: number;
  commission_earned: number;
}

interface PromotionsManagementProps {
  premiumPrice?: number;
}

const PromotionsManagement: React.FC<PromotionsManagementProps> = ({ premiumPrice = 3 }) => {
  const { toast } = useToast();
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  // New promo code form
  const [newCode, setNewCode] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newPercentageCut, setNewPercentageCut] = useState('20');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchPromoCodes = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all promo codes
      const { data: codes, error: codesError } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (codesError) throw codesError;

      if (!codes || codes.length === 0) {
        setPromoCodes([]);
        return;
      }

      // Fetch user signups per promo code
      const { data: signups, error: signupsError } = await supabase
        .from('profiles')
        .select('promo_code_used, id')
        .not('promo_code_used', 'is', null);

      if (signupsError) {
        console.error('Error fetching signups:', signupsError);
      }

      // Fetch premium subscriptions for users with promo codes
      const promoUserIds = signups?.map(s => s.id) || [];
      let premiumUsers: { user_id: string }[] = [];
      
      if (promoUserIds.length > 0) {
        const { data: subs, error: subsError } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('plan_name', 'premium')
          .eq('status', 'active')
          .in('user_id', promoUserIds);

        if (!subsError && subs) {
          premiumUsers = subs;
        }
      }

      // Calculate stats for each promo code
      const codesWithStats = codes.map(code => {
        const codeSignups = signups?.filter(s => 
          s.promo_code_used?.toLowerCase() === code.code.toLowerCase()
        ) || [];
        
        const premiumFromCode = codeSignups.filter(signup => 
          premiumUsers.some(p => p.user_id === signup.id)
        );

        const commission = premiumFromCode.length * premiumPrice * (code.percentage_cut / 100);

        return {
          ...code,
          total_signups: codeSignups.length,
          premium_signups: premiumFromCode.length,
          commission_earned: commission
        };
      });

      setPromoCodes(codesWithStats);
    } catch (error) {
      console.error('Error fetching promo codes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load promo codes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast, premiumPrice]);

  useEffect(() => {
    fetchPromoCodes();
  }, [fetchPromoCodes]);

  const handleCreatePromoCode = async () => {
    if (!newCode.trim() || !newOwnerName.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Please enter both code and owner name',
        variant: 'destructive'
      });
      return;
    }

    try {
      setCreating(true);
      
      const { error } = await supabase
        .from('promo_codes')
        .insert({
          code: newCode.toUpperCase().trim(),
          owner_name: newOwnerName.trim(),
          percentage_cut: parseFloat(newPercentageCut) || 20,
          is_active: true
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Promo code "${newCode.toUpperCase()}" created!`
      });

      // Reset form
      setNewCode('');
      setNewOwnerName('');
      setNewPercentageCut('20');
      setShowCreateForm(false);
      
      // Refresh list
      fetchPromoCodes();
    } catch (error: any) {
      console.error('Error creating promo code:', error);
      toast({
        title: 'Error',
        description: error.message?.includes('duplicate') 
          ? 'This promo code already exists' 
          : 'Failed to create promo code',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('promo_codes')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      setPromoCodes(prev => prev.map(code => 
        code.id === id ? { ...code, is_active: !currentStatus } : code
      ));

      toast({
        title: 'Updated',
        description: `Promo code ${!currentStatus ? 'activated' : 'deactivated'}`
      });
    } catch (error) {
      console.error('Error toggling promo code:', error);
      toast({
        title: 'Error',
        description: 'Failed to update promo code',
        variant: 'destructive'
      });
    }
  };

  const handleDeletePromoCode = async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to delete the promo code "${code}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPromoCodes(prev => prev.filter(c => c.id !== id));
      
      toast({
        title: 'Deleted',
        description: `Promo code "${code}" has been deleted`
      });
    } catch (error) {
      console.error('Error deleting promo code:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete promo code',
        variant: 'destructive'
      });
    }
  };

  // Calculate totals
  const totalSignups = promoCodes.reduce((sum, c) => sum + c.total_signups, 0);
  const totalPremiumSignups = promoCodes.reduce((sum, c) => sum + c.premium_signups, 0);
  const totalCommission = promoCodes.reduce((sum, c) => sum + c.commission_earned, 0);

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-blue-700 font-medium">Total Signups</span>
          </div>
          <p className="text-lg font-bold text-blue-900 mt-1">{totalSignups}</p>
        </div>
        <div className="p-3 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-yellow-600" />
            <span className="text-xs text-yellow-700 font-medium">Premium</span>
          </div>
          <p className="text-lg font-bold text-yellow-900 mt-1">{totalPremiumSignups}</p>
        </div>
        <div className="p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-xs text-green-700 font-medium">Commission</span>
          </div>
          <p className="text-lg font-bold text-green-900 mt-1">${totalCommission.toFixed(2)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button 
          size="sm" 
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          {showCreateForm ? 'Cancel' : 'New Promo Code'}
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={fetchPromoCodes}
          disabled={loading}
          className="text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="border-2 border-dashed border-green-300 bg-green-50/50">
          <CardContent className="p-4 space-y-3">
            <h4 className="text-sm font-semibold text-green-800">Create New Promo Code</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Code *</label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DEAN2025"
                  className="text-xs h-8"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Influencer Name *</label>
                <Input
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  placeholder="e.g. Dean Obeng"
                  className="text-xs h-8"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Commission %</label>
                <Input
                  type="number"
                  value={newPercentageCut}
                  onChange={(e) => setNewPercentageCut(e.target.value)}
                  min="1"
                  max="100"
                  className="text-xs h-8"
                />
              </div>
            </div>
            <Button 
              onClick={handleCreatePromoCode} 
              disabled={creating}
              size="sm"
              className="text-xs"
            >
              {creating ? 'Creating...' : 'Create Promo Code'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Promo Codes List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gift className="w-4 h-4" />
            Promo Codes ({promoCodes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600"></div>
            </div>
          ) : promoCodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No promo codes yet. Create one to get started!
            </div>
          ) : (
            <div className="space-y-3">
              {promoCodes.map((promo) => (
                <div 
                  key={promo.id} 
                  className={`p-3 rounded-lg border ${
                    promo.is_active 
                      ? 'bg-white border-gray-200' 
                      : 'bg-gray-50 border-gray-300 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm text-purple-700">
                          {promo.code}
                        </span>
                        <Badge 
                          variant={promo.is_active ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {promo.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-[10px] px-1.5 py-0"
                        >
                          <Percent className="w-2.5 h-2.5 mr-0.5" />
                          {promo.percentage_cut}%
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        Owner: <span className="font-medium">{promo.owner_name}</span>
                      </p>
                      
                      {/* Stats Row */}
                      <div className="flex gap-4 text-xs">
                        <div className="flex items-center gap-1 text-blue-600">
                          <Users className="w-3 h-3" />
                          <span>{promo.total_signups} signups</span>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-600">
                          <Crown className="w-3 h-3" />
                          <span>{promo.premium_signups} premium</span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600">
                          <DollarSign className="w-3 h-3" />
                          <span>${promo.commission_earned.toFixed(2)} earned</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={promo.is_active}
                        onCheckedChange={() => handleToggleActive(promo.id, promo.is_active)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeletePromoCode(promo.id, promo.code)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission Breakdown */}
      {promoCodes.some(p => p.premium_signups > 0) && (
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Commission Breakdown (First Month Only)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {promoCodes.filter(p => p.premium_signups > 0).map(promo => (
                <div key={promo.id} className="flex justify-between items-center text-xs p-2 bg-white rounded border">
                  <div>
                    <span className="font-mono font-bold text-purple-700">{promo.code}</span>
                    <span className="text-gray-500 ml-2">({promo.owner_name})</span>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-600">
                      {promo.premium_signups} × ${premiumPrice} × {promo.percentage_cut}%
                    </div>
                    <div className="font-bold text-green-700">
                      = ${promo.commission_earned.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t flex justify-between items-center">
                <span className="font-semibold text-sm text-green-800">Total Payout Due:</span>
                <span className="font-bold text-lg text-green-700">${totalCommission.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PromotionsManagement;

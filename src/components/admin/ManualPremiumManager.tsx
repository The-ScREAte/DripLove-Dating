import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Crown, X } from 'lucide-react';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_status: string;
  created_at: string;
  city: string;
  country: string;
  age: number;
  is_admin: boolean;
}

interface PremiumStatus {
  is_premium: boolean;
  plan_name: string;
  status: string;
  expires_at: string | null;
}

interface ManualPremiumManagerProps {
  users: UserProfile[];
  onRefreshStats: () => void;
}

const ManualPremiumManager: React.FC<ManualPremiumManagerProps> = ({ users, onRefreshStats }) => {
  const [selectedUser, setSelectedUser] = useState('');
  const [months, setMonths] = useState('1');
  const [loading, setLoading] = useState(false);
  const [premiumStatuses, setPremiumStatuses] = useState<Record<string, PremiumStatus>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const fetchUserPremiumStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_get_user_premium_status', {
        target_user_id: userId
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const status = data[0];
        setPremiumStatuses(prev => ({
          ...prev,
          [userId]: status
        }));
        return status;
      }
    } catch (error) {
      console.error('Error fetching premium status:', error);
    }
    return null;
  };

  const handleUserSelection = async (userId: string) => {
    setSelectedUser(userId);
    if (userId) {
      await fetchUserPremiumStatus(userId);
    }
  };

  // Filter users based on search term
  const filteredUsers = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return users;
    }
    
    const searchLower = searchTerm.toLowerCase().trim();
    return users.filter(user => {
      const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
      const email = user.email.toLowerCase();
      return fullName.includes(searchLower) || email.includes(searchLower);
    });
  }, [users, searchTerm]);

  const setPremium = async () => {
    if (!selectedUser || !months) {
      toast({
        title: 'Error',
        description: 'Please select a user and number of months',
        variant: 'destructive'
      });
      return;
    }

    const monthsNum = parseInt(months);
    if (monthsNum <= 0 || monthsNum > 24) {
      toast({
        title: 'Error',
        description: 'Please enter a valid number of months (1-24)',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_set_premium_subscription', {
        target_user_id: selectedUser,
        months_count: monthsNum
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `User has been set to premium for ${monthsNum} month(s)`
      });

      // Refresh user's premium status
      await fetchUserPremiumStatus(selectedUser);
      onRefreshStats();
      setMonths('1');
    } catch (error) {
      console.error('Error setting premium:', error);
      toast({
        title: 'Error',
        description: 'Failed to set premium subscription',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const cancelPremium = async () => {
    if (!selectedUser) {
      toast({
        title: 'Error',
        description: 'Please select a user',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_cancel_premium_subscription', {
        target_user_id: selectedUser
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Premium subscription has been cancelled'
      });

      // Refresh user's premium status
      await fetchUserPremiumStatus(selectedUser);
      onRefreshStats();
    } catch (error) {
      console.error('Error cancelling premium:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel premium subscription',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getSelectedUserStatus = () => {
    if (!selectedUser || !premiumStatuses[selectedUser]) {
      return null;
    }
    return premiumStatuses[selectedUser];
  };

  const selectedUserStatus = getSelectedUserStatus();
  const selectedUserInfo = users.find(user => user.id === selectedUser);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        {/* User Selection with search inside dropdown */}
        <div>
          <label className="block text-sm font-medium mb-2">Select User to Manage Premium</label>
          <Select value={selectedUser} onValueChange={handleUserSelection}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Choose a user to manage premium" />
            </SelectTrigger>
            <SelectContent className="max-h-[400px]">
              <div className="sticky top-0 bg-white z-10 p-2 border-b">
                <Input
                  type="text"
                  placeholder="Filter by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-sm"
                  onClick={(e) => e.stopPropagation()}
                  // Radix's Select captures keydown on its content for keyboard
                  // type-ahead navigation, which steals every keystroke typed into
                  // this nested input (each character registers, then focus/typing
                  // gets interrupted). Stop it from propagating past this field.
                  onKeyDown={(e) => e.stopPropagation()}
                />
                {searchTerm && (
                  <p className="text-xs text-gray-600 mt-1">
                    {filteredUsers.length} user(s) {filteredUsers.length === users.length ? 'shown' : 'matched'}
                  </p>
                )}
              </div>
              <div className="overflow-y-auto max-h-[280px]">
                {filteredUsers.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500 text-center">
                    No users match your filter
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <span>{user.first_name} {user.last_name}</span>
                        <span className="text-xs text-gray-500">({user.email})</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </div>
            </SelectContent>
          </Select>
        </div>

        {/* Current Status Display */}
        {selectedUserInfo && (
          <div className="p-3 bg-gray-50 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">
                  {selectedUserInfo.first_name} {selectedUserInfo.last_name}
                </p>
                <p className="text-xs text-gray-600">{selectedUserInfo.email}</p>
              </div>
              <div className="text-right">
                {selectedUserStatus ? (
                  <div className="space-y-1">
                    <Badge variant={selectedUserStatus.is_premium ? 'default' : 'secondary'}>
                      {selectedUserStatus.is_premium ? (
                        <div className="flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          Premium
                        </div>
                      ) : (
                        'Free'
                      )}
                    </Badge>
                    {selectedUserStatus.is_premium && selectedUserStatus.expires_at && (
                      <p className="text-xs text-gray-600">
                        Expires: {new Date(selectedUserStatus.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <Badge variant="secondary">Loading...</Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Premium Management Actions */}
        {selectedUser && (
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-medium text-sm text-green-800 mb-2">Set Premium</h4>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="24"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                placeholder="Months"
                className="w-20 text-sm"
              />
              <span className="flex items-center text-sm text-gray-600">months</span>
              <Button
                onClick={setPremium}
                disabled={loading}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Crown className="w-3 h-3 mr-1" />
                Set Premium
              </Button>
              {/* Cancel, right beside Set Premium - icon-only since it's a single, clear action */}
              {selectedUserStatus?.is_premium && (
                <Button
                  onClick={cancelPremium}
                  disabled={loading}
                  size="icon"
                  variant="destructive"
                  className="h-9 w-9 shrink-0"
                  title="Cancel Premium"
                  aria-label="Cancel Premium"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualPremiumManager;
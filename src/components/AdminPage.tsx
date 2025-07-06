import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { defaultPaymentMethods, PaymentMethod } from '@/constants/flwConfig';



import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import UserProfileModal from '@/components/UserProfileModal';
import { 
  Users, 
  Heart, 
  MessageSquare, 
  UserX, 
  TrendingUp,
  Calendar,
  Shield,
  Search,
  Eye,
  Ban,
  Pause,
  Play,
  Trash2,
  LogOut,
  UserPlus
} from 'lucide-react';

interface AdminPageProps {
  currentUser: any;
  onLogout: () => void;
}

interface AppStats {
  total_users: number;
  total_matches: number;
  total_likes: number;
  total_blocks: number;
  total_messages: number;
  active_users_today: number;
  new_users_this_week: number;
  matches_this_week: number;
  blocked_users: number;
  users_on_hold: number;
  total_admins: number;
}

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

const AdminPage = ({ currentUser, onLogout }: AdminPageProps) => {
  // Payment methods state for admin
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('payment_methods');
      if (stored) return JSON.parse(stored);
    }
    return defaultPaymentMethods;
  });

  const handlePaymentMethodChange = (index: number, field: keyof PaymentMethod, value: string) => {
    setPaymentMethods(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      localStorage.setItem('payment_methods', JSON.stringify(updated));
      return updated;
    });
  };

  // Payment methods admin UI
  // Payment config modal state
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('premium_price');
      if (stored) return stored;
    }
    return '50';
  });

  const handleSavePaymentConfig = () => {
    localStorage.setItem('payment_methods', JSON.stringify(paymentMethods));
    localStorage.setItem('premium_price', premiumPrice);
    setShowPaymentConfig(false);
    toast({ title: 'Saved', description: 'Payment methods and price updated.' });
  };

  const renderPaymentMethodsAdmin = () => (
    <>
      <Button className="mb-4" onClick={() => setShowPaymentConfig(true)}>
        Configure Premium Payment Options
      </Button>
      {showPaymentConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative">
            <button onClick={() => setShowPaymentConfig(false)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-xl font-bold mb-4">Configure Premium Payment</h2>
            <div className="mb-4">
              <label className="block font-medium mb-1">Premium Price (GHS)</label>
              <Input value={premiumPrice} onChange={e => setPremiumPrice(e.target.value)} type="number" min="1" className="w-full" />
            </div>
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Payment Methods</h3>
              <div className="space-y-4">
                {paymentMethods.map((method, idx) => (
                  <div key={method.type} className="flex flex-col gap-2 border-b pb-2">
                    <span className="font-medium capitalize">{method.label}</span>
                    {method.type === 'momo' ? (
                      <>
                        <Input
                          value={method.details}
                          onChange={e => handlePaymentMethodChange(idx, 'details', e.target.value)}
                          placeholder="MoMo Number"
                          className="w-full"
                        />
                        <Input
                          value={method.name || ''}
                          onChange={e => handlePaymentMethodChange(idx, 'name', e.target.value)}
                          placeholder="MoMo Name"
                          className="w-full"
                        />
                        <Input
                          value={method.extra || ''}
                          onChange={e => handlePaymentMethodChange(idx, 'extra', e.target.value)}
                          placeholder="MoMo Provider/Network (optional)"
                          className="w-full"
                        />
                      </>
                    ) : (
                      <>
                        <Input
                          value={method.details}
                          onChange={e => handlePaymentMethodChange(idx, 'details', e.target.value)}
                          placeholder="Card/Account Details"
                          className="w-full"
                        />
                        <Input
                          value={method.extra || ''}
                          onChange={e => handlePaymentMethodChange(idx, 'extra', e.target.value)}
                          placeholder="Bank Name/Info (optional)"
                          className="w-full"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={handleSavePaymentConfig} className="w-full bg-pink-600 text-white mt-2">Save</Button>
          </div>
        </div>
      )}

      {/* Show saved payment methods below the form */}
      <div className="mt-8">
        <h3 className="font-semibold mb-2">Saved Payment Accounts (Receiving)</h3>
        <div className="space-y-2">
          {paymentMethods.map((method, idx) => (
            <div key={method.type + idx} className="border rounded p-3 bg-gray-50">
              <span className="font-bold capitalize">{method.label} Account</span>
              {method.type === 'momo' ? (
                <div className="text-sm mt-1">
                  <div>MoMo Name: <span className="font-mono">{method.name}</span></div>
                  <div>MoMo Number: <span className="font-mono">{method.details}</span></div>
                  {method.extra && <div>Provider: <span className="font-mono">{method.extra}</span></div>}
                </div>
              ) : (
                <div className="text-sm mt-1">
                  <div>Card/Account: <span className="font-mono">{method.details}</span></div>
                  {method.extra && <div>Bank: <span className="font-mono">{method.extra}</span></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
  const [stats, setStats] = useState<AppStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [matchUser1, setMatchUser1] = useState('');
  const [matchUser2, setMatchUser2] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const usersPerPage = 10;
  const { toast } = useToast();

  // Check if current user is admin
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!currentUser?.id) {
        setIsAdmin(false);
        return;
      }
  
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', currentUser.id)
        .single();
  
      if (error || !data) {
        console.error('Failed to fetch admin status:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(data.is_admin);
      }
    };
  
    checkAdminStatus();
  }, [currentUser]);

  useEffect(() => {
    if (isAdmin) {
      fetchAppStats();
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchAppStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_app_stats');
      if (error) throw error;
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setStats(data as unknown as AppStats);
      }
    } catch (error) {
      console.error('Error fetching app stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load app statistics',
        variant: 'destructive'
      });
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, account_status, created_at, city, country, date_of_birth, is_admin')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const usersWithAge = data.map(user => ({
        ...user,
        age: calculateAge(user.date_of_birth)
      }));

      // Separate admin and regular users
      const regularUsers = usersWithAge.filter(user => !user.is_admin);
      const admins = usersWithAge.filter(user => user.is_admin);

      setUsers(regularUsers);
      setAdminUsers(admins);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  const updateUserStatus = async (userId: string, newStatus: string) => {
    try {
      const { error } = await supabase.rpc('admin_update_account_status', {
        target_user_id: userId,
        new_status: newStatus
      });

      if (error) throw error;

      setUsers(users.map(user => 
        user.id === userId ? { ...user, account_status: newStatus } : user
      ));

      await fetchAppStats();

      const statusMessages = {
        'active': 'User account has been activated',
        'on_hold': 'User account has been put on hold',
        'blocked': 'User account has been blocked'
      };

      toast({
        title: 'Success',
        description: statusMessages[newStatus as keyof typeof statusMessages] || 'User status updated'
      });

    } catch (error) {
      console.error('Error updating user status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive'
      });
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase.rpc('delete_user_and_data', {
        user_id_to_delete: userId
      });

      if (error) throw error;

      setUsers(users.filter(user => user.id !== userId));
      await fetchAppStats();

      toast({
        title: 'Success',
        description: 'User has been permanently deleted'
      });

    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive'
      });
    }
  };

  const createManualMatch = async () => {
    if (!matchUser1 || !matchUser2) {
      toast({
        title: 'Error',
        description: 'Please select both users to create a match',
        variant: 'destructive'
      });
      return;
    }

    if (matchUser1 === matchUser2) {
      toast({
        title: 'Error',
        description: 'Cannot match a user with themselves',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { error } = await supabase.rpc('admin_create_match', {
        user1_id: matchUser1,
        user2_id: matchUser2
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Match created successfully'
      });

      setMatchUser1('');
      setMatchUser2('');
      await fetchAppStats();

    } catch (error) {
      console.error('Error creating match:', error);
      toast({
        title: 'Error',
        description: 'Failed to create match',
        variant: 'destructive'
      });
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      onLogout();
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive'
      });
    }
  };

  const handleViewProfile = (userId: string) => {
    setSelectedUserId(userId);
    setIsProfileModalOpen(true);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || user.account_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage);

  const getStatusBadge = (status: string) => {
    const variants = {
      'active': 'bg-green-100 text-green-800',
      'on_hold': 'bg-yellow-100 text-yellow-800',
      'blocked': 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };
  
  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Checking admin permissions...</p>
      </div>
    );
  }
  
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="w-full min-h-screen bg-gray-100">
      <div className="w-full max-w-[390px] mx-auto bg-white min-h-screen">
        <div className="p-4 space-y-4">
          {isAdmin && renderPaymentMethodsAdmin()}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="px-3 py-1">
                <Shield className="w-4 h-4 mr-1" />
                Admin
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <React.Fragment>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Total Users</p>
                      <p className="text-lg font-bold">{stats.total_users}</p>
                    </div>
                    <Users className="w-6 h-6 text-blue-500" />
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Total Matches</p>
                      <p className="text-lg font-bold">{stats.total_matches}</p>
                    </div>
                    <Heart className="w-6 h-6 text-pink-500" />
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Messages Sent</p>
                      <p className="text-lg font-bold">{stats.total_messages}</p>
                    </div>
                    <MessageSquare className="w-6 h-6 text-green-500" />
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Active Today</p>
                      <p className="text-lg font-bold">{stats.active_users_today}</p>
                    </div>
                    <TrendingUp className="w-6 h-6 text-purple-500" />
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">New This Week</p>
                      <p className="text-lg font-bold">{stats.new_users_this_week}</p>
                    </div>
                    <Calendar className="w-6 h-6 text-indigo-500" />
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Users On Hold</p>
                      <p className="text-lg font-bold">{stats.users_on_hold}</p>
                    </div>
                    <Pause className="w-6 h-6 text-yellow-500" />
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Blocked Users</p>
                      <p className="text-lg font-bold">{stats.blocked_users}</p>
                    </div>
                    <UserX className="w-6 h-6 text-red-500" />
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Total Admins</p>
                      <p className="text-lg font-bold">{stats.total_admins}</p>
                    </div>
                    <Shield className="w-6 h-6 text-gray-500" />
                  </div>
                </Card>
              </React.Fragment>
            </div>
          )}

          {/* Manual Match Creation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="w-5 h-5" />
                Create Manual Match
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select value={matchUser1} onValueChange={setMatchUser1}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select User 1" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={matchUser2} onValueChange={setMatchUser2}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select User 2" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createManualMatch} className="w-full" size="sm">
                Create Match
              </Button>
            </CardContent>
          </Card>

          {/* Admin Users */}
          {adminUsers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="w-5 h-5" />
                  Admin Users ({adminUsers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {adminUsers.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div>
                        <p className="font-medium text-sm">{admin.first_name} {admin.last_name}</p>
                        <p className="text-xs text-gray-600">{admin.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewProfile(admin.id)}
                          className="text-blue-600 hover:text-blue-700 text-xs px-2 py-1 h-7"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          ADMIN
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* User Management */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5" />
                User Management ({filteredUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Search and Filter */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 text-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Users List Container */}
              <div className="border rounded-lg bg-white">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
                  </div>
                ) : (
                  <div className="space-y-0 max-h-96 overflow-y-auto">
                    {paginatedUsers.map((user, index) => (
                      <div key={user.id} className={`p-3 space-y-2 ${index !== paginatedUsers.length - 1 ? 'border-b' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate">
                              {user.first_name} {user.last_name}
                            </h3>
                            <p className="text-xs text-gray-600 truncate">{user.email}</p>
                            <p className="text-xs text-gray-500">
                              {user.city}, {user.country} • Age {user.age}
                            </p>
                            <p className="text-xs text-gray-500">
                              Joined: {new Date(user.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="ml-2">
                            {getStatusBadge(user.account_status)}
                          </div>
                        </div>
                        
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewProfile(user.id)}
                            className="text-blue-600 hover:text-blue-700 text-xs px-2 py-1 h-7"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                          
                          {user.account_status === 'on_hold' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserStatus(user.id, 'active')}
                              className="text-green-600 hover:text-green-700 text-xs px-2 py-1 h-7"
                            >
                              <Play className="w-3 h-3 mr-1" />
                              Activate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserStatus(user.id, 'on_hold')}
                              className="text-yellow-600 hover:text-yellow-700 text-xs px-2 py-1 h-7"
                            >
                              <Pause className="w-3 h-3 mr-1" />
                              Hold
                            </Button>
                          )}
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteUser(user.id)}
                            className="text-red-600 hover:text-red-700 text-xs px-2 py-1 h-7"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    {filteredUsers.length === 0 && (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        No users found matching your criteria.
                      </div>
                    )}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t px-3 pb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* User Profile Modal */}
      {selectedUserId && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => {
            setIsProfileModalOpen(false);
            setSelectedUserId(null);
          }}
          userId={selectedUserId}
        />
      )}
    </div>
  );
};

export default AdminPage;

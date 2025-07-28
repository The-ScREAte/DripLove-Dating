import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCountriesList, getCountryByCode } from '@/constants/locationData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { defaultPaymentMethods, PaymentMethod } from '@/constants/flwConfig';
import { bulkApproveExistingImages } from '@/utils/bulkApproveImages';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import UserProfileModal from '@/components/UserProfileModal';
import StatsCard from './admin/StatsCard';
import UserModerationPanel from './admin/UserModerationPanel';
import AdminErrorBoundary from './admin/AdminErrorBoundary';
import UserPoolDebugger from './admin/UserPoolDebugger';
import { debounce, userDataCache, createPagination } from '@/utils/performanceOptimizer';
import { useSupabaseSubscription, useMemoryMonitor } from '@/hooks/usePerformance';

import { CurrentUser, AdminStats } from '@/types';
import { Shield, LogOut, BarChart3, Users, Image, Search, Settings, UserPlus, Eye, Play, Pause, Trash2, CreditCard, Ban } from 'lucide-react';

interface AdminPageProps {
  currentUser: CurrentUser;
  onLogout: () => void;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_status: string;
  created_at: string;
  city?: string;
  country?: string;
  date_of_birth?: string;
  age?: number;
  is_admin?: boolean;
}

// Main admin page component
const AdminPageComponent: React.FC<AdminPageProps> = ({ currentUser, onLogout }) => {
  // User management state
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Payment config state
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState('50');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [enabledCountries, setEnabledCountries] = useState<string[]>([]);
  const [countryPrices, setCountryPrices] = useState<{ country: string; currency: string; price: string }[]>([]);
  const [editCountries, setEditCountries] = useState(false);

  // App stats
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Type for pending images
  type PendingImage = {
    id: string;
    user_id: string;
    image_url: string;
    moderation_status: string;
    created_at: string;
    moderation_notes?: string;
    profile?: {
      first_name: string;
      last_name: string;
      email: string;
    };
  };
  
  const [matchUser1, setMatchUser1] = useState('');
  const [matchUser2, setMatchUser2] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [loadingPendingImages, setLoadingPendingImages] = useState(false);
  const [approvingImages, setApprovingImages] = useState<Record<string, boolean>>({});
  const [rejectingImages, setRejectingImages] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  
  // Constants
  const usersPerPage = 20;
  const { toast } = useToast();

  // Check admin status on mount
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!currentUser?.id) {
        setIsAdmin(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', currentUser.id)
          .single();

        if (error) throw error;
        setIsAdmin(data?.is_admin || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, [currentUser?.id]);

  // Fetch payment config from DB on mount
  useEffect(() => {
    const fetchConfig = async () => {
      setLoadingConfig(true);
      try {
        const { data, error } = await supabase
          .from('payment_config')
          .select('premium_price, payment_methods, country_prices, enabled_countries')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;

        setPaymentMethods(data.payment_methods as unknown as PaymentMethod[]);
        setPremiumPrice(data.premium_price.toString());
        setEnabledCountries(Array.isArray(data.enabled_countries) ? data.enabled_countries.map(item => String(item)) : []);
        
        // Convert JSONB country_prices back to array format for UI
        if (data.country_prices && typeof data.country_prices === 'object') {
          const pricesArray = Object.entries(data.country_prices).map(([currency, price]) => {
            const countryCode = getCountriesList().find(c => getCountryByCode(c.code)?.currency === currency)?.code || '';
            return {
              country: countryCode,
              currency,
              price: price.toString()
            };
          });
          setCountryPrices(pricesArray);
        }
      } catch (error) {
        console.error('Error fetching payment config:', error);
        setPaymentMethods(defaultPaymentMethods);
        setPremiumPrice('50');
        setCountryPrices([]);
      }
      setLoadingConfig(false);
    };
    fetchConfig();
  }, []);

  const handlePaymentMethodChange = (index: number, field: keyof PaymentMethod, value: string) => {
    setPaymentMethods(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Save payment config to DB
  const handleSavePaymentConfig = async () => {
    setLoadingConfig(true);
    try {
      // Convert array format back to JSONB format for database
      const countryPricesObj = countryPrices.reduce((acc, item) => {
        if (item.currency && item.price) {
          acc[item.currency] = Number(item.price);
        }
        return acc;
      }, {} as Record<string, number>);

      // Get the first (and should be only) payment config record
      const { data: existing } = await supabase
        .from('payment_config')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('payment_config')
          .update({
            payment_methods: paymentMethods as unknown as any,
            premium_price: Number(premiumPrice),
            country_prices: countryPricesObj,
            updated_at: new Date().toISOString(),
            enabled_countries: enabledCountries,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from('payment_config')
          .insert({
            payment_methods: paymentMethods as unknown as any,
            premium_price: Number(premiumPrice),
            country_prices: countryPricesObj,
            enabled_countries: enabledCountries,
          });

        if (error) throw error;
      }

      setShowPaymentConfig(false);
      toast({ title: 'Saved', description: 'Payment methods and price updated.' });
    } catch (error) {
      console.error('Error saving payment config:', error);
      toast({ title: 'Error', description: 'Failed to save payment config', variant: 'destructive' });
    } finally {
      setLoadingConfig(false);
    }
  };

  const renderPaymentMethodsAdmin = () => (
    <>
      <Button className="mb-4" onClick={() => setShowPaymentConfig(true)} disabled={loadingConfig}>
        Configure Premium Payment Options
      </Button>
      {loadingConfig && <div className="text-center text-sm text-gray-500 mb-2">Loading payment config...</div>}
      {showPaymentConfig && !loadingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowPaymentConfig(false)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-xl font-bold mb-4">Configure Premium Payment</h2>
            <div className="mb-4">
              <label className="block font-medium mb-1">Default Premium Price (GHS)</label>
              <Input value={premiumPrice} onChange={e => setPremiumPrice(e.target.value)} type="number" min="1" className="w-full" />
            </div>
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Country-Specific Prices</h3>
              <div className="space-y-2">
                {countryPrices.map((entry, idx) => {
                  const countryOptions = getCountriesList();
                  const selectedCountry = countryOptions.find(c => c.code === entry.country);
                  const currency = selectedCountry ? getCountryByCode(selectedCountry.code)?.currency || '' : '';
                  return (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={entry.country}
                        onChange={e => {
                          const v = e.target.value;
                          const countryObj = getCountryByCode(v);
                          setCountryPrices(prices => prices.map((p, i) => i === idx ? { ...p, country: v, currency: countryObj?.currency || '', price: p.price } : p));
                        }}
                        className="w-1/3 border rounded px-2 py-1"
                      >
                        <option value="">Select Country</option>
                        {countryOptions.map(c => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                      <Input
                        type="text"
                        value={currency}
                        disabled
                        className="w-20 text-center"
                        placeholder="Currency"
                      />
                      <Input
                        type="number"
                        value={entry.price}
                        onChange={e => setCountryPrices(prices => prices.map((p, i) => i === idx ? { ...p, price: e.target.value } : p))}
                        className="w-24"
                        placeholder="Price"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setCountryPrices(prices => prices.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCountryPrices([...countryPrices, { country: '', currency: '', price: '' }])}
                >
                  Add Country Price
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSavePaymentConfig} disabled={loadingConfig}>
                Save Configuration
              </Button>
              <Button variant="outline" onClick={() => setShowPaymentConfig(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const fetchAppStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_stats');
      if (error) throw error;
      setStats(data as unknown as AdminStats);
    } catch (error) {
      console.error('Error fetching app stats:', error);
    }
  }, []);

  const fetchUsers = useCallback(debounce(async () => {
    try {
      setLoading(true);
      
      // Check cache first for performance
      const cacheKey = `users_${currentPage}_${statusFilter}`;
      const cachedUsers = userDataCache.get(cacheKey);
      if (cachedUsers) {
        const { regularUsers, admins } = cachedUsers;
        setUsers(regularUsers);
        setAdminUsers(admins);
        setLoading(false);
        return;
      }

      // Use pagination for better performance with large datasets
      let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, email, account_status, created_at, city, country, date_of_birth, is_admin')
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * usersPerPage, currentPage * usersPerPage - 1);

      if (statusFilter !== 'all') {
        query = query.eq('account_status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      const usersWithAge = data?.map(user => ({
        ...user,
        age: calculateAge(user.date_of_birth)
      })) || [];

      // Separate admin and regular users
      const regularUsers = usersWithAge.filter(user => !user.is_admin);
      const admins = usersWithAge.filter(user => user.is_admin);

      setUsers(regularUsers);
      setAdminUsers(admins);
      
      // Cache the users data for 3 minutes
      userDataCache.set(cacheKey, { regularUsers, admins });
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
  }, 300), [toast, currentPage, statusFilter, usersPerPage]);

  const fetchPendingImages = useCallback(async () => {
    try {
      setLoadingPendingImages(true);
      const { data, error } = await supabase
        .from('user_images')
        .select(`
          id,
          user_id,
          image_url,
          moderation_status,
          created_at,
          moderation_notes,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('moderation_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pendingImagesWithProfile = data?.map(image => ({
        ...image,
        profile: Array.isArray(image.profiles) ? image.profiles[0] : image.profiles
      })) || [];

      setPendingImages(pendingImagesWithProfile);
    } catch (error) {
      console.error('Error fetching pending images:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending images',
        variant: 'destructive'
      });
    } finally {
      setLoadingPendingImages(false);
    }
  }, [toast]);

  const calculateAge = (dateOfBirth: string) => {
    if (!dateOfBirth) return 0;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  // Second useEffect for fetching data after admin status is confirmed
  useEffect(() => {
    if (isAdmin) {
      fetchAppStats();
      fetchUsers();
      fetchPendingImages();
    }
  }, [isAdmin, fetchAppStats, fetchUsers, fetchPendingImages]);

  const updateUserStatus = async (userId: string, newStatus: string) => {
    try {
      const { error } = await supabase.rpc('admin_update_account_status', {
        target_user_id: userId,
        new_status: newStatus
      });

      if (error) throw error;

      // Optimistic update for better UX
      setUsers(users.map(user => 
        user.id === userId ? { ...user, account_status: newStatus } : user
      ));

      // Clear cache to ensure fresh data on next fetch
      userDataCache.clear();
      
      // Refresh stats in background
      fetchAppStats();

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
      // Revert optimistic update on error
      fetchUsers();
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

  const approveImage = async (imageId: string) => {
    setApprovingImages(prev => ({ ...prev, [imageId]: true }));
    try {
      const { error } = await supabase
        .from('user_images')
        .update({ 
          is_approved: true, 
          moderation_status: 'approved',
          moderated_by: currentUser.id,
          moderated_at: new Date().toISOString()
        })
        .eq('id', imageId);

      if (error) throw error;

      setPendingImages(prev => prev.filter(img => img.id !== imageId));
      toast({ title: 'Success', description: 'Image approved successfully' });
    } catch (error) {
      console.error('Error approving image:', error);
      toast({ title: 'Error', description: 'Failed to approve image', variant: 'destructive' });
    } finally {
      setApprovingImages(prev => ({ ...prev, [imageId]: false }));
    }
  };

  const rejectImage = async (imageId: string) => {
    setRejectingImages(prev => ({ ...prev, [imageId]: true }));
    try {
      const { error } = await supabase
        .from('user_images')
        .update({ 
          is_approved: false, 
          moderation_status: 'rejected',
          moderated_by: currentUser.id,
          moderated_at: new Date().toISOString()
        })
        .eq('id', imageId);

      if (error) throw error;

      setPendingImages(prev => prev.filter(img => img.id !== imageId));
      toast({ title: 'Success', description: 'Image rejected successfully' });
    } catch (error) {
      console.error('Error rejecting image:', error);
      toast({ title: 'Error', description: 'Failed to reject image', variant: 'destructive' });
    } finally {
      setRejectingImages(prev => ({ ...prev, [imageId]: false }));
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

  // Cleanup effect for memory management with 1000+ users - MUST be called before any returns
  useEffect(() => {
    return () => {
      // Clear cache when component unmounts to prevent memory leaks
      userDataCache.clear();
    };
  }, []);
  
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
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
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

          {/* Tabbed Interface with Error Boundaries for 1000+ users */}
          <AdminErrorBoundary>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5 mb-4 h-11">
                <TabsTrigger value="dashboard" className="text-xs flex flex-col gap-1 py-2">
                  <BarChart3 className="w-4 h-4" />
                  <span>Dashboard</span>
                </TabsTrigger>
                <TabsTrigger value="users" className="text-xs flex flex-col gap-1 py-2">
                  <Users className="w-4 h-4" />
                  <span>Users</span>
                </TabsTrigger>
                <TabsTrigger value="content" className="text-xs flex flex-col gap-1 py-2">
                  <Image className="w-4 h-4" />
                  <span>Content</span>
                </TabsTrigger>
                <TabsTrigger value="debugger" className="text-xs flex flex-col gap-1 py-2">
                  <Search className="w-4 h-4" />
                  <span>Debug</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs flex flex-col gap-1 py-2">
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </TabsTrigger>
              </TabsList>

              {/* Dashboard Tab */}
              <TabsContent value="dashboard" className="space-y-4">
                {/* Stats Overview */}
                {stats && (
                  <StatsCard stats={stats} />
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
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Users className="w-5 h-5" />
                      User Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Search and filters */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          placeholder="Search users..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                        <SelectTrigger className="w-full sm:w-48">
                          <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Users</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Users list */}
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {filteredUsers.map((user) => (
                          <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <div>
                                  <h4 className="font-medium text-sm">
                                    {user.first_name} {user.last_name}
                                  </h4>
                                  <p className="text-xs text-gray-600">{user.email}</p>
                                  <p className="text-xs text-gray-500">
                                    {user.city}, {user.country} • Age: {user.age || 'N/A'}
                                  </p>
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                  {getStatusBadge(user.account_status)}
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleViewProfile(user.id)}
                                      className="h-8 w-8 p-0"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    {user.account_status === 'active' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateUserStatus(user.id, 'blocked')}
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                      >
                                        <Ban className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {user.account_status === 'blocked' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateUserStatus(user.id, 'active')}
                                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                                      >
                                        <Play className="w-4 h-4" />
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => deleteUser(user.id)}
                                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {filteredUsers.length === 0 && (
                          <div className="text-center py-8 text-gray-500 text-sm">
                            No users found.
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Content Tab */}
              <TabsContent value="content" className="space-y-4">
                {/* Pending Images Management */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <div className="flex items-center gap-2">
                        <Image className="w-5 h-5" />
                        Pending Images ({pendingImages.length})
                      </div>
                      <Button
                        onClick={async () => {
                          toast({ title: "Bulk approval started", description: "Approving all existing images..." });
                          await bulkApproveExistingImages();
                          await fetchPendingImages();
                          toast({ title: "✅ Bulk approval complete", description: "All appropriate images have been approved." });
                        }}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                      >
                        🔧 Bulk Approve All
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingPendingImages ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
                      </div>
                    ) : pendingImages.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        No pending images to review.
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {pendingImages.map((image) => (
                          <div key={image.id} className="border rounded-lg p-4 bg-gray-50">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0">
                                <img
                                  src={image.image_url}
                                  alt="Pending image"
                                  className="w-20 h-20 object-cover rounded-lg border"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm">
                                  {image.profile?.first_name} {image.profile?.last_name}
                                </h4>
                                <p className="text-xs text-gray-600">{image.profile?.email}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Uploaded: {new Date(image.created_at).toLocaleDateString()}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Status: <span className="font-medium">{image.moderation_status}</span>
                                </p>
                                {image.moderation_notes && (
                                  <p className="text-xs text-orange-600 mt-1">
                                    Note: {image.moderation_notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => approveImage(image.id)}
                                  disabled={approvingImages[image.id]}
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 h-8"
                                >
                                  {approvingImages[image.id] ? 'Approving...' : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => rejectImage(image.id)}
                                  disabled={rejectingImages[image.id]}
                                  className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50 text-xs px-3 py-1 h-8"
                                >
                                  {rejectingImages[image.id] ? 'Rejecting...' : 'Reject'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Debugger Tab */}
              <TabsContent value="debugger" className="space-y-4">
                <UserPoolDebugger 
                  currentUserId={currentUser.id}
                  userPreferences={{
                    min_age: currentUser.min_age,
                    max_age: currentUser.max_age,
                    max_distance: currentUser.max_distance,
                    preference: currentUser.preference,
                    latitude: currentUser.latitude,
                    longitude: currentUser.longitude
                  }}
                />
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4">
                {/* Enabled Countries Management */}
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span className="inline-block w-5 h-5 bg-gradient-to-br from-green-400 to-blue-400 rounded-full mr-2" />
                      Enabled Countries
                    </CardTitle>
                    <Button size="sm" variant={editCountries ? 'default' : 'outline'} onClick={async () => {
                      if (editCountries) {
                        await handleSavePaymentConfig();
                      }
                      setEditCountries(!editCountries);
                    }}>
                      {editCountries ? 'Save' : 'Edit'}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {editCountries ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Select countries to enable</span>
                          <span className="text-xs text-gray-500">{enabledCountries.length} selected</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border rounded p-2 bg-gray-50 mb-4">
                          {getCountriesList().map(c => {
                            const checked = enabledCountries.includes(c.code);
                            return (
                              <label
                                key={c.code}
                                className={`flex items-center gap-2 text-sm cursor-pointer select-none px-2 py-1 rounded transition border-2 ${checked ? 'bg-blue-50 border-blue-500 font-semibold text-blue-900 shadow' : 'bg-white border-gray-200 hover:bg-blue-50'}`}
                                style={{ userSelect: 'none' }}
                              >
                                <input
                                  type="checkbox"
                                  className="accent-blue-600 w-4 h-4 border-2 border-blue-400 rounded focus:ring-2 focus:ring-blue-400"
                                  checked={checked}
                                  onChange={e => {
                                    setEnabledCountries(list => e.target.checked
                                      ? [...list, c.code]
                                      : list.filter(code => code !== c.code)
                                    );
                                  }}
                                />
                                <span>{c.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => { setEditCountries(false); }}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="default" onClick={async () => { await handleSavePaymentConfig(); setEditCountries(false); }}>
                            Save
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {enabledCountries.length === 0 ? (
                          <span className="text-gray-500 text-sm">No countries enabled.</span>
                        ) : (
                          enabledCountries.map(code => {
                            const c = getCountryByCode(code);
                            return c ? <span key={code} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs border border-blue-300 font-medium">{c.name}</span> : null;
                          })
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Payment Configuration */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CreditCard className="w-5 h-5" />
                      Payment Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isAdmin && renderPaymentMethodsAdmin()}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </AdminErrorBoundary>
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
    </div>
  );
};

// Memoize the component for performance with 1000+ users
const AdminPage = React.memo<AdminPageProps>(({ currentUser, onLogout }) => {
  return <AdminPageComponent currentUser={currentUser} onLogout={onLogout} />;
});

AdminPage.displayName = 'AdminPage';

export default AdminPage;
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
import { Search, Shield } from 'lucide-react';

import { CurrentUser, AdminStats } from '@/types';

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
}

// Type for pending images
type PendingImage = {
  id: string;
  user_id: string;
  image_url: string;
  moderation_status: string;
  created_at: string;
};

// Main admin page component
const AdminPageComponent: React.FC<AdminPageProps> = ({ currentUser, onLogout }) => {
  // User management state
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [appStats, setAppStats] = useState<AdminStats | null>(null);
  
  // Payment config state
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState('50');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [enabledCountries, setEnabledCountries] = useState<string[]>([]);
  const [countryPrices, setCountryPrices] = useState<{ country: string; currency: string; price: string }[]>([]);

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
        setEnabledCountries(Array.isArray(data.enabled_countries) ? data.enabled_countries.map(String) : []);
        setCountryPrices(data.country_prices ? Object.entries(data.country_prices).map(([currency, price]) => ({
          country: '',
          currency,
          price: price.toString()
        })) : []);
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

  // Fetch app stats
  const fetchAppStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_stats');
      if (error) throw error;
      setAppStats(data as unknown as AdminStats);
    } catch (error) {
      console.error('Error fetching app stats:', error);
    }
  }, []);

  // Fetch pending images
  const fetchPendingImages = useCallback(async () => {
    try {
      setLoadingPendingImages(true);
      const { data, error } = await supabase
        .from('user_images')
        .select('*')
        .eq('moderation_status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setPendingImages(data || []);
    } catch (error) {
      console.error('Error fetching pending images:', error);
    } finally {
      setLoadingPendingImages(false);
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

  // Check admin status on mount
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsAdmin(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        setIsAdmin(profile?.is_admin || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, []);

  // Second useEffect for fetching data after admin status is confirmed
  useEffect(() => {
    if (isAdmin) {
      fetchAppStats();
      fetchUsers();
      fetchPendingImages();
    }
  }, [isAdmin, fetchAppStats, fetchUsers, fetchPendingImages]);

  // Cleanup effect for memory management
  useEffect(() => {
    return () => {
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

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || user.account_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <AdminErrorBoundary>
      <div className="w-full min-h-screen bg-gray-100">
        <div className="w-full max-w-[390px] mx-auto bg-white min-h-screen">
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <Button onClick={onLogout} variant="outline" size="sm">
                Logout
              </Button>
            </div>

            {/* Navigation Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="images">Images</TabsTrigger>
              </TabsList>

              {/* Dashboard Tab */}
              <TabsContent value="dashboard" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>App Statistics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {appStats && (
                      <StatsCard stats={appStats} />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment Configuration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={() => setShowPaymentConfig(true)} 
                      disabled={loadingConfig}
                      className="w-full"
                    >
                      Configure Premium Payment Options
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users" className="space-y-4">
                <div className="p-4">
                  <p>User moderation panel would go here</p>
                </div>
              </TabsContent>

              {/* Images Tab */}
              <TabsContent value="images" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Image Moderation ({pendingImages.length} pending)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={async () => {
                        toast({ title: "Bulk approval started", description: "Approving all existing images..." });
                        await bulkApproveExistingImages();
                        await fetchPendingImages();
                        toast({ title: "✅ Bulk approval complete", description: "All appropriate images have been approved." });
                      }}
                      variant="outline"
                      size="sm"
                      className="mb-4"
                    >
                      Bulk Approve All
                    </Button>
                    
                    {loadingPendingImages ? (
                      <p>Loading pending images...</p>
                    ) : (
                      <div className="space-y-2">
                        {pendingImages.length === 0 ? (
                          <p className="text-gray-500">No pending images</p>
                        ) : (
                          pendingImages.slice(0, 10).map((image) => (
                            <div key={image.id} className="flex items-center gap-2 p-2 border rounded">
                              <img src={image.image_url} alt="Pending" className="w-16 h-16 object-cover rounded" />
                              <div className="flex-1">
                                <p className="text-sm">User: {image.user_id}</p>
                                <p className="text-xs text-gray-500">{new Date(image.created_at).toLocaleDateString()}</p>
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline">Approve</Button>
                                <Button size="sm" variant="destructive">Reject</Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Payment Config Modal */}
      {showPaymentConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowPaymentConfig(false)} 
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold mb-4">Configure Premium Payment</h2>
            
            <div className="mb-4">
              <label className="block font-medium mb-1">Default Premium Price (GHS)</label>
              <Input 
                value={premiumPrice} 
                onChange={e => setPremiumPrice(e.target.value)} 
                type="number" 
                min="1" 
                className="w-full" 
              />
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Enabled Countries</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                {enabledCountries.map(countryCode => {
                  const country = getCountryByCode(countryCode);
                  return (
                    <Badge key={countryCode} variant="outline" className="flex items-center gap-1">
                      {country?.name || countryCode}
                      <button
                        onClick={() => setEnabledCountries(prev => prev.filter(c => c !== countryCode))}
                        className="text-red-500 hover:text-red-700 ml-1"
                      >
                        ×
                      </button>
                    </Badge>
                  );
                })}
              </div>
              <select
                onChange={e => {
                  const value = e.target.value;
                  if (value && !enabledCountries.includes(value)) {
                    setEnabledCountries(prev => [...prev, value]);
                  }
                  e.target.value = '';
                }}
                className="w-full border rounded px-2 py-1"
              >
                <option value="">Add Country</option>
                {getCountriesList().map(country => (
                  <option key={country.code} value={country.code}>{country.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Payment Methods</h3>
              {paymentMethods.map((method, index) => (
                <div key={index} className="mb-3 p-3 border rounded">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium">Method</label>
                      <Input
                        value={method.type}
                        onChange={e => handlePaymentMethodChange(index, 'type', e.target.value)}
                        placeholder="e.g., card, mobilemoney"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Name</label>
                      <Input
                        value={method.name || ''}
                        onChange={e => handlePaymentMethodChange(index, 'name', e.target.value)}
                        placeholder="e.g., Mobile Money"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSavePaymentConfig} disabled={loadingConfig}>
                {loadingConfig ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button variant="outline" onClick={() => setShowPaymentConfig(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && selectedUserId && (
        <UserProfileModal
          userId={selectedUserId}
          isOpen={isProfileModalOpen}
          onClose={() => {
            setIsProfileModalOpen(false);
            setSelectedUserId(null);
          }}
        />
      )}
    </AdminErrorBoundary>
  );
};

export default AdminPageComponent;
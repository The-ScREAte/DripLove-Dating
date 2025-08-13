import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCountriesList, getCountryByCode } from '@/constants/locationData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { defaultPaymentMethods, PaymentMethod } from '@/constants/paymentConfig';
import { bulkApproveExistingImages } from '@/utils/bulkApproveImages';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import UserProfileModal from '@/components/UserProfileModal';
import StatsCard from './admin/StatsCard';
import UserModerationPanel from './admin/UserModerationPanel';
import AdminErrorBoundary from './admin/AdminErrorBoundary';
import UserPoolDebugger from './admin/UserPoolDebugger';
import CountryManagement from './admin/CountryManagement';
import ImageModerationPanel from './admin/ImageModerationPanel';
import SafeAreaDebug from './SafeAreaDebug';
import NotificationTester from './NotificationTester';
import { debounce, userDataCache, createPagination } from '@/utils/performanceOptimizer';
import { useSupabaseSubscription, useMemoryMonitor } from '@/hooks/usePerformance';
import { CurrentUser, AdminStats } from '@/types';
import { 
  LogOut, 
  Shield, 
  Users, 
  Heart, 
  MessageSquare, 
  TrendingUp, 
  Calendar, 
  Pause, 
  UserX, 
  UserPlus, 
  Eye, 
  Search, 
  Play,
  Trash2,
  Settings,
  Image,
  CreditCard,
  BarChart3
} from 'lucide-react';

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
  city: string;
  country: string;
  age: number;
  is_admin: boolean;
}

interface PendingImage {
  id: string;
  image_url: string;
  is_approved: boolean;
  moderation_status: string;
  moderation_notes?: string;
  created_at: string;
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

const AdminPageComponent = ({ currentUser, onLogout }: AdminPageProps) => {
  // Always call hooks in the same order - performance monitoring
  useMemoryMonitor();
  
  // All state hooks first - consistent order
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [premiumPriceOneTime, setPremiumPriceOneTime] = useState('50');
  const [premiumPriceMonthly, setPremiumPriceMonthly] = useState('25');
  // Now an array of { country, currency, price }
  const [countryPrices, setCountryPrices] = useState<{ country: string; currency: string; price: string }[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
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
        const response = await supabase
          .from('payment_config')
          .select('premium_price, premium_price_monthly, payment_methods, country_prices')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (response.error) throw response.error;

        const data = response.data as any; // Use any to bypass TypeScript issues
        setPaymentMethods(data.payment_methods as unknown as PaymentMethod[]);
        setPremiumPriceOneTime(data.premium_price?.toString() || '');
        setPremiumPriceMonthly(data.premium_price_monthly?.toString() || '');
        setCountryPrices(Array.isArray(data.country_prices) ? (data.country_prices as { country: string; currency: string; price: string }[]) : []);
      } catch (error) {
        console.error('Error fetching payment config:', error);
        setPaymentMethods(defaultPaymentMethods);
        setPremiumPriceOneTime('');
        setPremiumPriceMonthly('');
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
            premium_price: Number(premiumPriceOneTime) || 0,
            premium_price_monthly: Number(premiumPriceMonthly) || 0,
            country_prices: countryPrices,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from('payment_config')
          .insert({
            payment_methods: paymentMethods as unknown as any,
            premium_price: Number(premiumPriceOneTime) || 0,
            premium_price_monthly: Number(premiumPriceMonthly) || 0,
            country_prices: countryPrices,
          });

        if (error) throw error;
      }

      setShowPaymentConfig(false);
      toast({ title: 'Saved', description: 'Payment methods and prices updated.' });
    } catch (error) {
      console.error('Error saving payment config:', error);
      toast({ title: 'Error', description: 'Failed to save payment config', variant: 'destructive' });
    } finally {
      setLoadingConfig(false);
    }
  };

  const renderPaymentMethodsAdmin = () => (
    <>
      <Button
        className="mb-4 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-400 hover:from-yellow-500 hover:via-yellow-600 hover:to-orange-500 text-black font-bold py-2 px-6 rounded-xl shadow-md transition-all duration-200"
        onClick={() => setShowPaymentConfig(true)}
        disabled={loadingConfig}
      >
        Configure Premium Payment Options
      </Button>
      {loadingConfig && (
        <div className="text-center text-sm text-gray-500 mb-2">Loading payment config...</div>
      )}
      {showPaymentConfig && !loadingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto border-2 border-yellow-300">
            <button
              onClick={() => setShowPaymentConfig(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-2xl font-bold transition-colors"
              aria-label="Close"
            >✕</button>
            <h2 className="text-2xl font-bold mb-6 text-center text-yellow-600 flex items-center justify-center gap-2">
              <span>⚙️</span> Configure Premium Payment
            </h2>
            <div className="mb-6 space-y-4">
              <div>
                <label className="block font-semibold mb-2 text-gray-700">One-Time Premium Price (GHS)</label>
                <Input value={premiumPriceOneTime} onChange={e => setPremiumPriceOneTime(e.target.value)} type="number" min="1" className="w-full border-2 border-yellow-200 focus:border-yellow-400 rounded-lg" />
              </div>
              <div>
                <label className="block font-semibold mb-2 text-gray-700">Monthly Premium Price (GHS)</label>
                <Input value={premiumPriceMonthly} onChange={e => setPremiumPriceMonthly(e.target.value)} type="number" min="1" className="w-full border-2 border-yellow-200 focus:border-yellow-400 rounded-lg" />
              </div>
            </div>
            <div className="mb-6">
              <h3 className="font-semibold mb-3 text-gray-800">Country-Specific Prices</h3>
              <div className="space-y-3">
                {countryPrices.map((entry, idx) => {
                  const countryOptions = getCountriesList();
                  const selectedCountry = countryOptions.find(c => c.code === entry.country);
                  const currency = selectedCountry ? getCountryByCode(selectedCountry.code)?.currency || '' : '';
                  return (
                    <div key={idx} className="flex gap-2 items-center bg-yellow-50 rounded-lg p-2 border border-yellow-100 mb-1">
                      {/* Country dropdown */}
                      <select
                        value={entry.country}
                        onChange={e => {
                          const v = e.target.value;
                          const countryObj = getCountryByCode(v);
                          setCountryPrices(prices => prices.map((p, i) => i === idx ? { ...p, country: v, currency: countryObj?.currency || '', price: p.price } : p));
                        }}
                        className="w-1/3 border-2 border-yellow-200 rounded-lg px-2 py-1 focus:border-yellow-400 bg-white"
                      >
                        <option value="">Select Country</option>
                        {countryOptions.map(c => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                      {/* Currency display (readonly) */}
                      <Input
                        value={entry.currency}
                        readOnly
                        className="w-1/4 bg-gray-100 cursor-not-allowed border-2 border-yellow-100 rounded-lg"
                        placeholder="Currency"
                      />
                      {/* Price input */}
                      <Input
                        value={entry.price}
                        onChange={e => {
                          const v = e.target.value;
                          setCountryPrices(prices => prices.map((p, i) => i === idx ? { ...p, price: v } : p));
                        }}
                        type="number"
                        min="1"
                        placeholder="Price"
                        className="w-1/4 border-2 border-yellow-200 rounded-lg focus:border-yellow-400"
                      />
                      {/* Delete button */}
                      <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-100" onClick={() => setCountryPrices(prices => prices.filter((_, i) => i !== idx))}>
                        ✕
                      </Button>
                    </div>
                  );
                })}
                <Button size="sm" variant="outline" className="mt-2 border-yellow-300 text-yellow-700 hover:bg-yellow-100" onClick={() => setCountryPrices(prices => [...prices, { country: '', currency: '', price: '' }])}>
                  + Add Country
                </Button>
              </div>
            </div>
            <div className="mb-6">
              <h3 className="font-semibold mb-3 text-gray-800">Payment Methods</h3>
              <div className="space-y-4">
                {paymentMethods.map((method, idx) => (
                  <div key={method.type} className="flex flex-col gap-2 border-b border-yellow-100 pb-3 bg-white rounded-lg p-3">
                    <span className="font-medium capitalize text-yellow-700 text-base flex items-center gap-2">
                      {method.type === 'momo' ? '📱' : '💳'} {method.label}
                    </span>
                    {method.type === 'momo' ? (
                      <>
                        <Input
                          value={method.details}
                          onChange={e => handlePaymentMethodChange(idx, 'details', e.target.value)}
                          placeholder="MoMo Number"
                          className="w-full border-2 border-yellow-200 rounded-lg focus:border-yellow-400"
                        />
                        <Input
                          value={method.name || ''}
                          onChange={e => handlePaymentMethodChange(idx, 'name', e.target.value)}
                          placeholder="MoMo Name"
                          className="w-full border-2 border-yellow-200 rounded-lg focus:border-yellow-400"
                        />
                        <Input
                          value={method.extra || ''}
                          onChange={e => handlePaymentMethodChange(idx, 'extra', e.target.value)}
                          placeholder="MoMo Provider/Network (optional)"
                          className="w-full border-2 border-yellow-200 rounded-lg focus:border-yellow-400"
                        />
                      </>
                    ) : (
                      <>
                        <Input
                          value={method.details}
                          onChange={e => handlePaymentMethodChange(idx, 'details', e.target.value)}
                          placeholder="Card/Account Details"
                          className="w-full border-2 border-yellow-200 rounded-lg focus:border-yellow-400"
                        />
                        <Input
                          value={method.extra || ''}
                          onChange={e => handlePaymentMethodChange(idx, 'extra', e.target.value)}
                          placeholder="Bank Name/Info (optional)"
                          className="w-full border-2 border-yellow-200 rounded-lg focus:border-yellow-400"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Button
              onClick={handleSavePaymentConfig}
              className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-400 hover:from-yellow-500 hover:via-yellow-600 hover:to-orange-500 text-black font-bold py-3 rounded-xl text-lg shadow-xl transition-all duration-200"
            >
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* Show saved payment methods below the form */}
      <div className="mt-10">
        <h3 className="font-semibold mb-3 text-gray-800">Saved Payment Accounts (Receiving)</h3>
        <div className="space-y-3">
          {paymentMethods.map((method, idx) => (
            <div key={method.type + idx} className="border border-yellow-200 rounded-xl p-4 bg-yellow-50 flex flex-col gap-1 shadow-sm">
              <span className="font-bold capitalize text-yellow-700 text-base flex items-center gap-2">
                {method.type === 'momo' ? '📱' : '💳'} {method.label} Account
              </span>
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

      {/* Country Management Section */}
      <div className="mt-8">
        <CountryManagement />
      </div>
    </>
  );

  // Debounced search for better performance
  const debouncedSearch = useCallback(
    debounce((term: string) => {
      setSearchTerm(term);
      setCurrentPage(1); // Reset to first page on search
    }, 300),
    []
  );

  // Check if current user is admin - useEffect for admin status
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

  const fetchPendingImages = useCallback(async () => {
    try {
      setLoadingPendingImages(true);

      // Check cache first for performance
      const cacheKey = 'pending_images';
      const cachedImages = userDataCache.get(cacheKey);
      if (cachedImages) {
        setPendingImages(cachedImages);
        setLoadingPendingImages(false);
        return;
      }

      // Fetch images that need approval with pagination for performance
      const { data, error } = await supabase
        .from('user_images')
        .select(`
          id,
          image_url,
          is_approved,
          moderation_status,
          moderation_notes,
          created_at,
          user_id
        `)
        .or('is_approved.eq.false,moderation_status.eq.pending')
        .order('created_at', { ascending: false })
        .limit(50); // Limit for performance

      if (error) {
        console.error('❌ Error fetching pending images:', error);
        setPendingImages([]);
        toast({
          title: 'Error',
          description: 'Failed to load pending images',
          variant: 'destructive'
        });
        return;
      }
      
      if (!data || data.length === 0) {
        setPendingImages([]);
        userDataCache.set(cacheKey, []);
        return;
      }

      // Batch fetch user profiles for better performance
      const userIds = [...new Set(data.map(img => img.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds);

      // Transform the data to match expected format
      const transformedData = data.map(img => ({
        id: img.id,
        image_url: img.image_url,
        is_approved: img.is_approved ?? false,
        moderation_status: img.moderation_status ?? 'pending',
        moderation_notes: img.moderation_notes,
        created_at: img.created_at,
        profile: profiles?.find(p => p.id === img.user_id) || {
          first_name: 'Unknown',
          last_name: 'User',
          email: 'unknown@example.com'
        }
      }));

      setPendingImages(transformedData);
      // Cache for 2 minutes (shorter for pending content)
      userDataCache.set(cacheKey, transformedData);
    } catch (error) {
      console.error('Error fetching pending images:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending images',
        variant: 'destructive'
      });
      setPendingImages([]);
    } finally {
      setLoadingPendingImages(false);
    }
  }, [toast]);

  const approveImage = async (imageId: string) => {
    try {
      setApprovingImages(prev => ({ ...prev, [imageId]: true }));

      // Use the approve_image function if available, otherwise direct update
      const { data, error } = await supabase.rpc('approve_image', {
        image_id: imageId,
        admin_notes: 'Approved by admin'
      });

      if (error) {
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          // Fallback to direct update if function doesn't exist
          const { error: updateError } = await supabase
            .from('user_images')
            .update({
              is_approved: true,
              moderation_status: 'approved',
              moderated_at: new Date().toISOString(),
              moderated_by: currentUser.id
            })
            .eq('id', imageId);

          if (updateError) throw updateError;
        } else {
          throw error;
        }
      }

      // Remove from pending list
      setPendingImages(prev => prev.filter(img => img.id !== imageId));
      
      toast({
        title: 'Success',
        description: 'Image approved successfully'
      });

      // Refresh stats and pending images
      await Promise.all([fetchAppStats(), fetchPendingImages()]);

    } catch (error) {
      console.error('Error approving image:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve image',
        variant: 'destructive'
      });
    } finally {
      setApprovingImages(prev => ({ ...prev, [imageId]: false }));
    }
  };

  const rejectImage = async (imageId: string) => {
    try {
      setRejectingImages(prev => ({ ...prev, [imageId]: true }));

      // Use the reject_image function which has admin privileges and deletes the image
      const { error } = await supabase.rpc('reject_image', {
        image_id: imageId,
        admin_notes: 'Rejected by admin'
      });

      if (error) {
        throw error;
      }

      // Remove from pending list immediately
      setPendingImages(prev => prev.filter(img => img.id !== imageId));
      
      toast({
        title: 'Image rejected',
        description: 'Image permanently deleted from database'
      });

    } catch (error) {
      console.error('❌ Error rejecting image:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject image. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setRejectingImages(prev => ({ ...prev, [imageId]: false }));
    }
  };

  const fetchAppStats = useCallback(async () => {
    try {
      // Check cache first for better performance
      const cacheKey = 'app_stats';
      const cachedStats = userDataCache.get(cacheKey);
      if (cachedStats) {
        setStats(cachedStats);
        return;
      }

      const { data, error } = await supabase.rpc('get_app_stats');
      if (error) throw error;
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const statsData = data as unknown as AdminStats;
        setStats(statsData);
        // Cache for 2 minutes (stats don't change frequently)
        userDataCache.set(cacheKey, statsData);
      }
    } catch (error) {
      console.error('Error fetching app stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load app statistics',
        variant: 'destructive'
      });
    }
  }, [toast]);

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
    <div className="admin-page-container w-full min-h-screen bg-gray-100"
         style={{ 
           touchAction: 'pan-x pan-y',
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none'
         }}>
      {/* Safe Area Debug Component - Remove in production */}
      <SafeAreaDebug />
      
      {/* Notification Tester - Remove in production */}
      <NotificationTester currentUser={currentUser} />
      
      <div className="w-full max-w-[390px] mx-auto bg-white min-h-screen">
        {/* Fixed Header with Safe Area */}
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
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
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div className="p-4">

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
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <BarChart3 className="w-5 h-5" />
                      Platform Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                        <div>
                          <p className="text-xs text-blue-700 font-medium">Total Users</p>
                          <p className="text-lg font-bold text-blue-900">{stats.total_users}</p>
                        </div>
                        <Users className="w-6 h-6 text-blue-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-50 to-pink-100 rounded-lg border border-pink-200">
                        <div>
                          <p className="text-xs text-pink-700 font-medium">Total Matches</p>
                          <p className="text-lg font-bold text-pink-900">{stats.total_matches}</p>
                        </div>
                        <Heart className="w-6 h-6 text-pink-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
                        <div>
                          <p className="text-xs text-green-700 font-medium">Messages Sent</p>
                          <p className="text-lg font-bold text-green-900">{stats.total_messages}</p>
                        </div>
                        <MessageSquare className="w-6 h-6 text-green-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                        <div>
                          <p className="text-xs text-purple-700 font-medium">Active Today</p>
                          <p className="text-lg font-bold text-purple-900">{stats.active_users_today}</p>
                        </div>
                        <TrendingUp className="w-6 h-6 text-purple-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-indigo-50 to-indigo-100 rounded-lg border border-indigo-200">
                        <div>
                          <p className="text-xs text-indigo-700 font-medium">New This Week</p>
                          <p className="text-lg font-bold text-indigo-900">{stats.new_users_this_week}</p>
                        </div>
                        <Calendar className="w-6 h-6 text-indigo-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
                        <div>
                          <p className="text-xs text-yellow-700 font-medium">Users On Hold</p>
                          <p className="text-lg font-bold text-yellow-900">{stats.users_on_hold}</p>
                        </div>
                        <Pause className="w-6 h-6 text-yellow-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-red-50 to-red-100 rounded-lg border border-red-200">
                        <div>
                          <p className="text-xs text-red-700 font-medium">Blocked Users</p>
                          <p className="text-lg font-bold text-red-900">{stats.blocked_users}</p>
                        </div>
                        <UserX className="w-6 h-6 text-red-500" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                        <div>
                          <p className="text-xs text-gray-700 font-medium">Total Admins</p>
                          <p className="text-lg font-bold text-gray-900">{stats.total_admins}</p>
                        </div>
                        <Shield className="w-6 h-6 text-gray-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
                        <div key={admin.id} className="flex items-center justify-between p-2 bg-blue-50 rounded">
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
            </TabsContent>

            {/* Content Tab - Image Moderation */}
            <TabsContent value="content" className="space-y-4">
              <ImageModerationPanel />
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
            isAdmin={true}
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

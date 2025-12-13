import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCountriesList, getCountryByCode } from '@/constants/locationData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { defaultPaymentMethods, PaymentMethod } from '@/constants/paymentConfig';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import UserProfileModal from '@/components/UserProfileModal';
import StatsCard from './admin/StatsCard';
import UserModerationPanel from './admin/UserModerationPanel';
import AdminErrorBoundary from './admin/AdminErrorBoundary';
import UserPoolDebugger from './admin/UserPoolDebugger';
import CountryManagement from './admin/CountryManagement';
import ImageModerationPanel from './admin/ImageModerationPanel';
import FaceManagement from './admin/FaceManagement';

import ManualPremiumManager from './admin/ManualPremiumManager';
import AdsManagement from './admin/AdsManagement';
import RedirectLinkCreator from './admin/RedirectLinkCreator';
import BroadcastNotifications from './admin/BroadcastNotifications';
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
  BarChart3,
  Crown,
  Megaphone,
  Link2,
  Scan
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
  gender?: string | null;
  preference?: string | null;
  relationship_intent?: string | null;
  is_premium?: boolean;
  last_login_at?: string | null;
  login_count?: number | null;
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
  const [defaultInternationalPrice, setDefaultInternationalPrice] = useState('1.99');
  const [defaultInternationalCurrency, setDefaultInternationalCurrency] = useState('USD');
  // Now an array of { country, currency, price }
  const [countryPrices, setCountryPrices] = useState<{ country: string; currency: string; price: string }[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [showPaymentConfig, setShowPaymentConfig] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [interestedInFilter, setInterestedInFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [relationshipIntentFilter, setRelationshipIntentFilter] = useState('all');
  const [premiumFilter, setPremiumFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [matchUser1, setMatchUser1] = useState('');
  const [matchUser2, setMatchUser2] = useState('');
  const matchUser1Ref = useRef('');
  const matchUser2Ref = useRef('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [loadingPendingImages, setLoadingPendingImages] = useState(false);
  const [approvingImages, setApprovingImages] = useState<Record<string, boolean>>({});
  const [rejectingImages, setRejectingImages] = useState<Record<string, boolean>>({});
  const [reportedChats, setReportedChats] = useState<any[]>([]);
  const [loadingReportedChats, setLoadingReportedChats] = useState(false);
  const [processingReportIds, setProcessingReportIds] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailReport, setEmailReport] = useState<any | null>(null);
  const [emailRecipient, setEmailRecipient] = useState<'reported' | 'reporter'>('reported');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  
  // Constants
  const usersPerPage = 20;
  const { toast } = useToast();
  
  // Push notifications hook for sending admin notifications
  const { sendAdminNotification } = usePushNotifications(currentUser?.id);

  // Fetch payment config from DB on mount
  useEffect(() => {
    const fetchConfig = async () => {
      setLoadingConfig(true);
      try {
        const response = await supabase
          .from('payment_config')
          .select('premium_price, premium_price_monthly, payment_methods, country_prices, default_international_price, default_international_currency')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (response.error) throw response.error;

        const data = response.data as any; // Use any to bypass TypeScript issues
        setPaymentMethods(data.payment_methods as unknown as PaymentMethod[]);
        setPremiumPriceOneTime(data.premium_price?.toString() || '');
        setPremiumPriceMonthly(data.premium_price_monthly?.toString() || '');
        setDefaultInternationalPrice(data.default_international_price?.toString() || '1.99');
        setDefaultInternationalCurrency(data.default_international_currency || 'USD');
        setCountryPrices(Array.isArray(data.country_prices) ? (data.country_prices as { country: string; currency: string; price: string }[]) : []);
      } catch (error) {
        console.error('Error fetching payment config:', error);
        setPaymentMethods(defaultPaymentMethods);
        setPremiumPriceOneTime('');
        setPremiumPriceMonthly('');
        setDefaultInternationalPrice('1.99');
        setDefaultInternationalCurrency('USD');
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
            default_international_price: Number(defaultInternationalPrice) || 1.99,
            default_international_currency: defaultInternationalCurrency || 'USD',
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
            default_international_price: Number(defaultInternationalPrice) || 1.99,
            default_international_currency: defaultInternationalCurrency || 'USD',
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
                <label className="block font-semibold mb-2 text-gray-700">Ghana One-Time Price (GHS)</label>
                <Input value={premiumPriceOneTime} onChange={e => setPremiumPriceOneTime(e.target.value)} type="number" min="1" step="0.01" className="w-full border-2 border-yellow-200 focus:border-yellow-400 rounded-lg" />
              </div>
              <div>
                <label className="block font-semibold mb-2 text-gray-700">Ghana Monthly Price (GHS)</label>
                <Input value={premiumPriceMonthly} onChange={e => setPremiumPriceMonthly(e.target.value)} type="number" min="1" step="0.01" className="w-full border-2 border-yellow-200 focus:border-yellow-400 rounded-lg" />
              </div>
              <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <label className="block font-semibold mb-2 text-blue-800">Default International Price (for countries not listed below)</label>
                <div className="flex gap-2">
                  <select 
                    value={defaultInternationalCurrency} 
                    onChange={e => setDefaultInternationalCurrency(e.target.value)}
                    className="w-24 border-2 border-blue-300 rounded-lg px-2 py-1 focus:border-blue-400 bg-white font-semibold"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                  <Input 
                    value={defaultInternationalPrice} 
                    onChange={e => setDefaultInternationalPrice(e.target.value)} 
                    type="number" 
                    min="1" 
                    step="0.01"
                    className="flex-1 border-2 border-blue-300 focus:border-blue-400 rounded-lg" 
                  />
                </div>
                <p className="text-xs text-blue-600 mt-1">This price will be shown to users from countries not in your country-specific list</p>
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

  const fetchReportedChats = useCallback(async (force = false) => {
    try {
      setLoadingReportedChats(true);
      const cacheKey = 'reported_chats';
      const cached = userDataCache.get(cacheKey);
      // If we have a cached value and force isn't set, use cache to avoid refetching
      if (cached && !force) {
        setReportedChats(cached as any[]);
        setLoadingReportedChats(false);
        return;
      }

      // Fetch reported chat rows from reported_chats
      const { data: actions, error } = await supabase
        .from('reported_chats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!actions || actions.length === 0) {
        setReportedChats([]);
        userDataCache.set(cacheKey, []);
        return;
      }

      // Collect message ids and user ids to batch fetch
      // reported_chats already has reporter_id, reported_user_id and chat_id fields
      const messageIds = actions.map((a: any) => a.chat_id).filter(Boolean);
      const userIds = [
        ...new Set(actions.map((a: any) => a.reporter_id).filter(Boolean).concat(actions.map((a: any) => a.reported_user_id).filter(Boolean)))
      ];

      // Fetch chats/messages
      const { data: chats } = await supabase.from('chats').select('id, message, sender_id, match_id, created_at').in('id', messageIds || []);

      // Fetch profiles for reporter and reported users
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds || []);

      const transformed = actions.map((a: any) => {
        const msg = (chats || []).find((c: any) => c.id === a.chat_id) || null;
        const reporter = (profiles || []).find((p: any) => p.id === a.reporter_id) || null;
        const reportedUser = (profiles || []).find((p: any) => p.id === a.reported_user_id) || null;

        return {
          id: a.id,
          created_at: a.created_at,
          admin_id: a.admin_id,
          details: {
            reporter_id: a.reporter_id,
            content_type: 'message',
            content_id: a.chat_id,
            reason: a.reason,
            description: a.description
          },
          message: msg,
          reporter,
          reportedUser,
        };
      });

      setReportedChats(transformed);
      userDataCache.set(cacheKey, transformed);
    } catch (error) {
      console.error('Error fetching reported chats:', error);
      toast({ title: 'Error', description: 'Failed to load reported chats', variant: 'destructive' });
      setReportedChats([]);
    } finally {
      setLoadingReportedChats(false);
    }
  }, [toast]);

  const ignoreReport = async (reportId: string) => {
    try {
      if (!confirm('Ignore this report? This will remove it from the admin queue.')) return;
      setProcessingReportIds(prev => ({ ...prev, [reportId]: true }));
  const { error } = await supabase.from('reported_chats').delete().eq('id', reportId);
      if (error) throw error;
      setReportedChats(prev => prev.filter(r => r.id !== reportId));
      userDataCache.clear();
      toast({ title: 'Ignored', description: 'Report removed.' });
    } catch (error) {
      console.error('Error ignoring report:', error);
      toast({ title: 'Error', description: 'Failed to ignore report', variant: 'destructive' });
    } finally {
      setProcessingReportIds(prev => ({ ...prev, [reportId]: false }));
    }
  };

  const deleteReportedMessage = async (reportId: string, messageId?: string) => {
    try {
      if (!messageId) {
        toast({ title: 'Error', description: 'Message id missing', variant: 'destructive' });
        return;
      }
      if (!confirm('Permanently delete this message from the database?')) return;
      setProcessingReportIds(prev => ({ ...prev, [reportId]: true }));

  const { error: delErr } = await supabase.from('chats').delete().eq('id', messageId);
      if (delErr) throw delErr;

      // Remove the report after deleting the message
  const { error: repErr } = await supabase.from('reported_chats').delete().eq('id', reportId);
      if (repErr) throw repErr;

      setReportedChats(prev => prev.filter(r => r.id !== reportId));
      userDataCache.clear();
      toast({ title: 'Deleted', description: 'Message removed and report cleared.' });
    } catch (error) {
      console.error('Error deleting reported message:', error);
      toast({ title: 'Error', description: 'Failed to delete message', variant: 'destructive' });
    } finally {
      setProcessingReportIds(prev => ({ ...prev, [reportId]: false }));
    }
  };

  const blockUserFromReport = async (reportId: string, reportedUserId?: string) => {
    try {
      if (!reportedUserId) {
        toast({ title: 'Error', description: 'Reported user id missing', variant: 'destructive' });
        return;
      }
      if (!confirm('Block this user? This will set their account status to BLOCKED.')) return;
      setProcessingReportIds(prev => ({ ...prev, [reportId]: true }));

      // Use existing RPC to update account status
      const { error } = await supabase.rpc('admin_update_account_status', {
        target_user_id: reportedUserId,
        new_status: 'blocked'
      });
      if (error) throw error;

      // Send push notification to blocked user
      try {
        await sendAdminNotification(
          '🚫 Account Blocked',
          'Your account has been blocked due to community guideline violations. Please contact support if you believe this is an error.',
          reportedUserId
        );
        console.log('📤 Account block notification sent to:', reportedUserId);
      } catch (notifError) {
        console.error('📤 Failed to send block notification:', notifError);
        // Don't fail the block action if notification fails
      }

      // Optionally remove the report after blocking
  const { error: repErr } = await supabase.from('reported_chats').delete().eq('id', reportId);
      if (repErr) throw repErr;

      setReportedChats(prev => prev.filter(r => r.id !== reportId));
      userDataCache.clear();
      fetchAppStats();
      toast({ title: 'User Blocked', description: 'User has been blocked and report cleared.' });
    } catch (error) {
      console.error('Error blocking user from report:', error);
      toast({ title: 'Error', description: 'Failed to block user', variant: 'destructive' });
    } finally {
      setProcessingReportIds(prev => ({ ...prev, [reportId]: false }));
    }
  };

  const openEmailModal = (report: any) => {
    setEmailReport(report);
    // default to emailing the reported user if present, otherwise the reporter
    setEmailRecipient(report.reportedUser ? 'reported' : 'reporter');
    const reason = report?.details?.reason || '';
  setEmailSubject(`Urgent: Report #${report.id}${reason ? ` — ${reason}` : ''}`);

    // prepare a polite, neutral template depending on recipient
    const reportedName = report.reportedUser ? `${report.reportedUser.first_name || ''} ${report.reportedUser.last_name || ''}`.trim() : '';
    const reporterName = report.reporter ? `${report.reporter.first_name || ''} ${report.reporter.last_name || ''}`.trim() : '';

    if (report.reportedUser) {
      setEmailBody(
        `Hello ${reportedName || 'User'},\n\n` +
        `This is an official notice from the DripLove moderation team regarding a report (ID: ${report.id}) alleging: ${reason || '—'}. We request that you provide any relevant context or explanation within 3 days of receiving this message. ` +
        `Failure to respond within 3 days may result in temporary suspension or permanent blocking of your account while we complete our review.\n\n` +
        `If you believe this report was made in error, please reply with supporting details immediately so we can resolve the matter promptly.\n\n` +
        `Regards,\nDripLove Support`
      );
    } else {
      setEmailBody(
        `Hello ${reporterName || 'User'},\n\n` +
        `Thank you for submitting a report (ID: ${report.id}) regarding: ${reason || '—'}. Our moderation team is reviewing this matter. If you have any additional information, evidence, or context that would assist our investigation, please reply to this message.\n\n` +
        `We appreciate your help keeping the DripLove community safe.\n\nRegards,\nDripLove Support`
      );
    }

    setIsEmailModalOpen(true);
  };

  const closeEmailModal = () => {
    setIsEmailModalOpen(false);
    setEmailReport(null);
    setEmailSubject('');
    setEmailBody('');
  };

  const sendEmailToSelected = () => {
    if (!emailReport) return;

    const recipientEmail = emailRecipient === 'reported'
      ? emailReport.reportedUser?.email || emailReport.details?.reported_user_id
      : emailReport.reporter?.email || emailReport.details?.reporter_id;

    if (!recipientEmail) {
      toast({ title: 'Error', description: 'Recipient email not available', variant: 'destructive' });
      return;
    }

    const subject = encodeURIComponent(emailSubject || `Regarding report #${emailReport.id}`);
    const body = encodeURIComponent(emailBody || '');
    const mailto = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;

    // open user's default mail client
    window.open(mailto, '_blank');
    closeEmailModal();
  };

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

      const { data, error } = await supabase.rpc('get_admin_stats');
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
      const cacheKey = `users_all_${statusFilter}_${genderFilter}_${interestedInFilter}_${countryFilter}_${relationshipIntentFilter}_${premiumFilter}_${activityFilter}`;
      const cachedUsers = userDataCache.get(cacheKey);
      if (cachedUsers) {
        const { regularUsers, admins } = cachedUsers;
        setUsers(regularUsers);
        setAdminUsers(admins);
        setLoading(false);
        return;
      }

      // Fetch ALL users (not paginated in query - pagination happens in UI)
      let query = supabase
        .from('profiles')
        .select(`
          id, 
          first_name, 
          last_name, 
          email, 
          account_status, 
          created_at, 
          city, 
          country, 
          date_of_birth, 
          is_admin, 
          gender, 
          preference, 
          relationship_intent,
          last_login_at,
          login_count,
          user_subscriptions!left(
            status,
            expires_at
          )
        `)
        .eq('is_admin', false)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('account_status', statusFilter);
      }
      
      if (genderFilter !== 'all') {
        query = query.eq('gender', genderFilter);
      }
      
      if (interestedInFilter !== 'all') {
        query = query.eq('preference', interestedInFilter);
      }
      
      if (countryFilter !== 'all') {
        query = query.eq('country', countryFilter);
      }
      
      if (relationshipIntentFilter !== 'all') {
        query = query.eq('relationship_intent', relationshipIntentFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      const usersWithAge = data?.map(user => {
        // Check if user has active premium subscription
        // Premium if status is 'active' AND (expires_at is null OR expires_at is in the future)
        const hasPremium = Array.isArray(user.user_subscriptions) && 
          user.user_subscriptions.some((sub: any) => 
            sub.status === 'active' && 
            (sub.expires_at === null || new Date(sub.expires_at) > new Date())
          );
        
        return {
          ...user,
          age: calculateAge(user.date_of_birth),
          is_premium: hasPremium,
          last_login_at: (user as any).last_login_at,
          login_count: (user as any).login_count
        };
      }) || [];

      // Fetch admin users separately
      const { data: adminData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, account_status, created_at, city, country, date_of_birth, is_admin, gender, preference, relationship_intent')
        .eq('is_admin', true)
        .order('created_at', { ascending: false });

      const adminsWithAge = adminData?.map(user => ({
        ...user,
        age: calculateAge(user.date_of_birth)
      })) || [];

      setUsers(usersWithAge);
      setAdminUsers(adminsWithAge);
      
      // Cache the users data for 3 minutes
      userDataCache.set(cacheKey, { regularUsers: usersWithAge, admins: adminsWithAge });
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
  }, 300), [toast, statusFilter, genderFilter, interestedInFilter, countryFilter, relationshipIntentFilter, premiumFilter, activityFilter]);

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
      fetchReportedChats();
    }
  }, [isAdmin, fetchAppStats, fetchUsers, fetchPendingImages]);

  const updateUserStatus = async (userId: string, newStatus: string) => {
    try {
      const { error } = await supabase.rpc('admin_update_account_status', {
        target_user_id: userId,
        new_status: newStatus
      });

      if (error) throw error;

      // Send push notification based on status change
      try {
        const notificationMessages = {
          'active': {
            title: '✅ Account Activated',
            body: 'Your account has been activated. You can now use all features of the app!'
          },
          'on_hold': {
            title: '⏸️ Account On Hold',
            body: 'Your account has been placed on hold pending review. Please contact support for more information.'
          },
          'blocked': {
            title: '🚫 Account Blocked',
            body: 'Your account has been blocked due to policy violations. Contact support if you believe this is an error.'
          }
        };

        const notification = notificationMessages[newStatus as keyof typeof notificationMessages];
        if (notification) {
          await sendAdminNotification(notification.title, notification.body, userId);
          console.log('📤 Account status notification sent to:', userId, '- Status:', newStatus);
        }
      } catch (notifError) {
        console.error('📤 Failed to send status notification:', notifError);
        // Don't fail the status update if notification fails
      }

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
    console.log('=== CREATE MATCH CALLED ===');
    console.log('matchUser1 state:', matchUser1);
    console.log('matchUser2 state:', matchUser2);
    console.log('matchUser1Ref:', matchUser1Ref.current);
    console.log('matchUser2Ref:', matchUser2Ref.current);
    
    // Use refs instead of state to avoid closure issues
    const user1Id = matchUser1Ref.current || matchUser1;
    const user2Id = matchUser2Ref.current || matchUser2;
    
    console.log('Using values:', { user1Id, user2Id });
    
    if (!user1Id || !user2Id) {
      toast({
        title: 'Error',
        description: 'Please select both users to create a match',
        variant: 'destructive'
      });
      return;
    }

    if (user1Id === user2Id) {
      console.log('ERROR: Both users have same ID!');
      toast({
        title: 'Error',
        description: 'Cannot match a user with themselves',
        variant: 'destructive'
      });
      return;
    }

    // Debug logging
    const user1Data = users.find(u => u.id === user1Id);
    const user2Data = users.find(u => u.id === user2Id);
    
    console.log('Creating match with:', {
      user1_id: user1Id,
      user2_id: user2Id,
      user1_data: user1Data,
      user2_data: user2Data,
      are_equal: user1Id === user2Id
    });

    try {
      const { data, error } = await supabase.rpc('admin_create_match', {
        p_user1_id: user1Id,
        p_user2_id: user2Id
      });

      if (error) {
        console.error('RPC Error:', error);
        throw error;
      }

      console.log('Match creation response:', data);

      // Check the response from the function
      if (data && typeof data === 'object') {
        const result = data as { success?: boolean; error?: string; message?: string };
        if (result.success === false) {
          toast({
            title: 'Error',
            description: result.error || 'Failed to create match',
            variant: 'destructive'
          });
          return;
        }
      }

      const result = data as { message?: string } | null;
      toast({
        title: 'Success',
        description: result?.message || 'Match created successfully'
      });

      setMatchUser1('');
      setMatchUser2('');
      matchUser1Ref.current = '';
      matchUser2Ref.current = '';
      await fetchAppStats();

    } catch (error) {
      console.error('Error creating match:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create match';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    }
  };

  const handleLogout = async () => {
    try {
      // Remove push token before logging out
      if (currentUser?.id) {
        const { removePushToken } = await import('@/services/pushNotifications');
        await removePushToken(currentUser.id);
      }
      
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
                         user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.city && user.city.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (user.country && user.country.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || user.account_status === statusFilter;
    const matchesGender = genderFilter === 'all' || user.gender === genderFilter;
    const matchesInterestedIn = interestedInFilter === 'all' || user.preference === interestedInFilter;
    const matchesCountry = countryFilter === 'all' || user.country === countryFilter;
    const matchesRelationshipIntent = relationshipIntentFilter === 'all' || user.relationship_intent === relationshipIntentFilter;
    const matchesPremium = premiumFilter === 'all' || 
      (premiumFilter === 'premium' && user.is_premium) || 
      (premiumFilter === 'free' && !user.is_premium);
    
    // Activity filter logic
    let matchesActivity = true;
    if (activityFilter !== 'all') {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const lastLogin = user.last_login_at ? new Date(user.last_login_at) : null;
      const loginCount = user.login_count || 0;
      
      switch (activityFilter) {
        case 'active_week':
          matchesActivity = lastLogin !== null && lastLogin >= oneWeekAgo;
          break;
        case 'active_month':
          matchesActivity = lastLogin !== null && lastLogin >= oneMonthAgo;
          break;
        case 'logged_once':
          matchesActivity = loginCount === 1;
          break;
        case 'never_active':
          matchesActivity = lastLogin === null || loginCount === 0;
          break;
        case 'inactive_month':
          matchesActivity = lastLogin === null || lastLogin < oneMonthAgo;
          break;
      }
    }
    
    return matchesSearch && matchesStatus && matchesGender && matchesInterestedIn && matchesCountry && matchesRelationshipIntent && matchesPremium && matchesActivity;
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
    <div className="admin-page-container w-full min-h-screen bg-gray-100 overflow-y-auto">
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
        <div className="p-4 pb-20">

          {/* Tabbed Interface with Error Boundaries for 1000+ users */}
          <AdminErrorBoundary>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="space-y-2 mb-3">
                {/* First Row - Main Tabs */}
                <TabsList className="grid w-full grid-cols-4 h-auto">
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
                  <TabsTrigger value="broadcast" className="text-xs flex flex-col gap-1 py-2">
                    <Megaphone className="w-4 h-4" />
                    <span>Broadcast</span>
                  </TabsTrigger>
                </TabsList>

                {/* Second Row - Additional Tabs */}
                <TabsList className="grid w-full grid-cols-5 h-auto">
                  <TabsTrigger value="ads" className="text-xs flex flex-col gap-1 py-2">
                    <Megaphone className="w-4 h-4" />
                    <span>Ads</span>
                  </TabsTrigger>
                  <TabsTrigger value="redirects" className="text-xs flex flex-col gap-1 py-2">
                    <Link2 className="w-4 h-4" />
                    <span>Links</span>
                  </TabsTrigger>
                  <TabsTrigger value="faces" className="text-xs flex flex-col gap-1 py-2">
                    <Scan className="w-4 h-4" />
                    <span>Faces</span>
                  </TabsTrigger>
                  <TabsTrigger value="debugger" className="text-xs flex flex-col gap-1 py-2">
                    <Search className="w-4 h-4" />
                    <span>Debugger</span>
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="text-xs flex flex-col gap-1 py-2">
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </TabsTrigger>
                </TabsList>
              </div>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-4">
              {/* Stats Overview */}
              {stats && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <BarChart3 className="w-4 h-4" />
                      Platform Statistics
                    </CardTitle>
                    <p className="text-xs text-gray-600 mt-1">
                      Real-time metrics including active premium subscriptions
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                        <div>
                          <p className="text-[11px] text-blue-700 font-medium">Total Users</p>
                          <p className="text-base font-bold text-blue-900">{stats.total_users}</p>
                        </div>
                        <Users className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-pink-50 to-pink-100 rounded-lg border border-pink-200">
                        <div>
                          <p className="text-[11px] text-pink-700 font-medium">Total Matches</p>
                          <p className="text-base font-bold text-pink-900">{stats.total_matches}</p>
                        </div>
                        <Heart className="w-5 h-5 text-pink-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
                        <div>
                          <p className="text-[11px] text-green-700 font-medium">Messages Sent</p>
                          <p className="text-base font-bold text-green-900">{stats.total_messages}</p>
                        </div>
                        <MessageSquare className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                        <div>
                          <p className="text-[11px] text-purple-700 font-medium">Active Today</p>
                          <p className="text-base font-bold text-purple-900">{stats.active_users_today}</p>
                        </div>
                        <TrendingUp className="w-5 h-5 text-purple-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-indigo-50 to-indigo-100 rounded-lg border border-indigo-200">
                        <div>
                          <p className="text-[11px] text-indigo-700 font-medium">New This Week</p>
                          <p className="text-base font-bold text-indigo-900">{stats.new_users_this_week}</p>
                        </div>
                        <Calendar className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
                        <div>
                          <p className="text-[11px] text-yellow-700 font-medium">Users On Hold</p>
                          <p className="text-base font-bold text-yellow-900">{stats.users_on_hold}</p>
                        </div>
                        <Pause className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-red-50 to-red-100 rounded-lg border border-red-200">
                        <div>
                          <p className="text-[11px] text-red-700 font-medium">Blocked Users</p>
                          <p className="text-base font-bold text-red-900">{stats.blocked_users}</p>
                        </div>
                        <UserX className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                        <div>
                          <p className="text-[11px] text-gray-700 font-medium">Total Admins</p>
                          <p className="text-base font-bold text-gray-900">{stats.total_admins}</p>
                        </div>
                        <Shield className="w-5 h-5 text-gray-500" />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg border border-orange-200">
                        <div>
                          <p className="text-[11px] text-orange-700 font-medium">Premium Users</p>
                          <p className="text-base font-bold text-orange-900">{stats.premium_users}</p>
                          <p className="text-[10px] text-orange-600 opacity-75">Active subscriptions</p>
                        </div>
                        <Crown className="w-5 h-5 text-orange-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Manual Match Creation */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <UserPlus className="w-4 h-4" />
                    Create Manual Match
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={matchUser1} onValueChange={(value) => {
                      console.log('User 1 selected:', value, users.find(u => u.id === value));
                      matchUser1Ref.current = value;
                      setMatchUser1(value);
                    }}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Select User 1" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user, index) => (
                          <SelectItem key={`${user.id}-${index}`} value={user.id} className="text-xs">
                            {user.first_name} {user.last_name} (ID: {user.id.substring(0, 8)}...)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={matchUser2} onValueChange={(value) => {
                      console.log('User 2 selected:', value, users.find(u => u.id === value));
                      matchUser2Ref.current = value;
                      setMatchUser2(value);
                    }}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Select User 2" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user, index) => (
                          <SelectItem key={`${user.id}-${index}`} value={user.id} className="text-xs">
                            {user.first_name} {user.last_name} (ID: {user.id.substring(0, 8)}...)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createManualMatch} className="w-full text-xs h-8" size="sm">
                    Create Match
                  </Button>
                </CardContent>
              </Card>

              {/* Manual Premium Management */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CreditCard className="w-4 h-4" />
                    Manual Premium Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ManualPremiumManager users={users} onRefreshStats={fetchAppStats} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Broadcast Notifications Tab */}
            <TabsContent value="broadcast" className="space-y-4">
              <BroadcastNotifications />
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-4">
              {/* Admin Users */}
              {adminUsers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Shield className="w-4 h-4" />
                      Admin Users ({adminUsers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {adminUsers.map((admin) => (
                        <div key={admin.id} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                          <div>
                            <p className="font-medium text-xs">{admin.first_name} {admin.last_name}</p>
                            <p className="text-[11px] text-gray-600">{admin.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewProfile(admin.id)}
                              className="text-blue-600 hover:text-blue-700 text-[11px] px-2 py-1 h-6"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                            <Badge className="bg-blue-100 text-blue-800 text-[10px]">
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
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4" />
                      User Management ({filteredUsers.length})
                    </CardTitle>
                    {(statusFilter !== 'all' || genderFilter !== 'all' || interestedInFilter !== 'all' || 
                      countryFilter !== 'all' || relationshipIntentFilter !== 'all' || premiumFilter !== 'all' || activityFilter !== 'all') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setStatusFilter('all');
                          setGenderFilter('all');
                          setInterestedInFilter('all');
                          setCountryFilter('all');
                          setRelationshipIntentFilter('all');
                          setPremiumFilter('all');
                          setActivityFilter('all');
                        }}
                        className="text-xs h-7"
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Search and Filter */}
                  <div className="space-y-2 mb-3">
                    {/* Search Bar */}
                    <div className="flex-1 relative">
                      <Search className="absolute left-2 top-2 h-3 w-3 text-gray-400" />
                      <Input
                        placeholder="Search by name, email, city, or country..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-7 text-xs h-8"
                      />
                    </div>
                    
                    {/* Filters in 2-column grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Status</SelectItem>
                          <SelectItem value="active" className="text-xs">Active</SelectItem>
                          <SelectItem value="on_hold" className="text-xs">On Hold</SelectItem>
                          <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select value={genderFilter} onValueChange={setGenderFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="All Genders" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Genders</SelectItem>
                          <SelectItem value="male" className="text-xs">Male</SelectItem>
                          <SelectItem value="female" className="text-xs">Female</SelectItem>
                          <SelectItem value="other" className="text-xs">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select value={premiumFilter} onValueChange={setPremiumFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="All Users" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Users</SelectItem>
                          <SelectItem value="premium" className="text-xs">Premium</SelectItem>
                          <SelectItem value="free" className="text-xs">Free</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select value={interestedInFilter} onValueChange={setInterestedInFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="All Preferences" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Preferences</SelectItem>
                          <SelectItem value="male" className="text-xs">Interested in Male</SelectItem>
                          <SelectItem value="female" className="text-xs">Interested in Female</SelectItem>
                          <SelectItem value="everyone" className="text-xs">Interested in Everyone</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select value={relationshipIntentFilter} onValueChange={setRelationshipIntentFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="All Intents" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Intents</SelectItem>
                          <SelectItem value="serious" className="text-xs">Serious</SelectItem>
                          <SelectItem value="long-term" className="text-xs">Long-term</SelectItem>
                          <SelectItem value="casual" className="text-xs">Casual</SelectItem>
                          <SelectItem value="open_to_anything" className="text-xs">Open to Anything</SelectItem>
                          <SelectItem value="not-sure" className="text-xs">Not Sure</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select value={countryFilter} onValueChange={setCountryFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="All Countries" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          <SelectItem value="all" className="text-xs">All Countries</SelectItem>
                          {getCountriesList().map(country => (
                            <SelectItem key={country.code} value={country.name} className="text-xs">
                              {country.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Select value={activityFilter} onValueChange={setActivityFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="All Activity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Activity</SelectItem>
                          <SelectItem value="active_week" className="text-xs">Active Last Week</SelectItem>
                          <SelectItem value="active_month" className="text-xs">Active Last Month</SelectItem>
                          <SelectItem value="logged_once" className="text-xs">Logged In Once</SelectItem>
                          <SelectItem value="inactive_month" className="text-xs">Inactive 30+ Days</SelectItem>
                          <SelectItem value="never_active" className="text-xs">Never Logged In</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Users List Container */}
                  <div className="border rounded-lg bg-white">
                    {loading ? (
                      <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600"></div>
                      </div>
                    ) : (
                      <div className="space-y-0 max-h-96 overflow-y-auto">
                        {paginatedUsers.map((user, index) => (
                          <div key={user.id} className={`p-2 space-y-1 ${index !== paginatedUsers.length - 1 ? 'border-b' : ''}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-xs truncate">
                                  {user.first_name} {user.last_name}
                                </h3>
                                <p className="text-[11px] text-gray-600 truncate">{user.email}</p>
                                <p className="text-[11px] text-gray-500">
                                  {user.city}, {user.country} • Age {user.age}
                                  {user.gender && ` • ${user.gender.charAt(0).toUpperCase() + user.gender.slice(1)}`}
                                </p>
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                {user.preference && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                      Interested: {user.preference === 'everyone' ? 'Everyone' : user.preference.charAt(0).toUpperCase() + user.preference.slice(1)}
                                    </Badge>
                                  )}
                                  {user.relationship_intent && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                      {user.relationship_intent.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                    </Badge>
                                  )}
                                  {user.is_premium && (
                                    <Badge className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0 h-4">
                                      Premium
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  Joined: {new Date(user.created_at).toLocaleDateString()}
                                  {user.last_login_at && (
                                    <> • Last active: {new Date(user.last_login_at).toLocaleDateString()}</>
                                  )}
                                  {!user.last_login_at && (
                                    <> • <span className="text-orange-600">Never logged in</span></>
                                  )}
                                  {user.login_count !== null && user.login_count !== undefined && (
                                    <> • Logins: {user.login_count}</>
                                  )}
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
                              ) : user.account_status === 'blocked' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateUserStatus(user.id, 'active')}
                                  className="text-green-600 hover:text-green-700 text-xs px-2 py-1 h-7"
                                >
                                  <Play className="w-3 h-3 mr-1" />
                                  Unblock
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

              {/* Reported Chats Section */}
              <div className="bg-white border rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Reported Chats</h3>
                  <div className="text-xs text-gray-500">{loadingReportedChats ? 'Loading...' : `${reportedChats.length} reports`}</div>
                </div>

                {loadingReportedChats ? (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600"></div>
                  </div>
                ) : reportedChats.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No reported chats.</div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {reportedChats.map((r) => (
                      <div key={r.id} className="p-2 border rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{r.message?.message || '[message deleted]'}</p>
                          <p className="text-[11px] text-gray-600 truncate">
                            Reported by: {r.reporter ? `${r.reporter.first_name} ${r.reporter.last_name}` : r.details?.reporter_id}
                            {' • '}
                            Reported user: {r.reportedUser ? `${r.reportedUser.first_name} ${r.reportedUser.last_name}` : r.details?.reported_user_id || r.details?.reportedUser}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-1">Reason: {r.details?.reason || '—'}</p>
                          {r.details?.description && <p className="text-[11px] text-gray-500 mt-1">Notes: {r.details.description}</p>}
                        </div>

                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => ignoreReport(r.id)} disabled={processingReportIds[r.id]} className="text-xs h-7">
                            Ignore
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => blockUserFromReport(r.id, r.reportedUser?.id || r.details?.reported_user_id)} disabled={processingReportIds[r.id]} className="text-xs h-7">
                            Block
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteReportedMessage(r.id, r.message?.id)} disabled={processingReportIds[r.id]} className="text-xs h-7">
                            Delete
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openEmailModal(r)} className="text-xs h-7">
                            Email
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => fetchReportedChats(true)} className="text-xs">Refresh</Button>
                </div>
              </div>
            </TabsContent>

            {/* Ads Tab */}
            <TabsContent value="ads" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Megaphone className="w-4 h-4" />
                    Ads Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AdsManagement />
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

            {/* Redirects Tab */}
            <TabsContent value="redirects" className="space-y-4">
              <RedirectLinkCreator />
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

            {/* Faces Tab */}
            <TabsContent value="faces" className="space-y-4">
              <FaceManagement />
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

        {/* Email Report Modal */}
        {isEmailModalOpen && emailReport && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg relative border">
              <button onClick={closeEmailModal} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">✕</button>
              <h2 className="text-lg font-semibold mb-2">Email User about Report #{emailReport.id}</h2>
              <p className="text-sm text-gray-600 mb-4">Choose who to email about this report. The emails below are shown for convenience.</p>

              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    id="email-reported"
                    name="email-target"
                    checked={emailRecipient === 'reported'}
                    onChange={() => setEmailRecipient('reported')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium">Reported user</div>
                    <div className="text-xs text-gray-600">
                      {emailReport.reportedUser ? `${emailReport.reportedUser.first_name} ${emailReport.reportedUser.last_name} — ${emailReport.reportedUser.email}` : (emailReport.details?.reported_user_id || 'Unknown')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    id="email-reporter"
                    name="email-target"
                    checked={emailRecipient === 'reporter'}
                    onChange={() => setEmailRecipient('reporter')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium">Reporter</div>
                    <div className="text-xs text-gray-600">
                      {emailReport.reporter ? `${emailReport.reporter.first_name} ${emailReport.reporter.last_name} — ${emailReport.reporter.email}` : (emailReport.details?.reporter_id || 'Unknown')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Message</label>
                <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={6} className="w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={closeEmailModal}>Cancel</Button>
                <Button size="sm" onClick={sendEmailToSelected}>Send Email</Button>
              </div>
            </div>
          </div>
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

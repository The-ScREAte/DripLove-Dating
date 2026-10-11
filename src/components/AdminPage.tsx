import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import type { Json } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCountriesList, getCountryByCode } from '@/constants/locationData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { defaultPaymentMethods, PaymentMethod } from '@/constants/paymentConfig';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import UserProfileModal from '@/components/UserProfileModal';
import AdminErrorBoundary from './admin/AdminErrorBoundary';
// Every admin sub-panel below is lazy-loaded per tab: AdminPage itself is
// already its own chunk (vite.config.ts), but until now every one of these
// ~15 panels was statically bundled into that single chunk regardless of
// which tab (if any) the admin actually opens. Splitting them individually
// means visiting, say, just the Dashboard tab no longer pulls in the code
// for Faces/Ads/Broadcast/Redirects/Influencers/Settings/etc.
const StatsCard = lazy(() => import('./admin/StatsCard'));
const UserPoolDebugger = lazy(() => import('./admin/UserPoolDebugger'));
const CountryManagement = lazy(() => import('./admin/CountryManagement'));
const ImageModerationPanel = lazy(() => import('./admin/ImageModerationPanel'));
const FaceManagement = lazy(() => import('./admin/FaceManagement'));
const AppUpdateSettings = lazy(() => import('./admin/AppUpdateSettings'));
const PaystackSettings = lazy(() => import('./admin/PaystackSettings'));
const ManualPremiumManager = lazy(() => import('./admin/ManualPremiumManager'));
const AdsManagement = lazy(() => import('./admin/AdsManagement'));
const RedirectLinkCreator = lazy(() => import('./admin/RedirectLinkCreator'));
const BroadcastNotifications = lazy(() => import('./admin/BroadcastNotifications'));
const InfluencerManagement = lazy(() => import('./admin/InfluencerManagement'));
const SmartMatchSuggestions = lazy(() => import('./admin/SmartMatchSuggestions'));
const SmartLikeGiving = lazy(() => import('./admin/SmartLikeGiving'));
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
  Scan,
  Rocket
} from 'lucide-react';

interface AdminPageProps {
  currentUser: { id: string } | null;
  onLogout: () => void;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_status: string;
  created_at: string;
  date_of_birth: string;
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
  is_archived?: boolean;
  active_session_count?: number | null;
  photo_count?: number | null;
  profile_completion?: number | null;
  likes_received?: number | null;
  passes_received?: number | null;
  boost_until?: string | null;
}

interface PaymentConfigData {
  payment_methods: unknown;
  default_international_price?: number | string | null;
  default_international_currency?: string | null;
}

interface ReportedChatAction {
  id: string;
  created_at: string;
  admin_id: string | null;
  chat_id: string | null;
  reporter_id: string | null;
  reported_user_id: string | null;
  reason: string | null;
  description: string | null;
}

interface ChatMessageSummary {
  id: string;
  message: string | null;
  sender_id: string | null;
  match_id: string | null;
  created_at: string;
}

interface MinimalProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface ReportedChatItem {
  id: string;
  created_at: string;
  admin_id: string | null;
  details: {
    reporter_id: string | null;
    content_type: 'message';
    content_id: string | null;
    reason: string | null;
    description: string | null;
    reported_user_id?: string | null;
  };
  message: ChatMessageSummary | null;
  reporter: MinimalProfile | null;
  reportedUser: MinimalProfile | null;
}

interface PremiumStatusRow {
  user_id: string;
  is_premium: boolean;
}

interface ErrorLike {
  status?: number;
  message?: string;
  details?: string;
}

type RawUserProfile = Omit<UserProfile, 'age' | 'is_premium'>;

const AdminPageComponent = ({ currentUser, onLogout }: AdminPageProps) => {
  // Always call hooks in the same order - performance monitoring
  useMemoryMonitor();
  
  // All state hooks first - consistent order
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [defaultInternationalPrice, setDefaultInternationalPrice] = useState('5');
  const [defaultInternationalCurrency, setDefaultInternationalCurrency] = useState('USD');
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
  const [archiveFilter, setArchiveFilter] = useState('all');
  // Debug filter (same idea as Broadcast's): find profiles without photos,
  // half-finished profiles, people nobody has seen yet - then boost or remove them.
  const [photosFilter, setPhotosFilter] = useState('all');
  const [completionFilter, setCompletionFilter] = useState('all');
  const [seenFilter, setSeenFilter] = useState('all');
  const [boostFilter, setBoostFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  // Users-tab table now paginates on the server (admin_search_users_page RPC)
  // instead of fetching every non-admin profile in batches just to slice 20
  // rows client-side - see fetchUsersPage below.
  const [tableUsers, setTableUsers] = useState<UserProfile[]>([]);
  const [tableTotalCount, setTableTotalCount] = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [matchUser1, setMatchUser1] = useState('');
  const [matchUser2, setMatchUser2] = useState('');
  // Manual-match user pickers used to render one <SelectItem> per user with
  // no limit - at a few thousand users that alone could freeze the admin's
  // browser tab. Originally a client-side filter over the full `users`
  // array (itself an expensive bulk fetch); now a debounced server-side
  // search via admin_search_users_page, so opening this picker no longer
  // depends on that bulk fetch having already run.
  const [matchUser1Search, setMatchUser1Search] = useState('');
  const [matchUser2Search, setMatchUser2Search] = useState('');
  const [matchUser1Options, setMatchUser1Options] = useState<UserProfile[]>([]);
  const [matchUser2Options, setMatchUser2Options] = useState<UserProfile[]>([]);
  const MATCH_USER_OPTIONS_CAP = 100;

  const searchMatchUsers = useCallback(async (search: string): Promise<UserProfile[]> => {
    const { data, error } = await supabase.rpc('admin_search_users_page', {
      p_search: search.trim() || null,
      p_status: 'all',
      p_gender: 'all',
      p_preference: 'all',
      p_country: 'all',
      p_relationship_intent: 'all',
      p_premium: 'all',
      p_activity: 'all',
      p_archive: 'all',
      p_limit: MATCH_USER_OPTIONS_CAP,
      p_offset: 0,
    });
    if (error) {
      console.error('Error searching users for match picker:', error);
      return [];
    }
    const rows = (data || []) as Array<RawUserProfile & { is_premium: boolean; total_count: number }>;
    return rows.map(({ total_count, ...row }) => ({ ...row, age: calculateAge(row.date_of_birth) }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchMatchUsers(matchUser1Search).then(setMatchUser1Options);
    }, 300);
    return () => clearTimeout(timer);
  }, [matchUser1Search, searchMatchUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchMatchUsers(matchUser2Search).then(setMatchUser2Options);
    }, 300);
    return () => clearTimeout(timer);
  }, [matchUser2Search, searchMatchUsers]);

  const matchUser1Ref = useRef('');
  const matchUser2Ref = useRef('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reportedChats, setReportedChats] = useState<ReportedChatItem[]>([]);
  const [loadingReportedChats, setLoadingReportedChats] = useState(false);
  const [processingReportIds, setProcessingReportIds] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailReport, setEmailReport] = useState<ReportedChatItem | null>(null);
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
          .select('payment_methods, default_international_price, default_international_currency')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (response.error) throw response.error;

        const data = response.data as PaymentConfigData;
        const paymentMethodsValue = Array.isArray(data.payment_methods)
          ? (data.payment_methods as PaymentMethod[])
          : defaultPaymentMethods;
        setPaymentMethods(paymentMethodsValue);
        setDefaultInternationalPrice(data.default_international_price?.toString() || '5');
        setDefaultInternationalCurrency(data.default_international_currency || 'USD');
      } catch (error) {
        console.error('Error fetching payment config:', error);
        setPaymentMethods(defaultPaymentMethods);
        setDefaultInternationalPrice('5');
        setDefaultInternationalCurrency('USD');
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
            payment_methods: paymentMethods as unknown as Json,
            premium_price: Number(defaultInternationalPrice) || 5,
            premium_price_monthly: Number(defaultInternationalPrice) || 5,
            default_international_price: Number(defaultInternationalPrice) || 5,
            default_international_currency: defaultInternationalCurrency || 'USD',
            country_prices: [],
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from('payment_config')
          .insert({
            payment_methods: paymentMethods as unknown as Json,
            premium_price: Number(defaultInternationalPrice) || 5,
            premium_price_monthly: Number(defaultInternationalPrice) || 5,
            default_international_price: Number(defaultInternationalPrice) || 5,
            default_international_currency: defaultInternationalCurrency || 'USD',
            country_prices: [],
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
        <div className="admin-keyboard-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="admin-keyboard-modal bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto border-2 border-yellow-300">
            <button
              onClick={() => setShowPaymentConfig(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-2xl font-bold transition-colors"
              aria-label="Close"
            >✕</button>
            <h2 className="text-2xl font-bold mb-6 text-center text-yellow-600 flex items-center justify-center gap-2">
              <span>⚙️</span> Configure Premium Payment
            </h2>
            <div className="mb-6 space-y-4">
              <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <label className="block font-semibold mb-2 text-blue-800">Default International Price (Monthly Subscription)</label>
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
                <p className="text-xs text-blue-600 mt-1">This price will be shown to all users for web payments and serves as fallback for Android/iOS IAP</p>
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
            
            {/* Paystack Recurring Billing Trigger */}
            <div className="mt-6 pt-4 border-t-2 border-yellow-200">
              <h3 className="font-semibold mb-3 text-gray-800">Paystack Recurring Billing</h3>
              <p className="text-sm text-gray-600 mb-3">
                Manually trigger the recurring billing process to charge users with active subscriptions due for renewal.
              </p>
              <Button
                onClick={async () => {
                  try {
                    toast({ title: 'Running billing...', description: 'Please wait while we process subscriptions.' });
                    
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.access_token) {
                      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
                      return;
                    }
                    
                    const response = await fetch(
                      'https://tgjsyyihabsovironesw.supabase.co/functions/v1/admin-billing-trigger',
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({}),
                      }
                    );
                    
                    const result = await response.json();
                    
                    if (response.ok && result.success) {
                      toast({
                        title: 'Billing Complete',
                        description: `Processed: ${result.processed || 0}, Charged: ${result.charged || 0}, Failed: ${result.failed || 0}`,
                      });
                    } else {
                      toast({
                        title: 'Billing Failed',
                        description: result.error || 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  } catch (error) {
                    console.error('Billing trigger error:', error);
                    toast({
                      title: 'Error',
                      description: 'Failed to trigger billing',
                      variant: 'destructive',
                    });
                  }
                }}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 rounded-xl text-base shadow-lg transition-all duration-200"
              >
                🔄 Run Paystack Billing Now
              </Button>
            </div>
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
        <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
          <CountryManagement />
        </Suspense>
      </div>
    </>
  );

  // Debounce the raw search input before it drives the server-side query -
  // an RPC round-trip per keystroke would be worse than the old client-side
  // filter it's replacing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 whenever a filter changes so the pager doesn't end up
  // pointing past the end of a now-smaller result set.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedUserIds(new Set());
  }, [statusFilter, genderFilter, interestedInFilter, countryFilter, relationshipIntentFilter, premiumFilter, activityFilter, archiveFilter, photosFilter, completionFilter, seenFilter, boostFilter, sortBy, debouncedSearchTerm]);

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

  const fetchReportedChats = useCallback(async (force = false) => {
    try {
      setLoadingReportedChats(true);
      const cacheKey = 'reported_chats';
      const cached = userDataCache.get(cacheKey);
      // If we have a cached value and force isn't set, use cache to avoid refetching
      if (cached && !force) {
        setReportedChats(cached as ReportedChatItem[]);
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
      const reportActions = actions as ReportedChatAction[];
      const messageIds = reportActions.map((a) => a.chat_id).filter(Boolean) as string[];
      const userIds = [
        ...new Set(
          reportActions
            .map((a) => a.reporter_id)
            .filter(Boolean)
            .concat(reportActions.map((a) => a.reported_user_id).filter(Boolean))
        )
      ];

      // Fetch chats/messages
      const { data: chats } = await supabase.from('chats').select('id, message, sender_id, match_id, created_at').in('id', messageIds || []);

      // Fetch profiles for reporter and reported users
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds || []);

      const chatRows = (chats || []) as ChatMessageSummary[];
      const profileRows = (profiles || []) as MinimalProfile[];

      const transformed: ReportedChatItem[] = reportActions.map((a) => {
        const msg = chatRows.find((c) => c.id === a.chat_id) || null;
        const reporter = profileRows.find((p) => p.id === a.reporter_id) || null;
        const reportedUser = profileRows.find((p) => p.id === a.reported_user_id) || null;

        return {
          id: a.id,
          created_at: a.created_at,
          admin_id: a.admin_id,
          details: {
            reporter_id: a.reporter_id,
            reported_user_id: a.reported_user_id,
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
          'Account Blocked',
          'Your account has been blocked due to community guideline violations. Please contact support if you believe this is an error.',
          reportedUserId
        );
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

  const openEmailModal = (report: ReportedChatItem) => {
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
      // Note: Cache key does NOT include premiumFilter since we store all users and filter client-side
      const cacheKey = `users_all_${statusFilter}_${genderFilter}_${interestedInFilter}_${countryFilter}_${relationshipIntentFilter}_${activityFilter}`;
      const cachedUsers = userDataCache.get(cacheKey);
      if (cachedUsers) {
        const { regularUsers, admins } = cachedUsers;
        setUsers(regularUsers);
        setAdminUsers(admins);
        setLoading(false);
        return;
      }

      // Fetch ALL users in batches to bypass 1000 limit
      const allData: RawUserProfile[] = [];
      const BATCH_SIZE = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
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
            is_archived
          `)
          .eq('is_admin', false)
          .order('created_at', { ascending: false })
          .range(offset, offset + BATCH_SIZE - 1);

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

        const { data: batchData, error } = await query;

        if (error) throw error;

        if (batchData && batchData.length > 0) {
          allData.push(...batchData);
          offset += BATCH_SIZE;
          hasMore = batchData.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }

      const data = allData;

      // Determine premium via admin RPC (bypasses RLS on user_subscriptions)
      const userIds = (data || []).map(u => u.id).filter(Boolean);
      const premiumMap = new Map<string, boolean>();

      if (userIds.length > 0) {
        // Batch the RPC call to avoid payload/response limits on large user lists.
        // Premium logic is enforced inside the DB function:
        // plan_name = 'premium' AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
        const CHUNK_SIZE = 500;
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
          const chunk = userIds.slice(i, i + CHUNK_SIZE);
          const { data: premiumRowsRaw, error: premiumError } = await supabase.rpc(
            'admin_get_premium_status_for_users',
            { target_user_ids: chunk }
          );
          if (premiumError) {
            console.error('Premium status RPC failed:', premiumError);
            throw premiumError;
          }

          const premiumRows: PremiumStatusRow[] = Array.isArray(premiumRowsRaw)
            ? (premiumRowsRaw as PremiumStatusRow[])
            : [];
          premiumRows.forEach((row) => {
            if (!row?.user_id) return;

            // Be resilient to duplicate rows per user_id. If any row says premium, treat as premium.
            const current = premiumMap.get(row.user_id) ?? false;
            premiumMap.set(row.user_id, current || !!row.is_premium);
          });
        }
      }

      // Ensure every user gets an explicit boolean (default false)
      userIds.forEach((id) => {
        if (!premiumMap.has(id)) premiumMap.set(id, false);
      });

      // Map users and attach premium flag
      const usersWithAge = (data || []).map(user => ({
        ...user,
        age: calculateAge(user.date_of_birth),
        is_premium: premiumMap.get(user.id) ?? false,
        last_login_at: user.last_login_at,
        login_count: user.login_count
      }));

      // DO NOT filter by premium here - let filteredUsers handle ALL filtering
      // This ensures all users are loaded and filters work dynamically

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

      // Store ALL users in state - filtering happens in filteredUsers computed property
      setUsers(usersWithAge);
      setAdminUsers(adminsWithAge);
      
      // Cache ALL users data for 3 minutes (not pre-filtered)
      userDataCache.set(cacheKey, { regularUsers: usersWithAge, admins: adminsWithAge });
    } catch (error) {
      const errAny: ErrorLike = (typeof error === 'object' && error !== null)
        ? (error as ErrorLike)
        : {};
      const status = errAny?.status;
      const message: string = errAny?.message || '';
      const details: string = errAny?.details || '';

      console.error('Error fetching users:', errAny);

      const rpcName = 'admin_get_premium_status_for_users';
      const missingRpc =
        status === 404 ||
        message.toLowerCase().includes(rpcName) && message.toLowerCase().includes('could not find') ||
        message.toLowerCase().includes('function') && message.toLowerCase().includes(rpcName) && message.toLowerCase().includes('not found');

      toast({
        title: 'Error',
        description: missingRpc
          ? 'Premium lookup RPC is missing on the database. Apply the latest Supabase migration (admin_get_premium_status_for_users) and refresh.'
          : (details || message || 'Failed to load users'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, 300), [toast, statusFilter, genderFilter, interestedInFilter, countryFilter, relationshipIntentFilter, activityFilter]);

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

  // Fetches exactly one page of the Users-tab table via the server-side
  // admin_search_users_page RPC - replaces the old "fetch every non-admin
  // profile in batches, then filter/slice client-side" approach for this
  // table. The bulk `users` array (fetchUsers above) is left in place only
  // for the Dashboard-tab tools below that genuinely need the full list.
  const fetchUsersPage = useCallback(async () => {
    try {
      setTableLoading(true);
      const { data, error } = await supabase.rpc('admin_search_users_page', {
        p_search: debouncedSearchTerm || null,
        p_status: statusFilter,
        p_gender: genderFilter,
        p_preference: interestedInFilter,
        p_country: countryFilter,
        p_relationship_intent: relationshipIntentFilter,
        p_premium: premiumFilter,
        p_activity: activityFilter,
        p_archive: archiveFilter,
        p_limit: usersPerPage,
        p_offset: (currentPage - 1) * usersPerPage,
        // Debug filter + sort - only sent when set, so the list still loads
        // on a database that doesn't have them yet.
        ...(photosFilter !== 'all' ? { p_photos: photosFilter } : {}),
        ...(completionFilter !== 'all' ? { p_completion: completionFilter } : {}),
        ...(seenFilter !== 'all' ? { p_seen: seenFilter } : {}),
        ...(boostFilter !== 'all' ? { p_boost: boostFilter } : {}),
        ...(sortBy !== 'newest' ? { p_sort: sortBy } : {}),
      } as never);

      if (error) throw error;

      const rows = (data || []) as unknown as Array<RawUserProfile & { is_premium: boolean; total_count: number }>;
      setTableUsers(rows.map(({ total_count, ...row }) => ({
        ...row,
        age: calculateAge(row.date_of_birth),
      })));
      setTableTotalCount(rows[0]?.total_count ?? 0);
    } catch (error) {
      console.error('Error fetching users page:', error);
      const missingDebugSupport = (error as ErrorLike)?.message?.includes('admin_search_users_page');
      toast({
        title: 'Error',
        description: missingDebugSupport
          ? 'The debug filter and sort need the latest database update.'
          : 'Failed to load users',
        variant: 'destructive'
      });
      setTableUsers([]);
      setTableTotalCount(0);
    } finally {
      setTableLoading(false);
    }
  }, [toast, debouncedSearchTerm, statusFilter, genderFilter, interestedInFilter, countryFilter, relationshipIntentFilter, premiumFilter, activityFilter, archiveFilter, photosFilter, completionFilter, seenFilter, boostFilter, sortBy, currentPage]);

  // Small standalone fetch for the "Admin Users" card on the Users tab -
  // kept separate from fetchUsers' heavy bulk query since that one now only
  // runs when Dashboard is opened, and this list is normally just a handful
  // of rows (is_admin = true).
  const fetchAdminUsersList = useCallback(async () => {
    try {
      const { data: adminData, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, account_status, created_at, city, country, date_of_birth, is_admin, gender, preference, relationship_intent')
        .eq('is_admin', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAdminUsers((adminData || []).map(user => ({
        ...user,
        age: calculateAge(user.date_of_birth)
      })));
    } catch (error) {
      console.error('Error fetching admin users list:', error);
    }
  }, []);

  // Second useEffect for fetching data after admin status is confirmed
  // OPTIMIZED: Only fetch stats immediately, lazy load other data when tabs are accessed
  useEffect(() => {
    if (isAdmin) {
      fetchAppStats();
      // Don't fetch all data on mount - let tabs load their own data when accessed
      // This makes initial admin page load much faster
    }
  }, [isAdmin, fetchAppStats]);

  // Lazy load the full user list when Dashboard is accessed - it's the tab
  // that actually needs it (SmartMatchSuggestions/SmartLikeGiving/
  // ManualPremiumManager/manual-match pickers), not the Users tab anymore.
  useEffect(() => {
    if (isAdmin && activeTab === 'dashboard' && users.length === 0) {
      fetchUsers();
    }
  }, [isAdmin, activeTab]);

  // Lazy load (and refetch on filter/search/page change) the Users-tab table
  useEffect(() => {
    if (isAdmin && activeTab === 'users') {
      fetchUsersPage();
    }
  }, [isAdmin, activeTab, fetchUsersPage]);

  useEffect(() => {
    if (isAdmin && activeTab === 'users' && adminUsers.length === 0) {
      fetchAdminUsersList();
    }
  }, [isAdmin, activeTab]);

  // Lazy load content when content tab is accessed
  useEffect(() => {
    if (isAdmin && activeTab === 'content') {
      if (reportedChats.length === 0) fetchReportedChats();
    }
  }, [isAdmin, activeTab]);

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
            title: 'Account Activated',
            body: 'Your account has been activated. You can now use all features of the app.'
          },
          'on_hold': {
            title: 'Account On Hold',
            body: 'Your account has been placed on hold pending review. Please contact support for more information.'
          },
          'blocked': {
            title: 'Account Blocked',
            body: 'Your account has been blocked due to policy violations. Contact support if you believe this is an error.'
          }
        };

        const notification = notificationMessages[newStatus as keyof typeof notificationMessages];
        if (notification) {
          await sendAdminNotification(notification.title, notification.body, userId);
        }
      } catch (notifError) {
        console.error('📤 Failed to send status notification:', notifError);
        // Don't fail the status update if notification fails
      }

      // Optimistic update for better UX
      setUsers(users.map(user =>
        user.id === userId ? { ...user, account_status: newStatus } : user
      ));
      setTableUsers(prev => prev.map(user =>
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
      fetchUsersPage();
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive'
      });
    }
  };

  // Face record first (AWS Rekognition), then the account and all its data.
  const deleteUserAndData = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('face_descriptor')
        .eq('id', userId)
        .single();

      if (profile?.face_descriptor) {
        await supabase.functions.invoke('face-verify', {
          body: {
            action: 'delete_face',
            userId: userId,
            faceId: profile.face_descriptor
          }
        });
      }
    } catch (faceError) {
      console.error('Error deleting face from Rekognition:', faceError);
      // Continue with account deletion even if face deletion fails
    }

    const { error } = await supabase.rpc('delete_user_and_data', {
      user_id_to_delete: userId
    });
    if (error) throw error;
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteUserAndData(userId);

      toggleUserSelected(userId, false);
      setUsers(users.filter(user => user.id !== userId));
      setTableUsers(prev => prev.filter(user => user.id !== userId));
      setTableTotalCount(prev => Math.max(0, prev - 1));
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
    // Use refs instead of state to avoid closure issues
    const user1Id = matchUser1Ref.current || matchUser1;
    const user2Id = matchUser2Ref.current || matchUser2;
    
    if (!user1Id || !user2Id) {
      toast({
        title: 'Error',
        description: 'Please select both users to create a match',
        variant: 'destructive'
      });
      return;
    }

    if (user1Id === user2Id) {
      toast({
        title: 'Error',
        description: 'Cannot match a user with themselves',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data, error } = await supabase.rpc('admin_create_match', {
        p_user1_id: user1Id,
        p_user2_id: user2Id
      });

      if (error) {
        throw error;
      }

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
      
      // Clear all IAP state to prevent it leaking to next logged-in user
      const { clearAllIapState } = await import('@/iap-google');
      clearAllIapState();
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Call parent's onLogout which should redirect to welcome screen
      onLogout();
      
      // Additional safety: redirect to root if parent doesn't handle it
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
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

  const toggleUserSelected = (userId: string, selected: boolean) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  // Boosted profiles come first in other people's Discover/Circle - but only
  // for people whose own filters (country, gender, distance...) already
  // include them. At most half of anyone's batch is boosted.
  const boostSelectedUsers = async (days = 7) => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return;
    setBulkWorking(true);
    try {
      const { data, error } = await supabase.rpc('admin_boost_profiles' as never, { p_user_ids: ids, p_days: days } as never);
      if (error) throw error;
      toast({ title: 'Boosted', description: `${data ?? ids.length} profile(s) will show first in feeds for ${days} days.` });
      setSelectedUserIds(new Set());
      fetchUsersPage();
    } catch (error) {
      console.error('Error boosting users:', error);
      toast({ title: 'Error', description: 'Failed to boost - the latest database update may be missing.', variant: 'destructive' });
    } finally {
      setBulkWorking(false);
    }
  };

  const clearSelectedBoosts = async () => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return;
    setBulkWorking(true);
    try {
      const { error } = await supabase.rpc('admin_clear_boosts' as never, { p_user_ids: ids } as never);
      if (error) throw error;
      toast({ title: 'Boost removed', description: `${ids.length} profile(s) back to normal order.` });
      setSelectedUserIds(new Set());
      fetchUsersPage();
    } catch (error) {
      console.error('Error removing boosts:', error);
      toast({ title: 'Error', description: 'Failed to remove boost', variant: 'destructive' });
    } finally {
      setBulkWorking(false);
    }
  };

  // Same job the weekly cron runs: everyone with photos nobody has liked or
  // passed in 30 days gets a 7-day boost.
  const boostUnseenNow = async () => {
    if (!confirm('Boost everyone with photos that nobody has liked or passed in the last 30 days, for 7 days?')) return;
    setBulkWorking(true);
    try {
      const { data, error } = await supabase.rpc('admin_boost_unseen_now' as never);
      if (error) throw error;
      toast({ title: 'Unseen profiles boosted', description: `${data ?? 0} profile(s) will show first in feeds this week.` });
      fetchUsersPage();
    } catch (error) {
      console.error('Error boosting unseen users:', error);
      toast({ title: 'Error', description: 'Failed to boost - the latest database update may be missing.', variant: 'destructive' });
    } finally {
      setBulkWorking(false);
    }
  };

  const deleteSelectedUsers = async () => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} user(s) and all their data? This cannot be undone.`)) return;
    setBulkWorking(true);
    let deleted = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await deleteUserAndData(id);
        deleted += 1;
      } catch (error) {
        console.error('Error deleting user', id, error);
        failed.push(id);
      }
    }
    setSelectedUserIds(new Set(failed));
    setUsers(prev => prev.filter(user => !ids.includes(user.id) || failed.includes(user.id)));
    setBulkWorking(false);
    fetchUsersPage();
    fetchAppStats();
    toast({
      title: failed.length ? 'Some deletes failed' : 'Deleted',
      description: failed.length
        ? `${deleted} deleted, ${failed.length} failed (still selected).`
        : `${deleted} user(s) permanently deleted.`,
      variant: failed.length ? 'destructive' : undefined,
    });
  };

  // All 9 filters (search, status, gender, preference, country,
  // relationship_intent, premium, activity, archive) now run server-side in
  // admin_search_users_page (fetchUsersPage above) - tableUsers is already
  // exactly the current page.
  const paginatedUsers = tableUsers;
  const totalPages = Math.max(1, Math.ceil(tableTotalCount / usersPerPage));

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
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-pink-950 via-pink-900 to-black">
        <p className="text-gray-300">Checking admin permissions...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-pink-950 via-pink-900 to-black">
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
    <div className="admin-page-container w-full min-h-screen bg-gradient-to-br from-pink-950 via-pink-900 to-black overflow-y-auto">
      <div className="w-full max-w-[390px] sm:max-w-3xl lg:max-w-6xl mx-auto bg-gradient-to-br from-pink-950 via-pink-900 to-black min-h-screen">
        {/* Fixed Header with Safe Area */}
        <div className="sticky top-0 z-50">
          <div className="px-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-white">Admin Dashboard</h1>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="px-3 py-1 text-white border-white/40 bg-white/10">
                  <Shield className="w-4 h-4 mr-1" />
                  Admin
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="bg-white text-red-600 hover:text-red-700"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div>

          {/* Tabbed Interface with Error Boundaries for 1000+ users */}
          <AdminErrorBoundary>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="sticky top-12 z-40 mb-3 py-2 bg-gradient-to-br from-pink-950 via-pink-900 to-black">
                {/* Tabs in 2 rows on desktop - pinned in place under the header so it never scrolls out of view */}
                <TabsList className="grid w-full grid-cols-5 h-auto gap-1">
                  <TabsTrigger value="dashboard" className="w-full text-xs flex flex-col gap-1 py-2">
                    <BarChart3 className="w-4 h-4" />
                    <span>Dashboard</span>
                  </TabsTrigger>
                  <TabsTrigger value="users" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Users className="w-4 h-4" />
                    <span>Users</span>
                  </TabsTrigger>
                  <TabsTrigger value="content" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Image className="w-4 h-4" />
                    <span>Content</span>
                  </TabsTrigger>
                  <TabsTrigger value="broadcast" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Megaphone className="w-4 h-4" />
                    <span>Broadcast</span>
                  </TabsTrigger>
                  <TabsTrigger value="ads" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Megaphone className="w-4 h-4" />
                    <span>Ads</span>
                  </TabsTrigger>
                  <TabsTrigger value="redirects" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Link2 className="w-4 h-4" />
                    <span>Links</span>
                  </TabsTrigger>
                  <TabsTrigger value="faces" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Scan className="w-4 h-4" />
                    <span>Faces</span>
                  </TabsTrigger>
                  <TabsTrigger value="debugger" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Search className="w-4 h-4" />
                    <span>Debugger</span>
                  </TabsTrigger>
                  <TabsTrigger value="influencers" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Crown className="w-4 h-4" />
                    <span>Promoters</span>
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="w-full text-xs flex flex-col gap-1 py-2">
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </TabsTrigger>
                </TabsList>
              </div>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-4">
              {/* Stats Overview */}
              {stats && (
                <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                  <StatsCard stats={stats} />
                </Suspense>
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
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={matchUser1Search}
                        onChange={(e) => setMatchUser1Search(e.target.value)}
                        placeholder="Filter by name or ID..."
                        className="w-full text-xs px-2 py-1 rounded border border-input bg-background"
                      />
                      <Select value={matchUser1} onValueChange={(value) => {
                        matchUser1Ref.current = value;
                        setMatchUser1(value);
                      }}>
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Select User 1" />
                        </SelectTrigger>
                        <SelectContent>
                          {matchUser1Options.map((user, index) => (
                            <SelectItem key={`${user.id}-${index}`} value={user.id} className="text-xs">
                              {user.first_name} {user.last_name} (ID: {user.id.substring(0, 8)}...)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={matchUser2Search}
                        onChange={(e) => setMatchUser2Search(e.target.value)}
                        placeholder="Filter by name or ID..."
                        className="w-full text-xs px-2 py-1 rounded border border-input bg-background"
                      />
                      <Select value={matchUser2} onValueChange={(value) => {
                        matchUser2Ref.current = value;
                        setMatchUser2(value);
                      }}>
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Select User 2" />
                        </SelectTrigger>
                        <SelectContent>
                          {matchUser2Options.map((user, index) => (
                            <SelectItem key={`${user.id}-${index}`} value={user.id} className="text-xs">
                              {user.first_name} {user.last_name} (ID: {user.id.substring(0, 8)}...)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={createManualMatch} className="w-full text-xs h-8" size="sm">
                    Create Match
                  </Button>
                  
                  {/* Smart Match Suggestions */}
                  <div className="pt-3 border-t">
                    <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                      <SmartMatchSuggestions users={users} onMatchCreated={fetchAppStats} />
                    </Suspense>
                  </div>
                  
                  {/* Smart Like Giving */}
                  <div className="pt-3 border-t">
                    <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                      <Heart className="w-3 h-3 text-pink-500" />
                      Smart Like Giving
                    </h4>
                    <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                      <SmartLikeGiving users={users} onLikesCreated={fetchAppStats} />
                    </Suspense>
                  </div>
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
                  <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                    <ManualPremiumManager users={users} onRefreshStats={fetchAppStats} />
                  </Suspense>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Broadcast Notifications Tab */}
            <TabsContent value="broadcast" className="space-y-4">
              <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                <BroadcastNotifications />
              </Suspense>
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
                      User Management ({tableTotalCount})
                    </CardTitle>
                    {(statusFilter !== 'all' || genderFilter !== 'all' || interestedInFilter !== 'all' || 
                      countryFilter !== 'all' || relationshipIntentFilter !== 'all' || premiumFilter !== 'all' || activityFilter !== 'all' || archiveFilter !== 'all' ||
                      photosFilter !== 'all' || completionFilter !== 'all' || seenFilter !== 'all' || boostFilter !== 'all' || sortBy !== 'newest') && (
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
                          setArchiveFilter('all');
                          setPhotosFilter('all');
                          setCompletionFilter('all');
                          setSeenFilter('all');
                          setBoostFilter('all');
                          setSortBy('newest');
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
                          <SelectValue placeholder="Last Active" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Activity</SelectItem>
                          <SelectItem value="today" className="text-xs">Active Today</SelectItem>
                          <SelectItem value="3_days" className="text-xs">Last 3 Days</SelectItem>
                          <SelectItem value="1_week" className="text-xs">Last Week</SelectItem>
                          <SelectItem value="2_weeks" className="text-xs">Last 2 Weeks</SelectItem>
                          <SelectItem value="1_month" className="text-xs">Last Month</SelectItem>
                          <SelectItem value="3_months" className="text-xs">Last 3 Months</SelectItem>
                          <SelectItem value="inactive_month" className="text-xs">Inactive 30+ Days</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select value={archiveFilter} onValueChange={setArchiveFilter}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Archive Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Users</SelectItem>
                          <SelectItem value="active" className="text-xs">Not Archived</SelectItem>
                          <SelectItem value="archived" className="text-xs">Archived Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Debug filter - find profiles to fix, boost or remove */}
                    <div className="rounded-md border border-dashed p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-gray-700">Debug filter</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={boostUnseenNow}
                          disabled={bulkWorking}
                          className="text-[11px] h-7 px-2"
                        >
                          <Rocket className="w-3 h-3 mr-1" />
                          Boost all unseen now
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={photosFilter} onValueChange={setPhotosFilter}>
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue placeholder="Photos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">Any Photos</SelectItem>
                            <SelectItem value="with" className="text-xs">With Photos</SelectItem>
                            <SelectItem value="without" className="text-xs">No Photos</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={completionFilter} onValueChange={setCompletionFilter}>
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue placeholder="Profile Completion" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">Any Completion</SelectItem>
                            <SelectItem value="0_25" className="text-xs">Under 25% Complete</SelectItem>
                            <SelectItem value="25_50" className="text-xs">25–49% Complete</SelectItem>
                            <SelectItem value="50_75" className="text-xs">50–74% Complete</SelectItem>
                            <SelectItem value="75_100" className="text-xs">75%+ Complete</SelectItem>
                            <SelectItem value="incomplete" className="text-xs">Not 100% Complete</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={seenFilter} onValueChange={setSeenFilter}>
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue placeholder="Seen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">Seen or Not</SelectItem>
                            <SelectItem value="never" className="text-xs">Never Seen</SelectItem>
                            <SelectItem value="not_30_days" className="text-xs">Not Seen in 30 Days</SelectItem>
                            <SelectItem value="seen" className="text-xs">Has Been Seen</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={boostFilter} onValueChange={setBoostFilter}>
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue placeholder="Feed Boost" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">Boosted or Not</SelectItem>
                            <SelectItem value="boosted" className="text-xs">Boosted in Feeds</SelectItem>
                            <SelectItem value="not_boosted" className="text-xs">Not Boosted</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={setSortBy}>
                          <SelectTrigger className="text-xs h-8 col-span-2">
                            <SelectValue placeholder="Sort" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="newest" className="text-xs">Sort: Newest Sign-ups</SelectItem>
                            <SelectItem value="oldest" className="text-xs">Sort: Oldest Sign-ups</SelectItem>
                            <SelectItem value="last_active" className="text-xs">Sort: Recently Active</SelectItem>
                            <SelectItem value="most_logins" className="text-xs">Sort: Most Logins</SelectItem>
                            <SelectItem value="most_active" className="text-xs">Sort: Most Times Active</SelectItem>
                            <SelectItem value="least_complete" className="text-xs">Sort: Least Complete Profile</SelectItem>
                            <SelectItem value="most_complete" className="text-xs">Sort: Most Complete Profile</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-[10px] text-gray-500">
                        "Seen" means someone liked or passed them. Boosted profiles show first in Discover and Circle for people whose own filters already include them (at most half of anyone's batch). Every Monday everyone with photos nobody has seen in 30 days is boosted for a week automatically.
                      </p>
                    </div>
                  </div>

                  {/* Bulk actions for the people ticked below */}
                  {paginatedUsers.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
                        <Checkbox
                          checked={paginatedUsers.length > 0 && paginatedUsers.every(u => selectedUserIds.has(u.id))}
                          onCheckedChange={(checked) => {
                            setSelectedUserIds(prev => {
                              const next = new Set(prev);
                              paginatedUsers.forEach(u => (checked ? next.add(u.id) : next.delete(u.id)));
                              return next;
                            });
                          }}
                        />
                        Select page
                      </label>
                      {selectedUserIds.size > 0 && (
                        <>
                          <span className="text-[11px] text-gray-500">{selectedUserIds.size} selected</span>
                          <Button size="sm" variant="outline" disabled={bulkWorking} onClick={() => boostSelectedUsers(7)} className="text-[11px] h-7 px-2 text-pink-600">
                            <Rocket className="w-3 h-3 mr-1" />
                            Boost in feeds (7 days)
                          </Button>
                          <Button size="sm" variant="outline" disabled={bulkWorking} onClick={clearSelectedBoosts} className="text-[11px] h-7 px-2">
                            Remove boost
                          </Button>
                          <Button size="sm" variant="outline" disabled={bulkWorking} onClick={deleteSelectedUsers} className="text-[11px] h-7 px-2 text-red-600">
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete selected
                          </Button>
                          <Button size="sm" variant="ghost" disabled={bulkWorking} onClick={() => setSelectedUserIds(new Set())} className="text-[11px] h-7 px-2">
                            Clear
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Users List Container */}
                  <div className="border rounded-lg bg-white">
                    {tableLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600"></div>
                      </div>
                    ) : (
                      <div className="space-y-0 max-h-96 overflow-y-auto">
                        {paginatedUsers.map((user, index) => (
                          <div key={user.id} className={`p-2 space-y-1 ${index !== paginatedUsers.length - 1 ? 'border-b' : ''} ${selectedUserIds.has(user.id) ? 'bg-pink-50' : ''}`}>
                            <div className="flex items-start justify-between">
                              <Checkbox
                                checked={selectedUserIds.has(user.id)}
                                onCheckedChange={(checked) => toggleUserSelected(user.id, checked === true)}
                                className="mr-2 mt-0.5"
                                aria-label={`Select ${user.first_name} ${user.last_name}`}
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-xs truncate">
                                  {user.first_name} {user.last_name}
                                </h3>
                                <p className="text-[11px] text-gray-600 truncate">{user.email}</p>
                                <p className="text-[11px] text-gray-500">
                                  {user.city}, {user.country} • Age {user.age}
                                  {user.gender && ` • ${user.gender.charAt(0).toUpperCase() + user.gender.slice(1)}`}
                                </p>
                                {user.is_archived && (
                                  <Badge variant="outline" className="text-[10px] h-4 text-gray-500 mt-1">
                                    Archived
                                  </Badge>
                                )}
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
                                  {user.boost_until && (
                                    <Badge className="bg-pink-100 text-pink-700 text-[10px] px-1.5 py-0 h-4">
                                      Boosted until {new Date(user.boost_until).toLocaleDateString()}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  Joined: {new Date(user.created_at).toLocaleDateString()}
                                  {' • Last active: '}
                                  {(() => {
                                    const dateToUse = user.last_login_at || user.created_at;
                                    const date = new Date(dateToUse);
                                    const now = new Date();
                                    const diffMs = now.getTime() - date.getTime();
                                    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                                    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
                                    const diffMins = Math.floor(diffMs / (60 * 1000));

                                    if (diffMins < 5) return 'Just now';
                                    if (diffMins < 60) return `${diffMins}m ago`;
                                    if (diffHours < 24) return `${diffHours}h ago`;
                                    if (diffDays === 1) return 'Yesterday';
                                    if (diffDays < 7) return `${diffDays}d ago`;
                                    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
                                    return date.toLocaleDateString();
                                  })()}
                                  {' • Logins: '}{user.login_count ?? 0}
                                  {user.active_session_count !== undefined && (
                                    <> • Active {user.active_session_count ?? 0} times</>
                                  )}
                                </p>
                                {user.profile_completion !== undefined && (
                                  <p className="text-[11px] text-gray-500">
                                    Photos: {user.photo_count ?? 0}
                                    {' • Profile: '}{user.profile_completion ?? 0}%
                                    {' • Seen: '}{(user.likes_received ?? 0) + (user.passes_received ?? 0)}
                                    {' '}({user.likes_received ?? 0} likes, {user.passes_received ?? 0} passes)
                                  </p>
                                )}
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
                        
                        {!tableLoading && paginatedUsers.length === 0 && (
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
              <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                <ImageModerationPanel onViewProfile={handleViewProfile} />
              </Suspense>

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
                            Reported user: {r.reportedUser ? `${r.reportedUser.first_name} ${r.reportedUser.last_name}` : r.details?.reported_user_id}
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
                  <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                    <AdsManagement />
                  </Suspense>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Debugger Tab */}
            <TabsContent value="debugger" className="space-y-4">
              <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                <UserPoolDebugger
                  currentUserId={currentUser?.id || ''}
                  userPreferences={{
                    min_age: 18,
                    max_age: 99,
                    max_distance: 100,
                    preference: 'both',
                    latitude: null,
                    longitude: null
                  }}
                  onViewProfile={handleViewProfile}
                />
              </Suspense>
            </TabsContent>

            {/* Redirects Tab */}
            <TabsContent value="redirects" className="space-y-4">
              <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                <RedirectLinkCreator />
              </Suspense>
            </TabsContent>

            {/* Promoters Tab */}
            <TabsContent value="influencers" className="space-y-4">
              <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                <InfluencerManagement />
              </Suspense>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                {/* App Update Settings */}
                <AppUpdateSettings />

                {/* Paystack Settings */}
                <PaystackSettings />
              </Suspense>

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
              <Suspense fallback={<div className="text-center py-4 text-xs text-gray-400">Loading...</div>}>
                <FaceManagement />
              </Suspense>
            </TabsContent>
          </Tabs>
          </AdminErrorBoundary>
        </div>

        {/* User Profile Modal */}
        {selectedUserId && (
          <UserProfileModal
            isOpen={isProfileModalOpen}
            onClose={(wasEdited) => {
              setIsProfileModalOpen(false);
              setSelectedUserId(null);
              // Refresh users list if admin edited preferences
              if (wasEdited) {
                userDataCache.clear();
                fetchUsers();
              }
            }}
            userId={selectedUserId}
            isAdmin={true}
          />
        )}

        {/* Email Report Modal */}
        {isEmailModalOpen && emailReport && (
          <div className="admin-keyboard-modal-overlay fixed inset-0 z-60 flex items-center justify-center bg-black/40">
            <div className="admin-keyboard-modal bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg relative border">
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
 
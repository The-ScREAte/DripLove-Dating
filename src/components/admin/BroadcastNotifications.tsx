import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, Users, Globe, CheckCircle2, AlertCircle, Trash2, RotateCw, Eye, History, Copy, Mail, Calendar, Bell, Download } from 'lucide-react';
import EmailExport from './EmailExport';
import EmailBroadcast from './EmailBroadcast';
import ScheduledBroadcasts from './ScheduledBroadcasts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchAllRows, applyDebugFilter } from '@/hooks/useBatchFetch';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

interface Country {
  code: string;
  name: string;
  userCount: number;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  country: string;
  city: string;
  has_push_token: boolean;
}

type RecipientFilter = 'all' | 'no_images' | 'never_seen' | 'incomplete_profile' | 'active_accounts' | 'premium_users';

interface Campaign {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  target_countries: string[];
  total_recipients: number;
  successful_sends: number;
  failed_sends: number;
  created_at: string;
  admin_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  save_to_profile: boolean;
}

interface EmailCampaign {
  id: string;
  subject: string;
  message: string;
  recipient_count: number;
  successful_sends: number;
  failed_sends: number;
  target_countries: string[] | null;
  recipient_filter: string | null;
  status: string;
  error_details: Array<{ email: string; error: string }> | null;
  created_at: string;
}

interface HistoryItem {
  id: string;
  type: 'push' | 'email';
  title: string;
  preview: string;
  totalRecipients: number;
  successful: number;
  failed: number;
  targetCountries: string[] | null;
  status: string;
  createdAt: string;
  push?: Campaign;
  email?: EmailCampaign;
}

const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
};

// Collapsible countries badge component
const CountriesBadge = ({ countries }: { countries: string[] | null }) => {
  const [expanded, setExpanded] = useState(false);

  if (!countries || countries.length === 0) {
    return <Badge variant="outline" className="text-[10px] h-4 bg-white">All countries</Badge>;
  }

  if (countries.length === 1) {
    return <Badge variant="outline" className="text-[10px] h-4 bg-white">{countries[0]}</Badge>;
  }

  return (
    <Badge
      variant="outline"
      className="text-[10px] h-4 cursor-pointer hover:bg-gray-50 transition-colors bg-white"
      onClick={(e) => {
        e.stopPropagation();
        setExpanded(!expanded);
      }}
    >
      {expanded ? (
        <span className="bg-white px-0.5">{countries.join(', ')}</span>
      ) : (
        <span className="bg-white px-0.5">{countries[0]} +{countries.length - 1} more</span>
      )}
    </Badge>
  );
};

interface Recipient {
  id: string;
  user_id: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  sent_at: string | null;
  user?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function BroadcastNotifications() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('email');
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('all');
  const [showExport, setShowExport] = useState(false);

  // History (unified push + email)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignRecipients, setCampaignRecipients] = useState<Recipient[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);
  const [selectedEmailCampaign, setSelectedEmailCampaign] = useState<EmailCampaign | null>(null);
  const [showEmailDetails, setShowEmailDetails] = useState(false);

  const lastHistorySignatureRef = useRef<string>('');
  const historyPollIntervalRef = useRef<number | null>(null);
  const historyRef = useRef<HistoryItem[]>([]);

  useEffect(() => {
    loadCountries();
  }, []);

  useEffect(() => {
    if (selectedCountries.size > 0) {
      loadUsers();
    } else {
      setUsers([]);
      setSelectedUsers(new Set());
    }
  }, [selectedCountries, recipientFilter]);

  useEffect(() => {
    // Changing the audience should reset selection to prevent accidental sending
    // to previously-selected users from a different filter.
    setSelectedUsers(new Set());
  }, [selectedCountries, recipientFilter]);

  useEffect(() => {
    if (activeTab !== 'history') {
      if (historyPollIntervalRef.current) {
        window.clearInterval(historyPollIntervalRef.current);
        historyPollIntervalRef.current = null;
      }
      return;
    }

    // Initial load can show the spinner.
    loadHistory({ silent: false });

    // Poll silently while there are active push campaigns.
    historyPollIntervalRef.current = window.setInterval(() => {
      const hasActive = historyRef.current.some(
        (c) => c.type === 'push' && (c.status === 'queued' || c.status === 'processing')
      );
      if (!hasActive) return;
      void loadHistory({ silent: true });
    }, 4000);

    return () => {
      if (historyPollIntervalRef.current) {
        window.clearInterval(historyPollIntervalRef.current);
        historyPollIntervalRef.current = null;
      }
    };
  }, [activeTab]);

  const loadCountries = async () => {
    setIsLoadingCountries(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('country, id')
        .not('country', 'is', null)
        .eq('is_admin', false);

      if (error) throw error;

      const countryMap = new Map<string, number>();
      data?.forEach((profile) => {
        const count = countryMap.get(profile.country) || 0;
        countryMap.set(profile.country, count + 1);
      });

      const countryList: Country[] = Array.from(countryMap.entries())
        .map(([code, userCount]) => ({
          code,
          name: getCountryName(code),
          userCount,
        }))
        .sort((a, b) => b.userCount - a.userCount);

      setCountries(countryList);
    } catch (error) {
      console.error('Error loading countries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load countries',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCountries(false);
    }
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const countryArray = Array.from(selectedCountries);

      // Batch fetch all profiles from selected countries
      const PAGE_SIZE = 1000;
      const profiles: Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        country: string | null;
        city: string | null;
        gender?: string | null;
        preference?: string | null;
        bio?: string | null;
        account_status?: string | null;
      }> = [];

      for (let page = 0; ; page++) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data: pageRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, country, city, gender, preference, bio, account_status')
          .in('country', countryArray)
          .eq('is_admin', false)
          .order('id')
          .range(from, to);

        if (profileError) throw profileError;
        if (!pageRows || pageRows.length === 0) break;

        profiles.push(...pageRows);
        if (pageRows.length < PAGE_SIZE) break;
      }

      // Batch fetch ALL push tokens (not just for current users) to ensure accurate token check
      const allTokens = await fetchAllRows<{ user_id: string }>('push_tokens', 'user_id');
      const usersWithTokens = new Set<string>();
      allTokens.forEach(t => {
        if (t.user_id) usersWithTokens.add(t.user_id);
      });

      let filteredProfiles = [...profiles];

      // Apply debug filters using shared utility - these SHOW ONLY users matching the selected criteria
      if (recipientFilter !== 'all') {
        const result = await applyDebugFilter(filteredProfiles, recipientFilter);
        filteredProfiles = result.filteredProfiles;
      }

      const userList: User[] = filteredProfiles.map(p => ({
        id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        country: p.country || '',
        city: p.city || '',
        has_push_token: usersWithTokens.has(p.id),
      }));

      setUsers(userList);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadHistory = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setIsLoadingHistory(true);
    try {
      const [{ data: pushData, error: pushError }, { data: emailData, error: emailError }] = await Promise.all([
        supabase.from('broadcast_campaigns').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('email_broadcast_history').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      if (pushError) throw pushError;
      if (emailError) throw emailError;

      const pushItems: HistoryItem[] = ((pushData || []) as Campaign[]).map((c) => ({
        id: `push-${c.id}`,
        type: 'push',
        title: c.title,
        preview: c.message,
        totalRecipients: c.total_recipients,
        successful: c.successful_sends,
        failed: c.failed_sends,
        targetCountries: c.target_countries,
        status: c.status,
        createdAt: c.created_at,
        push: c,
      }));

      const emailItems: HistoryItem[] = ((emailData || []) as unknown as EmailCampaign[]).map((c) => ({
        id: `email-${c.id}`,
        type: 'email',
        title: c.subject,
        preview: htmlToPlainText(c.message),
        totalRecipients: c.recipient_count,
        successful: c.successful_sends,
        failed: c.failed_sends,
        targetCountries: c.target_countries,
        status: c.status,
        createdAt: c.created_at,
        email: c,
      }));

      const next = [...pushItems, ...emailItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const signature = next
        .map((c) => `${c.id}:${c.status}:${c.successful}:${c.failed}:${c.totalRecipients}`)
        .join('|');

      if (signature !== lastHistorySignatureRef.current) {
        lastHistorySignatureRef.current = signature;
        historyRef.current = next;
        setHistoryItems(next);
      } else {
        historyRef.current = next;
      }
    } catch (error) {
      console.error('Error loading history:', error);
      if (!silent) {
        toast({
          title: 'Error',
          description: 'Failed to load broadcast history',
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) setIsLoadingHistory(false);
    }
  };

  const loadCampaignRecipients = async (campaignId: string) => {
    setIsLoadingRecipients(true);
    try {
      const { data, error } = await supabase
        .from('broadcast_recipients')
        .select(`
          id,
          user_id,
          status,
          error_message,
          sent_at,
          user:profiles(first_name, last_name, email)
        `)
        .eq('campaign_id', campaignId);

      if (error) throw error;

      const recipients: Recipient[] = (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        status: item.status as 'pending' | 'sent' | 'failed',
        error_message: item.error_message,
        sent_at: item.sent_at,
        user: item.user,
      }));

      setCampaignRecipients(recipients);
    } catch (error) {
      console.error('Error loading recipients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load recipient details',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingRecipients(false);
    }
  };

  const getCountryName = (code: string): string => {
    const countryNames: Record<string, string> = {
      'GH': 'Ghana', 'NG': 'Nigeria', 'US': 'United States', 'GB': 'United Kingdom',
      'CA': 'Canada', 'KE': 'Kenya', 'ZA': 'South Africa', 'UG': 'Uganda',
      'TZ': 'Tanzania', 'RW': 'Rwanda',
    };
    return countryNames[code] || code || 'Unknown';
  };

  const toggleCountry = (countryCode: string) => {
    const newSelected = new Set(selectedCountries);
    if (newSelected.has(countryCode)) {
      newSelected.delete(countryCode);
    } else {
      newSelected.add(countryCode);
    }
    setSelectedCountries(newSelected);
  };

  const toggleAllCountries = () => {
    if (selectedCountries.size === countries.length) {
      setSelectedCountries(new Set());
    } else {
      setSelectedCountries(new Set(countries.map(c => c.code)));
    }
  };

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleAllUsers = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)));
    }
  };

  const sendNotifications = async () => {
    if (selectedUsers.size === 0) {
      toast({
        title: 'No Users Selected',
        description: 'Please select at least one user to send notifications to.',
        variant: 'destructive',
      });
      return;
    }

    if (!notificationTitle.trim() || !notificationMessage.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please enter both title and message for the notification.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);

    try {
      // Call edge function to queue the broadcast
      const { data, error } = await supabase.functions.invoke('send-broadcast-campaign', {
        body: {
          title: notificationTitle,
          message: notificationMessage,
          targetCountries: Array.from(selectedCountries),
          userIds: Array.from(selectedUsers),
          notificationType: 'system',
          saveToProfile: saveToProfile,
        },
      });

      if (error) throw error;

      const campaignId = (data as any)?.campaignId;
      const totalRecipients = (data as any)?.totalRecipients || selectedUsers.size;

      // Trigger the background worker to start processing immediately
      supabase.functions.invoke('process-broadcast-queue', {
        body: { campaignId }
      }).catch(err => {
        console.error('Failed to trigger worker:', err);
        // Don't show error to user - worker will pick it up anyway
      });

      toast({
        title: 'Broadcast Queued',
        description: `Sending to ${totalRecipients} users. Check History for progress.`,
        duration: 5000,
      });

      // Reset form
      setNotificationTitle('');
      setNotificationMessage('');
      setSaveToProfile(true);
      setSelectedUsers(new Set());

      // Switch to history tab to show progress
      setActiveTab('history');
    } catch (error) {
      console.error('Error starting broadcast:', error);
      toast({
        title: 'Error',
        description: await getEdgeFunctionErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!confirm('Delete this campaign? This will also delete all recipient records.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('broadcast_campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      toast({ title: 'Deleted', description: 'Campaign removed from history.' });
      loadHistory();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete campaign',
        variant: 'destructive',
      });
    }
  };

  const deleteEmailCampaign = async (id: string) => {
    if (!confirm('Delete this email campaign? This only removes the history entry.')) return;
    try {
      const { error } = await supabase.from('email_broadcast_history').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Email campaign removed from history.' });
      loadHistory();
    } catch (error) {
      console.error('Error deleting email campaign:', error);
      toast({ title: 'Error', description: 'Failed to delete campaign', variant: 'destructive' });
    }
  };

  const viewCampaignDetails = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setShowCampaignDetails(true);
    await loadCampaignRecipients(campaign.id);
  };

  const retryFailedNotifications = async (campaign: Campaign) => {
    // Load failed recipients
    const { data: failedRecipients } = await supabase
      .from('broadcast_recipients')
      .select('user_id')
      .eq('campaign_id', campaign.id)
      .eq('status', 'failed');

    if (!failedRecipients || failedRecipients.length === 0) {
      toast({
        title: 'No Failed Notifications',
        description: 'There are no failed notifications to retry.',
      });
      return;
    }

    const failedUserIds = failedRecipients.map(r => r.user_id);
    setSelectedUsers(new Set(failedUserIds));
    setNotificationTitle(campaign.title);
    setNotificationMessage(campaign.message);
    setActiveTab('push');

    toast({
      title: 'Retry Prepared',
      description: `${failedUserIds.length} failed recipients loaded. Click Send to retry.`,
    });
  };

  const repeatCampaign = async (campaign: Campaign, useSameAudience: boolean) => {
    // Set the notification content
    setNotificationTitle(campaign.title);
    setNotificationMessage(campaign.message);

    if (useSameAudience) {
      // Load all original recipients (successful + failed)
      const { data: recipients } = await supabase
        .from('broadcast_recipients')
        .select('user_id')
        .eq('campaign_id', campaign.id);

      if (recipients && recipients.length > 0) {
        const userIds = recipients.map(r => r.user_id);

        // Select the target countries from the campaign
        setSelectedCountries(new Set(campaign.target_countries));

        // Wait for users to load, then select them
        setTimeout(() => {
          setSelectedUsers(new Set(userIds));
        }, 500);

        toast({
          title: 'Campaign Loaded',
          description: `Using same audience: ${recipients.length} recipients. Click Send when ready.`,
        });
      }
    } else {
      // Load countries but let user select new audience
      setSelectedCountries(new Set(campaign.target_countries));
      setSelectedUsers(new Set());

      toast({
        title: 'Campaign Loaded',
        description: 'Select your new audience and click Send.',
      });
    }

    // Switch to push broadcast tab
    setActiveTab('push');
  };

  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      (u.city || '').toLowerCase().includes(q) ||
      getCountryName(u.country).toLowerCase().includes(q)
    );
  });

  const filteredUsersWithPushTokens = filteredUsers.filter(u => u.has_push_token).length;
  const selectedUsersWithTokens = users.filter(u => selectedUsers.has(u.id) && u.has_push_token).length;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Broadcast Notifications</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="email" className="text-xs">
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            Email
          </TabsTrigger>
          <TabsTrigger value="push" className="text-xs">
            <Bell className="w-3.5 h-3.5 mr-1.5" />
            Push Not.
          </TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs">
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Schedule Msg
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            <History className="w-3.5 h-3.5 mr-1.5" />
            History
          </TabsTrigger>
        </TabsList>

        {/* EMAIL TAB */}
        <TabsContent value="email" className="space-y-3 mt-3">
          <EmailBroadcast />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowExport(true)} className="h-7 text-xs text-gray-500">
              <Download className="w-3 h-3 mr-1.5" />
              Export email list
            </Button>
          </div>
        </TabsContent>

        {/* PUSH NOTIFICATION TAB */}
        <TabsContent value="push" className="space-y-3 mt-3">
          {/* Country Selection */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-1.5 text-xs">
                  <Globe className="w-3.5 h-3.5" />
                  Countries ({selectedCountries.size} selected)
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllCountries}
                  disabled={isLoadingCountries}
                  className="h-6 text-[11px] px-2"
                >
                  {selectedCountries.size === countries.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingCountries ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : countries.length === 0 ? (
                <p className="text-center text-gray-500 text-xs py-6">No countries found</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {countries.map((country) => (
                    <div
                      key={country.code}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border cursor-pointer transition-colors ${
                        selectedCountries.has(country.code)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => toggleCountry(country.code)}
                    >
                      <Checkbox
                        checked={selectedCountries.has(country.code)}
                        onCheckedChange={() => toggleCountry(country.code)}
                        className="h-3.5 w-3.5 data-[state=checked]:bg-purple-600"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-[11px] truncate">{country.name}</div>
                        <div className="text-[9px] text-gray-500">{country.userCount} users</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Selection */}
          {selectedCountries.size > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-1.5 text-xs">
                    <Users className="w-3.5 h-3.5" />
                    Recipients ({filteredUsers.length})
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAllUsers}
                    disabled={isLoadingUsers || users.length === 0}
                    className="h-6 text-[11px] px-2"
                  >
                    {selectedUsers.size === users.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="mb-2 flex items-center gap-2">
                  <Select value={recipientFilter} onValueChange={(v) => setRecipientFilter(v as RecipientFilter)}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Audience filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      <SelectItem value="no_images">No photos</SelectItem>
                      <SelectItem value="never_seen">Never seen</SelectItem>
                      <SelectItem value="incomplete_profile">Incomplete profiles</SelectItem>
                      <SelectItem value="active_accounts">Active accounts only</SelectItem>
                      <SelectItem value="premium_users">Premium users only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mb-2">
                  <Input
                    placeholder="Search by name, city or country..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="text-xs h-7"
                  />
                </div>
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : users.length === 0 ? (
                  <p className="text-center text-gray-500 text-xs py-6">No users found in selected countries</p>
                ) : (
                  <>
                    {filteredUsersWithPushTokens === 0 && (
                      <Alert className="mb-2 py-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <AlertDescription className="text-[11px]">
                          None of these users have push notifications enabled.
                        </AlertDescription>
                      </Alert>
                    )}
                    <ScrollArea className="h-[260px] pr-3">
                      <div className="space-y-1">
                        {filteredUsers.map((user) => (
                          <div
                            key={user.id}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border cursor-pointer transition-colors ${
                              selectedUsers.has(user.id)
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            onClick={() => toggleUser(user.id)}
                          >
                            <Checkbox
                              checked={selectedUsers.has(user.id)}
                              onCheckedChange={() => toggleUser(user.id)}
                              className="h-3.5 w-3.5 data-[state=checked]:bg-purple-600"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-[11px] truncate">
                                  {user.first_name} {user.last_name}
                                </span>
                                {user.has_push_token ? (
                                  <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                                ) : (
                                  <span className="text-[9px] text-gray-400 shrink-0">no token</span>
                                )}
                              </div>
                              <div className="text-[9px] text-gray-500 truncate">
                                {user.city}, {getCountryName(user.country)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notification Form */}
          {selectedUsers.size > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Notification Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="title" className="text-xs">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., New Features Available!"
                    value={notificationTitle}
                    onChange={(e) => setNotificationTitle(e.target.value)}
                    maxLength={100}
                    className="text-xs h-8"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="message" className="text-xs">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="e.g., Check out the new updates we've added to improve your experience..."
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    rows={5}
                    maxLength={3000}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-gray-400 text-right">{notificationMessage.length}/3000</p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="saveToProfile"
                    checked={saveToProfile}
                    onCheckedChange={(checked) => setSaveToProfile(checked as boolean)}
                    className="h-3.5 w-3.5"
                  />
                  <label
                    htmlFor="saveToProfile"
                    className="text-xs font-medium leading-none cursor-pointer"
                  >
                    Also save to profile messages
                  </label>
                </div>

                <div className="flex items-center justify-between pt-3 border-t gap-2">
                  <div>
                    <p className="text-xs font-medium">
                      {selectedUsers.size} recipient{selectedUsers.size !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {selectedUsersWithTokens} will receive a push notification
                    </p>
                  </div>
                  <Button
                    onClick={sendNotifications}
                    disabled={isSending || !notificationTitle.trim() || !notificationMessage.trim() || selectedUsers.size === 0}
                    className="h-8 text-xs"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3 mr-2" />
                        Send Broadcast
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SCHEDULE TAB */}
        <TabsContent value="schedule" className="mt-3">
          <ScheduledBroadcasts />
        </TabsContent>

        {/* HISTORY TAB (unified push + email) */}
        <TabsContent value="history" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  {historyItems.length} sent
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadHistory({ silent: false })}
                  disabled={isLoadingHistory}
                  className="h-6 text-[11px] px-2"
                >
                  <RotateCw className={`w-3 h-3 mr-1 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                </div>
              ) : historyItems.length === 0 ? (
                <div className="text-center py-10">
                  <History className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 text-xs">Nothing sent yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[480px]">
                  <div className="space-y-1.5 pr-3">
                    {historyItems.map((item) => {
                      const isActive = item.status === 'queued' || item.status === 'processing';
                      const isPartial = item.status === 'partial';
                      const progress = item.totalRecipients > 0
                        ? ((item.successful + item.failed) / item.totalRecipients) * 100
                        : 0;

                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 border rounded-lg transition-all hover:shadow-sm ${
                            isActive ? 'border-purple-200 bg-purple-50/50' : isPartial ? 'border-amber-200 bg-amber-50/40' : 'hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] h-4 px-1.5 shrink-0 ${
                                    item.type === 'push'
                                      ? 'border-blue-400 text-blue-600'
                                      : 'border-purple-400 text-purple-600'
                                  }`}
                                >
                                  {item.type === 'push' ? (
                                    <Bell className="w-2 h-2 mr-0.5" />
                                  ) : (
                                    <Mail className="w-2 h-2 mr-0.5" />
                                  )}
                                  {item.type === 'push' ? 'Push' : 'Email'}
                                </Badge>
                                <h4 className="font-medium text-xs truncate">{item.title}</h4>
                                {isActive && (
                                  <Badge className="bg-purple-100 text-purple-700 text-[9px] h-4 px-1.5 shrink-0">
                                    <Loader2 className="w-2 h-2 mr-0.5 animate-spin" />
                                    Live
                                  </Badge>
                                )}
                                {isPartial && (
                                  <Badge className="bg-amber-100 text-amber-700 text-[9px] h-4 px-1.5 shrink-0">
                                    Queued — resumes automatically
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{item.preview}</p>
                            </div>
                            <span className="text-[9px] text-gray-400 whitespace-nowrap shrink-0">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          {isActive && item.totalRecipients > 0 && (
                            <div className="mb-1.5">
                              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-purple-600 h-1.5 transition-all duration-300"
                                  style={{ width: `${Math.min(100, progress)}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {item.totalRecipients} recipients
                            </span>
                            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              ✓ {item.successful}
                            </span>
                            {item.failed > 0 && (
                              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                ✗ {item.failed}
                              </span>
                            )}
                            <CountriesBadge countries={item.targetCountries} />
                          </div>

                          <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-100">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                item.type === 'push' ? viewCampaignDetails(item.push!) : (setSelectedEmailCampaign(item.email!), setShowEmailDetails(true))
                              }
                              className="h-6 text-[10px] px-2 hover:bg-gray-100"
                            >
                              <Eye className="w-2.5 h-2.5 mr-1" />
                              View
                            </Button>
                            {item.type === 'push' && item.failed > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryFailedNotifications(item.push!)}
                                className="h-6 text-[10px] px-2 text-orange-600 hover:bg-orange-50"
                              >
                                <RotateCw className="w-2.5 h-2.5 mr-1" />
                                Retry
                              </Button>
                            )}
                            {item.type === 'push' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => repeatCampaign(item.push!, true)}
                                className="h-6 text-[10px] px-2 text-purple-600 hover:bg-purple-50"
                              >
                                <Copy className="w-2.5 h-2.5 mr-1" />
                                Clone
                              </Button>
                            )}
                            <div className="flex-1" />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => (item.type === 'push' ? deleteCampaign(item.push!.id) : deleteEmailCampaign(item.email!.id))}
                              className="h-6 text-[10px] px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Push Campaign Details Dialog */}
      <Dialog open={showCampaignDetails} onOpenChange={setShowCampaignDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedCampaign?.title}</DialogTitle>
            <DialogDescription>
              Recipient delivery status
            </DialogDescription>
          </DialogHeader>

          {selectedCampaign && (
              <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-600 mb-2">{selectedCampaign.message}</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] h-4">
                    {selectedCampaign.total_recipients} total
                  </Badge>
                  <Badge variant="outline" className="text-green-600 border-green-600 text-[10px] h-4">
                    {selectedCampaign.successful_sends} successful
                  </Badge>
                  <Badge variant="outline" className="text-red-600 border-red-600 text-[10px] h-4">
                    {selectedCampaign.failed_sends} failed
                  </Badge>
                </div>
              </div>
              <ScrollArea className="h-[400px] pr-4">
                {isLoadingRecipients ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {campaignRecipients.map((recipient) => (
                      <div
                        key={recipient.id}
                        className="flex items-center justify-between p-2 border rounded-md"
                      >
                        <div className="flex-1">
                          <p className="text-xs font-medium">
                            {recipient.user?.first_name} {recipient.user?.last_name}
                          </p>
                          <p className="text-[10px] text-gray-500">{recipient.user?.email}</p>
                          {recipient.error_message && (
                            <p className="text-[10px] text-red-600 mt-1">{recipient.error_message}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {recipient.status === 'sent' && (
                            <Badge className="bg-green-100 text-green-700 text-[10px] h-4">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                              Sent
                            </Badge>
                          )}
                          {recipient.status === 'failed' && (
                            <Badge className="bg-red-100 text-red-700 text-[10px] h-4">
                              <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                              Failed
                            </Badge>
                          )}
                          {recipient.status === 'pending' && (
                            <Badge variant="outline" className="text-[10px] h-4">Pending</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Campaign Details Dialog */}
      <Dialog open={showEmailDetails} onOpenChange={setShowEmailDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedEmailCampaign?.subject}</DialogTitle>
            <DialogDescription>
              Sent {selectedEmailCampaign ? new Date(selectedEmailCampaign.created_at).toLocaleString() : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedEmailCampaign && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] h-4">
                  {selectedEmailCampaign.recipient_count} total
                </Badge>
                <Badge variant="outline" className="text-green-600 border-green-600 text-[10px] h-4">
                  {selectedEmailCampaign.successful_sends} successful
                </Badge>
                <Badge variant="outline" className="text-red-600 border-red-600 text-[10px] h-4">
                  {selectedEmailCampaign.failed_sends} failed
                </Badge>
              </div>
              <ScrollArea className="max-h-[240px] rounded border p-3">
                <div
                  className="text-xs [&_a]:text-purple-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: selectedEmailCampaign.message }}
                />
              </ScrollArea>
              {selectedEmailCampaign.error_details && selectedEmailCampaign.error_details.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-red-600 mb-1">Failed recipients</p>
                  <ScrollArea className="h-[120px] rounded border p-2">
                    <div className="space-y-1">
                      {selectedEmailCampaign.error_details.map((f, i) => (
                        <div key={i} className="text-[10px] text-gray-600">
                          {f.email} — <span className="text-red-500">{f.error}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Email List Dialog */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export Email List</DialogTitle>
            <DialogDescription>Export user emails for external campaigns</DialogDescription>
          </DialogHeader>
          <EmailExport />
        </DialogContent>
      </Dialog>
    </div>
  );
}

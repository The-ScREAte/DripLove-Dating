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
import { Loader2, Send, Users, Globe, CheckCircle2, AlertCircle, Trash2, RotateCw, Eye, History, Copy, Mail, Calendar, MessageCircle } from 'lucide-react';
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

// Collapsible countries badge component
const CountriesBadge = ({ countries }: { countries: string[] }) => {
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

const getEdgeFunctionErrorMessage = (err: unknown): string => {
  if (err && typeof err === 'object') {
    const anyErr = err as any;

    // Supabase FunctionsHttpError often includes a JSON string body in context
    const body = anyErr?.context?.body;
    if (body) {
      if (typeof body === 'string' && body.trim().length > 0) {
        try {
          const parsed = JSON.parse(body);
          const msg = parsed?.error || parsed?.message;
          if (typeof msg === 'string' && msg.trim().length > 0) return msg;
        } catch {
          // ignore JSON parse errors
        }
      } else if (typeof body === 'object') {
        const msg = (body as any)?.error || (body as any)?.message;
        if (typeof msg === 'string' && msg.trim().length > 0) return msg;
      }
    }

    const message = anyErr?.message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }

  return 'Failed to start broadcast campaign';
};

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
  const [activeTab, setActiveTab] = useState('new');
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('all');
  
  // Campaign history
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignRecipients, setCampaignRecipients] = useState<Recipient[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);

  const lastCampaignsSignatureRef = useRef<string>('');
  const historyPollIntervalRef = useRef<number | null>(null);
  const campaignsRef = useRef<Campaign[]>([]);

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
    loadCampaigns({ silent: false });

    // Poll silently while there are active campaigns.
    historyPollIntervalRef.current = window.setInterval(() => {
      const hasActive = campaignsRef.current.some(
        (c) => c.status === 'queued' || c.status === 'processing'
      );
      if (!hasActive) return;
      void loadCampaigns({ silent: true });
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

      // Supabase/PostgREST commonly applies a default max rows per request.
      // Page through results so large countries (>1000 users) are fully included.
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
      }> = [];
      for (let page = 0; ; page++) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data: pageRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, country, city, gender, preference, bio')
          .in('country', countryArray)
          .eq('is_admin', false)
          .order('id')
          .range(from, to);

        if (profileError) throw profileError;
        if (!pageRows || pageRows.length === 0) break;

        profiles.push(...pageRows);
        if (pageRows.length < PAGE_SIZE) break;
      }

      const userIds = profiles.map((p) => p.id);
      const usersWithTokens = new Set<string>();

      // Avoid huge `.in(...)` queries that can exceed URL limits and return 400.
      // Batch token lookups in smaller chunks.
      const CHUNK_SIZE = 100;
      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);
        if (chunk.length === 0) continue;

        const { data: tokensChunk, error: tokenError } = await supabase
          .from('push_tokens')
          .select('user_id')
          .in('user_id', chunk);

        if (tokenError) throw tokenError;
        (tokensChunk || []).forEach((t) => {
          if (t.user_id) usersWithTokens.add(t.user_id);
        });
      }

      let filteredProfiles = profiles;

      // Apply debug filters - these SHOW ONLY users matching the selected criteria
      if (recipientFilter === 'no_images') {
        // Show ONLY users WITHOUT any images
        const usersWithImages = new Set<string>();
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
          const chunk = userIds.slice(i, i + CHUNK_SIZE);
          if (chunk.length === 0) continue;

          const { data: imagesChunk, error: imagesError } = await supabase
            .from('user_images')
            .select('user_id')
            .in('user_id', chunk);

          if (imagesError) throw imagesError;
          (imagesChunk || []).forEach((img) => {
            if (img.user_id) usersWithImages.add(img.user_id);
          });
        }

        // FILTER: Keep only users who have NO images (not in usersWithImages set)
        filteredProfiles = profiles.filter((p) => !usersWithImages.has(p.id));
        console.log(`[Broadcast] no_images filter: ${usersWithImages.size} users have images, ${filteredProfiles.length} users without images`);
      } else if (recipientFilter === 'never_seen') {
        // Show ONLY users who have never been liked or passed
        const seenUsers = new Set<string>();
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
          const chunk = userIds.slice(i, i + CHUNK_SIZE);
          if (chunk.length === 0) continue;

          const [{ data: likesChunk, error: likesError }, { data: passesChunk, error: passesError }] = await Promise.all([
            supabase.from('likes').select('liked_id').in('liked_id', chunk),
            supabase.from('passes').select('passed_id').in('passed_id', chunk),
          ]);

          if (likesError) throw likesError;
          if (passesError) throw passesError;

          (likesChunk || []).forEach((r: any) => {
            if (r.liked_id) seenUsers.add(r.liked_id);
          });
          (passesChunk || []).forEach((r: any) => {
            if (r.passed_id) seenUsers.add(r.passed_id);
          });
        }

        // FILTER: Keep only users who have NOT been seen (not in seenUsers set)
        filteredProfiles = profiles.filter((p) => !seenUsers.has(p.id));
        console.log(`[Broadcast] never_seen filter: ${seenUsers.size} users have been seen, ${filteredProfiles.length} never seen`);
      } else if (recipientFilter === 'incomplete_profile') {
        // Show ONLY users with incomplete profiles
        filteredProfiles = profiles.filter((p) => {
          const gender = (p.gender || '').trim();
          const preference = (p.preference || '').trim();
          const bio = (p.bio || '').trim();
          const city = (p.city || '').trim();
          // Incomplete means missing at least one key field
          return !(gender && preference && bio && city);
        });
        console.log(`[Broadcast] incomplete_profile filter: ${filteredProfiles.length} incomplete profiles`);
      } else if (recipientFilter === 'active_accounts') {
        // Show only users with active account status (non-archived, non-suspended)
        // Since we're already querying active profiles by default, just show all
        filteredProfiles = profiles;
        console.log(`[Broadcast] active_accounts filter: ${filteredProfiles.length} active accounts`);
      } else if (recipientFilter === 'premium_users') {
        // Show ONLY premium users with active subscriptions
        const premiumUserIds = new Set<string>();
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
          const chunk = userIds.slice(i, i + CHUNK_SIZE);
          if (chunk.length === 0) continue;

          const { data: subsChunk, error: subsError } = await supabase
            .from('user_subscriptions')
            .select('user_id')
            .in('user_id', chunk)
            .eq('status', 'active');

          if (subsError) throw subsError;
          (subsChunk || []).forEach((sub: any) => {
            if (sub.user_id) premiumUserIds.add(sub.user_id);
          });
        }

        // FILTER: Keep only users who ARE premium (in premiumUserIds set)
        filteredProfiles = profiles.filter((p) => premiumUserIds.has(p.id));
        console.log(`[Broadcast] premium_users filter: ${premiumUserIds.size} premium users found`);
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

  const loadCampaigns = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setIsLoadingCampaigns(true);
    try {
      const { data, error } = await supabase
        .from('broadcast_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const next = (data || []) as Campaign[];

      // Prevent re-renders (and scroll jumps) when nothing meaningful changed.
      const signature = next
        .map((c) => `${c.id}:${c.status}:${c.successful_sends}:${c.failed_sends}:${c.total_recipients}`)
        .join('|');

      if (signature !== lastCampaignsSignatureRef.current) {
        lastCampaignsSignatureRef.current = signature;
        campaignsRef.current = next;
        setCampaigns(next);
      } else {
        // Still keep ref current in case other code reads it.
        campaignsRef.current = next;
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
      // Avoid spamming toast on silent refresh.
      if (!silent) {
        toast({
          title: 'Error',
          description: 'Failed to load campaign history',
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) setIsLoadingCampaigns(false);
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
    return countryNames[code] || code;
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
        description: `Sending to ${totalRecipients} users. Processing in background. Check History tab for progress.`,
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
        description: getEdgeFunctionErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  // Poll for broadcast progress
  const startProgressPolling = (campaignId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const { data: campaign, error } = await supabase
          .from('broadcast_campaigns')
          .select('status, successful_sends, failed_sends, total_recipients')
          .eq('id', campaignId)
          .single();

        if (error) throw error;

        if (campaign.status === 'completed') {
          clearInterval(pollInterval);
          toast({
            title: 'Broadcast Complete',
            description: `Sent: ${campaign.successful_sends}, Failed: ${campaign.failed_sends} out of ${campaign.total_recipients} total`,
            duration: 5000,
          });
          loadCampaigns();
        } else if (campaign.successful_sends + campaign.failed_sends > 0) {
          // Progress update happening silently
        }
      } catch (error) {
        console.error('Error polling progress:', error);
        clearInterval(pollInterval);
      }
    }, 3000); // Poll every 3 seconds

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000);
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This will also delete all recipient records.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('broadcast_campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: 'Campaign Deleted',
        description: 'The campaign has been successfully deleted.',
      });

      loadCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete campaign',
        variant: 'destructive',
      });
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
    setActiveTab('new');
    
    toast({
      title: 'Retry Prepared',
      description: `${failedUserIds.length} failed recipients loaded. Click Send to retry.`,
    });
  };

  const resendCampaign = async (campaign: Campaign, useSameAudience: boolean) => {
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
    
    // Switch to new broadcast tab
    setActiveTab('new');
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

  const usersWithPushTokens = users.filter(u => u.has_push_token).length;
  const filteredUsersWithPushTokens = filteredUsers.filter(u => u.has_push_token).length;
  const selectedUsersWithTokens = users.filter(u => selectedUsers.has(u.id) && u.has_push_token).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-1">Broadcast Notifications</h2>
        <p className="text-xs text-gray-600">Send and manage push notifications to users</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="scheduled">
            <Calendar className="w-4 h-4 mr-2" />
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger value="emailing">
            <Mail className="w-4 h-4 mr-2" />
            Emailing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          {/* Country Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xs">
                    <Globe className="w-3 h-3" />
                    <span className="text-xs">Select Countries</span>
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Choose which countries to target ({selectedCountries.size} selected)
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllCountries}
                  disabled={isLoadingCountries}
                  className="h-7 text-xs"
                >
                  {selectedCountries.size === countries.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingCountries ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : countries.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No countries found</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {countries.map((country) => (
                    <div
                      key={country.code}
                      className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer transition-colors ${
                        selectedCountries.has(country.code)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => toggleCountry(country.code)}
                    >
                      <Checkbox
                        checked={selectedCountries.has(country.code)}
                        onCheckedChange={() => toggleCountry(country.code)}
                        className="rounded-sm data-[state=checked]:bg-purple-600"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-xs">{country.name}</div>
                        <div className="text-[10px] text-gray-500">{country.userCount} users</div>
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
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xs">
                      <Users className="w-3 h-3" />
                      <span className="text-xs">Select Users</span>
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      {recipientFilter !== 'all' ? (
                        <span className="text-purple-600 font-medium">
                          Filtered: {recipientFilter === 'no_images' ? 'Users without photos' : 
                                    recipientFilter === 'never_seen' ? 'Users never seen' :
                                    recipientFilter === 'incomplete_profile' ? 'Incomplete profiles' :
                                    recipientFilter === 'active_accounts' ? 'Active accounts' :
                                    recipientFilter === 'premium_users' ? 'Premium users' : 'All users'} • 
                        </span>
                      ) : null}
                      {' '}{filteredUsers.length} users shown ({filteredUsersWithPushTokens} with push notifications enabled)
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAllUsers}
                    disabled={isLoadingUsers || users.length === 0}
                    className="h-7 text-xs"
                  >
                    {selectedUsers.size === users.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex-1">
                    <Select value={recipientFilter} onValueChange={(v) => setRecipientFilter(v as RecipientFilter)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Audience filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All users</SelectItem>
                        <SelectItem value="no_images">No images (users without photos)</SelectItem>
                        <SelectItem value="never_seen">Never seen (no likes/passes)</SelectItem>
                        <SelectItem value="incomplete_profile">Incomplete profiles</SelectItem>
                        <SelectItem value="active_accounts">Active accounts only</SelectItem>
                        <SelectItem value="premium_users">Premium users only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mb-3">
                  <Input
                    placeholder="Search users by name, city or country..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : users.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No users found in selected countries</p>
                ) : (
                  <>
                    {filteredUsersWithPushTokens === 0 && (
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          None of the users in selected countries have push notifications enabled.
                        </AlertDescription>
                      </Alert>
                    )}
                    <ScrollArea className="h-[300px] pr-4">
                      <div className="space-y-2">
                        {filteredUsers.map((user) => (
                          <div
                            key={user.id}
                            className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer transition-colors ${
                              selectedUsers.has(user.id)
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            onClick={() => toggleUser(user.id)}
                          >
                            <Checkbox
                              checked={selectedUsers.has(user.id)}
                              onCheckedChange={() => toggleUser(user.id)}
                              className="rounded-sm data-[state=checked]:bg-purple-600"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-xs">
                                  {user.first_name} {user.last_name}
                                </span>
                                {user.has_push_token ? (
                                  <Badge variant="outline" className="text-green-600 border-green-600 text-[10px] h-4">
                                    <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                    Push Enabled
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-gray-400 border-gray-400 text-[10px] h-4">
                                    No Push Token
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-500">
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
              <CardHeader>
                <CardTitle className="text-sm">Notification Content</CardTitle>
                <CardDescription className="text-xs">
                  Compose your notification message
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs">Notification Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., New Features Available!"
                    value={notificationTitle}
                    onChange={(e) => setNotificationTitle(e.target.value)}
                    maxLength={100}
                    className="text-xs h-8"
                  />
                  <p className="text-[10px] text-gray-500">{notificationTitle.length}/100 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="text-xs">Notification Message</Label>
                  <Textarea
                    id="message"
                    placeholder="e.g., Check out the new updates we've added to improve your experience..."
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    rows={4}
                    maxLength={200}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-gray-500">{notificationMessage.length}/200 characters</p>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This notification will open the Discover page when users tap on it.
                  </AlertDescription>
                </Alert>

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="saveToProfile"
                    checked={saveToProfile}
                    onCheckedChange={(checked) => setSaveToProfile(checked as boolean)}
                  />
                  <label
                    htmlFor="saveToProfile"
                    className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Save to Profile Messages
                  </label>
                </div>
                <p className="text-[10px] text-gray-500 ml-6">
                  When enabled, this notification will also be saved as a profile message for each recipient
                </p>

                <div className="flex items-center justify-between pt-4 border-t gap-2">
                  <div>
                    <p className="text-xs font-medium">
                      Sending to {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {selectedUsersWithTokens} will receive push notification
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
                        Starting...
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

        <TabsContent value="scheduled">
          <ScheduledBroadcasts />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Campaign History
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    {campaigns.length} campaigns • Click any campaign for details
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadCampaigns({ silent: false })}
                  disabled={isLoadingCampaigns}
                  className="h-7 text-xs"
                >
                  <RotateCw className={`w-3 h-3 mr-1 ${isLoadingCampaigns ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingCampaigns ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">No campaigns yet</p>
                  <p className="text-gray-400 text-xs mt-1">Create your first broadcast in the New tab</p>
                </div>
              ) : (
                <ScrollArea className="h-[480px]">
                  <div className="space-y-2 pr-3">
                    {campaigns.map((campaign) => {
                      const isActive = campaign.status === 'queued' || campaign.status === 'processing';
                      const progress = campaign.total_recipients > 0 
                        ? ((campaign.successful_sends + campaign.failed_sends) / campaign.total_recipients) * 100 
                        : 0;
                      
                      return (
                        <div
                          key={campaign.id}
                          className={`p-3 border rounded-lg transition-all hover:shadow-sm ${
                            isActive ? 'border-purple-200 bg-purple-50/50' : 'hover:border-gray-300'
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-xs truncate">{campaign.title}</h4>
                                {isActive && (
                                  <Badge className="bg-purple-100 text-purple-700 text-[9px] h-4 px-1.5 shrink-0">
                                    <Loader2 className="w-2 h-2 mr-0.5 animate-spin" />
                                    Live
                                  </Badge>
                                )}
                                {campaign.status === 'completed' && (
                                  <Badge className="bg-green-100 text-green-700 text-[9px] h-4 px-1.5 shrink-0">
                                    <CheckCircle2 className="w-2 h-2 mr-0.5" />
                                    Done
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{campaign.message}</p>
                            </div>
                            <span className="text-[9px] text-gray-400 whitespace-nowrap shrink-0">
                              {new Date(campaign.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Progress bar for active campaigns */}
                          {isActive && campaign.total_recipients > 0 && (
                            <div className="mb-2">
                              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-purple-600 h-1.5 transition-all duration-300"
                                  style={{ width: `${Math.min(100, progress)}%` }}
                                />
                              </div>
                              <p className="text-[9px] text-gray-500 mt-0.5">
                                {campaign.successful_sends + campaign.failed_sends} / {campaign.total_recipients} processed
                              </p>
                            </div>
                          )}

                          {/* Stats row */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {campaign.total_recipients} recipients
                            </span>
                            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              ✓ {campaign.successful_sends}
                            </span>
                            {campaign.failed_sends > 0 && (
                              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                ✗ {campaign.failed_sends}
                              </span>
                            )}
                            <CountriesBadge countries={campaign.target_countries} />
                          </div>

                          {/* Actions row */}
                          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewCampaignDetails(campaign)}
                              className="h-6 text-[10px] px-2 hover:bg-gray-100"
                            >
                              <Eye className="w-2.5 h-2.5 mr-1" />
                              View
                            </Button>
                            {campaign.failed_sends > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryFailedNotifications(campaign)}
                                className="h-6 text-[10px] px-2 text-orange-600 hover:bg-orange-50"
                              >
                                <RotateCw className="w-2.5 h-2.5 mr-1" />
                                Retry Failed
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resendCampaign(campaign, true)}
                              className="h-6 text-[10px] px-2 text-purple-600 hover:bg-purple-50"
                            >
                              <Copy className="w-2.5 h-2.5 mr-1" />
                              Clone
                            </Button>
                            <div className="flex-1" />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCampaign(campaign.id)}
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

        <TabsContent value="emailing">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Send Email Broadcast</h3>
              <p className="text-xs text-gray-600 mb-4">
                Send custom emails to selected users using Supabase email service
              </p>
            </div>
            <EmailBroadcast />
            <div className="border-t pt-4 mt-6">
              <h3 className="text-sm font-semibold mb-2">Export Email List</h3>
              <p className="text-xs text-gray-600 mb-4">
                Export user emails for external email campaigns
              </p>
              <EmailExport />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Campaign Details Dialog */}
      <Dialog open={showCampaignDetails} onOpenChange={setShowCampaignDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedCampaign?.title}</DialogTitle>
            <DialogDescription>
              Campaign details and recipient delivery status
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
              </div>              <ScrollArea className="h-[400px] pr-4">
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
    </div>
  );
}

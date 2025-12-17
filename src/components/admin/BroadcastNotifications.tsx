import React, { useState, useEffect } from 'react';
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
import { Loader2, Send, Users, Globe, CheckCircle2, AlertCircle, Trash2, RotateCw, Eye, History, Copy, Mail, Calendar } from 'lucide-react';
import EmailExport from './EmailExport';
import ScheduledBroadcasts from './ScheduledBroadcasts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function BroadcastNotifications() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0, failed: 0 });
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('new');
  
  // Campaign history
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignRecipients, setCampaignRecipients] = useState<Recipient[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);

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
  }, [selectedCountries]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadCampaigns();
    }
  }, [activeTab]);

  const loadCountries = async () => {
    setIsLoadingCountries(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('country, id')
        .not('country', 'is', null)
        .eq('account_status', 'active')
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
      
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, country, city')
        .in('country', countryArray)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .order('first_name');

      if (profileError) throw profileError;

      const userIds = profiles?.map(p => p.id) || [];
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('user_id')
        .in('user_id', userIds);

      const usersWithTokens = new Set(tokens?.map(t => t.user_id) || []);

      const userList: User[] = profiles?.map(p => ({
        id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        country: p.country || '',
        city: p.city || '',
        has_push_token: usersWithTokens.has(p.id),
      })) || [];

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

  const loadCampaigns = async () => {
    setIsLoadingCampaigns(true);
    try {
      const { data, error } = await supabase
        .from('broadcast_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setCampaigns(data || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast({
        title: 'Error',
        description: 'Failed to load campaign history',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCampaigns(false);
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

  const sendNotifications = async (retryFailed = false, existingCampaignId?: string) => {
    let recipientsToSend = Array.from(selectedUsers);
    
    if (!retryFailed && selectedUsers.size === 0) {
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
    setSendProgress({ sent: 0, total: recipientsToSend.length, failed: 0 });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let campaignId = existingCampaignId;
      
      // Create or update campaign
      if (!retryFailed || !existingCampaignId) {
        const { data: campaign, error: campaignError } = await supabase
          .from('broadcast_campaigns')
          .insert({
            admin_id: user?.id,
            title: notificationTitle,
            message: notificationMessage,
            notification_type: 'system',
            target_countries: Array.from(selectedCountries),
            total_recipients: recipientsToSend.length,
            successful_sends: 0,
            failed_sends: 0,
          })
          .select()
          .single();

        if (campaignError) throw campaignError;
        campaignId = campaign.id;
        setCurrentCampaignId(campaignId);

        // Create recipient records
        const recipients = recipientsToSend.map(userId => ({
          campaign_id: campaignId,
          user_id: userId,
          status: 'pending' as const,
        }));

        const { error: recipientsError } = await supabase
          .from('broadcast_recipients')
          .insert(recipients);

        if (recipientsError) throw recipientsError;
      }

      let successCount = 0;
      let failureCount = 0;

      // Send notifications in batches
      const batchSize = 10;
      for (let i = 0; i < recipientsToSend.length; i += batchSize) {
        const batch = recipientsToSend.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map(async (userId) => {
            try {
              const { data, error } = await supabase.functions.invoke('send-push-notification', {
                body: {
                  title: notificationTitle,
                  body: notificationMessage,
                  userId: userId,
                  type: 'system',
                  data: { action: 'open_discover' }
                }
              });

              if (error) throw error;
              
              const success = data?.success || false;
              
              // Update recipient status
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: success ? 'sent' : 'failed',
                  error_message: success ? null : 'Notification failed to send',
                  sent_at: success ? new Date().toISOString() : null,
                })
                .eq('campaign_id', campaignId)
                .eq('user_id', userId);

              return { success, userId };
            } catch (error) {
              console.error(`Failed to send to user ${userId}:`, error);
              
              // Update recipient status
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: error instanceof Error ? error.message : 'Unknown error',
                })
                .eq('campaign_id', campaignId)
                .eq('user_id', userId);
              
              return { success: false, userId };
            }
          })
        );

        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            successCount++;
          } else {
            failureCount++;
          }
        });

        setSendProgress({
          sent: successCount,
          total: recipientsToSend.length,
          failed: failureCount,
        });

        if (i + batchSize < recipientsToSend.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Update campaign stats
      await supabase
        .from('broadcast_campaigns')
        .update({
          successful_sends: successCount,
          failed_sends: failureCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId);

      setIsSending(false);

      toast({
        title: 'Notifications Sent',
        description: `Successfully sent ${successCount} notifications. ${failureCount > 0 ? `${failureCount} failed.` : ''}`,
        variant: successCount > 0 ? 'default' : 'destructive',
      });

      if (successCount > 0) {
        setNotificationTitle('');
        setNotificationMessage('');
        setSelectedUsers(new Set());
      }
      
      if (activeTab === 'history') {
        loadCampaigns();
      }
    } catch (error) {
      console.error('Error sending notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to process notification campaign',
        variant: 'destructive',
      });
      setIsSending(false);
    }
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
          <TabsTrigger value="new">New Broadcast</TabsTrigger>
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
                      {filteredUsers.length} users shown ({filteredUsersWithPushTokens} with push notifications enabled)
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

                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <p className="text-xs font-medium">
                      Sending to {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {selectedUsersWithTokens} will receive push notification
                    </p>
                  </div>
                  <Button
                    onClick={() => sendNotifications()}
                    disabled={isSending || !notificationTitle.trim() || !notificationMessage.trim()}
                    className="min-w-[140px] h-8 text-xs"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Sending... {sendProgress.sent}/{sendProgress.total}
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3 mr-2" />
                        Send Notifications
                      </>
                    )}
                  </Button>
                </div>

                {isSending && (
                  <div className="space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(sendProgress.sent / sendProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-center text-gray-500">
                      Sent: {sendProgress.sent} | Failed: {sendProgress.failed} | Remaining: {sendProgress.total - sendProgress.sent - sendProgress.failed}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scheduled">
          <ScheduledBroadcasts />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs">Campaign History</CardTitle>
              <CardDescription className="text-[10px]">
                View past broadcast campaigns and their delivery status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingCampaigns ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : campaigns.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No campaigns found</p>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {campaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="p-3 border rounded-md hover:border-purple-300 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-xs">{campaign.title}</h4>
                            <p className="text-[10px] text-gray-600 mt-1">{campaign.message}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] h-4">
                            {campaign.total_recipients} recipients
                          </Badge>
                          <Badge variant="outline" className="text-green-600 border-green-600 text-[10px] h-4">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                            {campaign.successful_sends} sent
                          </Badge>
                          {campaign.failed_sends > 0 && (
                            <Badge variant="outline" className="text-red-600 border-red-600 text-[10px] h-4">
                              <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                              {campaign.failed_sends} failed
                            </Badge>
                          )}
                          <CountriesBadge countries={campaign.target_countries} />
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] text-gray-500">
                            {new Date(campaign.created_at).toLocaleString()}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewCampaignDetails(campaign)}
                              className="h-6 text-[10px] px-2"
                            >
                              <Eye className="w-2.5 h-2.5 mr-1" />
                              Details
                            </Button>
                            {campaign.failed_sends > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryFailedNotifications(campaign)}
                                className="h-6 text-[10px] px-2"
                              >
                                <RotateCw className="w-2.5 h-2.5 mr-1" />
                                Retry
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resendCampaign(campaign, true)}
                              className="h-6 text-[10px] px-2 text-purple-600 hover:text-purple-700"
                            >
                              <Copy className="w-2.5 h-2.5 mr-1" />
                              Same
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resendCampaign(campaign, false)}
                              className="h-6 text-[10px] px-2 text-blue-600 hover:text-blue-700"
                            >
                              <Send className="w-2.5 h-2.5 mr-1" />
                              New
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCampaign(campaign.id)}
                              className="h-6 text-[10px] px-2 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-2.5 h-2.5 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emailing">
          <EmailExport />
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

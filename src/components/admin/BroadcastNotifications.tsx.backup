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
import { Loader2, Send, Users, Globe, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

  // Load countries and user counts
  useEffect(() => {
    loadCountries();
  }, []);

  // Load users when countries are selected
  useEffect(() => {
    if (selectedCountries.size > 0) {
      loadUsers();
    } else {
      setUsers([]);
      setSelectedUsers(new Set());
    }
  }, [selectedCountries]);

  const loadCountries = async () => {
    setIsLoadingCountries(true);
    try {
      // Get unique countries with user counts
      const { data, error } = await supabase
        .from('profiles')
        .select('country, id')
        .not('country', 'is', null)
        .eq('account_status', 'active');

      if (error) throw error;

      // Group by country and count
      const countryMap = new Map<string, number>();
      data?.forEach((profile) => {
        const count = countryMap.get(profile.country) || 0;
        countryMap.set(profile.country, count + 1);
      });

      // Convert to array and sort by user count
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
      
      // Get users from selected countries with push token info
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, country, city')
        .in('country', countryArray)
        .eq('account_status', 'active')
        .order('first_name');

      if (profileError) throw profileError;

      // Get push tokens for these users
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

  const getCountryName = (code: string): string => {
    const countryNames: Record<string, string> = {
      'GH': 'Ghana',
      'NG': 'Nigeria',
      'US': 'United States',
      'GB': 'United Kingdom',
      'CA': 'Canada',
      'KE': 'Kenya',
      'ZA': 'South Africa',
      'UG': 'Uganda',
      'TZ': 'Tanzania',
      'RW': 'Rwanda',
      // Add more as needed
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
    setSendProgress({ sent: 0, total: selectedUsers.size, failed: 0 });

    const userIds = Array.from(selectedUsers);
    let successCount = 0;
    let failureCount = 0;

    // Send notifications in batches of 10 to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
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
            if (!data?.success) throw new Error('Notification failed');
            
            return { success: true };
          } catch (error) {
            console.error(`Failed to send to user ${userId}:`, error);
            return { success: false };
          }
        })
      );

      // Count successes and failures
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failureCount++;
        }
      });

      setSendProgress({
        sent: successCount,
        total: userIds.length,
        failed: failureCount,
      });

      // Small delay between batches
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsSending(false);

    toast({
      title: 'Notifications Sent',
      description: `Successfully sent ${successCount} notifications. ${failureCount > 0 ? `${failureCount} failed.` : ''}`,
      variant: successCount > 0 ? 'default' : 'destructive',
    });

    // Clear form on success
    if (successCount > 0) {
      setNotificationTitle('');
      setNotificationMessage('');
    }
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
        <h2 className="text-lg font-semibold mb-1">Broadcast Notifications</h2>
        <p className="text-sm text-gray-600">Send push notifications to users across different countries</p>
      </div>

      {/* Country Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Globe className="w-4 h-4" />
                <span className="text-sm">Select Countries</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Choose which countries to target ({selectedCountries.size} selected)
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllCountries}
              disabled={isLoadingCountries}
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
                  className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedCountries.has(country.code)
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleCountry(country.code)}
                >
                  <Checkbox
                    checked={selectedCountries.has(country.code)}
                    onCheckedChange={() => toggleCountry(country.code)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{country.name}</div>
                    <div className="text-xs text-gray-500">{country.userCount} users</div>
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
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Select Users</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  {filteredUsers.length} users shown ({filteredUsersWithPushTokens} with push notifications enabled)
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllUsers}
                disabled={isLoadingUsers || users.length === 0}
              >
                {selectedUsers.size === users.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search box */}
            <div className="mb-3">
              <Input
                placeholder="Search users by name, city or country..."
                value={searchTerm}
                onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                className="text-sm"
                id="broadcast-search"
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
                        className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedUsers.has(user.id)
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => toggleUser(user.id)}
                      >
                        <Checkbox
                          checked={selectedUsers.has(user.id)}
                          onCheckedChange={() => toggleUser(user.id)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {user.first_name} {user.last_name}
                            </span>
                            {user.has_push_token ? (
                              <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Push Enabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-gray-400 border-gray-400 text-xs">
                                No Push Token
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
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
            <CardTitle>Notification Content</CardTitle>
            <CardDescription>
              Compose your notification message
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Notification Title</Label>
              <Input
                id="title"
                placeholder="e.g., New Features Available!"
                value={notificationTitle}
                onChange={(e) => setNotificationTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-gray-500">{notificationTitle.length}/100 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Notification Message</Label>
              <Textarea
                id="message"
                placeholder="e.g., Check out the new updates we've added to improve your experience..."
                value={notificationMessage}
                onChange={(e) => setNotificationMessage(e.target.value)}
                rows={4}
                maxLength={200}
              />
              <p className="text-xs text-gray-500">{notificationMessage.length}/200 characters</p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This notification will open the Discover page when users tap on it.
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <p className="text-sm font-medium">
                  Sending to {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedUsersWithTokens} will receive push notification
                </p>
              </div>
              <Button
                onClick={sendNotifications}
                disabled={isSending || !notificationTitle.trim() || !notificationMessage.trim()}
                className="min-w-[140px]"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending... {sendProgress.sent}/{sendProgress.total}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Notifications
                  </>
                )}
              </Button>
            </div>

            {isSending && (
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(sendProgress.sent / sendProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-center text-gray-500">
                  Sent: {sendProgress.sent} | Failed: {sendProgress.failed} | Remaining: {sendProgress.total - sendProgress.sent - sendProgress.failed}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

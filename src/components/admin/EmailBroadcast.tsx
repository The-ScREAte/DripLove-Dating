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
import { Loader2, Send, Users, Globe, Mail, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchAllRows, applyDebugFilter, fetchAllProfiles } from '@/hooks/useBatchFetch';

interface Country {
  code: string;
  name: string;
  userCount: number;
}

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  country: string;
  city: string;
}

type RecipientFilter = 'all' | 'premium' | 'free';

const getCountryName = (code: string): string => {
  const countryNames: Record<string, string> = {
    'GH': 'Ghana', 'NG': 'Nigeria', 'US': 'United States', 'GB': 'United Kingdom',
    'CA': 'Canada', 'KE': 'Kenya', 'ZA': 'South Africa', 'UG': 'Uganda',
    'TZ': 'Tanzania', 'RW': 'Rwanda', 'CI': "Côte d'Ivoire", 'SN': 'Senegal',
    'CM': 'Cameroon', 'ET': 'Ethiopia', 'EG': 'Egypt', 'MA': 'Morocco',
    'DZ': 'Algeria', 'TN': 'Tunisia', 'BW': 'Botswana', 'ZW': 'Zimbabwe',
  };
  return countryNames[code] || code;
};

export default function EmailBroadcast() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [preferenceFilter, setPreferenceFilter] = useState<string>('all');
  const [intentFilter, setIntentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [debugFilter, setDebugFilter] = useState<string>('all');
  const [archiveFilter, setArchiveFilter] = useState<string>('not_archived');
  const { toast } = useToast();

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
  }, [selectedCountries, recipientFilter, genderFilter, preferenceFilter, intentFilter, statusFilter, debugFilter, archiveFilter]);

  useEffect(() => {
    setSelectedUsers(new Set());
  }, [selectedCountries, recipientFilter, genderFilter, preferenceFilter, intentFilter, statusFilter, debugFilter, archiveFilter]);

  const loadCountries = async () => {
    setIsLoadingCountries(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('country, id')
        .not('country', 'is', null)
        .not('email', 'is', null)
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

      // Use batch fetch utility for profiles
      const profiles = await fetchAllProfiles(countryArray, {
        genderFilter,
        preferenceFilter,
        intentFilter,
        statusFilter,
        archiveFilter,
        isAdmin: false,
      });

      // Filter to only profiles with email
      let filteredProfiles = profiles.filter(p => p.email);

      // Apply premium/free filter if needed
      if (recipientFilter === 'premium' || recipientFilter === 'free') {
        // Use batch fetch for all subscriptions
        const allSubs = await fetchAllRows<{ user_id: string; status: string; expires_at: string }>('user_subscriptions', 'user_id, status, expires_at', [
          { column: 'status', op: 'eq', value: 'active' }
        ]);
        
        const premiumUserIds = new Set<string>();
        allSubs
          .filter(s => s.status === 'active' && new Date(s.expires_at || 0) > new Date())
          .forEach(s => premiumUserIds.add(s.user_id));

        if (recipientFilter === 'premium') {
          filteredProfiles = filteredProfiles.filter(p => premiumUserIds.has(p.id));
        } else {
          filteredProfiles = filteredProfiles.filter(p => !premiumUserIds.has(p.id));
        }
      }

      // Apply debug filter using shared utility
      if (debugFilter !== 'all') {
        const result = await applyDebugFilter(filteredProfiles, debugFilter);
        filteredProfiles = result.filteredProfiles;
      }

      setUsers(filteredProfiles.map(p => ({
        id: p.id,
        email: p.email || '',
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        country: p.country || '',
        city: p.city || '',
      })).filter(u => u.email));
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
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const sendEmails = async () => {
    if (selectedUsers.size === 0) {
      toast({
        title: 'No Users Selected',
        description: 'Please select at least one user to send emails to.',
        variant: 'destructive',
      });
      return;
    }

    if (!emailSubject.trim() || !emailBody.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please enter both subject and message for the email.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);

    try {
      // Get email addresses for selected users
      const selectedUserEmails = users
        .filter(u => selectedUsers.has(u.id) && u.email)
        .map(u => u.email);

      if (selectedUserEmails.length === 0) {
        toast({
          title: 'No Valid Emails',
          description: 'Selected users do not have valid email addresses.',
          variant: 'destructive',
        });
        return;
      }

      // Create Primary inbox-friendly HTML content (minimal design, no promotions triggers)
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0; padding: 0;">
  <div style="max-width: 580px; margin: 0 auto; padding: 20px;">
    <!-- Message content -->
    <div style="color: #333333;">
      ${emailBody.replace(/\n/g, '<br>')}
    </div>
    
    <!-- Professional sign-off with logo -->
    <table style="margin-top: 30px; border: none;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align: top; padding-right: 12px;">
          <img src="https://driplove.love/driplove-logo.png" alt="DripLove" width="40" height="40" style="display: block; border-radius: 6px;" />
        </td>
        <td style="vertical-align: middle;">
          <span style="font-size: 14px; color: #333333; display: block;">Best regards,</span>
          <span style="font-size: 14px; font-weight: 600; color: #333333; display: block;">The DripLove Team</span>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
      `;

      // Get current user for logging
      const { data: { user } } = await supabase.auth.getUser();

      // Call edge function to send emails
      const response = await supabase.functions.invoke('send-broadcast-email', {
        body: {
          recipients: selectedUserEmails,
          subject: emailSubject,
          htmlContent: htmlContent,
          textContent: emailBody,
          targetCountries: Array.from(selectedCountries),
          recipientFilter: recipientFilter,
          adminId: user?.id,
        },
      });

      if (response.error) {
        console.error('Edge function error:', response.error);
        // Show more specific error from the response
        const errorData = response.error;
        let errorMessage = 'Failed to send emails';
        if (typeof errorData === 'object' && errorData.message) {
          errorMessage = errorData.message;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
        throw new Error(errorMessage);
      }
      
      // Check for error in response data (edge function returned error)
      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const results = response.data?.results;
      
      if (results?.failed > 0) {
        toast({
          title: 'Emails Sent with Issues',
          description: `Sent: ${results.sent}, Failed: ${results.failed}. Check console for details.`,
          duration: 5000,
        });
        console.log('Failed emails:', results.details?.failed);
      } else {
        toast({
          title: 'Emails Sent Successfully',
          description: `Successfully sent ${results?.sent || 0} email(s).`,
          duration: 5000,
        });
      }

      // Reset form
      setEmailSubject('');
      setEmailBody('');
      setSelectedUsers(new Set());

    } catch (error) {
      console.error('Error sending emails:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send emails',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.city || '').toLowerCase().includes(q) ||
      getCountryName(u.country).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          Send custom emails to selected users. Emails are sent using Supabase's email service.
        </AlertDescription>
      </Alert>

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
                  <span className="text-xs">Select Recipients</span>
                </CardTitle>
                <CardDescription className="text-[10px]">
                  {filteredUsers.length} users shown, {selectedUsers.size} selected
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllUsers}
                disabled={isLoadingUsers || users.length === 0}
                className="h-7 text-xs"
              >
                {selectedUsers.size === filteredUsers.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] mb-1">Gender</Label>
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="non-binary">Non-binary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] mb-1">Looking For</Label>
                  <Select value={preferenceFilter} onValueChange={setPreferenceFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Preferences</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] mb-1">Relationship Intent</Label>
                  <Select value={intentFilter} onValueChange={setIntentFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Intents</SelectItem>
                      <SelectItem value="serious">Serious</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="friendship">Friendship</SelectItem>
                      <SelectItem value="unsure">Unsure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] mb-1">Subscription</Label>
                  <Select value={recipientFilter} onValueChange={(v) => setRecipientFilter(v as RecipientFilter)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="free">Free</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] mb-1">Account Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] mb-1">Debug Filter</Label>
                  <Select value={debugFilter} onValueChange={setDebugFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">No Debug Filter</SelectItem>
                      <SelectItem value="no_photo">No Photo</SelectItem>
                      <SelectItem value="never_seen">Never Seen</SelectItem>
                      <SelectItem value="incomplete">Incomplete</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-[10px] mb-1">Archive Status</Label>
                <Select value={archiveFilter} onValueChange={setArchiveFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_archived">Not Archived (Default)</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="archived_only">Archived Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mb-3">
              <Input
                placeholder="Search by name, email, or city..."
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
              <p className="text-center text-gray-500 py-8">No users found with email addresses</p>
            ) : (
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
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {user.email}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {user.city}, {getCountryName(user.country)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Email Composition */}
      {selectedUsers.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs">Compose Email</CardTitle>
            <CardDescription className="text-[10px]">
              Write your email to send to {selectedUsers.size} selected user(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-subject" className="text-xs">Subject</Label>
              <Input
                id="email-subject"
                placeholder="Enter email subject..."
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-body" className="text-xs">Message</Label>
              <Textarea
                id="email-body"
                placeholder="Enter your email message..."
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={8}
                className="text-xs resize-none"
              />
              <p className="text-[10px] text-gray-500">
                Your message will be formatted in a branded email template.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-600">
                Sending to {selectedUsers.size} recipient(s)
              </div>
              <Button
                onClick={sendEmails}
                disabled={isSending || !emailSubject.trim() || !emailBody.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3 mr-2" />
                    Send Emails
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

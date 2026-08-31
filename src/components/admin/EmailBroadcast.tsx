import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, Users, Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchAllRows, applyDebugFilter, fetchAllProfiles } from '@/hooks/useBatchFetch';
import RichTextEditor from './RichTextEditor';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

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

const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+\n/g, '\n').trim();
};

const getCountryName = (code: string): string => {
  const countryNames: Record<string, string> = {
    'GH': 'Ghana', 'NG': 'Nigeria', 'US': 'United States', 'GB': 'United Kingdom',
    'CA': 'Canada', 'KE': 'Kenya', 'ZA': 'South Africa', 'UG': 'Uganda',
    'TZ': 'Tanzania', 'RW': 'Rwanda', 'CI': "Côte d'Ivoire", 'SN': 'Senegal',
    'CM': 'Cameroon', 'ET': 'Ethiopia', 'EG': 'Egypt', 'MA': 'Morocco',
    'DZ': 'Algeria', 'TN': 'Tunisia', 'BW': 'Botswana', 'ZW': 'Zimbabwe',
  };
  return countryNames[code] || code || 'Unknown';
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
      // Paginated - a plain .select() here silently caps at Supabase's
      // default 1000-row limit, which undercounted every country's badge
      // (e.g. Ghana showed 421 instead of its real ~2430) once the profiles
      // table grew past that. Mirrors fetchAllProfiles's pagination below.
      const PAGE_SIZE = 1000;
      const allProfiles: { country: string | null; id: string; email: string | null }[] = [];
      for (let page = 0; ; page++) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data: pageRows, error } = await supabase
          .from('profiles')
          .select('country, id, email')
          .not('country', 'is', null)
          .not('email', 'is', null)
          .eq('is_admin', false)
          .order('id')
          .range(from, to);

        if (error) throw error;
        if (!pageRows || pageRows.length === 0) break;
        allProfiles.push(...pageRows);
        if (pageRows.length < PAGE_SIZE) break;
      }

      const countryMap = new Map<string, number>();
      allProfiles.forEach((profile) => {
        const count = countryMap.get(profile.country as string) || 0;
        countryMap.set(profile.country as string, count + 1);
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

    if (!emailSubject.trim() || !htmlToPlainText(emailBody)) {
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

      const htmlContent = emailBody;
      const textContent = htmlToPlainText(emailBody);

      // Sent via a Supabase Edge Function (same approach as push notifications) so this
      // works identically on web, Android and iOS regardless of where the admin panel is hosted —
      // no dependency on a separately-deployed Express/SMTP server URL.
      const { data: smtpData, error: smtpError } = await supabase.functions.invoke('send-broadcast-email-smtp', {
        body: {
          recipients: selectedUserEmails,
          subject: emailSubject,
          htmlContent,
          textContent,
          targetCountries: Array.from(selectedCountries),
          recipientFilter,
        },
      });

      if (smtpError) {
        throw new Error(await getEdgeFunctionErrorMessage(smtpError, 'SMTP email request failed'));
      }

      // The edge function creates and owns the email_broadcast_history row itself now
      // (same pattern as push broadcasts), so it shows up in the unified History tab automatically.
      const results: { sent?: number; failed?: number; queued?: number; details?: { failed?: Array<{ email: string; error: string }> } } | undefined = (smtpData as any)?.results;
      const sentCount = results?.sent || 0;
      const failedCount = results?.failed || 0;
      const queuedCount = results?.queued || 0;

      if (queuedCount > 0) {
        toast({
          title: 'Sent — some queued for later',
          description: `Sent: ${sentCount}, Failed: ${failedCount}, Queued: ${queuedCount} (daily sending limit reached — these will go out automatically once quota resets).`,
          duration: 7000,
        });
      } else if (failedCount > 0) {
        toast({
          title: 'Emails Sent with Issues',
          description: `Sent: ${sentCount}, Failed: ${failedCount}. Check console for details.`,
          duration: 5000,
        });
        console.log('Failed emails:', results?.details?.failed);
      } else {
        toast({
          title: 'Emails Sent Successfully',
          description: `Successfully sent ${sentCount} email(s).`,
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
    <div className="space-y-3">
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
                {selectedUsers.size === filteredUsers.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-2 space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <Label className="text-[10px] mb-0.5 block">Gender</Label>
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
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
                  <Label className="text-[10px] mb-0.5 block">Looking For</Label>
                  <Select value={preferenceFilter} onValueChange={setPreferenceFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
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
                  <Label className="text-[10px] mb-0.5 block">Intent</Label>
                  <Select value={intentFilter} onValueChange={setIntentFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
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

              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <Label className="text-[10px] mb-0.5 block">Subscription</Label>
                  <Select value={recipientFilter} onValueChange={(v) => setRecipientFilter(v as RecipientFilter)}>
                    <SelectTrigger className="h-7 text-[11px]">
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
                  <Label className="text-[10px] mb-0.5 block">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
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
                  <Label className="text-[10px] mb-0.5 block">Debug Filter</Label>
                  <Select value={debugFilter} onValueChange={setDebugFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">None</SelectItem>
                      <SelectItem value="no_photo">No Photo</SelectItem>
                      <SelectItem value="never_seen">Never Seen</SelectItem>
                      <SelectItem value="incomplete">Incomplete</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-[10px] mb-0.5 block">Archive Status</Label>
                <Select value={archiveFilter} onValueChange={setArchiveFilter}>
                  <SelectTrigger className="h-7 text-[11px]">
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

            <div className="mb-2">
              <Input
                placeholder="Search by name, email, or city..."
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
              <p className="text-center text-gray-500 text-xs py-6">No users found with email addresses</p>
            ) : (
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
                        <span className="font-medium text-[11px] truncate block">
                          {user.first_name} {user.last_name}
                        </span>
                        <div className="text-[9px] text-gray-500 truncate">
                          {user.email} · {user.city}, {getCountryName(user.country)}
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
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Compose Email ({selectedUsers.size} recipients)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email-subject" className="text-xs">Subject</Label>
              <Input
                id="email-subject"
                placeholder="Enter email subject..."
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email-body" className="text-xs">Message</Label>
              <RichTextEditor
                value={emailBody}
                onChange={setEmailBody}
                placeholder="Write your email message..."
              />
            </div>
            <div className="flex items-center justify-end pt-1">
              <Button
                onClick={sendEmails}
                disabled={isSending || !emailSubject.trim() || !htmlToPlainText(emailBody)}
                className="h-8 text-xs bg-purple-600 hover:bg-purple-700"
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

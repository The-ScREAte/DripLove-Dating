import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Copy, Check, Mail, Users, Globe, Filter, Download } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Country {
  code: string;
  name: string;
  userCount: number;
}

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

export default function EmailExport() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [preferenceFilter, setPreferenceFilter] = useState<string>('all');
  const [premiumFilter, setPremiumFilter] = useState<string>('all');
  const [intentFilter, setIntentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [debuggerFilter, setDebuggerFilter] = useState<string>('none');
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCountries();
  }, []);

  const loadCountries = async () => {
    setIsLoadingCountries(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('country, id')
        .not('country', 'is', null);

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

  const fetchEmails = async () => {
    setIsLoadingEmails(true);
    setEmails([]);
    
    try {
      // Fetch ALL profiles in batches to bypass 1000 limit
      const allProfiles: any[] = [];
      const BATCH_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        // Build the query for each batch
        let query = supabase
          .from('profiles')
          .select('id, email, gender, preference, relationship_intent, account_status, country, is_archived, bio, city');

        // Apply country filter
        if (selectedCountries.size > 0) {
          query = query.in('country', Array.from(selectedCountries));
        }

        // Apply gender filter
        if (genderFilter !== 'all') {
          query = query.eq('gender', genderFilter);
        }

        // Apply preference filter
        if (preferenceFilter !== 'all') {
          query = query.eq('preference', preferenceFilter);
        }

        // Apply intent filter
        if (intentFilter !== 'all') {
          query = query.eq('relationship_intent', intentFilter);
        }

        // Apply status filter
        if (statusFilter !== 'all') {
          query = query.eq('account_status', statusFilter);
        }

        // Apply archive filter (only if NOT including archived)
        if (!includeArchived) {
          query = query.or('is_archived.is.null,is_archived.eq.false');
        }

        // Safety: exclude deleted/suspended users (even if archived is checked)
        query = query.neq('account_status', 'deleted')
                     .neq('account_status', 'suspended');

        // Add pagination
        query = query.range(offset, offset + BATCH_SIZE - 1);

        const { data: profiles, error: profileError } = await query;

        if (profileError) throw profileError;
        
        if (profiles && profiles.length > 0) {
          allProfiles.push(...profiles);
          offset += BATCH_SIZE;
          // If we got less than batch size, we've reached the end
          hasMore = profiles.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }

      let filteredProfiles = allProfiles;

      // Apply premium filter (requires joining with subscriptions)
      if (premiumFilter !== 'all') {
        const userIds = filteredProfiles.map(p => p.id);
        
        const { data: subscriptions } = await supabase
          .from('user_subscriptions')
          .select('user_id, status, expires_at')
          .in('user_id', userIds);

        const premiumUserIds = new Set(
          (subscriptions || [])
            .filter(s => s.status === 'active' && new Date(s.expires_at || 0) > new Date())
            .map(s => s.user_id)
        );

        if (premiumFilter === 'premium') {
          filteredProfiles = filteredProfiles.filter(p => premiumUserIds.has(p.id));
        } else if (premiumFilter === 'free') {
          filteredProfiles = filteredProfiles.filter(p => !premiumUserIds.has(p.id));
        }
      }

      // Apply debugger category filters
      if (debuggerFilter !== 'none') {
        const profileIds = filteredProfiles.map(p => p.id);

        if (debuggerFilter === 'no_photo') {
          // Fetch all user images to find users without photos
          const usersWithImages = new Set<string>();
          for (let page = 0; ; page++) {
            const { data: images, error } = await supabase
              .from('user_images')
              .select('user_id')
              .in('user_id', profileIds.slice(page * BATCH_SIZE, (page + 1) * BATCH_SIZE));
            
            if (error) throw error;
            if (!images || images.length === 0) break;
            images.forEach(img => usersWithImages.add(img.user_id));
            if (profileIds.slice(page * BATCH_SIZE, (page + 1) * BATCH_SIZE).length < BATCH_SIZE) break;
          }
          
          filteredProfiles = filteredProfiles.filter(p => !usersWithImages.has(p.id));
        } else if (debuggerFilter === 'incomplete') {
          // Users with missing essential fields
          filteredProfiles = filteredProfiles.filter(p => 
            !p.gender || !p.preference || !p.bio || !p.city
          );
        } else if (debuggerFilter === 'never_seen') {
          // Users who have never been liked or passed
          const seenUsers = new Set<string>();
          
          // Get all likes for these users
          for (let page = 0; ; page++) {
            const chunk = profileIds.slice(page * BATCH_SIZE, (page + 1) * BATCH_SIZE);
            if (chunk.length === 0) break;
            
            const { data: likes, error } = await supabase
              .from('likes')
              .select('liked_id')
              .in('liked_id', chunk);
            
            if (error) throw error;
            if (!likes || likes.length === 0) {
              if (chunk.length < BATCH_SIZE) break;
              continue;
            }
            likes.forEach(l => seenUsers.add(l.liked_id));
            if (chunk.length < BATCH_SIZE) break;
          }
          
          // Get all passes for these users
          for (let page = 0; ; page++) {
            const chunk = profileIds.slice(page * BATCH_SIZE, (page + 1) * BATCH_SIZE);
            if (chunk.length === 0) break;
            
            const { data: passes, error } = await supabase
              .from('passes')
              .select('passed_id')
              .in('passed_id', chunk);
            
            if (error) throw error;
            if (!passes || passes.length === 0) {
              if (chunk.length < BATCH_SIZE) break;
              continue;
            }
            passes.forEach(p => p.passed_id && seenUsers.add(p.passed_id));
            if (chunk.length < BATCH_SIZE) break;
          }
          
          filteredProfiles = filteredProfiles.filter(p => !seenUsers.has(p.id));
        }
      }

      // Extract emails
      const emailList = filteredProfiles
        .map(p => p.email)
        .filter((email): email is string => !!email && email.trim() !== '');

      setEmails(emailList);

      toast({
        title: 'Emails Fetched',
        description: `Found ${emailList.length} email addresses${debuggerFilter !== 'none' ? ` (${debuggerFilter.replace('_', ' ')} filter applied)` : ''}`,
      });
    } catch (error) {
      console.error('Error fetching emails:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch emails',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingEmails(false);
    }
  };

  const copyToClipboard = async () => {
    const emailText = emails.join(', ');
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: `${emails.length} emails copied to clipboard`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const downloadAsCSV = () => {
    try {
      // Create CSV content with one email per line
      const csvContent = 'email\n' + emails.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `emails_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Downloaded!',
        description: `${emails.length} emails saved to CSV file`,
      });
    } catch (error) {
      console.error('Failed to download:', error);
      toast({
        title: 'Error',
        description: 'Failed to download CSV file',
        variant: 'destructive',
      });
    }
  };

  const csvEmails = emails.join(', ');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Export
          </CardTitle>
          <CardDescription>
            Fetch user emails based on filters for marketing or contact purposes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filters Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Gender Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Gender
              </Label>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preference Filter */}
            <div className="space-y-2">
              <Label>Looking For</Label>
              <Select value={preferenceFilter} onValueChange={setPreferenceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Preferences</SelectItem>
                  <SelectItem value="male">Men</SelectItem>
                  <SelectItem value="female">Women</SelectItem>
                  <SelectItem value="everyone">Everyone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Intent Filter */}
            <div className="space-y-2">
              <Label>Relationship Intent</Label>
              <Select value={intentFilter} onValueChange={setIntentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select intent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Intents</SelectItem>
                  <SelectItem value="serious">Serious Relationship</SelectItem>
                  <SelectItem value="casual">Casual Dating</SelectItem>
                  <SelectItem value="friends">Just Friends</SelectItem>
                  <SelectItem value="not_sure">Not Sure Yet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Premium Filter */}
            <div className="space-y-2">
              <Label>Subscription</Label>
              <Select value={premiumFilter} onValueChange={setPremiumFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subscription" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="premium">Premium Only</SelectItem>
                  <SelectItem value="free">Free Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Account Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Debugger Category Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-orange-500" />
                Debugger Category
              </Label>
              <Select value={debuggerFilter} onValueChange={setDebuggerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Filter</SelectItem>
                  <SelectItem value="no_photo">No Photo</SelectItem>
                  <SelectItem value="incomplete">Incomplete Profile</SelectItem>
                  <SelectItem value="never_seen">Never Seen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Include Archived Checkbox */}
          <div className="flex items-center space-x-2 p-3 border rounded-lg bg-blue-50">
            <Checkbox
              id="include-archived"
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(checked as boolean)}
            />
            <label
              htmlFor="include-archived"
              className="text-sm font-medium cursor-pointer"
            >
              Include archived users (for re-engagement emails)
            </label>
          </div>

          {/* Country Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Countries ({selectedCountries.size} selected)
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllCountries}
              >
                {selectedCountries.size === countries.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            
            {isLoadingCountries ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="h-40 border rounded-lg p-3">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {countries.map((country) => (
                    <div
                      key={country.code}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`country-${country.code}`}
                        checked={selectedCountries.has(country.code)}
                        onCheckedChange={() => toggleCountry(country.code)}
                      />
                      <label
                        htmlFor={`country-${country.code}`}
                        className="text-sm cursor-pointer flex items-center gap-1"
                      >
                        {country.name}
                        <Badge variant="secondary" className="text-xs h-5">
                          {country.userCount}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Fetch Button */}
          <Button
            onClick={fetchEmails}
            disabled={isLoadingEmails}
            className="w-full"
          >
            {isLoadingEmails ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Fetching Emails...
              </>
            ) : (
              <>
                <Users className="h-4 w-4 mr-2" />
                Fetch Emails
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results Section */}
      {emails.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Results
                <Badge variant="secondary">{emails.length} emails</Badge>
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={downloadAsCSV}
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download CSV
                </Button>
                <Button
                  onClick={copyToClipboard}
                  variant={copied ? "default" : "outline"}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy All
                    </>
                  )}
                </Button>
              </div>
            </div>
            <CardDescription>
              Comma-separated email addresses ready to copy or download
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={csvEmails}
              readOnly
              className="min-h-[200px] font-mono text-sm"
              placeholder="Emails will appear here..."
            />
          </CardContent>
        </Card>
      )}

      {emails.length === 0 && !isLoadingEmails && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Apply filters and click "Fetch Emails" to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

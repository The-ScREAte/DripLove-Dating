import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { getCountriesList } from '@/constants/locationData';
import { Heart, Users, Search, Check, X, Loader2, UserPlus, Filter, Undo2, Clock } from 'lucide-react';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  gender?: string | null;
  country?: string;
  country_code?: string | null;
  city?: string;
  last_login_at?: string | null;
  created_at?: string | null;
}

interface Props {
  users: UserProfile[];
  onLikesCreated: () => void;
}

type LastActiveRange = 'all' | 'today' | '3' | '7' | '14' | '30' | '90' | 'inactive30' | 'custom';

const DAY_MS = 24 * 60 * 60 * 1000;
// Rendering thousands of rows makes search typing lag; Select All still covers every match.
const MAX_VISIBLE_RECEIVERS = 500;

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Calendar-day shift (stays on local midnight across daylight-saving changes).
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

// "yyyy-MM-dd" from a date input, read as a local day (new Date(str) would read it as UTC).
const parseDateInput = (value: string): Date | null => {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

const toDateInputValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Users with no recorded login are treated as last active when they signed up,
// the same rule the dashboard's "Current Users" stat uses.
const lastActiveTime = (u: UserProfile): number | null => {
  const ts = u.last_login_at ?? u.created_at;
  return ts ? new Date(ts).getTime() : null;
};

const describeLastActive = (u: UserProfile): string => {
  const ts = lastActiveTime(u);
  if (ts === null) return 'No activity recorded';
  const days = Math.round((startOfLocalDay(new Date()).getTime() - startOfLocalDay(new Date(ts)).getTime()) / DAY_MS);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
  return u.last_login_at ? `Active ${when}` : `Joined ${when}`;
};

const SmartLikeGiving: React.FC<Props> = ({ users, onLikesCreated }) => {
  const [selectedGiver, setSelectedGiver] = useState<string | null>(null);
  const [selectedReceivers, setSelectedReceivers] = useState<Set<string>>(new Set());
  const [giverSearch, setGiverSearch] = useState('');
  const [receiverSearch, setReceiverSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [lastActiveRange, setLastActiveRange] = useState<LastActiveRange>('all');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [existingLikes, setExistingLikes] = useState<Set<string>>(new Set());
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [allReceivers, setAllReceivers] = useState<UserProfile[]>([]);
  const [loadingReceivers, setLoadingReceivers] = useState(false);
  const { toast } = useToast();

  const countries = useMemo(() => getCountriesList(), []);

  // Filter users based on search for givers - show up to 200 for better selection
  const filteredGivers = useMemo(() => {
    const search = giverSearch.toLowerCase().trim();
    if (!search) return users.slice(0, 200);
    return users.filter(u => 
      u.first_name?.toLowerCase().includes(search) ||
      u.last_name?.toLowerCase().includes(search) ||
      u.email?.toLowerCase().includes(search) ||
      u.id.toLowerCase().includes(search)
    ).slice(0, 200);
  }, [users, giverSearch]);

  // Filter receivers with country and search filters, excluding already liked
  const filteredReceivers = useMemo(() => {
    const search = receiverSearch.toLowerCase().trim();
    let filtered = allReceivers.filter(u => !existingLikes.has(u.id));
    
    if (countryFilter !== 'all') {
      // Match against country_code (preferred), country name, or the filter code itself
      const selectedCountry = countries.find(c => c.code === countryFilter);
      filtered = filtered.filter(u => {
        const userCountryCode = u.country_code?.toUpperCase() || '';
        const userCountry = u.country?.toUpperCase() || '';
        const filterCode = countryFilter.toUpperCase();
        const countryName = selectedCountry?.name?.toUpperCase() || '';
        
        return userCountryCode === filterCode || 
               userCountry === filterCode ||
               userCountry === countryName;
      });
    }

    if (genderFilter !== 'all') {
      filtered = filtered.filter(u => u.gender === genderFilter);
    }

    if (lastActiveRange !== 'all') {
      const today = startOfLocalDay(new Date());
      let from: number | null = null;
      let to: number | null = null;

      if (lastActiveRange === 'today') {
        from = today.getTime();
      } else if (lastActiveRange === 'inactive30') {
        to = addDays(today, -30).getTime();
      } else if (lastActiveRange === 'custom') {
        const fromDate = parseDateInput(activeFrom);
        const toDate = parseDateInput(activeTo);
        from = fromDate ? fromDate.getTime() : null;
        // Through the end of the "to" day
        to = toDate ? addDays(toDate, 1).getTime() : null;
      } else {
        // "Last N days" includes today
        from = addDays(today, -(Number(lastActiveRange) - 1)).getTime();
      }

      if (from !== null || to !== null) {
        filtered = filtered.filter(u => {
          const ts = lastActiveTime(u);
          if (ts === null) return lastActiveRange === 'inactive30';
          return (from === null || ts >= from) && (to === null || ts < to);
        });
      }
    }

    if (search) {
      filtered = filtered.filter(u => 
        u.first_name?.toLowerCase().includes(search) ||
        u.last_name?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search) ||
        u.id.toLowerCase().includes(search) ||
        u.city?.toLowerCase().includes(search)
      );
    }
    
    return filtered;
  }, [allReceivers, receiverSearch, countryFilter, genderFilter, lastActiveRange, activeFrom, activeTo, existingLikes, countries]);

  // Load existing likes when giver is selected
  const loadExistingLikes = async (giverId: string) => {
    setLoadingLikes(true);
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', giverId);

      if (error) throw error;

      const likedIds = new Set((data || []).map(l => l.liked_id));
      setExistingLikes(likedIds);
    } catch (err) {
      console.error('Error loading existing likes:', err);
      toast({
        title: 'Error',
        description: 'Failed to load existing likes',
        variant: 'destructive'
      });
    } finally {
      setLoadingLikes(false);
    }
  };

  // Load all potential receivers from database, in pages - a single query is
  // capped at 1000 rows, which silently dropped everyone but the newest 1000.
  const loadReceivers = async (giverId: string) => {
    setLoadingReceivers(true);
    try {
      const PAGE_SIZE = 1000;
      const receivers: UserProfile[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, gender, country, country_code, city, last_login_at, created_at')
          .eq('is_admin', false)
          .neq('id', giverId)
          .order('created_at', { ascending: false }) // Newest first to see more recent users
          .order('id', { ascending: true }) // Stable paging when created_at ties
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        receivers.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }

      setAllReceivers(receivers);
    } catch (err) {
      console.error('Error loading receivers:', err);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive'
      });
    } finally {
      setLoadingReceivers(false);
    }
  };

  const handleSelectGiver = async (userId: string) => {
    setSelectedGiver(userId);
    setSelectedReceivers(new Set());
    setCountryFilter('all');
    setGenderFilter('all');
    setLastActiveRange('all');
    setActiveFrom('');
    setActiveTo('');
    setReceiverSearch('');
    await Promise.all([
      loadExistingLikes(userId),
      loadReceivers(userId)
    ]);
  };

  const handleToggleReceiver = (userId: string) => {
    setSelectedReceivers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = new Set(filteredReceivers.map(u => u.id));
    setSelectedReceivers(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedReceivers(new Set());
  };

  const handleCreateLikes = async () => {
    if (!selectedGiver || selectedReceivers.size === 0) return;

    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;

    // No push calls from here: the likes trigger announces every new like to
    // its receiver, and send-push-notification ignores app-sent like pushes.
    try {
      // Create likes in batches to avoid overwhelming the DB
      const receiverIds = Array.from(selectedReceivers);
      const batchSize = 50;
      
      for (let i = 0; i < receiverIds.length; i += batchSize) {
        const batch = receiverIds.slice(i, i + batchSize);
        
        const likesToInsert = batch.map(receiverId => ({
          liker_id: selectedGiver,
          liked_id: receiverId
        }));

        const { error } = await supabase
          .from('likes')
          .insert(likesToInsert);

        if (error) {
          console.error('Batch insert error:', error);
          errorCount += batch.length;
        } else {
          successCount += batch.length;
          // Only batches that actually inserted count as liked
          setExistingLikes(prev => {
            const next = new Set(prev);
            batch.forEach(id => next.add(id));
            return next;
          });
        }
      }

      // Clear selection
      setSelectedReceivers(new Set());

      toast({
        title: 'Likes Created',
        description: `Created ${successCount} likes${errorCount > 0 ? `, ${errorCount} failed` : ''}. Each receiver is notified automatically.`
      });

      onLikesCreated();

    } catch (err) {
      console.error('Error creating likes:', err);
      toast({
        title: 'Error',
        description: 'Failed to create likes',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reverts (deletes) every like this giver has given - used to undo likes
  // that were seeded from a demo/test account (e.g. "Ashley") once real
  // production data no longer needs them.
  const handleRevertAllLikes = async () => {
    if (!selectedGiver || existingLikes.size === 0) return;

    setIsReverting(true);
    try {
      const { error, count } = await supabase
        .from('likes')
        .delete({ count: 'exact' })
        .eq('liker_id', selectedGiver);

      if (error) throw error;

      setExistingLikes(new Set());
      setSelectedReceivers(new Set());

      toast({
        title: 'Likes Reverted',
        description: `Removed ${count ?? 'all'} likes given by ${giverUser?.first_name || 'this user'}.`
      });

      onLikesCreated();
    } catch (err) {
      console.error('Error reverting likes:', err);
      toast({
        title: 'Error',
        description: 'Failed to revert likes',
        variant: 'destructive'
      });
    } finally {
      setIsReverting(false);
    }
  };

  const giverUser = users.find(u => u.id === selectedGiver);

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-600 mb-2">
        Select one giver and multiple receivers. The giver will "like" all selected receivers.
      </div>

      {/* Step 1: Select Giver */}
      <div className="space-y-2">
        <label className="text-xs font-semibold flex items-center gap-1">
          <UserPlus className="w-3 h-3" />
          Step 1: Select Like Giver
        </label>
        
        {selectedGiver ? (
          <div className="flex items-center justify-between p-2 bg-pink-50 rounded-lg border border-pink-200">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-500" />
              <span className="text-sm font-medium">
                {giverUser?.first_name} {giverUser?.last_name}
              </span>
              <span className="text-xs text-gray-500">
                ({giverUser?.email})
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => {
                setSelectedGiver(null);
                setSelectedReceivers(new Set());
                setExistingLikes(new Set());
              }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <Input
                placeholder="Search by name, email, or ID..."
                value={giverSearch}
                onChange={(e) => setGiverSearch(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
            <ScrollArea className="h-40 border rounded-lg">
              <div className="p-1 space-y-1">
                {filteredGivers.map(user => (
                  <div
                    key={user.id}
                    onClick={() => handleSelectGiver(user.id)}
                    className="p-2 hover:bg-gray-100 rounded cursor-pointer text-xs"
                  >
                    <div className="font-medium">{user.first_name} {user.last_name}</div>
                    <div className="text-gray-500">{user.email}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Step 2: Select Receivers */}
      {selectedGiver && (
        <div className="space-y-2">
          <label className="text-xs font-semibold flex items-center gap-1">
            <Users className="w-3 h-3" />
            Step 2: Select Receivers ({selectedReceivers.size} selected)
          </label>

          {(loadingLikes || loadingReceivers) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-xs text-gray-500">Loading users...</span>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <Input
                    placeholder="Search by name, email, city..."
                    value={receiverSearch}
                    onChange={(e) => setReceiverSearch(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Filter className="w-3 h-3 text-gray-500" />
                  
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={countryFilter} onValueChange={setCountryFilter}>
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue placeholder="Country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Countries</SelectItem>
                      {countries.map(country => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={lastActiveRange}
                    onValueChange={(v) => {
                      setLastActiveRange(v as LastActiveRange);
                      if (v === 'custom' && !activeFrom && !activeTo) {
                        const today = new Date();
                        setActiveFrom(toDateInputValue(addDays(today, -6)));
                        setActiveTo(toDateInputValue(today));
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                      <Clock className="w-3 h-3 mr-1 text-gray-500 shrink-0" />
                      <SelectValue placeholder="Last active" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Last active: any time</SelectItem>
                      <SelectItem value="today">Active today</SelectItem>
                      <SelectItem value="3">Last 3 days</SelectItem>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                      <SelectItem value="inactive30">Inactive 30+ days</SelectItem>
                      <SelectItem value="custom">Custom date range…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={handleSelectAll}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={handleDeselectAll}
                >
                  Clear
                </Button>
              </div>

              {lastActiveRange === 'custom' && (
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
                  <span>Last active from</span>
                  <Input
                    type="date"
                    value={activeFrom}
                    max={activeTo || toDateInputValue(new Date())}
                    onChange={(e) => setActiveFrom(e.target.value)}
                    className="h-8 w-[150px] text-xs"
                  />
                  <span>to</span>
                  <Input
                    type="date"
                    value={activeTo}
                    min={activeFrom || undefined}
                    max={toDateInputValue(new Date())}
                    onChange={(e) => setActiveTo(e.target.value)}
                    className="h-8 w-[150px] text-xs"
                  />
                  <span className="text-gray-400">(either date can be left empty)</span>
                </div>
              )}

              <ScrollArea className="h-[400px] border rounded-lg">
                <div className="p-1 space-y-1">
                  {filteredReceivers.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-500">
                      No users found matching your criteria
                    </div>
                  ) : (
                    filteredReceivers.slice(0, MAX_VISIBLE_RECEIVERS).map(user => {
                      const isSelected = selectedReceivers.has(user.id);

                      return (
                        <div
                          key={user.id}
                          onClick={() => handleToggleReceiver(user.id)}
                          className={`p-2 rounded flex items-center gap-2 text-xs cursor-pointer ${
                            isSelected 
                              ? 'bg-green-50 border border-green-200' 
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            className="pointer-events-none"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {user.first_name} {user.last_name}
                            </div>
                            <div className="text-gray-500 truncate">{user.email}</div>
                            <div className="text-[10px] text-gray-400 truncate">{describeLastActive(user)}</div>
                          </div>
                          {user.gender && (
                            <Badge variant="secondary" className="text-[10px]">
                              {user.gender}
                            </Badge>
                          )}
                          {user.country && (
                            <Badge variant="outline" className="text-[10px]">
                              {user.country}
                            </Badge>
                          )}
                          {user.city && (
                            <span className="text-[10px] text-gray-400">{user.city}</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>

              <div className="text-xs text-gray-500 flex items-center justify-between">
                <span>
                  {filteredReceivers.length} of {allReceivers.length} users match
                  {filteredReceivers.length > MAX_VISIBLE_RECEIVERS &&
                    ` (listing first ${MAX_VISIBLE_RECEIVERS}; Select All picks all ${filteredReceivers.length})`}
                </span>
                <span className="text-pink-600">{existingLikes.size} already liked by this user</span>
              </div>

              {existingLikes.size > 0 && (
                <Button
                  onClick={handleRevertAllLikes}
                  disabled={isReverting}
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                >
                  {isReverting ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Reverting...
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-3 h-3 mr-2" />
                      Revert All {existingLikes.size} Likes Given by {giverUser?.first_name || 'This User'}
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 3: Create Likes */}
      {selectedGiver && selectedReceivers.size > 0 && (
        <Button
          onClick={handleCreateLikes}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating Likes...
            </>
          ) : (
            <>
              <Heart className="w-4 h-4 mr-2" />
              Create {selectedReceivers.size} Likes from {giverUser?.first_name}
            </>
          )}
        </Button>
      )}
    </div>
  );
};

export default SmartLikeGiving;

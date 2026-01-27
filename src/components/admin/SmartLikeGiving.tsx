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
import { Heart, Users, Search, Check, X, Loader2, UserPlus, Filter } from 'lucide-react';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  gender?: string | null;
  country?: string;
  country_code?: string | null;
  city?: string;
}

interface Props {
  users: UserProfile[];
  onLikesCreated: () => void;
}

const SmartLikeGiving: React.FC<Props> = ({ users, onLikesCreated }) => {
  const [selectedGiver, setSelectedGiver] = useState<string | null>(null);
  const [selectedReceivers, setSelectedReceivers] = useState<Set<string>>(new Set());
  const [giverSearch, setGiverSearch] = useState('');
  const [receiverSearch, setReceiverSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
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
  }, [allReceivers, receiverSearch, countryFilter, genderFilter, existingLikes, countries]);

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

  // Load all potential receivers from database
  const loadReceivers = async (giverId: string) => {
    setLoadingReceivers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, gender, country, country_code, city')
        .eq('is_admin', false)
        .neq('id', giverId)
        .order('created_at', { ascending: false }); // Order by newest first to see more recent users

      if (error) throw error;

      setAllReceivers(data || []);
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
    let notificationsSent = 0;

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
          
          // Send notifications to each receiver in this batch
          for (const receiverId of batch) {
            try {
              await supabase.functions.invoke('send-push-notification', {
                body: {
                  title: 'Someone is interested in you! 💕',
                  body: 'People are showing interest in you. Check who liked you!',
                  userId: receiverId,
                  type: 'like',
                  save_to_db: true
                }
              });
              notificationsSent++;
            } catch (notifErr) {
              console.error('Failed to send notification to:', receiverId, notifErr);
              // Non-fatal: continue with other notifications
            }
          }
        }
      }

      // Update existing likes set
      setExistingLikes(prev => {
        const next = new Set(prev);
        selectedReceivers.forEach(id => next.add(id));
        return next;
      });

      // Clear selection
      setSelectedReceivers(new Set());

      toast({
        title: 'Likes Created',
        description: `Created ${successCount} likes, sent ${notificationsSent} notifications${errorCount > 0 ? `, ${errorCount} failed` : ''}`
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

              <ScrollArea className="h-[400px] border rounded-lg">
                <div className="p-1 space-y-1">
                  {filteredReceivers.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-500">
                      No users found matching your criteria
                    </div>
                  ) : (
                    filteredReceivers.map(user => {
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
                <span>Showing {filteredReceivers.length} of {allReceivers.length} users</span>
                <span className="text-pink-600">{existingLikes.size} already liked by this user</span>
              </div>
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

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  RefreshCw, Users, MapPin, Heart, X, Clock, 
  Database, Server, Wifi, AlertCircle, CheckCircle,
  Bell, Mail, CreditCard, Archive, ImageOff, Eye, EyeOff,
  Ban, Pause, Trash2, Play, Loader2
} from 'lucide-react';

interface UserPoolStats {
  totalUsers: number;
  activeUsers: number;
  archivedUsers: number;
  usersInAgeRange: number;
  usersInDistance: number;
  usersWithPreferenceMatch: number;
  likedUsers: number;
  blockedUsers: number;
  recentPasses: number;
  finalEligibleUsers: number;
}

interface SystemStats {
  pushTokens: number;
  activeSubscriptions: number;
  scheduledBroadcasts: number;
  pendingPayouts: number;
  recentMatches: number;
  recentLikes: number;
}

interface ProfileHealthIssue {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  issues: string[];
  lastLoginAt?: string | null;
}

interface HealthStats {
  usersWithNoImages: ProfileHealthIssue[];
  usersWithBrokenImages: ProfileHealthIssue[];
  usersNeverSeen: ProfileHealthIssue[];
  usersWithIncompleteProfiles: ProfileHealthIssue[];
}

interface Props {
  currentUserId: string;
  userPreferences?: {
    min_age?: number;
    max_age?: number;
    max_distance?: number;
    preference?: string;
    latitude?: number;
    longitude?: number;
  };
  onViewProfile?: (userId: string) => void;
}

const UserPoolDebugger: React.FC<Props> = ({ currentUserId, userPreferences, onViewProfile }) => {
  const [stats, setStats] = useState<UserPoolStats | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [healthStats, setHealthStats] = useState<HealthStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'userPool' | 'system' | 'health'>('userPool');
  const [lastLoginFilter, setLastLoginFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

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

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getGenderFilter = (userPreference: string) => {
    if (userPreference === 'male') {
      return ['male'];
    } else if (userPreference === 'female') {
      return ['female'];
    } else if (userPreference === 'everyone' || userPreference === 'both') {
      return ['male', 'female', 'other'];
    }
    return ['male', 'female', 'other'];
  };

  // Batch fetch all rows from a table to bypass 1000 row limit
  const fetchAllRows = async <T extends Record<string, unknown>>(
    tableName: 'profiles' | 'likes' | 'blocks' | 'passes' | 'user_images',
    selectFields: string,
    filters?: { column: string; op: string; value: string | boolean | number }[]
  ): Promise<T[]> => {
    const batchSize = 1000;
    let allRows: T[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const baseQuery = supabase.from(tableName).select(selectFields);
      let query = baseQuery.range(offset, offset + batchSize - 1);

      if (filters) {
        for (const filter of filters) {
          if (filter.column && filter.op === 'neq') {
            query = (query as any).neq(filter.column, filter.value);
          } else if (filter.column && filter.op === 'eq') {
            query = (query as any).eq(filter.column, filter.value);
          } else if (filter.column && filter.op === 'gte') {
            query = (query as any).gte(filter.column, filter.value);
          } else if (filter.op === 'or') {
            query = (query as any).or(filter.value);
          }
        }
      }

      const { data, error } = await query;
      
      if (error) {
        console.error(`Error fetching batch from ${tableName}:`, error);
        break;
      }

      if (data && data.length > 0) {
        allRows = [...allRows, ...(data as unknown as T[])];
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    return allRows;
  };

  const formatLastLogin = (lastLoginAt: string | null | undefined): string => {
    if (!lastLoginAt) return 'Never';
    
    const loginDate = new Date(lastLoginAt);
    const now = new Date();
    const diffMs = now.getTime() - loginDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1d ago';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  const getLastLoginFilterDate = (filter: string): Date | null => {
    if (filter === 'all') return null;
    const days = parseInt(filter);
    if (isNaN(days)) return null;
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  };

  const analyzeUserPool = async () => {
    if (!currentUserId) return;
    
    setIsLoading(true);
    try {
      const [
        { count: totalUsersCount },
        { count: activeUsersCount },
        { count: archivedUsersCount },
        likedUsers,
        blockedUsers,
        recentPasses
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .neq('id', currentUserId)
          .eq('is_admin', false),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .neq('id', currentUserId)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .eq('is_archived', false),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .neq('id', currentUserId)
          .eq('is_archived', true)
          .eq('is_admin', false),
        fetchAllRows<{ liked_id: string }>('likes', 'liked_id', [
          { column: 'liker_id', op: 'eq', value: currentUserId }
        ]),
        fetchAllRows<{ blocked_id: string; blocker_id: string }>('blocks', 'blocked_id, blocker_id', [
          { column: '', op: 'or', value: `blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}` }
        ]),
        supabase
          .from('passes')
          .select('passed_id')
          .eq('passer_id', currentUserId)
          .gte('passed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      const preferences = userPreferences || {};
      const minAge = preferences.min_age || 18;
      const maxAge = preferences.max_age || 99;

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const recentPassIds = recentPasses.data?.map(pass => pass.passed_id) || [];

      const allProfiles = await fetchAllRows<{
        id: string;
        gender: string;
        date_of_birth: string;
        latitude: number;
        longitude: number;
        account_status: string;
        is_admin: boolean;
        is_archived: boolean;
      }>('profiles', 'id, gender, date_of_birth, latitude, longitude, account_status, is_admin, is_archived', [
        { column: 'id', op: 'neq', value: currentUserId },
        { column: 'is_admin', op: 'eq', value: false }
      ]);

      const allowedGenders = getGenderFilter(preferences.preference || 'everyone');
      const activeUsers = allProfiles.filter(user => 
        user.account_status === 'active' && !user.is_admin && !user.is_archived
      );
      const genderFilteredUsers = activeUsers.filter(user =>
        allowedGenders.includes(user.gender)
      );
      const ageFilteredUsers = genderFilteredUsers.filter(user => {
        if (!user.date_of_birth) return false;
        const age = calculateAge(user.date_of_birth);
        return age >= minAge && age <= maxAge;
      });

      let distanceFilteredUsers = ageFilteredUsers;
      const maxDistance = preferences.max_distance || 50;
      if (preferences.latitude && preferences.longitude) {
        distanceFilteredUsers = ageFilteredUsers.filter(user => {
          if (!user.latitude || !user.longitude) return true;
          const distance = calculateDistance(
            preferences.latitude!,
            preferences.longitude!,
            user.latitude,
            user.longitude
          );
          return distance <= maxDistance;
        });
      }

      const finalUsers = distanceFilteredUsers.filter(user =>
        !likedUserIds.includes(user.id) &&
        !blockedUserIds.includes(user.id) &&
        !recentPassIds.includes(user.id)
      );

      const stats: UserPoolStats = {
        totalUsers: totalUsersCount || allProfiles.length,
        activeUsers: activeUsersCount || activeUsers.length,
        archivedUsers: archivedUsersCount || 0,
        usersWithPreferenceMatch: genderFilteredUsers.length,
        usersInAgeRange: ageFilteredUsers.length,
        usersInDistance: distanceFilteredUsers.length,
        likedUsers: likedUserIds.length,
        blockedUsers: blockedUserIds.length,
        recentPasses: recentPassIds.length,
        finalEligibleUsers: finalUsers.length
      };

      setStats(stats);
      toast({
        title: "Analysis Complete",
        description: `Found ${stats.finalEligibleUsers} eligible users out of ${stats.totalUsers} total users.`,
      });

    } catch (error) {
      console.error('Error analyzing user pool:', error);
      toast({
        title: "Error",
        description: "Failed to analyze user pool",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeSystem = async () => {
    setIsLoading(true);
    try {
      const [
        { count: pushTokenCount },
        { count: activeSubCount },
        { count: scheduledBroadcastCount },
        { count: pendingPayoutCount },
        { count: recentMatchCount },
        { count: recentLikeCount }
      ] = await Promise.all([
        supabase.from('push_tokens').select('*', { count: 'exact', head: true }),
        supabase.from('user_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('scheduled_broadcasts').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('matches').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('likes').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      setSystemStats({
        pushTokens: pushTokenCount || 0,
        activeSubscriptions: activeSubCount || 0,
        scheduledBroadcasts: scheduledBroadcastCount || 0,
        pendingPayouts: pendingPayoutCount || 0,
        recentMatches: recentMatchCount || 0,
        recentLikes: recentLikeCount || 0
      });

      toast({
        title: "System Analysis Complete",
        description: "All system stats fetched successfully.",
      });

    } catch (error) {
      console.error('Error analyzing system:', error);
      toast({
        title: "Error",
        description: "Failed to analyze system",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeProfileHealth = async () => {
    setIsLoading(true);
    try {
      const profiles = await fetchAllRows<{
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        gender: string;
        preference: string;
        date_of_birth: string;
        country: string;
        city: string;
        bio: string;
        is_admin: boolean;
        account_status: string;
        last_login_at: string | null;
      }>('profiles', 'id, first_name, last_name, email, gender, preference, date_of_birth, country, city, bio, is_admin, account_status, last_login_at', [
        { column: 'account_status', op: 'eq', value: 'active' },
        { column: 'is_admin', op: 'eq', value: false }
      ]);

      const allImages = await fetchAllRows<{
        user_id: string;
        image_url: string;
        is_approved: boolean;
      }>('user_images', 'user_id, image_url, is_approved');

      const allLikes = await fetchAllRows<{ liked_id: string }>('likes', 'liked_id');
      const allPasses = await fetchAllRows<{ passed_id: string }>('passes', 'passed_id');

      const usersWithImages = new Set<string>();
      (allImages || []).forEach(img => {
        if (img.user_id) usersWithImages.add(img.user_id);
      });

      const seenUsers = new Set<string>();
      (allLikes || []).forEach(like => {
        if (like.liked_id) seenUsers.add(like.liked_id);
      });
      (allPasses || []).forEach(pass => {
        if (pass.passed_id) seenUsers.add(pass.passed_id);
      });

      const usersWithNoImages: ProfileHealthIssue[] = [];
      const usersNeverSeen: ProfileHealthIssue[] = [];
      const usersWithIncompleteProfiles: ProfileHealthIssue[] = [];

      (profiles || []).forEach(profile => {
        const hasImages = usersWithImages.has(profile.id);
        const hasBeenSeen = seenUsers.has(profile.id);

        if (!hasImages) {
          usersWithNoImages.push({
            userId: profile.id,
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            issues: ['No profile images'],
            lastLoginAt: profile.last_login_at
          });
        }

        if (!hasBeenSeen) {
          usersNeverSeen.push({
            userId: profile.id,
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            issues: ['Never been seen by other users'],
            lastLoginAt: profile.last_login_at
          });
        }

        if (!profile.gender || !profile.preference || !profile.bio || !profile.city) {
          const missing: string[] = [];
          if (!profile.gender) missing.push('gender');
          if (!profile.preference) missing.push('preference');
          if (!profile.bio) missing.push('bio');
          if (!profile.city) missing.push('city');
          
          usersWithIncompleteProfiles.push({
            userId: profile.id,
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            issues: [`Missing: ${missing.join(', ')}`],
            lastLoginAt: profile.last_login_at
          });
        }
      });

      setHealthStats({
        usersWithNoImages,
        usersWithBrokenImages: [],
        usersNeverSeen,
        usersWithIncompleteProfiles
      });

      toast({
        title: "Health Check Complete",
        description: `Found ${usersWithNoImages.length} users without images, ${usersNeverSeen.length} unseen profiles.`,
      });

    } catch (error) {
      console.error('Error analyzing profile health:', error);
      toast({
        title: "Error",
        description: "Failed to analyze profile health",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter users by last login
  const filterUsersByLastLogin = (users: ProfileHealthIssue[]): ProfileHealthIssue[] => {
    const filterDate = getLastLoginFilterDate(lastLoginFilter);
    if (!filterDate) return users;
    
    return users.filter(user => {
      if (!user.lastLoginAt) return true; // Include users who never logged in
      const loginDate = new Date(user.lastLoginAt);
      return loginDate < filterDate;
    });
  };

  // Admin actions
  const handleBlockUser = async (userId: string, userName: string) => {
    if (!confirm(`Block ${userName}? They won't be able to use the app.`)) return;
    
    setActionLoading(prev => ({ ...prev, [`block-${userId}`]: true }));
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'blocked' })
        .eq('id', userId);

      if (error) throw error;
      
      toast({ title: 'User Blocked', description: `${userName} has been blocked.` });
      analyzeProfileHealth();
    } catch (error) {
      console.error('Error blocking user:', error);
      toast({ title: 'Error', description: 'Failed to block user', variant: 'destructive' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`block-${userId}`]: false }));
    }
  };

  const handleHoldUser = async (userId: string, userName: string) => {
    if (!confirm(`Put ${userName} on hold? Their account will be temporarily suspended.`)) return;
    
    setActionLoading(prev => ({ ...prev, [`hold-${userId}`]: true }));
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'on_hold' })
        .eq('id', userId);

      if (error) throw error;
      
      toast({ title: 'User On Hold', description: `${userName} has been put on hold.` });
      analyzeProfileHealth();
    } catch (error) {
      console.error('Error putting user on hold:', error);
      toast({ title: 'Error', description: 'Failed to put user on hold', variant: 'destructive' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`hold-${userId}`]: false }));
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`DELETE ${userName}? This action is PERMANENT and cannot be undone!`)) return;
    if (!confirm(`Are you ABSOLUTELY sure you want to permanently delete ${userName}?`)) return;
    
    setActionLoading(prev => ({ ...prev, [`delete-${userId}`]: true }));
    try {
      const { error } = await supabase.rpc('delete_user_and_data', { user_id_to_delete: userId });

      if (error) throw error;
      
      toast({ title: 'User Deleted', description: `${userName} has been permanently deleted.` });
      analyzeProfileHealth();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`delete-${userId}`]: false }));
    }
  };

  const renderUserRow = (user: ProfileHealthIssue, bgColor: string) => {
    const isBlocking = actionLoading[`block-${user.userId}`];
    const isHolding = actionLoading[`hold-${user.userId}`];
    const isDeleting = actionLoading[`delete-${user.userId}`];
    const userName = `${user.firstName} ${user.lastName}`;
    
    return (
      <div key={user.userId} className={`flex items-center justify-between text-xs p-1.5 ${bgColor} rounded gap-1`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="truncate font-medium">{userName}</span>
          <Badge variant="outline" className="text-[9px] h-4 shrink-0 bg-white">
            {formatLastLogin(user.lastLoginAt)}
          </Badge>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onViewProfile && (
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onViewProfile(user.userId)} title="View Profile">
              <Eye className="w-3 h-3" />
            </Button>
          )}
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-5 w-5 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50" 
            onClick={() => handleHoldUser(user.userId, userName)}
            disabled={isHolding}
            title="Put on Hold"
          >
            {isHolding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" 
            onClick={() => handleBlockUser(user.userId, userName)}
            disabled={isBlocking}
            title="Block User"
          >
            {isBlocking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-5 w-5 p-0 text-red-700 hover:text-red-800 hover:bg-red-100" 
            onClick={() => handleDeleteUser(user.userId, userName)}
            disabled={isDeleting}
            title="Delete User"
          >
            {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="w-4 h-4" />
          System Debugger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tab buttons */}
        <div className="flex gap-2">
          <Button 
            variant={activeTab === 'userPool' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('userPool')}
            className="flex-1 text-xs"
          >
            <Users className="w-3 h-3 mr-1" />
            User Pool
          </Button>
          <Button 
            variant={activeTab === 'system' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('system')}
            className="flex-1 text-xs"
          >
            <Server className="w-3 h-3 mr-1" />
            System
          </Button>
          <Button 
            variant={activeTab === 'health' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('health')}
            className="flex-1 text-xs"
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            Health
          </Button>
        </div>

        {activeTab === 'userPool' && (
          <>
            <Button 
              onClick={analyzeUserPool} 
              disabled={isLoading}
              className="w-full"
              size="sm"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Analyze User Pool
                </>
              )}
            </Button>

            {stats && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>Total Users:</span>
                    <Badge variant="secondary" className="text-xs">{stats.totalUsers}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>Active:</span>
                    <Badge variant="secondary" className="text-xs">{stats.activeUsers}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-orange-50 rounded">
                    <span className="flex items-center gap-1">
                      <Archive className="w-3 h-3" />
                      Archived:
                    </span>
                    <Badge variant="outline" className="text-xs">{stats.archivedUsers}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>Gender Match:</span>
                    <Badge variant="secondary" className="text-xs">{stats.usersWithPreferenceMatch}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>Age Range:</span>
                    <Badge variant="secondary" className="text-xs">{stats.usersInAgeRange}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-gray-50 rounded">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Distance:
                    </span>
                    <Badge variant="secondary" className="text-xs">{stats.usersInDistance}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-red-50 rounded">
                    <span className="flex items-center gap-1 text-red-600">
                      <Heart className="w-3 h-3" />
                      Liked:
                    </span>
                    <Badge variant="destructive" className="text-xs">{stats.likedUsers}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-red-50 rounded">
                    <span className="flex items-center gap-1 text-red-600">
                      <X className="w-3 h-3" />
                      Blocked:
                    </span>
                    <Badge variant="destructive" className="text-xs">{stats.blockedUsers}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-yellow-50 rounded col-span-2">
                    <span className="flex items-center gap-1 text-yellow-600">
                      <Clock className="w-3 h-3" />
                      Recent Passes (24h):
                    </span>
                    <Badge variant="secondary" className="text-xs">{stats.recentPasses}</Badge>
                  </div>
                </div>
                
                <div className="border-t pt-2">
                  <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span className="font-semibold text-sm flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      Eligible Users:
                    </span>
                    <Badge 
                      variant={stats.finalEligibleUsers > 10 ? "default" : "destructive"}
                      className="text-sm px-2"
                    >
                      {stats.finalEligibleUsers}
                    </Badge>
                  </div>
                </div>

                {stats.finalEligibleUsers < 10 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs">
                    <p className="font-medium text-yellow-800 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Low User Pool
                    </p>
                    <p className="text-yellow-700 mt-1">
                      Consider adjusting preferences or the app needs more users.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'system' && (
          <>
            <Button 
              onClick={analyzeSystem} 
              disabled={isLoading}
              className="w-full"
              size="sm"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Server className="w-3 h-3 mr-1" />
                  Analyze System
                </>
              )}
            </Button>

            {systemStats && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between p-2 bg-blue-50 rounded">
                    <span className="flex items-center gap-1">
                      <Bell className="w-3 h-3" />
                      Push Tokens:
                    </span>
                    <Badge className="bg-blue-100 text-blue-700 text-xs">{systemStats.pushTokens}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-green-50 rounded">
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      Active Subs:
                    </span>
                    <Badge className="bg-green-100 text-green-700 text-xs">{systemStats.activeSubscriptions}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-purple-50 rounded">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      Scheduled:
                    </span>
                    <Badge className="bg-purple-100 text-purple-700 text-xs">{systemStats.scheduledBroadcasts}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-orange-50 rounded">
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Pending Payouts:
                    </span>
                    <Badge className="bg-orange-100 text-orange-700 text-xs">{systemStats.pendingPayouts}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-pink-50 rounded">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      Matches (7d):
                    </span>
                    <Badge className="bg-pink-100 text-pink-700 text-xs">{systemStats.recentMatches}</Badge>
                  </div>
                  
                  <div className="flex justify-between p-2 bg-red-50 rounded">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      Likes (24h):
                    </span>
                    <Badge className="bg-red-100 text-red-700 text-xs">{systemStats.recentLikes}</Badge>
                  </div>
                </div>

                {systemStats.pendingPayouts > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded p-2 text-xs">
                    <p className="font-medium text-orange-800 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {systemStats.pendingPayouts} Pending Payout(s)
                    </p>
                    <p className="text-orange-700 mt-1">
                      Review payouts in the Influencer Management section.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'health' && (
          <>
            <div className="flex gap-2 items-end">
              <Button 
                onClick={analyzeProfileHealth} 
                disabled={isLoading}
                className="flex-1"
                size="sm"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Check Health
                  </>
                )}
              </Button>
            </div>

            {/* Last Login Filter */}
            <div className="space-y-1">
              <Label className="text-[10px]">Filter by Last Login</Label>
              <Select value={lastLoginFilter} onValueChange={setLastLoginFilter}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="7">Last login 7+ days ago</SelectItem>
                  <SelectItem value="14">Last login 14+ days ago</SelectItem>
                  <SelectItem value="30">Last login 30+ days ago</SelectItem>
                  <SelectItem value="45">Last login 45+ days ago</SelectItem>
                  <SelectItem value="60">Last login 60+ days ago</SelectItem>
                  <SelectItem value="80">Last login 80+ days ago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {healthStats && (
              <div className="space-y-3">
                {/* No Images */}
                <div className="border rounded p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageOff className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-sm">
                      No Images ({filterUsersByLastLogin(healthStats.usersWithNoImages).length})
                    </span>
                  </div>
                  {filterUsersByLastLogin(healthStats.usersWithNoImages).length > 0 ? (
                    <ScrollArea className="h-40">
                      <div className="space-y-1">
                        {filterUsersByLastLogin(healthStats.usersWithNoImages).slice(0, 50).map(user => 
                          renderUserRow(user, 'bg-red-50')
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-xs text-gray-500">All users have images</p>
                  )}
                </div>

                {/* Never Seen */}
                <div className="border rounded p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <EyeOff className="w-4 h-4 text-orange-500" />
                    <span className="font-medium text-sm">
                      Never Seen ({filterUsersByLastLogin(healthStats.usersNeverSeen).length})
                    </span>
                  </div>
                  {filterUsersByLastLogin(healthStats.usersNeverSeen).length > 0 ? (
                    <ScrollArea className="h-40">
                      <div className="space-y-1">
                        {filterUsersByLastLogin(healthStats.usersNeverSeen).slice(0, 50).map(user => 
                          renderUserRow(user, 'bg-orange-50')
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-xs text-gray-500">All users have been seen</p>
                  )}
                </div>

                {/* Incomplete Profiles */}
                <div className="border rounded p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="font-medium text-sm">
                      Incomplete ({filterUsersByLastLogin(healthStats.usersWithIncompleteProfiles).length})
                    </span>
                  </div>
                  {filterUsersByLastLogin(healthStats.usersWithIncompleteProfiles).length > 0 ? (
                    <ScrollArea className="h-40">
                      <div className="space-y-1">
                        {filterUsersByLastLogin(healthStats.usersWithIncompleteProfiles).slice(0, 50).map(user => 
                          renderUserRow(user, 'bg-yellow-50')
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-xs text-gray-500">All profiles complete</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default UserPoolDebugger;

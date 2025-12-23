import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  RefreshCw, Users, MapPin, Heart, X, Clock, 
  Database, Server, Wifi, AlertCircle, CheckCircle,
  Bell, Mail, CreditCard, Archive, ImageOff, Eye, EyeOff
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

  const analyzeUserPool = async () => {
    if (!currentUserId) return;
    
    setIsLoading(true);
    try {
      const [
        { data: allUsers },
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses }
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, gender, date_of_birth, latitude, longitude, account_status, is_admin, is_archived')
          .neq('id', currentUserId),
        supabase
          .from('likes')
          .select('liked_id')
          .eq('liker_id', currentUserId),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`),
        supabase
          .from('passes')
          .select('passed_id')
          .eq('passer_id', currentUserId)
          .gte('passed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      if (!allUsers) {
        throw new Error('Failed to fetch user data');
      }

      const preferences = userPreferences || {};
      const minAge = preferences.min_age || 18;
      const maxAge = preferences.max_age || 99;
      const maxDistance = preferences.max_distance || 50;
      const allowedGenders = getGenderFilter(preferences.preference || 'everyone');

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const recentPassIds = recentPasses?.map(pass => pass.passed_id) || [];

      // Count archived users
      const archivedUsers = allUsers.filter(user => user.is_archived === true).length;

      // Step 1: Active & not archived users only
      const activeUsers = allUsers.filter(user => 
        user.account_status === 'active' && !user.is_admin && !user.is_archived
      );

      // Step 2: Gender preference filtering
      const genderFilteredUsers = activeUsers.filter(user =>
        allowedGenders.includes(user.gender)
      );

      // Step 3: Age filtering
      const ageFilteredUsers = genderFilteredUsers.filter(user => {
        if (!user.date_of_birth) return false;
        const age = calculateAge(user.date_of_birth);
        return age >= minAge && age <= maxAge;
      });

      // Step 4: Distance filtering
      let distanceFilteredUsers = ageFilteredUsers;
      if (preferences.latitude && preferences.longitude) {
        distanceFilteredUsers = ageFilteredUsers.filter(user => {
          if (!user.latitude || !user.longitude) {
            return true;
          }
          const distance = calculateDistance(
            preferences.latitude!,
            preferences.longitude!,
            user.latitude,
            user.longitude
          );
          return distance <= maxDistance;
        });
      }

      // Step 5: Remove excluded users
      const finalUsers = distanceFilteredUsers.filter(user =>
        !likedUserIds.includes(user.id) &&
        !blockedUserIds.includes(user.id) &&
        !recentPassIds.includes(user.id)
      );

      const stats: UserPoolStats = {
        totalUsers: allUsers.length,
        activeUsers: activeUsers.length,
        archivedUsers,
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
      // Fetch all active profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, gender, preference, date_of_birth, country, city, bio, is_admin, account_status')
        .eq('account_status', 'active')
        .eq('is_admin', false);

      if (profilesError) throw profilesError;

      // Fetch all user images
      const { data: allImages, error: imagesError } = await supabase
        .from('user_images')
        .select('user_id, image_url, is_approved');

      if (imagesError) throw imagesError;

      // Fetch all likes to determine users who have never been seen
      const { data: allLikes, error: likesError } = await supabase
        .from('likes')
        .select('liked_id');

      if (likesError) throw likesError;

      // Fetch all passes
      const { data: allPasses, error: passesError } = await supabase
        .from('passes')
        .select('passed_id');

      if (passesError) throw passesError;

      // Create sets for quick lookup
      const usersWithImages = new Set<string>();
      const imagesByUser = new Map<string, { url: string; approved: boolean }[]>();

      (allImages || []).forEach(img => {
        if (img.user_id) {
          usersWithImages.add(img.user_id);
          if (!imagesByUser.has(img.user_id)) {
            imagesByUser.set(img.user_id, []);
          }
          imagesByUser.get(img.user_id)!.push({ url: img.image_url, approved: img.is_approved || false });
        }
      });

      const seenUsers = new Set<string>();
      (allLikes || []).forEach(like => {
        if (like.liked_id) seenUsers.add(like.liked_id);
      });
      (allPasses || []).forEach(pass => {
        if (pass.passed_id) seenUsers.add(pass.passed_id);
      });

      // Analyze profiles
      const usersWithNoImages: ProfileHealthIssue[] = [];
      const usersNeverSeen: ProfileHealthIssue[] = [];
      const usersWithIncompleteProfiles: ProfileHealthIssue[] = [];

      (profiles || []).forEach(profile => {
        const issues: string[] = [];
        const hasImages = usersWithImages.has(profile.id);
        const hasBeenSeen = seenUsers.has(profile.id);

        // Check for no images
        if (!hasImages) {
          usersWithNoImages.push({
            userId: profile.id,
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            issues: ['No profile images']
          });
        }

        // Check if never seen (not liked or passed by anyone)
        if (!hasBeenSeen) {
          usersNeverSeen.push({
            userId: profile.id,
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            issues: ['Never been seen by other users']
          });
        }

        // Check for incomplete profile
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
            issues: [`Missing: ${missing.join(', ')}`]
          });
        }
      });

      setHealthStats({
        usersWithNoImages,
        usersWithBrokenImages: [], // Would need server-side check for broken URLs
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
            <Button 
              onClick={analyzeProfileHealth} 
              disabled={isLoading}
              className="w-full"
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
                  Check Profile Health
                </>
              )}
            </Button>

            {healthStats && (
              <div className="space-y-3">
                {/* No Images */}
                <div className="border rounded p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageOff className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-sm">No Images ({healthStats.usersWithNoImages.length})</span>
                  </div>
                  {healthStats.usersWithNoImages.length > 0 ? (
                    <ScrollArea className="h-32">
                      <div className="space-y-1">
                        {healthStats.usersWithNoImages.slice(0, 20).map(user => (
                          <div key={user.userId} className="flex items-center justify-between text-xs p-1 bg-red-50 rounded">
                            <span>{user.firstName} {user.lastName}</span>
                            {onViewProfile && (
                              <Button size="sm" variant="ghost" className="h-5 px-1" onClick={() => onViewProfile(user.userId)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))}
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
                    <span className="font-medium text-sm">Never Seen ({healthStats.usersNeverSeen.length})</span>
                  </div>
                  {healthStats.usersNeverSeen.length > 0 ? (
                    <ScrollArea className="h-32">
                      <div className="space-y-1">
                        {healthStats.usersNeverSeen.slice(0, 20).map(user => (
                          <div key={user.userId} className="flex items-center justify-between text-xs p-1 bg-orange-50 rounded">
                            <span>{user.firstName} {user.lastName}</span>
                            {onViewProfile && (
                              <Button size="sm" variant="ghost" className="h-5 px-1" onClick={() => onViewProfile(user.userId)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))}
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
                    <span className="font-medium text-sm">Incomplete ({healthStats.usersWithIncompleteProfiles.length})</span>
                  </div>
                  {healthStats.usersWithIncompleteProfiles.length > 0 ? (
                    <ScrollArea className="h-32">
                      <div className="space-y-1">
                        {healthStats.usersWithIncompleteProfiles.slice(0, 20).map(user => (
                          <div key={user.userId} className="flex items-center justify-between text-xs p-1 bg-yellow-50 rounded">
                            <div>
                              <span>{user.firstName} {user.lastName}</span>
                              <span className="text-gray-400 ml-1">({user.issues[0]})</span>
                            </div>
                            {onViewProfile && (
                              <Button size="sm" variant="ghost" className="h-5 px-1" onClick={() => onViewProfile(user.userId)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))}
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
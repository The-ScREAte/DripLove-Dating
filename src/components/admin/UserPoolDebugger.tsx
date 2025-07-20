import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Users, MapPin, Heart, X, Clock } from 'lucide-react';

interface UserPoolStats {
  totalUsers: number;
  activeUsers: number;
  usersInAgeRange: number;
  usersInDistance: number;
  usersWithPreferenceMatch: number;
  likedUsers: number;
  blockedUsers: number;
  recentPasses: number;
  finalEligibleUsers: number;
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
}

const UserPoolDebugger: React.FC<Props> = ({ currentUserId, userPreferences }) => {
  const [stats, setStats] = useState<UserPoolStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
    const R = 6371; // Earth's radius in kilometers
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
      // Get current user's exclusions
      const [
        { data: allUsers },
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses }
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, gender, date_of_birth, latitude, longitude, account_status, is_admin')
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

      let currentStep = allUsers;

      // Step 1: Active users only
      const activeUsers = currentStep.filter(user => 
        user.account_status === 'active' && !user.is_admin
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

      // Step 4: Distance filtering (if coordinates available)
      let distanceFilteredUsers = ageFilteredUsers;
      if (preferences.latitude && preferences.longitude) {
        distanceFilteredUsers = ageFilteredUsers.filter(user => {
          if (!user.latitude || !user.longitude) {
            return true; // Include users without coordinates
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          User Pool Debugger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={analyzeUserPool} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Analyze User Pool
            </>
          )}
        </Button>

        {stats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span>Total Users:</span>
                <Badge variant="secondary">{stats.totalUsers}</Badge>
              </div>
              
              <div className="flex justify-between">
                <span>Active Users:</span>
                <Badge variant="secondary">{stats.activeUsers}</Badge>
              </div>
              
              <div className="flex justify-between">
                <span>Gender Match:</span>
                <Badge variant="secondary">{stats.usersWithPreferenceMatch}</Badge>
              </div>
              
              <div className="flex justify-between">
                <span>Age Range:</span>
                <Badge variant="secondary">{stats.usersInAgeRange}</Badge>
              </div>
              
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Distance:
                </span>
                <Badge variant="secondary">{stats.usersInDistance}</Badge>
              </div>
              
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-red-600">
                  <Heart className="w-3 h-3" />
                  Liked:
                </span>
                <Badge variant="destructive">{stats.likedUsers}</Badge>
              </div>
              
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-red-600">
                  <X className="w-3 h-3" />
                  Blocked:
                </span>
                <Badge variant="destructive">{stats.blockedUsers}</Badge>
              </div>
              
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-yellow-600">
                  <Clock className="w-3 h-3" />
                  Recent Passes:
                </span>
                <Badge variant="secondary">{stats.recentPasses}</Badge>
              </div>
            </div>
            
            <div className="border-t pt-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Final Eligible Users:</span>
                <Badge 
                  variant={stats.finalEligibleUsers > 10 ? "default" : "destructive"}
                  className="text-lg px-3 py-1"
                >
                  {stats.finalEligibleUsers}
                </Badge>
              </div>
            </div>

            {stats.finalEligibleUsers < 10 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-yellow-800">Low User Pool Detected</p>
                <p className="text-yellow-700 mt-1">
                  Consider adjusting your preferences (age range, distance, gender) or the app may need more users in your area.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UserPoolDebugger;

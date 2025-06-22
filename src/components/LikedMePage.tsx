
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Heart, Crown, Timer, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import UserProfileModal from './UserProfileModal';
import PremiumUpgrade from './PremiumUpgrade';
import { useSubscription } from '@/hooks/useSubscription';

interface LikedMePageProps {
  currentUser: any;
}

const LikedMePage = ({ currentUser }: LikedMePageProps) => {
  const [likedProfiles, setLikedProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [canUseLikeMe, setCanUseLikeMe] = useState(true);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const { toast } = useToast();
  const { subscription, isPremium } = useSubscription(currentUser?.id);

  useEffect(() => {
    if (currentUser?.id) {
      fetchLikedProfiles();
      checkLikeMeCooldown();
    }
  }, [currentUser]);

  const checkLikeMeCooldown = async () => {
    if (!currentUser?.id) return;

    try {
      // Check if user is premium first
      if (isPremium()) {
        setCanUseLikeMe(true);
        return;
      }

      // For free users, check cooldown
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('like_me_cooldown_until')
        .eq('id', currentUser.id)
        .single();

      if (error) throw error;

      const cooldownTime = profile?.like_me_cooldown_until;
      const now = new Date();
      const canUse = !cooldownTime || new Date(cooldownTime) <= now;

      setCanUseLikeMe(canUse);
      if (!canUse) {
        setCooldownUntil(cooldownTime);
      }
    } catch (error) {
      console.error('Error checking Like Me cooldown:', error);
    }
  };

  const fetchLikedProfiles = async () => {
    if (!currentUser?.id) return;

    try {
      setLoading(true);

      // Get users who liked me but I haven't liked back (no mutual match yet)
      const { data: likes, error: likesError } = await supabase
        .from('likes')
        .select(`
          *,
          liker:profiles!likes_liker_id_fkey(
            id,
            first_name,
            last_name,
            age:date_of_birth,
            bio,
            city,
            country,
            interests,
            account_status
          )
        `)
        .eq('liked_id', currentUser.id)
        .neq('liker.account_status', 'blocked');

      if (likesError) throw likesError;

      // Filter out users I've already liked back (mutual matches)
      const { data: myLikes, error: myLikesError } = await supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', currentUser.id);

      if (myLikesError) throw myLikesError;

      const myLikedIds = new Set(myLikes?.map(like => like.liked_id) || []);
      
      // Filter out users I've blocked or who have blocked me
      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);

      if (blocksError) throw blocksError;

      const blockedUserIds = new Set();
      blocks?.forEach(block => {
        if (block.blocker_id === currentUser.id) {
          blockedUserIds.add(block.blocked_id);
        } else {
          blockedUserIds.add(block.blocker_id);
        }
      });

      const filteredLikes = likes?.filter(like => 
        !myLikedIds.has(like.liker_id) && 
        !blockedUserIds.has(like.liker_id) &&
        like.liker.account_status === 'active'
      ) || [];

      // For free users, show only limited profiles based on subscription
      const visibleCount = subscription?.features?.liked_me_visible || 1;
      const visibleProfiles = isPremium() ? filteredLikes : filteredLikes.slice(0, visibleCount);

      setLikedProfiles(visibleProfiles);
    } catch (error) {
      console.error('Error fetching liked profiles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load profiles who liked you.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLikeBack = async (profileId: string) => {
    if (!canUseLikeMe && !isPremium()) {
      toast({
        title: 'Like Me Cooldown',
        description: 'Free users can only match from Like Me once every 90 days. Upgrade to Premium for unlimited access!',
        variant: 'destructive'
      });
      setShowPremiumUpgrade(true);
      return;
    }

    try {
      // Like back
      const { error: likeError } = await supabase
        .from('likes')
        .insert({
          liker_id: currentUser.id,
          liked_id: profileId
        });

      if (likeError) throw likeError;

      // Set cooldown for free users
      if (!isPremium()) {
        const cooldownDate = new Date();
        cooldownDate.setDate(cooldownDate.getDate() + 90);
        
        await supabase
          .from('profiles')
          .update({ like_me_cooldown_until: cooldownDate.toISOString() })
          .eq('id', currentUser.id);
          
        setCanUseLikeMe(false);
        checkLikeMeCooldown();
      }

      toast({
        title: 'It\'s a Match! 🎉',
        description: 'You can now start chatting with each other.',
      });

      // Refresh the list
      fetchLikedProfiles();

    } catch (error) {
      console.error('Error liking back:', error);
      toast({
        title: 'Error',
        description: 'Failed to like back. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const formatCooldownTime = (cooldownUntil: string) => {
    const now = new Date();
    const cooldown = new Date(cooldownUntil);
    const diffTime = cooldown.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) {
      return `${diffDays} days`;
    }
    return 'Soon';
  };

  if (showPremiumUpgrade) {
    return <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} />;
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-pink-50 to-purple-50 pb-20">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center">
              <Heart className="w-6 h-6 text-pink-600 mr-2" />
              People Who Liked You
            </h1>
            <p className="text-gray-600 mt-1">
              {likedProfiles.length} {likedProfiles.length === 1 ? 'person has' : 'people have'} liked you
            </p>
          </div>
        </div>

        {/* Cooldown Warning for Free Users */}
        {!isPremium() && !canUseLikeMe && cooldownUntil && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Timer className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="font-medium text-orange-800">Like Me Cooldown Active</p>
                  <p className="text-sm text-orange-600">
                    You can match again in {formatCooldownTime(cooldownUntil)}. 
                    <Button 
                      variant="link" 
                      className="p-0 ml-1 text-orange-600 underline"
                      onClick={() => setShowPremiumUpgrade(true)}
                    >
                      Upgrade to Premium for unlimited access!
                    </Button>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {likedProfiles.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-600 mb-2">No Likes Yet</h2>
              <p className="text-gray-500">
                Keep swiping! People who like you will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {likedProfiles.map((like) => {
              const profile = like.liker;
              const age = profile.age ? new Date().getFullYear() - new Date(profile.age).getFullYear() : null;
              
              return (
                <Card key={like.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-0">
                    <div className="aspect-square bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-20 h-20 bg-pink-200 rounded-full flex items-center justify-center mx-auto mb-2">
                          <span className="text-2xl font-bold text-pink-700">
                            {profile.first_name?.charAt(0)}{profile.last_name?.charAt(0)}
                          </span>
                        </div>
                        <h3 className="font-semibold text-lg">
                          {profile.first_name} {profile.last_name}
                        </h3>
                        {age && <p className="text-gray-600">{age} years old</p>}
                        <p className="text-sm text-gray-500">
                          {profile.city}, {profile.country}
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      {profile.bio && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                          {profile.bio}
                        </p>
                      )}
                      
                      {profile.interests && profile.interests.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-4">
                          {profile.interests.slice(0, 3).map((interest: string, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {interest}
                            </Badge>
                          ))}
                          {profile.interests.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{profile.interests.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => {
                            setSelectedUserId(profile.id);
                            setIsUserProfileOpen(true);
                          }}
                          variant="outline"
                          className="flex-1"
                          size="sm"
                        >
                          View Profile
                        </Button>
                        <Button
                          onClick={() => handleLikeBack(profile.id)}
                          className="flex-1"
                          size="sm"
                          disabled={!canUseLikeMe && !isPremium()}
                        >
                          <Heart className="w-4 h-4 mr-1" />
                          {!canUseLikeMe && !isPremium() ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            'Like Back'
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!isPremium() && likedProfiles.length > 0 && (
          <Card className="mt-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Crown className="w-6 h-6 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-800">Upgrade to Premium</p>
                    <p className="text-sm text-yellow-600">
                      See all your likes and match unlimited times from Like Me!
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowPremiumUpgrade(true)}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        userId={selectedUserId}
      />
    </div>
  );
};

export default LikedMePage;

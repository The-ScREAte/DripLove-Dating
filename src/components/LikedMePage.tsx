
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Heart, X, Calendar, MapPin, Shield, ChevronDown, ChevronUp, Briefcase, GraduationCap, Crown, Lock, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import BlockDialog from './BlockDialog';
import PremiumUpgrade from './PremiumUpgrade';

interface LikedMePageProps {
  currentUser: any;
}

const LikedMePage = ({ currentUser }: LikedMePageProps) => {
  const [likers, setLikers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [lockoutEndDate, setLockoutEndDate] = useState<Date | null>(null);
  const [hasInteractedToday, setHasInteractedToday] = useState(false);
  const { toast } = useToast();

  const { subscription, isPremium, getLikedMeVisibleCount } = useSubscription(currentUser?.id);

  const calculateAge = useCallback((dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }, []);

  const checkLockoutStatus = useCallback(async () => {
    if (!currentUser?.id || isPremium()) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('like_me_cooldown_until')
        .eq('id', currentUser.id)
        .single();

      if (error) throw error;

      if (data?.like_me_cooldown_until) {
        const cooldownDate = new Date(data?.like_me_cooldown_until);
        if (cooldownDate > new Date()) {
          setLockoutEndDate(cooldownDate);
        }
      }
    } catch (error) {
      console.error('Error checking lockout status:', error);
    }
  }, [currentUser?.id, isPremium]);

  const fetchLikers = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      setLoading(true);

      // Parallel queries for better performance
      const [
        { data: likes, error: likesError },
        { data: matches },
        { data: blockedUsers }
      ] = await Promise.all([
        supabase
          .from('likes')
          .select(`*, liker:profiles!likes_liker_id_fkey(*)`)
          .eq('liked_id', currentUser.id),
        supabase
          .from('matches')
          .select('user1_id, user2_id')
          .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`)
      ]);

      if (likesError) throw likesError;

      const matchedIds = matches?.map(match =>
        match.user1_id === currentUser.id ? match.user2_id : match.user1_id
      ) || [];

      const blockedIds = blockedUsers?.map(block =>
        block.blocker_id === currentUser.id ? block.blocked_id : block.blocker_id
      ) || [];

      const filteredLikes = likes?.filter(like =>
        !matchedIds.includes(like.liker.id) && !blockedIds.includes(like.liker.id) && like.liker.is_admin !== true
      ) || [];

      const likersData = filteredLikes.map(like => like.liker);

      if (likersData.length > 0) {
        // Only load images for first few profiles for faster initial load
        const profilesForImages = likersData.slice(0, 6);
        const imagePromises = profilesForImages.map(async (profile) => {
          const { data: images } = await supabase
            .from('user_images')
            .select('image_url')
            .eq('user_id', profile.id)
            .order('image_order')
            .limit(1); // Only load first image for grid view

          return {
            profileId: profile.id,
            images: images?.map(img => img.image_url) || []
          };
        });

        const imageResults = await Promise.all(imagePromises);
        const imageMap: { [key: string]: string[] } = {};
        imageResults.forEach(result => {
          imageMap[result.profileId] = result.images;
        });

        setUserImages(imageMap);
      }

      setLikers(likersData);
    } catch (error) {
      console.error('Error fetching likers:', error);
      toast({
        title: "Error",
        description: "Failed to load people who liked you",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, toast]);

  // Load additional images when profile is selected
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 1) return; // Already loaded

    const { data: images } = await supabase
      .from('user_images')
      .select('image_url')
      .eq('user_id', profileId)
      .order('image_order');

    if (images?.length) {
      setUserImages(prev => ({
        ...prev,
        [profileId]: images.map(img => img.image_url)
      }));
    }
  }, [userImages]);

  useEffect(() => {
    if (currentUser?.id) {
      fetchLikers();
      checkLockoutStatus();
    }
  }, [currentUser?.id, fetchLikers, checkLockoutStatus]);

  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false);
  }, [selectedProfile]);

  const setLockoutPeriod = async () => {
    if (isPremium()) return;

    try {
      const lockoutDate = new Date();
      lockoutDate.setDate(lockoutDate.getDate() + 50);

      const { error } = await supabase
        .from('profiles')
        .update({ like_me_cooldown_until: lockoutDate.toISOString() })
        .eq('id', currentUser.id);

      if (error) throw error;

      setLockoutEndDate(lockoutDate);
    } catch (error) {
      console.error('Error setting lockout period:', error);
    }
  };

  const handleTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    const { clientX } = e.changedTouches[0];
    const screenWidth = window.innerWidth;
    const profileImages = userImages[selectedProfile.id] || [];

    if (clientX < screenWidth / 2) {
      setImageIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else {
      setImageIndex(prev => (prev < profileImages.length - 1 ? prev + 1 : prev));
    }
  };

  const handleLikeBack = async (profileId: string) => {
    try {
      const { data: existingLike } = await supabase
        .from('likes')
        .select('*')
        .eq('liker_id', currentUser.id)
        .eq('liked_id', profileId)
        .single();

      if (existingLike) {
        toast({
          title: "Already liked",
          description: "You've already liked this person back",
        });
        return;
      }

      const { error: likeError } = await supabase
        .from('likes')
        .insert({
          liker_id: currentUser.id,
          liked_id: profileId
        });

      if (likeError) throw likeError;

      // Set lockout period for free users
      if (!isPremium() && !hasInteractedToday) {
        await setLockoutPeriod();
        setHasInteractedToday(true);
      }

      toast({
        title: "It's a Match! 🎉",
        description: "You can now start chatting!",
      });

      setLikers(prev => prev.filter(liker => liker.id !== profileId));
      setSelectedProfile(null);
    } catch (error) {
      console.error('Error liking back:', error);
      toast({
        title: "Error",
        description: "Failed to like back",
        variant: "destructive",
      });
    }
  };

  const handlePass = async (profileId: string) => {
    try {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('liker_id', profileId)
        .eq('liked_id', currentUser.id);

      if (error) throw error;

      // Set lockout period for free users
      if (!isPremium() && !hasInteractedToday) {
        await setLockoutPeriod();
        setHasInteractedToday(true);
      }

      toast({
        title: "Passed",
        description: "Profile removed from your likes",
      });

      setLikers(prev => prev.filter(liker => liker.id !== profileId));
      setSelectedProfile(null);
    } catch (error) {
      console.error('Error passing:', error);
      toast({
        title: "Error",
        description: "Failed to pass",
        variant: "destructive",
      });
    }
  };

  const handleBlock = () => {
    setBlockDialogOpen(true);
  };

  const handleBlockSuccess = () => {
    if (selectedProfile) {
      setLikers(prev => prev.filter(liker => liker.id !== selectedProfile.id));
      setSelectedProfile(null);
    }
  };

  const handleProfileClick = (liker: any, index: number) => {
    // For free users, only allow clicking if they're premium
    if (!isPremium()) {
      setShowPremiumUpgrade(true);
      return;
    }

    setSelectedProfile(liker);
    // Load full images when profile is selected
    loadFullImages(liker.id);
  };

  const getRemainingDays = () => {
    if (!lockoutEndDate) return 0;
    const now = new Date();
    const diff = lockoutEndDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const isInLockout = useMemo(() => 
    !isPremium() && lockoutEndDate && new Date() < lockoutEndDate,
    [isPremium, lockoutEndDate]
  );

  if (showPremiumUpgrade) {
    return <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} preselectedPlan="premium" />;
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (selectedProfile) {
    const profileImages = userImages[selectedProfile.id] || [];

    return (
      <div className="h-full w-full relative flex flex-col bg-white">
        {/* Main Image Area - takes full available height */}
        <div className="flex-1 relative" onTouchEnd={handleTouch}>
          {profileImages.length > 0 ? (
            <>
              <img
                src={profileImages[imageIndex]}
                alt={`${selectedProfile.first_name}'s photo`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Image indicators */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex gap-1 z-10">
                {profileImages.map((_,idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full ${idx === imageIndex ? 'bg-white' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center">
                <span className="text-4xl font-bold text-gray-700">
                  {selectedProfile.first_name?.[0]}{selectedProfile.last_name?.[0]}
                </span>
              </div>
            </div>
          )}

          {/* Header buttons */}
          <Button
            onClick={() => setSelectedProfile(null)}
            variant="outline"
            className="absolute top-4 left-4 bg-white/80 hover:bg-white z-10 h-10 px-3"
          >
            ← Back
          </Button>

          <Button
            onClick={handleBlock}
            variant="outline"
            size="sm"
            className="absolute top-4 right-4 bg-white/80 hover:bg-white z-10 h-10 w-10 p-0"
          >
            <Shield className="w-4 h-4" />
          </Button>

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

          {/* Profile Info Overlay - Fixed at bottom with proper spacing for mobile nav */}
          <div className="absolute bottom-0 left-0 right-0 text-white pb-24">
            {/* Main info section */}
            <div className="px-6 pb-4">
              <div className="mb-3">
                <h2 className="text-2xl font-bold mb-1">
                  {selectedProfile.first_name} {selectedProfile.last_name}
                </h2>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    <span>{calculateAge(selectedProfile.date_of_birth)} years old</span>
                  </div>
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    <span>{selectedProfile.city}, {selectedProfile.country}</span>
                  </div>
                </div>
              </div>

              {/* Expandable Info Section */}
              <div className="mb-4">
                <Button
                  onClick={() => setShowMoreInfo(!showMoreInfo)}
                  variant="ghost"
                  className="text-white p-0 h-auto font-normal text-left mb-2 hover:bg-transparent"
                >
                  <span className="flex items-center text-sm">
                    {showMoreInfo ? 'Show Less' : 'Show More'}
                    {showMoreInfo ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                  </span>
                </Button>

                {showMoreInfo && (
                  <div className="space-y-3 bg-black/50 p-3 rounded-lg max-h-32 overflow-y-auto">
                    {selectedProfile.bio && (
                      <div>
                        <h3 className="font-semibold mb-1 text-sm">About</h3>
                        <p className="text-xs leading-relaxed">{selectedProfile.bio}</p>
                      </div>
                    )}

                    {(selectedProfile.occupation || selectedProfile.education_level) && (
                      <div className="space-y-2">
                        {selectedProfile.occupation && (
                          <div className="flex items-center text-xs">
                            <Briefcase className="w-3 h-3 mr-2 flex-shrink-0" />
                            <span>{selectedProfile.occupation}</span>
                          </div>
                        )}
                        {selectedProfile.education_level && (
                          <div className="flex items-center text-xs">
                            <GraduationCap className="w-3 h-3 mr-2 flex-shrink-0" />
                            <span>{selectedProfile.education_level}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedProfile.interests && selectedProfile.interests.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 text-sm">Interests</h3>
                        <div className="flex flex-wrap gap-1">
                          {selectedProfile.interests.map((interest: string, index: number) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-white/20 rounded-full text-xs"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons - positioned above mobile nav */}
            <div className="flex justify-center space-x-6 px-6">
              <Button
                onClick={() => handlePass(selectedProfile.id)}
                variant="outline"
                className="w-14 h-14 rounded-full border-2 border-red-400/80 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm"
              >
                <X className="w-6 h-6 text-red-400" />
              </Button>

              <Button
                onClick={() => handleLikeBack(selectedProfile.id)}
                variant="outline"
                className="w-14 h-14 rounded-full border-2 border-green-400/80 bg-green-500/20 hover:bg-green-500/30 backdrop-blur-sm"
              >
                <Heart className="w-6 h-6 text-green-400" />
              </Button>
            </div>
          </div>
        </div>

        <BlockDialog
          isOpen={blockDialogOpen}
          onClose={() => setBlockDialogOpen(false)}
          userToBlock={selectedProfile}
          currentUserId={currentUser.id}
          onBlockSuccess={handleBlockSuccess}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-shrink-0 bg-white border-b p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Users className="w-6 h-6 text-pink-600" />
            <h1 className="text-xl font-bold text-gray-800">People who liked you</h1>
          </div>
          {!isPremium() && (
            <Button
              onClick={() => setShowPremiumUpgrade(true)}
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold text-xs px-2 py-1"
            >
              <Crown className="w-4 h-4 mr-1" />
              Upgrade
            </Button>
          )}
        </div>
        <p className="text-gray-600 text-sm">({likers.length} people)</p>
        
        {!isPremium() && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
            <div className="flex items-center space-x-2 text-yellow-800">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-medium">
                Upgrade to Premium to see who liked you and interact with them
              </span>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white">
        {likers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">No new likes</h3>
              <p className="text-gray-600">Keep swiping! Someone special is waiting to find you.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {likers.map((liker, index) => {
              const profileImages = userImages[liker.id] || [];
              const isLocked = !isPremium();
              
              return (
                <Card
                  key={liker.id}
                  className={`cursor-pointer hover:shadow-lg transition-shadow flex flex-col relative ${isLocked ? 'opacity-75' : ''}`}
                  onClick={() => handleProfileClick(liker, index)}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-lg">
                    {profileImages.length > 0 ? (
                      <img
                        src={profileImages[0]}
                        alt={`${liker.first_name}'s photo`}
                        className={`w-full h-full object-cover ${isLocked ? 'blur-md' : ''}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center ${isLocked ? 'blur-md' : ''}`}>
                        <span className="text-2xl font-bold text-gray-700">
                          {liker.first_name?.[0]}{liker.last_name?.[0]}
                        </span>
                      </div>
                    )}
                    {isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="bg-white/90 backdrop-blur-sm rounded-full p-3">
                          <Lock className="w-6 h-6 text-gray-700" />
                        </div>
                      </div>
                    )}
                  </div>

                  <CardContent className="p-3 flex-1">
                    <h3 className={`font-semibold text-gray-800 truncate text-sm ${isLocked ? 'blur-sm' : ''}`}>
                      {liker.first_name}, {calculateAge(liker.date_of_birth)}
                    </h3>
                    <p className={`text-xs text-gray-600 truncate ${isLocked ? 'blur-sm' : ''}`}>
                      {liker.city}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LikedMePage;

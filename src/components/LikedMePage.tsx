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
  isPremium?: boolean;
}

const LikedMePage = ({ currentUser, isPremium = false }: LikedMePageProps) => {
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

  const { subscription, getLikedMeVisibleCount } = useSubscription(currentUser?.id);

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
    if (!currentUser?.id || isPremium) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('like_me_cooldown_until')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking lockout status:', error);
        return;
      }

      if (data?.like_me_cooldown_until) {
        const cooldownDate = new Date(data.like_me_cooldown_until);
        if (cooldownDate > new Date()) {
          setLockoutEndDate(cooldownDate);
        }
      }
    } catch (error) {
      console.error('Error checking lockout status:', error);
    }
  }, [currentUser?.id, isPremium]);


  // Optimized: batch queries and filter in SQL
  const fetchLikers = useCallback(async () => {
    if (!currentUser?.id) {
      setLikers([]);
      setUserImages({});
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // Defensive: clear previous data to avoid UI blinking forever
      setLikers([]);
      setUserImages({});
      // 1. Get all likes for this user
      const { data: likes, error: likesError } = await supabase
        .from('likes')
        .select('liker_id, created_at')
        .eq('liked_id', currentUser.id);
      if (likesError) {
        console.error('Supabase likesError:', likesError);
        throw likesError;
      }
      if (!likes || likes.length === 0) {
        setLikers([]);
        setUserImages({});
        setLoading(false);
        return;
      }
      // 2. Get all matches and blocks in one go
      const [matchesRes, blocksRes] = await Promise.all([
        supabase
          .from('matches')
          .select('user1_id, user2_id')
          .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`)
      ]);
      if (matchesRes.error) {
        console.error('Supabase matchesError:', matchesRes.error);
        throw matchesRes.error;
      }
      if (blocksRes.error) {
        console.error('Supabase blocksError:', blocksRes.error);
        throw blocksRes.error;
      }
      const matches = matchesRes.data || [];
      const blockedUsers = blocksRes.data || [];
      const matchedIds = matches.map(match =>
        match.user1_id === currentUser.id ? match.user2_id : match.user1_id
      );
      const blockedIds = blockedUsers.map(block =>
        block.blocker_id === currentUser.id ? block.blocked_id : block.blocker_id
      );
      // 3. Filter likerIds in JS (could be done in SQL with a view for even more speed)
      const likerIds = likes
        .map(like => like.liker_id)
        .filter(id => !matchedIds.includes(id) && !blockedIds.includes(id));
      if (likerIds.length === 0) {
        setLikers([]);
        setUserImages({});
        setLoading(false);
        return;
      }
      // 4. Fetch all profiles in one go
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', likerIds)
        .neq('is_admin', true);
      if (profileError) {
        console.error('Supabase profileError:', profileError, 'likerIds:', likerIds);
        throw profileError;
      }
      setLikers(profiles || []);
      // 5. Fetch all first images for these profiles in one query - only approved ones
      if (likerIds.length > 0) {
        let imagesData = null;
        try {
          // Try to fetch approved images first
          const { data: approvedImages, error: imagesError } = await supabase
            .from('user_images')
            .select('user_id, image_url, image_order')
            .in('user_id', likerIds)
            .eq('is_approved', true) // Only show approved images
            .order('image_order', { ascending: true });

          // If moderation columns don't exist, fall back to basic query
          if (imagesError && imagesError.message.includes('does not exist')) {
            const { data: fallbackImages, error: fallbackError } = await supabase
              .from('user_images')
              .select('user_id, image_url, image_order')
              .in('user_id', likerIds)
              .order('image_order', { ascending: true });

            if (fallbackError) throw fallbackError;
            imagesData = fallbackImages;
          } else if (imagesError) {
            throw imagesError;
          } else {
            imagesData = approvedImages;
          }
        } catch (error) {
          console.error('Supabase imagesError:', error, 'likerIds:', likerIds);
          throw error;
        }
        // Only keep the first image for each user
        const imageMap: { [key: string]: string[] } = {};
        if (imagesData) {
          for (const img of imagesData) {
            if (!imageMap[img.user_id]) {
              imageMap[img.user_id] = [img.image_url];
            }
          }
        }
        setUserImages(imageMap);
        // Preload next profile images in the background
        if (profiles && profiles.length > 0) {
          preloadNextProfileImages(profiles, imageMap);
        }
      } else {
        setUserImages({});
      }
    } catch (error) {
      console.error('Error in fetchLikers:', error);
      toast({
        title: "Error",
        description: "Failed to load people who liked you",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, toast]);

  // Load additional images when profile is selected - only approved ones
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 1) return; // Already loaded

    try {
      // Try to fetch approved images first
      let { data: images, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', profileId)
        .eq('is_approved', true) // Only show approved images
        .order('image_order');

      // If moderation columns don't exist, fall back to basic query
      if (error && error.message.includes('does not exist')) {
        const { data: fallbackImages, error: fallbackError } = await supabase
          .from('user_images')
          .select('image_url')
          .eq('user_id', profileId)
          .order('image_order');

        if (fallbackError) return; // Silent fail for fallback
        images = fallbackImages;
      } else if (error) {
        return; // Silent fail
      }

      if (images?.length) {
        setUserImages(prev => ({
          ...prev,
          [profileId]: images.map(img => img.image_url)
        }));
      }
    } catch (error) {
      console.error('Error loading additional images:', error);
    }
  }, [userImages]);

  // Preload images for the next few profiles for smoother UX
  const preloadNextProfileImages = useCallback(
    async (likersList: { id: string }[], alreadyLoaded: { [key: string]: string[] }) => {
      // Preload for the next 2 profiles (can adjust as needed)
      const toPreload = likersList
        .filter(liker => !alreadyLoaded[liker.id] || alreadyLoaded[liker.id].length <= 1)
        .slice(0, 2);
      for (const liker of toPreload) {
        // Don't await, fire and forget
        void loadFullImages(liker.id);
      }
    },
    [loadFullImages]
  );

  useEffect(() => {
    // Only run on mount, not on every render
    if (!currentUser?.id) {
      setLoading(false);
      setLikers([]);
      setUserImages({});
      return;
    }
    fetchLikers();
    checkLockoutStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false);
  }, [selectedProfile]);

  const setLockoutPeriod = async () => {
    if (isPremium) return;

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
        .maybeSingle();

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
      if (!isPremium && !hasInteractedToday) {
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
      if (!isPremium && !hasInteractedToday) {
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
    if (!isPremium) {
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
    !isPremium && lockoutEndDate && new Date() < lockoutEndDate,
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
          {!isPremium && (
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
        
        {!isPremium && (
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
              const isLocked = !isPremium;
              
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

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Undo2, MapPin, Briefcase, GraduationCap, ChevronDown, ChevronUp, Calendar, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';

interface DiscoverPageProps {
  currentUser: any;
  onNavigateToChat?: (userId: string) => void;
}

interface PotentialMatch {
  id: string;
  first_name: string;
  last_name: string;
  bio: string;
  city: string;
  country: string;
  occupation: string;
  education_level: string;
  date_of_birth: string;
  interests: string[];
  images: string[];
}

interface PassedUser {
  user_id: string;
  passed_at: Date;
}

const DiscoverPage = ({ currentUser, onNavigateToChat }: DiscoverPageProps) => {
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [passedUsers, setPassedUsers] = useState<PassedUser[]>([]);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [isOutOfSwipes, setIsOutOfSwipes] = useState(false);
  const [showMatchAnimation, setShowMatchAnimation] = useState(false);
  const [matchedUser, setMatchedUser] = useState<PotentialMatch | null>(null);
  const { toast } = useToast();
  
  const { subscription, checkUsageLimit, isPremium } = useSubscription(currentUser?.id);

  useEffect(() => {
    fetchPotentialMatches();
  }, [currentUser]);

  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false);
  }, [currentIndex]);

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

  const fetchPotentialMatches = async () => {
    if (!currentUser?.id) return;

    try {
      setIsLoading(true);

      const { data: likedUsers } = await supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', currentUser.id);

      const { data: blockedUsers } = await supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const excludedIds = [...likedUserIds, ...blockedUserIds, currentUser.id];

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .limit(10);

      if (error) throw error;

      const matchesWithImages = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: images } = await supabase
            .from('user_images')
            .select('image_url')
            .eq('user_id', profile.id)
            .order('image_order', { ascending: true });
      
          return {
            ...profile,
            images: images?.map(img => img.image_url) || []
          };
        })
      );
      
      // Shuffle client-side
      const shuffled = matchesWithImages.sort(() => 0.5 - Math.random());
      setPotentialMatches(shuffled);
      

      setPotentialMatches(matchesWithImages);
    } catch (error) {
      console.error('Error fetching potential matches:', error);
      toast({
        title: 'Error',
        description: 'Failed to load potential matches. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Check swipe limit before proceeding
    const usageResult = await checkUsageLimit('swipe');
    if (!usageResult.success) {
      setIsOutOfSwipes(true);
      toast({
        title: 'Daily Limit Reached',
        description: usageResult.message,
        variant: 'destructive'
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('likes')
        .insert({ liker_id: currentUser.id, liked_id: currentMatch.id });

      if (error) throw error;

      const { data: mutualLike } = await supabase
        .from('likes')
        .select('*')
        .eq('liker_id', currentMatch.id)
        .eq('liked_id', currentUser.id)
        .single();

      if (mutualLike) {
        setMatchedUser(currentMatch);
        setShowMatchAnimation(true);
      }

      moveToNext();
    } catch (error) {
      console.error('Error liking user:', error);
      toast({
        title: 'Error',
        description: 'Failed to like user. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handlePass = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Check swipe limit before proceeding
    const usageResult = await checkUsageLimit('swipe');
    if (!usageResult.success) {
      setIsOutOfSwipes(true);
      toast({
        title: 'Daily Limit Reached',
        description: usageResult.message,
        variant: 'destructive'
      });
      return;
    }

    setPassedUsers(prev => [{ user_id: currentMatch.id, passed_at: new Date() }, ...prev]);
    moveToNext();
  };

  const handleReverse = async () => {
    if (passedUsers.length === 0) return;

    // Check reverse dislike limit for free users
    if (!isPremium()) {
      const usageResult = await checkUsageLimit('reverse_dislike');
      if (!usageResult.success) {
        toast({
          title: 'Daily Limit Reached',
          description: usageResult.message + ' Upgrade to Premium for unlimited reverse dislikes.',
          variant: 'destructive'
        });
        return;
      }
    }

    const lastPassedUser = passedUsers[0];
    const passedUserData = potentialMatches.find(match => match.id === lastPassedUser.user_id);

    if (passedUserData) {
      const newMatches = [...potentialMatches];
      newMatches.splice(currentIndex, 0, passedUserData);
      setPotentialMatches(newMatches);
    }

    setPassedUsers(prev => prev.slice(1));

    toast({
      title: 'Reversed',
      description: 'Brought back the last passed user.'
    });
  };

  const handleImageAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only change image if clicking on empty space (not on text/buttons)
    const target = e.target as HTMLElement;
    if (target.closest('.profile-info') || target.closest('button')) {
      return;
    }

    const { clientX } = e;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const width = rect.width;

    if (clickX < width / 2) {
      setImageIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else {
      setImageIndex(prev =>
        currentMatch?.images && prev < currentMatch.images.length - 1 ? prev + 1 : prev
      );
    }
  };

  const handleTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    // Only change image if touching empty space (not on text/buttons)
    const target = e.target as HTMLElement;
    if (target.closest('.profile-info') || target.closest('button')) {
      return;
    }

    const { clientX } = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const touchX = clientX - rect.left;
    const width = rect.width;

    if (touchX < width / 2) {
      setImageIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else {
      setImageIndex(prev =>
        currentMatch?.images && prev < currentMatch.images.length - 1 ? prev + 1 : prev
      );
    }
  };

  const moveToNext = () => {
    if (currentIndex < potentialMatches.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      fetchPotentialMatches();
      setCurrentIndex(0);
    }
  };

  const handleStartChat = (userId: string) => {
    setShowMatchAnimation(false);
    if (onNavigateToChat) {
      onNavigateToChat(userId);
    }
  };

  const handleCloseMatch = () => {
    setShowMatchAnimation(false);
    setMatchedUser(null);
  };

  if (showMatchAnimation && matchedUser) {
    return (
      <MatchAnimation
        currentUserName={currentUser?.first_name || 'You'}
        matchedUserName={`${matchedUser.first_name} ${matchedUser.last_name}`}
        matchedUserImage={matchedUser.images?.[0]}
        matchedUserId={matchedUser.id}
        onClose={handleCloseMatch}
        onStartChat={handleStartChat}
      />
    );
  }

  if (showPremiumUpgrade) {
    return <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} />;
  }

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (isOutOfSwipes) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">You're out of swipes for today!</h2>
            <p className="text-gray-600 mb-4">
              Free users get 12 swipes per day. Come back tomorrow or upgrade to Premium for unlimited swipes!
            </p>
            <div className="space-y-3">
              <Button 
                onClick={() => setShowPremiumUpgrade(true)} 
                className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Premium
              </Button>
              <Button 
                onClick={() => {
                  setIsOutOfSwipes(false);
                  fetchPotentialMatches();
                }} 
                variant="outline" 
                className="w-full"
              >
                Check Again Tomorrow
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentMatch = potentialMatches[currentIndex];

  if (!currentMatch) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">No more profiles</h2>
            <p className="text-gray-600 mb-4">
              You've seen all available profiles. Check back later for new matches!
            </p>
            <Button onClick={fetchPotentialMatches} className="w-full">
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative flex flex-col">
      {/* Main Image Area - Fixed height container with reserved space for buttons */}
      <div className="flex-1 relative overflow-hidden pb-32">
        <div 
          className="h-full w-full cursor-pointer" 
          onTouchEnd={handleTouch}
          onClick={handleImageAreaClick}
        >
          {currentMatch.images?.length > 0 ? (
            <>
              <img
                src={currentMatch.images[imageIndex]}
                alt={`${currentMatch.first_name}'s photo`}
                className="w-full h-full object-cover object-center"
              />
              {/* Image indicators */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex gap-1 z-10">
                {currentMatch.images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full ${idx === imageIndex ? 'bg-white' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
              <span className="text-6xl font-bold text-gray-700">
                {currentMatch.first_name?.[0]}{currentMatch.last_name?.[0]}
              </span>
            </div>
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

          {/* Profile Info Overlay - Positioned to not interfere with buttons */}
          <div className="absolute bottom-32 left-0 right-0 text-white px-6 profile-info">
            {/* Main info section */}
            <div className="mb-3">
              <h2 className="text-2xl font-bold mb-1">
                {currentMatch.first_name} {currentMatch.last_name}
              </h2>
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  <span>{calculateAge(currentMatch.date_of_birth)} years old</span>
                </div>
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span>{currentMatch.city}, {currentMatch.country}</span>
                </div>
              </div>
            </div>

            {/* Expandable Info Section */}
            <div>
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
                  {currentMatch.bio && (
                    <div>
                      <h3 className="font-semibold mb-1 text-sm">About</h3>
                      <p className="text-xs leading-relaxed">{currentMatch.bio}</p>
                    </div>
                  )}

                  {(currentMatch.occupation || currentMatch.education_level) && (
                    <div className="space-y-2">
                      {currentMatch.occupation && (
                        <div className="flex items-center text-xs">
                          <Briefcase className="w-3 h-3 mr-2 flex-shrink-0" />
                          <span>{currentMatch.occupation}</span>
                        </div>
                      )}
                      {currentMatch.education_level && (
                        <div className="flex items-center text-xs">
                          <GraduationCap className="w-3 h-3 mr-2 flex-shrink-0" />
                          <span>{currentMatch.education_level}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {currentMatch.interests?.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 text-sm">Interests</h3>
                      <div className="flex flex-wrap gap-1">
                        {currentMatch.interests.map((interest, index) => (
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
        </div>
      </div>

      {/* Action Buttons - Fixed position at bottom with higher z-index and moved up more */}
      <div className="absolute bottom-24 left-0 right-0 flex justify-center space-x-6 px-6 z-30">
        <Button
          onClick={handlePass}
          variant="outline"
          className="w-16 h-16 rounded-full border-2 border-red-500 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm shadow-lg hover:border-red-400 transition-all duration-200"
        >
          <X className="w-7 h-7 text-red-500" />
        </Button>

        <Button
          onClick={handleReverse}
          variant="outline"
          disabled={!passedUsers.length}
          className="w-16 h-16 rounded-full border-2 border-yellow-500 bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-30 backdrop-blur-sm shadow-lg hover:border-yellow-400 transition-all duration-200"
        >
          <Undo2 className="w-7 h-7 text-yellow-500" />
        </Button>

        <Button
          onClick={handleLike}
          variant="outline"
          className="w-16 h-16 rounded-full border-2 border-green-500 bg-green-500/20 hover:bg-green-500/30 backdrop-blur-sm shadow-lg hover:border-green-400 transition-all duration-200"
        >
          <Heart className="w-7 h-7 text-green-500" />
        </Button>
      </div>
    </div>
  );
};

export default DiscoverPage;

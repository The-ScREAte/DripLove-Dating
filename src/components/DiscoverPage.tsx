import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Crown, Calendar, MapPin, ChevronDown, ChevronUp, Briefcase, GraduationCap, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { calculateDistance } from '@/constants/locationData';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import MatchCard from './discover/MatchCard';
import SwipeButtons from './discover/SwipeButtons';
import { CurrentUser, PotentialMatch } from '@/types';

interface DiscoverPageProps {
  currentUser: CurrentUser;
  onNavigateToChat?: (userId: string) => void;
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
  // New: Store images by userId for instant access
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const { toast } = useToast();
  
  const { subscription, checkUsageLimit, isPremium } = useSubscription(currentUser?.id);
  const [lastShuffleTime, setLastShuffleTime] = useState<number>(0);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);

  // Memoize expensive calculations
  const getGenderFilter = useCallback((userPreference: string) => {
    if (userPreference === 'male') {
      return ['male'];
    } else if (userPreference === 'female') {
      return ['female'];
    } else if (userPreference === 'everyone' || userPreference === 'both') {
      return ['male', 'female', 'other'];
    }
    return ['male', 'female', 'other']; // default to all
  }, []);

  const allowedGenders = useMemo(() => 
    getGenderFilter(currentUser?.preference || 'everyone'), 
    [currentUser?.preference, getGenderFilter]
  );

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

  const shouldReshuffle = useCallback(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000; // 10 minutes in milliseconds
    return now - lastShuffleTime > tenMinutes;
  }, [lastShuffleTime]);

  const fetchPotentialMatches = useCallback(async () => {
    if (!currentUser?.id) return;
  
    try {
      setIsLoading(true);
      
      // Parallel queries for better performance
      const [
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses }
      ] = await Promise.all([
        supabase
          .from('likes')
          .select('liked_id')
          .eq('liker_id', currentUser.id),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`),
        supabase
          .from('passes')
          .select('passed_id, passed_at')
          .match({ passer_id: currentUser.id })
          .gte('passed_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
      ]);

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const hiddenPassedIds = recentPasses?.map(p => p.passed_id) || [];
      const excludedIds = [...likedUserIds, ...blockedUserIds, ...hiddenPassedIds, currentUser.id];
      
      console.log('User preference:', currentUser.preference, 'Allowed genders:', allowedGenders);
  
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .limit(50); // Increased limit to account for distance filtering

      if (error) throw error;

      // Apply distance filtering if current user has coordinates and distance preference
      let filteredProfiles = profiles || [];
      const userMaxDistance = currentUser.max_distance || currentUser.distance_preference || 50;
      if (currentUser.latitude && currentUser.longitude && userMaxDistance) {
        filteredProfiles = (profiles || []).filter(profile => {
          // If profile doesn't have coordinates, include it (fallback to country/city matching)
          if (!profile.latitude || !profile.longitude) {
            return profile.country === currentUser.country;
          }

          // Calculate distance between users
          const distance = calculateDistance(
            currentUser.latitude,
            currentUser.longitude,
            profile.latitude,
            profile.longitude
          );

          return distance <= userMaxDistance;
        });

        console.log(`Applied distance filter: ${profiles.length} -> ${filteredProfiles.length} profiles within ${userMaxDistance}km`);
      } else {
        console.log('No distance filtering applied - missing coordinates or preference');
      }

      // Add empty images array to match interface
      const profilesWithImages = filteredProfiles.map(profile => ({
        ...profile,
        images: [] // Will be loaded separately
      }));

      const shuffled = profilesWithImages.sort(() => 0.5 - Math.random());

      // Load last profile ID and time from localStorage
      const savedId = localStorage.getItem('afrovibe_last_profile_id');
      const savedTime = parseInt(localStorage.getItem('afrovibe_last_profile_time') || '0');
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const isSavedValid = savedId && Date.now() - savedTime < twentyFourHours;

      let indexToShow = 0;
      if (isSavedValid) {
        const savedIndex = shuffled.findIndex(p => p.id === savedId);
        if (savedIndex !== -1) {
          indexToShow = savedIndex;
        }
      }

      setPotentialMatches(shuffled);
      setCurrentIndex(indexToShow);
      setLastShuffleTime(Date.now());

      // Preload images for the first 3 profiles
      preloadNextProfileImages(shuffled, {}, 0);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allowedGenders, toast]);


  // Preload images for the next N profiles (like LikedMePage)
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 0) return; // Already loaded
    
    try {
      // Always use basic query for now to avoid moderation column issues
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', profileId)
        .order('image_order', { ascending: true });

      if (error) throw error;

      if (images?.length) {
        setUserImages(prev => ({
          ...prev,
          [profileId]: images.map(img => img.image_url)
        }));
      }
    } catch (error) {
      console.error('Error loading user images:', error);
    }
  }, [userImages]);

  // Preload images for the next N profiles for smoother UX
  const preloadNextProfileImages = useCallback((matches: PotentialMatch[], alreadyLoaded: { [key: string]: string[] }, startIdx: number) => {
    // Preload for the next 2 profiles (can adjust as needed)
    const toPreload = matches.slice(startIdx, startIdx + 2).filter(match => !alreadyLoaded[match.id] || alreadyLoaded[match.id]?.length === 0);
    for (const match of toPreload) {
      void loadFullImages(match.id);
    }
  }, [loadFullImages]);

  useEffect(() => {
    if (currentUser?.id) {
      fetchPotentialMatches();
    }
  }, [currentUser?.id, fetchPotentialMatches]);

  // Save current match state
  useEffect(() => {
    if (potentialMatches.length > 0) {
      localStorage.setItem('afrovibe_last_profile_id', potentialMatches[currentIndex]?.id || '');
      localStorage.setItem('afrovibe_last_profile_time', Date.now().toString());
    }
  }, [currentIndex, potentialMatches]);

  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false);
    // Load images for current match if not already loaded
    const currentMatch = potentialMatches[currentIndex];
    if (currentMatch && !userImages[currentMatch.id]) {
      loadFullImages(currentMatch.id);
    }
    // Preload images for the next 2 profiles
    preloadNextProfileImages(potentialMatches, userImages, currentIndex + 1);
  }, [currentIndex, potentialMatches, userImages, preloadNextProfileImages, loadFullImages]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setCurrentX(touch.clientX);
    setCurrentY(touch.clientY);
    setIsDragging(true);
    setSwipeDirection(null);
    setSwipeDistance(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setCurrentX(touch.clientX);
    setCurrentY(touch.clientY);
    
    const deltaX = touch.clientX - startX;
    const deltaY = Math.abs(touch.clientY - startY);
    
    // Only show swipe feedback if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > deltaY) {
      setSwipeDistance(Math.abs(deltaX));
      setSwipeDirection(deltaX > 0 ? 'right' : 'left');
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
  
    const deltaX = currentX - startX;
    const deltaY = Math.abs(currentY - startY);
    const screenWidth = window.innerWidth;
    const minSwipeDistance = screenWidth * 0.4;
  
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        handleLike();
      } else {
        handlePass();
      }
    }
  
    // Reset values
    setStartX(0);
    setStartY(0);
    setCurrentX(0);
    setCurrentY(0);
    setSwipeDirection(null);
    setSwipeDistance(0);
  };

  // Mouse event handlers for swipe on desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setStartY(e.clientY);
    setCurrentX(e.clientX);
    setCurrentY(e.clientY);
    setIsDragging(true);
    setSwipeDirection(null);
    setSwipeDistance(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCurrentX(e.clientX);
    setCurrentY(e.clientY);
    
    const deltaX = e.clientX - startX;
    const deltaY = Math.abs(e.clientY - startY);
    
    // Only show swipe feedback if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > deltaY) {
      setSwipeDistance(Math.abs(deltaX));
      setSwipeDirection(deltaX > 0 ? 'right' : 'left');
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaX = currentX - startX;
    const deltaY = Math.abs(e.clientY - startY);
    const minSwipeDistance = 80;

    // Only trigger swipe if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swipe right - like
        handleLike();
      } else {
        // Swipe left - dislike
        handlePass();
      }
    }

    // Reset values
    setStartX(0);
    setStartY(0);
    setCurrentX(0);
    setCurrentY(0);
    setSwipeDirection(null);
    setSwipeDistance(0);
  };

  const handleImageAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent swipe action if dragging occurred
    if (Math.abs(currentX - startX) > 10) return;

    // This function is now mainly used for compatibility
    // The actual image/slide navigation is handled within MatchCard
  };

  // Function to check if a profile is verified (90%+ completion with photos and basic info)
  const calculateProfileVerification = useCallback((profile: PotentialMatch) => {
    if (!profile) return false;

    // Check if profile has at least 3 images (similar to ProfilePage logic)
    const profileImages = userImages[profile.id] || [];
    const hasEnoughPhotos = profileImages.length >= 3;

    // Check basic info completion (fields available in PotentialMatch)
    const hasBasicInfo = !!(
      profile.first_name?.trim() &&
      profile.last_name?.trim() &&
      profile.bio?.trim() &&
      profile.date_of_birth
    );

    // Check other available completion criteria
    const hasLocation = !!(profile.city?.trim() && profile.country?.trim());
    const hasWork = !!(profile.occupation?.trim() && profile.education_level);
    const hasInterests = (profile.interests || []).length >= 3;

    // Simplified completion check - count completed sections out of 5 key areas
    let completedSections = 0;
    const totalSections = 5;

    if (hasEnoughPhotos) completedSections += 1; // Photos
    if (hasBasicInfo) completedSections += 1; // Basic info 
    if (hasLocation) completedSections += 1; // Location
    if (hasWork) completedSections += 1; // Work & Education
    if (hasInterests) completedSections += 1; // Interests

    const completionPercentage = Math.round((completedSections / totalSections) * 100);

    // Return verified if 80%+ (4/5 sections) AND has photos + basic info
    return completionPercentage >= 80 && hasEnoughPhotos && hasBasicInfo;
  }, [userImages]);

  // Optimistic UI: move to next card instantly, then process like in background
  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    moveToNext(); // Move UI instantly

    // Check swipe limit before proceeding (but UI is already updated)
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

      const { data: mutualLike, error: mutualError } = await supabase
        .from('likes')
        .select('*')
        .match({ liker_id: currentMatch.id, liked_id: currentUser.id })
        .maybeSingle();

      if (mutualError) {
        console.error('Error checking mutual like:', mutualError.message);
      }

      if (mutualLike) {
        setMatchedUser(currentMatch);
        setShowMatchAnimation(true);
      }
    } catch (error) {
      console.error('Error liking user:', error);
      toast({
        title: 'Error',
        description: 'Failed to like user. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Optimistic UI: move to next card instantly, then process pass in background
  const handlePass = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    moveToNext(); // Move UI instantly

    // Check swipe limit before proceeding (but UI is already updated)
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
      const { error } = await supabase.from('passes').insert({
        passer_id: currentUser.id,
        passed_id: currentMatch.id
      });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving pass:', err);
      toast({
        title: 'Error',
        description: 'Could not skip this profile.',
        variant: 'destructive'
      });
    }
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
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-full max-w-lg">
          <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} />
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={() => setShowPremiumUpgrade(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
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
  // Use preloaded images for current and next card
  const currentMatchImages = currentMatch ? (userImages[currentMatch.id] || []) : [];
  const nextMatch = potentialMatches[currentIndex + 1];
  const nextMatchImages = nextMatch ? (userImages[nextMatch.id] || []) : [];

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

  // Calculate swipe overlay opacity and transform
  const swipeOpacity = Math.min(swipeDistance / 100, 0.8);
  const cardTransform = isDragging ? `translateX(${currentX - startX}px) rotate(${(currentX - startX) * 0.1}deg)` : '';



  return (
    <div className="h-full w-full fixed top-0 left-0 overflow-hidden">
      {/* Main Image Area - Card stack */}
      <div className="flex-1 relative overflow-hidden h-[calc(100vh-80px)]">
        {/* Next card (preloaded, below) */}
        {nextMatch && (
          <div
            className={`absolute inset-0 z-0 scale-95 opacity-80 pointer-events-none transition-all duration-300 ${isDragging ? 'blur-[1.5px]' : ''}`}
            style={{
              filter: isDragging ? 'blur(1.5px)' : 'none',
              transition: 'filter 0.2s, opacity 0.2s, transform 0.2s',
            }}
          >
            {nextMatchImages.length > 0 ? (
              <img
                src={nextMatchImages[0]}
                alt={`${nextMatch.first_name}'s photo`}
                className="w-full h-full object-cover object-center"
                draggable={false}
                loading="eager"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
                <span className="text-6xl font-bold text-gray-700">
                  {nextMatch.first_name?.[0]}{nextMatch.last_name?.[0]}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
          </div>
        )}

        {/* Current card (top) */}
        <div
          className="h-full w-full cursor-pointer select-none relative z-10"
          style={{
            transform: cardTransform,
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: isDragging ? '0 8px 32px 0 rgba(0,0,0,0.25)' : '0 4px 16px 0 rgba(0,0,0,0.10)'
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleImageAreaClick}
        >
          {/* Swipe Feedback Overlays */}
          {isDragging && swipeDirection && (
            <>
              {/* Like Overlay (Right Swipe) */}
              {swipeDirection === 'right' && (
                <div
                  className="absolute inset-0 bg-green-500/20 flex items-center justify-center z-20 pointer-events-none"
                  style={{ opacity: swipeOpacity }}
                >
                  <div className="bg-green-500 text-white px-8 py-4 rounded-full font-bold text-2xl shadow-lg transform rotate-12">
                    <Heart className="w-8 h-8 inline mr-2" />
                    LIKE
                  </div>
                </div>
              )}

              {/* Dislike Overlay (Left Swipe) */}
              {swipeDirection === 'left' && (
                <div
                  className="absolute inset-0 bg-red-500/20 flex items-center justify-center z-20 pointer-events-none"
                  style={{ opacity: swipeOpacity }}
                >
                  <div className="bg-red-500 text-white px-8 py-4 rounded-full font-bold text-2xl shadow-lg transform -rotate-12">
                    <X className="w-8 h-8 inline mr-2" />
                    NOPE
                  </div>
                </div>
              )}
            </>
          )}

          <MatchCard
            match={currentMatch}
            imageIndex={imageIndex}
            showMoreInfo={showMoreInfo}
            isPremium={isPremium()}
            userImages={currentMatchImages}
            currentUserLatitude={currentUser.latitude}
            currentUserLongitude={currentUser.longitude}
            onImageClick={() => handleImageAreaClick({} as React.MouseEvent<HTMLDivElement>)}
            onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
            calculateAge={calculateAge}
            calculateDistance={calculateDistance}
            swipeDirection={swipeDirection}
            swipeDistance={swipeDistance}
            isVerified={calculateProfileVerification(currentMatch)} // Pass verification status
          />
        </div>

        {/* Action Buttons */}
        <SwipeButtons
          onPass={handlePass}
          onReverse={handleReverse}
          onLike={handleLike}
          canReverse={passedUsers.length > 0}
        />
      </div>
    </div>
  );
}

export default DiscoverPage;

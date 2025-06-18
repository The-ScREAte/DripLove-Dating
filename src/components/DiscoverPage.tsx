import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, MapPin, Calendar, Briefcase, GraduationCap, Dumbbell, Wine, Cigarette, Shield, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BlockDialog from './BlockDialog';

interface DiscoverPageProps {
  currentUser: any;
}

const DiscoverPage = ({ currentUser }: DiscoverPageProps) => {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [passedProfiles, setPassedProfiles] = useState<any[]>([]);
  const { toast } = useToast();
  
  // Touch/swipe handling
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Minimum swipe distance to trigger action
  const minSwipeDistance = 50;

  useEffect(() => {
    fetchProfiles();
  }, [currentUser]);

  // Reset image index when profile changes
  useEffect(() => {
    setCurrentImageIndex(0);
    setShowDetails(false);
  }, [currentIndex]);

  const fetchProfiles = async () => {
    if (!currentUser?.id) return;
    
    try {
      // Get profiles that current user hasn't liked yet
      const { data: likedProfiles } = await supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', currentUser.id);
      
      const likedIds = likedProfiles?.map(like => like.liked_id) || [];
      
      // Get blocked users (both directions)
      const { data: blockedUsers } = await supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);
      
      const blockedIds = blockedUsers?.map(block => 
        block.blocker_id === currentUser.id ? block.blocked_id : block.blocker_id
      ) || [];
      
      // Get matched users
      const { data: matches } = await supabase
        .from('matches')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
      
      const matchedIds = matches?.map(match => 
        match.user1_id === currentUser.id ? match.user2_id : match.user1_id
      ) || [];
      
      // Combine all excluded IDs
      const excludedIds = [...likedIds, ...blockedIds, ...matchedIds];
      
      let query = supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUser.id)
        .limit(10);
      
      if (excludedIds.length > 0) {
        query = query.not('id', 'in', `(${excludedIds.join(',')})`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Fetch images for each profile
      if (data && data.length > 0) {
        const imagePromises = data.map(async (profile) => {
          const { data: images } = await supabase
            .from('user_images')
            .select('image_url')
            .eq('user_id', profile.id)
            .order('image_order');
          
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
      
      setProfiles(data || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        title: "Error",
        description: "Failed to load profiles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

  const handleSwipe = async (direction: 'like' | 'pass') => {
    const currentProfile = profiles[currentIndex];
    
    if (direction === 'like') {
      try {
        const { error } = await supabase
          .from('likes')
          .insert({
            liker_id: currentUser.id,
            liked_id: currentProfile.id
          });
        
        if (error) throw error;
        
        // Check if it's a match
        const { data: existingLike } = await supabase
          .from('likes')
          .select('*')
          .eq('liker_id', currentProfile.id)
          .eq('liked_id', currentUser.id)
          .single();
        
        if (existingLike) {
          toast({
            title: "It's a Match! 🎉",
            description: `You and ${currentProfile.first_name} liked each other!`,
          });
        } else {
          toast({
            title: "Liked!",
            description: `You liked ${currentProfile.first_name}`,
          });
        }
      } catch (error) {
        console.error('Error liking profile:', error);
        toast({
          title: "Error",
          description: "Failed to like profile",
          variant: "destructive",
        });
        return;
      }
    } else if (direction === 'pass') {
      // Store passed profile for potential reversal
      setPassedProfiles(prev => [...prev, currentProfile]);
    }
    
    setCurrentIndex(prev => prev + 1);
  };

  const handleReverse = () => {
    if (passedProfiles.length > 0 && currentIndex > 0) {
      const lastPassedProfile = passedProfiles[passedProfiles.length - 1];
      
      // Insert the passed profile back to the current position
      setProfiles(prev => {
        const newProfiles = [...prev];
        newProfiles.splice(currentIndex, 0, lastPassedProfile);
        return newProfiles;
      });
      
      // Remove from passed profiles
      setPassedProfiles(prev => prev.slice(0, -1));
      
      toast({
        title: "Profile restored",
        description: `${lastPassedProfile.first_name} is back in your queue`,
      });
    }
  };

  // Touch handlers for swipe functionality
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isLeftSwipe = distanceX > minSwipeDistance;
    const isRightSwipe = distanceX < -minSwipeDistance;
    const isVerticalSwipe = Math.abs(distanceY) > Math.abs(distanceX);
    
    // Only process horizontal swipes
    if (!isVerticalSwipe) {
      if (isLeftSwipe) {
        handleSwipe('pass');
      } else if (isRightSwipe) {
        handleSwipe('like');
      }
    }
  };

  const handleBlock = () => {
    setBlockDialogOpen(true);
  };

  const handleBlockSuccess = () => {
    setProfiles(prev => prev.filter((_, index) => index !== currentIndex));
    if (currentIndex >= profiles.length - 1) {
      setCurrentIndex(0);
    }
  };

  const nextImage = () => {
    const profileImages = userImages[profiles[currentIndex]?.id] || [];
    if (currentImageIndex < profileImages.length - 1) {
      setCurrentImageIndex(prev => prev + 1);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(prev => prev - 1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (profiles.length === 0 || currentIndex >= profiles.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No more profiles</h2>
            <p className="text-gray-600 mb-4">Check back later for new matches!</p>
            <Button 
              onClick={fetchProfiles}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const profileImages = userImages[currentProfile.id] || [];
  const currentImage = profileImages[currentImageIndex];

  return (
    <div className="h-full relative overflow-hidden">
      {/* Full-screen background image */}
      <div 
        className="absolute inset-0"
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {currentImage ? (
          <img
            src={currentImage}
            alt={`${currentProfile.first_name}'s photo`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
            <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center">
              <span className="text-4xl font-bold text-gray-700">
                {currentProfile.first_name?.[0]}{currentProfile.last_name?.[0]}
              </span>
            </div>
          </div>
        )}
        
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black bg-opacity-30"></div>
      </div>

      {/* Top controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <div className="flex space-x-2">
          <Button
            onClick={handleBlock}
            variant="outline"
            size="sm"
            className="bg-white/80 hover:bg-white border-white"
          >
            <Shield className="w-4 h-4" />
          </Button>
          
          {passedProfiles.length > 0 && (
            <Button
              onClick={handleReverse}
              variant="outline"
              size="sm"
              className="bg-white/80 hover:bg-white border-white"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        {profileImages.length > 1 && (
          <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
            {currentImageIndex + 1} / {profileImages.length}
          </div>
        )}
      </div>

      {/* Image navigation */}
      {profileImages.length > 1 && (
        <>
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
            disabled={currentImageIndex === 0}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
            disabled={currentImageIndex === profileImages.length - 1}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Swipe indicators */}
      <div className="absolute top-1/2 left-8 transform -translate-y-1/2 z-10 opacity-50">
        <div className="text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
          ← Pass
        </div>
      </div>
      <div className="absolute top-1/2 right-8 transform -translate-y-1/2 z-10 opacity-50">
        <div className="text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
          Like →
        </div>
      </div>

      {/* Bottom content overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent text-white p-6 z-10">
        {/* Basic info always visible */}
        <div className="mb-4">
          <h2 className="text-3xl font-bold">
            {currentProfile.first_name} {currentProfile.last_name}
          </h2>
          <div className="flex items-center text-white/90 mt-2">
            <Calendar className="w-4 h-4 mr-1" />
            <span>{calculateAge(currentProfile.date_of_birth)} years old</span>
          </div>
          <div className="flex items-center text-white/90 mt-1">
            <MapPin className="w-4 h-4 mr-1" />
            <span>{currentProfile.city}, {currentProfile.country}</span>
          </div>
        </div>

        {/* Toggle button for more details */}
        <Button
          onClick={() => setShowDetails(!showDetails)}
          variant="outline"
          size="sm"
          className="mb-4 bg-white/20 border-white/30 text-white hover:bg-white/30"
        >
          {showDetails ? 'Show Less' : 'Show More'}
        </Button>

        {/* Expandable details */}
        {showDetails && (
          <div className="space-y-4 mb-4 max-h-48 overflow-y-auto">
            {(currentProfile.occupation || currentProfile.industry || currentProfile.education_level) && (
              <div>
                <h3 className="font-semibold text-white mb-2">Work & Experience</h3>
                <div className="space-y-1">
                  {currentProfile.occupation && (
                    <div className="flex items-center text-white/90 text-sm">
                      <Briefcase className="w-4 h-4 mr-2" />
                      <span>{currentProfile.occupation}</span>
                      {currentProfile.industry && <span className="text-white/70 ml-1">at {currentProfile.industry}</span>}
                    </div>
                  )}
                  {currentProfile.education_level && (
                    <div className="flex items-center text-white/90 text-sm">
                      <GraduationCap className="w-4 h-4 mr-2" />
                      <span>{currentProfile.education_level}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(currentProfile.exercise_level || currentProfile.drinking || currentProfile.smoking) && (
              <div>
                <h3 className="font-semibold text-white mb-2">Lifestyle</h3>
                <div className="flex flex-wrap gap-2">
                  {currentProfile.exercise_level && (
                    <span className="flex items-center px-2 py-1 bg-white/20 text-white rounded-full text-xs">
                      <Dumbbell className="w-3 h-3 mr-1" />
                      {currentProfile.exercise_level}
                    </span>
                  )}
                  {currentProfile.drinking && (
                    <span className="flex items-center px-2 py-1 bg-white/20 text-white rounded-full text-xs">
                      <Wine className="w-3 h-3 mr-1" />
                      {currentProfile.drinking}
                    </span>
                  )}
                  {currentProfile.smoking && (
                    <span className="flex items-center px-2 py-1 bg-white/20 text-white rounded-full text-xs">
                      <Cigarette className="w-3 h-3 mr-1" />
                      {currentProfile.smoking}
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {currentProfile.bio && (
              <div>
                <p className="text-white/90">{currentProfile.bio}</p>
              </div>
            )}
            
            {currentProfile.interests && currentProfile.interests.length > 0 && (
              <div>
                <h3 className="font-semibold text-white mb-2">Interests</h3>
                <div className="flex flex-wrap gap-2">
                  {currentProfile.interests.map((interest: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-white/20 text-white rounded-full text-sm"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Action buttons */}
        <div className="flex space-x-4">
          <Button
            onClick={() => handleSwipe('pass')}
            variant="outline"
            size="lg"
            className="flex-1 border-2 border-white/50 bg-white/20 text-white hover:bg-white/30"
          >
            <X className="w-6 h-6" />
          </Button>
          <Button
            onClick={() => handleSwipe('like')}
            size="lg"
            className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 border-0"
          >
            <Heart className="w-6 h-6" />
          </Button>
        </div>
      </div>

      <BlockDialog
        isOpen={blockDialogOpen}
        onClose={() => setBlockDialogOpen(false)}
        userToBlock={currentProfile}
        currentUserId={currentUser.id}
        onBlockSuccess={handleBlockSuccess}
      />
    </div>
  );
};

export default DiscoverPage;

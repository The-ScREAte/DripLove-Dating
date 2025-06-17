import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Heart, X, MapPin, Calendar, Briefcase, GraduationCap, Dumbbell, Wine, Cigarette, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BlockDialog from './BlockDialog';

interface DiscoverPageProps {
  currentUser: any;
}

const DiscoverPage = ({ currentUser }: DiscoverPageProps) => {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfiles();
  }, [currentUser]);

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
        return; // Don't proceed to next profile if there was an error
      }
    }
    
    setCurrentIndex(prev => prev + 1);
  };

  const handleBlock = () => {
    setBlockDialogOpen(true);
  };

  const handleBlockSuccess = () => {
    // Remove the current profile from the list
    setProfiles(prev => prev.filter((_, index) => index !== currentIndex));
    // Reset current index if needed
    if (currentIndex >= profiles.length - 1) {
      setCurrentIndex(0);
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
        <Card className="w-full max-w-md">
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

  return (
    <div className="max-w-md mx-auto">
      <Card className="overflow-hidden shadow-2xl">
        <div className="relative h-96">
          {profileImages.length > 0 ? (
            profileImages.length === 1 ? (
              <img
                src={profileImages[0]}
                alt={`${currentProfile.first_name}'s photo`}
                className="w-full h-full object-cover"
              />
            ) : (
              <Carousel className="w-full h-full">
                <CarouselContent>
                  {profileImages.map((imageUrl, index) => (
                    <CarouselItem key={index}>
                      <img
                        src={imageUrl}
                        alt={`${currentProfile.first_name}'s photo ${index + 1}`}
                        className="w-full h-96 object-cover"
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {profileImages.length > 1 && (
                  <>
                    <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2" />
                    <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2" />
                  </>
                )}
              </Carousel>
            )
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center">
                <span className="text-4xl font-bold text-gray-700">
                  {currentProfile.first_name?.[0]}{currentProfile.last_name?.[0]}
                </span>
              </div>
            </div>
          )}
          
          {profileImages.length > 1 && (
            <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded-full text-sm">
              {profileImages.length} photos
            </div>
          )}

          {/* Block button */}
          <Button
            onClick={handleBlock}
            variant="outline"
            size="sm"
            className="absolute top-4 left-4 bg-white/80 hover:bg-white"
          >
            <Shield className="w-4 h-4" />
          </Button>
        </div>
        
        <CardContent className="p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-800">
              {currentProfile.first_name} {currentProfile.last_name}
            </h2>
            <div className="flex items-center text-gray-600 mt-2">
              <Calendar className="w-4 h-4 mr-1" />
              <span>{calculateAge(currentProfile.date_of_birth)} years old</span>
            </div>
            <div className="flex items-center text-gray-600 mt-1">
              <MapPin className="w-4 h-4 mr-1" />
              <span>{currentProfile.city}, {currentProfile.country}</span>
            </div>
          </div>

          {/* Work & Experience */}
          {(currentProfile.occupation || currentProfile.industry || currentProfile.education_level) && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-800 mb-2">Work & Experience</h3>
              <div className="space-y-1">
                {currentProfile.occupation && (
                  <div className="flex items-center text-gray-600 text-sm">
                    <Briefcase className="w-4 h-4 mr-2" />
                    <span>{currentProfile.occupation}</span>
                    {currentProfile.industry && <span className="text-gray-500 ml-1">at {currentProfile.industry}</span>}
                  </div>
                )}
                {currentProfile.education_level && (
                  <div className="flex items-center text-gray-600 text-sm">
                    <GraduationCap className="w-4 h-4 mr-2" />
                    <span>{currentProfile.education_level}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lifestyle */}
          {(currentProfile.exercise_level || currentProfile.drinking || currentProfile.smoking) && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-800 mb-2">Lifestyle</h3>
              <div className="flex flex-wrap gap-2">
                {currentProfile.exercise_level && (
                  <span className="flex items-center px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                    <Dumbbell className="w-3 h-3 mr-1" />
                    {currentProfile.exercise_level}
                  </span>
                )}
                {currentProfile.drinking && (
                  <span className="flex items-center px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                    <Wine className="w-3 h-3 mr-1" />
                    {currentProfile.drinking}
                  </span>
                )}
                {currentProfile.smoking && (
                  <span className="flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                    <Cigarette className="w-3 h-3 mr-1" />
                    {currentProfile.smoking}
                  </span>
                )}
              </div>
            </div>
          )}
          
          {currentProfile.bio && (
            <div className="mb-4">
              <p className="text-gray-700">{currentProfile.bio}</p>
            </div>
          )}
          
          {currentProfile.interests && currentProfile.interests.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-2">Interests</h3>
              <div className="flex flex-wrap gap-2">
                {currentProfile.interests.map((interest: string, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex space-x-4">
            <Button
              onClick={() => handleSwipe('pass')}
              variant="outline"
              size="lg"
              className="flex-1 border-2 border-gray-300 hover:border-gray-400"
            >
              <X className="w-6 h-6 text-gray-600" />
            </Button>
            <Button
              onClick={() => handleSwipe('like')}
              size="lg"
              className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            >
              <Heart className="w-6 h-6" />
            </Button>
          </div>
        </CardContent>
      </Card>

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

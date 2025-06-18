
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Undo2, MapPin, Briefcase, GraduationCap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DiscoverPageProps {
  currentUser: any;
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
  interests: string[];
  images: string[];
}

interface PassedUser {
  user_id: string;
  passed_at: Date;
}

const DiscoverPage = ({ currentUser }: DiscoverPageProps) => {
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [passedUsers, setPassedUsers] = useState<PassedUser[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchPotentialMatches();
  }, [currentUser]);

  const fetchPotentialMatches = async () => {
    if (!currentUser?.id) return;

    try {
      setIsLoading(true);

      // Get users that the current user has already liked
      const { data: likedUsers } = await supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', currentUser.id);

      // Get users that the current user has blocked or been blocked by
      const { data: blockedUsers } = await supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const excludedIds = [...likedUserIds, ...blockedUserIds, currentUser.id];

      console.log('Excluded IDs:', excludedIds);

      // Fetch potential matches
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .eq('account_status', 'active')
        .limit(10);

      if (error) throw error;

      console.log('Fetched profiles:', profiles);

      // Fetch images for each profile
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

      setPotentialMatches(matchesWithImages);
    } catch (error) {
      console.error('Error fetching potential matches:', error);
      toast({
        title: "Error",
        description: "Failed to load potential matches. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    try {
      console.log('Liking user:', currentMatch.id);

      const { error } = await supabase
        .from('likes')
        .insert({
          liker_id: currentUser.id,
          liked_id: currentMatch.id
        });

      if (error) throw error;

      // Check if it's a mutual like
      const { data: mutualLike } = await supabase
        .from('likes')
        .select('*')
        .eq('liker_id', currentMatch.id)
        .eq('liked_id', currentUser.id)
        .single();

      if (mutualLike) {
        toast({
          title: "It's a Match! 🎉",
          description: `You and ${currentMatch.first_name} liked each other!`,
        });
      }

      moveToNext();
    } catch (error) {
      console.error('Error liking user:', error);
      toast({
        title: "Error",
        description: "Failed to like user. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePass = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Add to passed users for potential reversal
    setPassedUsers(prev => [{
      user_id: currentMatch.id,
      passed_at: new Date()
    }, ...prev]);

    moveToNext();
  };

  const handleReverse = () => {
    if (passedUsers.length === 0) return;

    const lastPassedUser = passedUsers[0];
    
    // Find the passed user in potential matches or create a new entry
    const passedUserData = potentialMatches.find(match => match.id === lastPassedUser.user_id);
    
    if (passedUserData) {
      // Insert the passed user back at the current position
      const newMatches = [...potentialMatches];
      newMatches.splice(currentIndex, 0, passedUserData);
      setPotentialMatches(newMatches);
    }

    // Remove from passed users
    setPassedUsers(prev => prev.slice(1));

    toast({
      title: "Reversed",
      description: "Brought back the last passed user.",
    });
  };

  const moveToNext = () => {
    if (currentIndex < potentialMatches.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // No more matches, try to fetch more
      fetchPotentialMatches();
      setCurrentIndex(0);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  const currentMatch = potentialMatches[currentIndex];

  if (!currentMatch) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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
    <div className="max-w-md mx-auto p-4">
      <Card className="relative overflow-hidden">
        {/* Main Image */}
        <div className="relative h-96">
          {currentMatch.images && currentMatch.images.length > 0 ? (
            <img 
              src={currentMatch.images[0]} 
              alt={`${currentMatch.first_name}'s photo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
              <span className="text-gray-500">No photo available</span>
            </div>
          )}
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          
          {/* Basic info overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
            <h2 className="text-2xl font-bold">
              {currentMatch.first_name} {currentMatch.last_name}
            </h2>
            <div className="flex items-center mt-2 space-x-4 text-sm">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-1" />
                <span>{currentMatch.city}, {currentMatch.country}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <CardContent className="p-4">
          {currentMatch.bio && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-800 mb-2">About</h3>
              <p className="text-gray-600">{currentMatch.bio}</p>
            </div>
          )}

          {(currentMatch.occupation || currentMatch.education_level) && (
            <div className="mb-4 space-y-2">
              {currentMatch.occupation && (
                <div className="flex items-center text-sm text-gray-600">
                  <Briefcase className="w-4 h-4 mr-2" />
                  <span>{currentMatch.occupation}</span>
                </div>
              )}
              {currentMatch.education_level && (
                <div className="flex items-center text-sm text-gray-600">
                  <GraduationCap className="w-4 h-4 mr-2" />
                  <span>{currentMatch.education_level}</span>
                </div>
              )}
            </div>
          )}

          {currentMatch.interests && currentMatch.interests.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-800 mb-2">Interests</h3>
              <div className="flex flex-wrap gap-2">
                {currentMatch.interests.slice(0, 6).map((interest, index) => (
                  <span 
                    key={index}
                    className="px-3 py-1 bg-pink-100 text-pink-800 rounded-full text-sm"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        {/* Action Buttons */}
        <div className="p-4 bg-gray-50">
          <div className="flex justify-center space-x-4">
            <Button
              onClick={handlePass}
              variant="outline"
              size="lg"
              className="w-14 h-14 rounded-full border-2 border-gray-300 hover:border-red-500 hover:bg-red-50"
            >
              <X className="w-6 h-6 text-gray-600 hover:text-red-500" />
            </Button>

            <Button
              onClick={handleReverse}
              variant="outline"
              size="lg"
              disabled={passedUsers.length === 0}
              className="w-14 h-14 rounded-full border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50"
            >
              <Undo2 className="w-6 h-6 text-gray-600 hover:text-blue-500" />
            </Button>

            <Button
              onClick={handleLike}
              variant="outline"
              size="lg"
              className="w-14 h-14 rounded-full border-2 border-pink-300 hover:border-pink-500 hover:bg-pink-50"
            >
              <Heart className="w-6 h-6 text-pink-500" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Progress indicator */}
      <div className="mt-4 text-center text-sm text-gray-500">
        {currentIndex + 1} of {potentialMatches.length} profiles
        {passedUsers.length > 0 && (
          <span className="ml-2">• {passedUsers.length} passed</span>
        )}
      </div>
    </div>
  );
};

export default DiscoverPage;

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Heart, X, Calendar, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LikedMePageProps {
  currentUser: any;
}

const LikedMePage = ({ currentUser }: LikedMePageProps) => {
  const [likers, setLikers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchLikers();
  }, [currentUser]);

  const fetchLikers = async () => {
    if (!currentUser?.id) return;

    try {
      // Get people who liked the current user
      const { data: likes, error } = await supabase
        .from('likes')
        .select(`
          *,
          liker:profiles!likes_liker_id_fkey(*)
        `)
        .eq('liked_id', currentUser.id);

      if (error) throw error;

      const likersData = likes?.map(like => like.liker) || [];
      
      // Fetch images for each liker
      if (likersData.length > 0) {
        const imagePromises = likersData.map(async (profile) => {
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

  const handleLikeBack = async (profileId: string) => {
    try {
      // Check if already liked back
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

      // Create the like back
      const { error: likeError } = await supabase
        .from('likes')
        .insert({
          liker_id: currentUser.id,
          liked_id: profileId
        });

      if (likeError) throw likeError;

      toast({
        title: "It's a Match! 🎉",
        description: "You can now start chatting!",
      });

      // Remove from likers list since they're now matched
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
      // Remove the like from the likes table
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('liker_id', profileId)
        .eq('liked_id', currentUser.id);

      if (error) throw error;

      toast({
        title: "Passed",
        description: "Profile removed from your likes",
      });

      // Remove from likers list
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (selectedProfile) {
    const profileImages = userImages[selectedProfile.id] || [];
    
    return (
      <div className="max-w-md mx-auto">
        <Button 
          onClick={() => setSelectedProfile(null)}
          variant="outline"
          className="mb-4"
        >
          ← Back to likes
        </Button>
        
        <Card className="overflow-hidden shadow-2xl">
          <div className="relative h-96">
            {profileImages.length > 0 ? (
              <img
                src={profileImages[0]}
                alt={`${selectedProfile.first_name}'s photo`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
                <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center">
                  <span className="text-4xl font-bold text-gray-700">
                    {selectedProfile.first_name?.[0]}{selectedProfile.last_name?.[0]}
                  </span>
                </div>
              </div>
            )}
            
            {profileImages.length > 1 && (
              <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded-full text-sm">
                +{profileImages.length - 1} photos
              </div>
            )}
          </div>
          
          <CardContent className="p-6">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-gray-800">
                {selectedProfile.first_name} {selectedProfile.last_name}
              </h2>
              <div className="flex items-center text-gray-600 mt-2">
                <Calendar className="w-4 h-4 mr-1" />
                <span>{calculateAge(selectedProfile.date_of_birth)} years old</span>
              </div>
              <div className="flex items-center text-gray-600 mt-1">
                <MapPin className="w-4 h-4 mr-1" />
                <span>{selectedProfile.city}, {selectedProfile.country}</span>
              </div>
            </div>
            
            {selectedProfile.bio && (
              <div className="mb-4">
                <p className="text-gray-700">{selectedProfile.bio}</p>
              </div>
            )}
            
            {selectedProfile.interests && selectedProfile.interests.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-2">Interests</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedProfile.interests.map((interest: string, index: number) => (
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
                onClick={() => handlePass(selectedProfile.id)}
                variant="outline"
                size="lg"
                className="flex-1 border-2 border-gray-300 hover:border-gray-400"
              >
                <X className="w-6 h-6 text-gray-600" />
              </Button>
              <Button
                onClick={() => handleLikeBack(selectedProfile.id)}
                size="lg"
                className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              >
                <Heart className="w-6 h-6" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="w-6 h-6 text-pink-600" />
            <span>People who liked you ({likers.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {likers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">No new likes</h3>
              <p className="text-gray-600">Keep swiping! Someone special is waiting to find you.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {likers.map((liker) => {
                const profileImages = userImages[liker.id] || [];
                return (
                  <Card 
                    key={liker.id} 
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedProfile(liker)}
                  >
                    <div className="relative h-48">
                      {profileImages.length > 0 ? (
                        <img
                          src={profileImages[0]}
                          alt={`${liker.first_name}'s photo`}
                          className="w-full h-full object-cover rounded-t-lg"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center rounded-t-lg">
                          <span className="text-2xl font-bold text-gray-700">
                            {liker.first_name?.[0]}{liker.last_name?.[0]}
                          </span>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-semibold text-gray-800 truncate">
                        {liker.first_name}, {calculateAge(liker.date_of_birth)}
                      </h3>
                      <p className="text-sm text-gray-600 truncate">
                        {liker.city}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LikedMePage;

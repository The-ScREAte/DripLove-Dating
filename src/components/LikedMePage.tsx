import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Heart, X, Calendar, MapPin, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BlockDialog from './BlockDialog';

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
  const { toast } = useToast();

  useEffect(() => {
    fetchLikers();
  }, [currentUser]);

  useEffect(() => {
    setImageIndex(0);
  }, [selectedProfile]);

  const fetchLikers = async () => {
    if (!currentUser?.id) return;

    try {
      const { data: likes, error } = await supabase
        .from('likes')
        .select(`*, liker:profiles!likes_liker_id_fkey(*)`)
        .eq('liked_id', currentUser.id);

      if (error) throw error;

      const { data: matches } = await supabase
        .from('matches')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);

      const matchedIds = matches?.map(match =>
        match.user1_id === currentUser.id ? match.user2_id : match.user1_id
      ) || [];

      const { data: blockedUsers } = await supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);

      const blockedIds = blockedUsers?.map(block =>
        block.blocker_id === currentUser.id ? block.blocked_id : block.blocker_id
      ) || [];

      const filteredLikes = likes?.filter(like =>
        !matchedIds.includes(like.liker.id) && !blockedIds.includes(like.liker.id)
      ) || [];

      const likersData = filteredLikes.map(like => like.liker);

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
        <Button onClick={() => setSelectedProfile(null)} variant="outline" className="mb-4">
          ← Back to likes
        </Button>

        <Card className="overflow-hidden shadow-2xl">
          <div className="relative h-96" onTouchEnd={handleTouch}>
            {profileImages.length > 0 ? (
              <>
                <img
                  src={profileImages[imageIndex]}
                  alt={`${selectedProfile.first_name}'s photo`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 flex gap-1">
                  {profileImages.map((_, idx) => (
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

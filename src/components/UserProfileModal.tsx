
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Heart, Briefcase, GraduationCap, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const UserProfileModal = ({ isOpen, onClose, userId }: UserProfileModalProps) => {
  const [profile, setProfile] = useState<any>(null);
  const [userImages, setUserImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserProfile();
      fetchUserImages();
    }
  }, [isOpen, userId]);

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserImages = async () => {
    try {
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', userId)
        .order('image_order', { ascending: true });

      if (error) throw error;
      setUserImages(images?.map(img => img.image_url) || []);
    } catch (error) {
      console.error('Error fetching user images:', error);
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

  if (!profile && !loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <p className="text-gray-500">Profile not found</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header with main image and basic info */}
            <div className="text-center">
              {userImages.length > 0 ? (
                <img 
                  src={userImages[0]} 
                  alt={`${profile?.first_name} ${profile?.last_name}`}
                  className="w-32 h-32 rounded-full mx-auto object-cover mb-4"
                />
              ) : (
                <Avatar className="w-32 h-32 mx-auto mb-4">
                  <AvatarFallback className="bg-pink-100 text-pink-700 text-2xl">
                    {profile?.first_name?.charAt(0)}{profile?.last_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              )}
              
              <h2 className="text-2xl font-bold text-gray-800">
                {profile?.first_name} {profile?.last_name}
              </h2>
              
              {profile?.date_of_birth && (
                <p className="text-gray-600 mb-2">
                  {calculateAge(profile.date_of_birth)} years old
                </p>
              )}
              
              {(profile?.city || profile?.country) && (
                <div className="flex items-center justify-center text-gray-600 mb-4">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span>{profile?.city}{profile?.city && profile?.country && ', '}{profile?.country}</span>
                </div>
              )}
            </div>

            {/* Bio */}
            {profile?.bio && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-gray-700 text-center italic">"{profile.bio}"</p>
                </CardContent>
              </Card>
            )}

            {/* Additional Images */}
            {userImages.length > 1 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <User className="w-4 h-4 mr-2 text-pink-600" />
                    More Photos
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {userImages.slice(1).map((image, index) => (
                      <img 
                        key={index}
                        src={image} 
                        alt={`Photo ${index + 2}`}
                        className="aspect-square object-cover rounded-lg"
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Basic Info */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3 flex items-center">
                  <Heart className="w-4 h-4 mr-2 text-pink-600" />
                  Looking For
                </h3>
                <div className="space-y-2">
                  {profile?.preference && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Interested in:</span>
                      <Badge variant="secondary" className="capitalize">{profile.preference}</Badge>
                    </div>
                  )}
                  {profile?.relationship_intent && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Looking for:</span>
                      <Badge variant="secondary" className="capitalize">{profile.relationship_intent}</Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Lifestyle */}
            {(profile?.smoking || profile?.drinking || profile?.exercise_level || profile?.sleeping_schedule) && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">Lifestyle</h3>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {profile?.smoking && (
                      <div>
                        <span className="text-gray-600">Smoking:</span>
                        <span className="block font-medium">{profile.smoking}</span>
                      </div>
                    )}
                    {profile?.drinking && (
                      <div>
                        <span className="text-gray-600">Drinking:</span>
                        <span className="block font-medium">{profile.drinking}</span>
                      </div>
                    )}
                    {profile?.exercise_level && (
                      <div>
                        <span className="text-gray-600">Exercise:</span>
                        <span className="block font-medium">{profile.exercise_level}</span>
                      </div>
                    )}
                    {profile?.sleeping_schedule && (
                      <div>
                        <span className="text-gray-600">Sleep:</span>
                        <span className="block font-medium">{profile.sleeping_schedule}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Work & Education */}
            {(profile?.occupation || profile?.industry || profile?.education_level) && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <Briefcase className="w-4 h-4 mr-2 text-pink-600" />
                    Work & Education
                  </h3>
                  <div className="space-y-3">
                    {profile?.occupation && (
                      <div>
                        <span className="text-gray-600">Occupation:</span>
                        <span className="block font-medium">{profile.occupation}</span>
                      </div>
                    )}
                    {profile?.industry && (
                      <div>
                        <span className="text-gray-600">Industry:</span>
                        <span className="block font-medium">{profile.industry}</span>
                      </div>
                    )}
                    {profile?.education_level && (
                      <div>
                        <span className="text-gray-600 flex items-center">
                          <GraduationCap className="w-4 h-4 mr-1" /> Education:
                        </span>
                        <span className="block font-medium">{profile.education_level}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Fun Questions */}
            {(profile?.fun_fact || profile?.perfect_first_date || profile?.last_googled) && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">Fun Facts</h3>
                  <div className="space-y-4">
                    {profile?.fun_fact && (
                      <div>
                        <span className="text-gray-600 font-medium">Fun fact about me:</span>
                        <p className="text-gray-800">{profile.fun_fact}</p>
                      </div>
                    )}
                    {profile?.perfect_first_date && (
                      <div>
                        <span className="text-gray-600 font-medium">My perfect first date:</span>
                        <p className="text-gray-800">{profile.perfect_first_date}</p>
                      </div>
                    )}
                    {profile?.last_googled && (
                      <div>
                        <span className="text-gray-600 font-medium">Last thing I googled:</span>
                        <p className="text-gray-800">{profile.last_googled}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Interests */}
            {profile?.interests && profile.interests.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">Interests</h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.interests.map((interest: string) => (
                      <Badge key={interest} variant="outline" className="bg-pink-50 text-pink-800 border-pink-200">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileModal;

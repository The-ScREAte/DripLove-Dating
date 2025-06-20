
import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, RotateCcw, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import PremiumUpgrade from './PremiumUpgrade';

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  bio: string;
  city: string;
  country: string;
  gender: string;
  age?: number;
  interests: string[];
  occupation?: string;
  education_level?: string;
  relationship_intent?: string;
  images?: { image_url: string; image_order: number }[];
}

interface DiscoverPageProps {
  currentUser: any;
}

const DiscoverPage = ({ currentUser }: DiscoverPageProps) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { toast } = useToast();
  const { subscription, checkUsageLimit, isPremium } = useSubscription(currentUser?.id);

  // Preload next profiles for faster experience
  const preloadProfiles = useCallback(async (offset = 0, limit = 10) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, bio, city, country, gender, date_of_birth,
          interests, occupation, education_level, relationship_intent,
          user_images!inner(image_url, image_order)
        `)
        .neq('id', currentUser.id)
        .eq('account_status', 'active')
        .not('id', 'in', `(
          SELECT liked_id FROM likes WHERE liker_id = '${currentUser.id}'
          UNION
          SELECT liker_id FROM likes WHERE liked_id = '${currentUser.id}'
          UNION
          SELECT blocked_id FROM blocks WHERE blocker_id = '${currentUser.id}'
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = '${currentUser.id}'
        )`)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const processedProfiles = data?.map(profile => ({
        ...profile,
        age: profile.date_of_birth ? 
          new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() : 
          undefined,
        images: profile.user_images?.sort((a, b) => a.image_order - b.image_order) || []
      })) || [];

      return processedProfiles;
    } catch (error) {
      console.error('Error fetching profiles:', error);
      return [];
    }
  }, [currentUser.id]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const fetchedProfiles = await preloadProfiles(0, 20);
    setProfiles(fetchedProfiles);
    setLoading(false);
  }, [preloadProfiles]);

  // Preload more profiles when getting close to the end
  useEffect(() => {
    if (currentIndex >= profiles.length - 3 && profiles.length > 0) {
      preloadProfiles(profiles.length, 10).then(newProfiles => {
        setProfiles(prev => [...prev, ...newProfiles]);
      });
    }
  }, [currentIndex, profiles.length, preloadProfiles]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const currentProfile = profiles[currentIndex];
  const currentImages = currentProfile?.images || [];

  const handleLike = async () => {
    if (!currentProfile || actionLoading) return;

    // Check usage limit for free users
    if (!isPremium()) {
      const usageResult = await checkUsageLimit('swipe');
      if (!usageResult.success) {
        setShowUpgrade(true);
        return;
      }
    }

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('likes')
        .insert({
          liker_id: currentUser.id,
          liked_id: currentProfile.id
        });

      if (error) throw error;

      toast({
        title: "👍 Liked!",
        description: `You liked ${currentProfile.first_name}`,
      });

      nextProfile();
    } catch (error: any) {
      console.error('Error liking profile:', error);
      toast({
        title: "Error",
        description: "Failed to like profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDislike = async () => {
    if (!currentProfile || actionLoading) return;

    // Check usage limit for free users
    if (!isPremium()) {
      const usageResult = await checkUsageLimit('swipe');
      if (!usageResult.success) {
        setShowUpgrade(true);
        return;
      }
    }

    setActionLoading(true);
    nextProfile();
    setActionLoading(false);
  };

  const handleReverse = async () => {
    if (currentIndex === 0 || actionLoading) return;

    // Check reverse dislike limit
    const usageResult = await checkUsageLimit('reverse_dislike');
    if (!usageResult.success) {
      if (isPremium()) {
        toast({
          title: "Error",
          description: usageResult.message,
          variant: "destructive",
        });
      } else {
        setShowUpgrade(true);
      }
      return;
    }

    setActionLoading(true);
    setCurrentIndex(prev => Math.max(0, prev - 1));
    setCurrentImageIndex(0);
    setActionLoading(false);

    toast({
      title: "⏪ Reversed!",
      description: "Previous profile restored",
    });
  };

  const nextProfile = () => {
    setCurrentIndex(prev => prev + 1);
    setCurrentImageIndex(0);
  };

  const nextImage = () => {
    if (currentImages.length > 1) {
      setCurrentImageIndex(prev => (prev + 1) % currentImages.length);
    }
  };

  const prevImage = () => {
    if (currentImages.length > 1) {
      setCurrentImageIndex(prev => prev === 0 ? currentImages.length - 1 : prev - 1);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const cardWidth = rect.width;
    
    if (clickX < cardWidth * 0.3) {
      prevImage();
    } else if (clickX > cardWidth * 0.7) {
      nextImage();
    }
  };

  if (showUpgrade) {
    return <PremiumUpgrade currentUser={currentUser} onClose={() => setShowUpgrade(false)} preselectedPlan="premium" />;
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">No more profiles</h2>
          <p className="text-gray-600 mb-6">Check back later for new people to discover!</p>
          <Button onClick={() => window.location.reload()} className="bg-pink-600 hover:bg-pink-700">
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-pink-50 to-purple-50">
      <div className="w-full max-w-sm mx-auto">
        {/* Profile Card */}
        <Card 
          className="relative bg-white rounded-3xl shadow-2xl overflow-hidden mb-8 cursor-pointer select-none"
          onClick={handleCardClick}
        >
          {/* Image Section */}
          <div className="relative h-96 overflow-hidden">
            {currentImages.length > 0 ? (
              <img
                src={currentImages[currentImageIndex]?.image_url}
                alt={`${currentProfile.first_name} ${currentProfile.last_name}`}
                className="w-full h-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 mx-auto">
                    <span className="text-2xl font-bold text-pink-600">
                      {currentProfile.first_name[0]}{currentProfile.last_name[0]}
                    </span>
                  </div>
                  <p className="text-gray-600">No photos</p>
                </div>
              </div>
            )}
            
            {/* Image indicators */}
            {currentImages.length > 1 && (
              <div className="absolute top-4 left-4 right-4 flex space-x-1">
                {currentImages.map((_, index) => (
                  <div
                    key={index}
                    className={`flex-1 h-1 rounded-full ${
                      index === currentImageIndex ? 'bg-white' : 'bg-white/30'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Profile Info */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-gray-800">
                {currentProfile.first_name} {currentProfile.last_name}
                {currentProfile.age && <span className="text-xl">, {currentProfile.age}</span>}
              </h2>
            </div>
            
            {currentProfile.bio && (
              <p className="text-gray-600 mb-3 line-clamp-3">{currentProfile.bio}</p>
            )}
            
            <div className="space-y-2 text-sm text-gray-500">
              {currentProfile.city && currentProfile.country && (
                <p>📍 {currentProfile.city}, {currentProfile.country}</p>
              )}
              {currentProfile.occupation && (
                <p>💼 {currentProfile.occupation}</p>
              )}
              {currentProfile.education_level && (
                <p>🎓 {currentProfile.education_level}</p>
              )}
              {currentProfile.relationship_intent && (
                <p>💕 {currentProfile.relationship_intent.replace('_', ' ')}</p>
              )}
            </div>
            
            {currentProfile.interests && currentProfile.interests.length > 0 && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2">
                  {currentProfile.interests.slice(0, 6).map((interest, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm"
                    >
                      {interest}
                    </span>
                  ))}
                  {currentProfile.interests.length > 6 && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                      +{currentProfile.interests.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4">
          <Button
            onClick={handleReverse}
            disabled={currentIndex === 0 || actionLoading}
            variant="outline"
            size="lg"
            className="w-16 h-16 rounded-full border-2 border-yellow-400 hover:bg-yellow-50 disabled:opacity-50"
          >
            <RotateCcw className="w-6 h-6 text-yellow-600" />
          </Button>
          
          <Button
            onClick={handleDislike}
            disabled={actionLoading}
            variant="outline"
            size="lg"
            className="w-16 h-16 rounded-full border-2 border-red-400 hover:bg-red-50"
          >
            <X className="w-6 h-6 text-red-600" />
          </Button>
          
          <Button
            onClick={handleLike}
            disabled={actionLoading}
            size="lg"
            className="w-16 h-16 rounded-full bg-pink-600 hover:bg-pink-700"
          >
            <Heart className="w-6 h-6 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DiscoverPage;

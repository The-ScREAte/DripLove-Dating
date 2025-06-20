
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Crown, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import PremiumUpgrade from './PremiumUpgrade';
import UserProfileModal from './UserProfileModal';

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  bio: string;
  city: string;
  country: string;
  age?: number;
  interests: string[];
  images?: { image_url: string; image_order: number }[];
}

interface LikedMePageProps {
  currentUser: any;
}

const LikedMePage = ({ currentUser }: LikedMePageProps) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const { subscription, isPremium, getLikedMeVisibleCount } = useSubscription(currentUser?.id);

  const fetchLikedMeProfiles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('likes')
        .select(`
          liker_id,
          profiles!likes_liker_id_fkey (
            id, first_name, last_name, bio, city, country, date_of_birth,
            interests, user_images (image_url, image_order)
          )
        `)
        .eq('liked_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedProfiles = data
        ?.map(like => {
          const profile = like.profiles;
          return profile ? {
            ...profile,
            age: profile.date_of_birth ? 
              new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() : 
              undefined,
            images: profile.user_images?.sort((a, b) => a.image_order - b.image_order) || []
          } : null;
        })
        .filter(Boolean) || [];

      setProfiles(processedProfiles);
    } catch (error) {
      console.error('Error fetching liked me profiles:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchLikedMeProfiles();
  }, [fetchLikedMeProfiles]);

  const visibleCount = getLikedMeVisibleCount();
  const canSeeAll = isPremium() || visibleCount === -1;

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

  if (profiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Heart className="w-16 h-16 text-pink-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-4">No likes yet</h2>
          <p className="text-gray-600">People who like you will appear here!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">People who liked you</h1>
          {!canSeeAll && profiles.length > visibleCount && (
            <Button
              onClick={() => setShowUpgrade(true)}
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
            >
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to see all
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {profiles.map((profile, index) => {
            const isVisible = canSeeAll || index < visibleCount;
            const shouldBlur = !isVisible;

            return (
              <div
                key={profile.id}
                className={`relative bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transform transition-all duration-200 hover:scale-105 ${
                  shouldBlur ? 'pointer-events-none' : ''
                }`}
                onClick={() => !shouldBlur && setSelectedProfile(profile)}
              >
                <div className="relative aspect-[3/4]">
                  {profile.images && profile.images.length > 0 ? (
                    <img
                      src={profile.images[0].image_url}
                      alt={`${profile.first_name} ${profile.last_name}`}
                      className={`w-full h-full object-cover ${shouldBlur ? 'blur-md' : ''}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center ${shouldBlur ? 'blur-md' : ''}`}>
                      <div className="text-center">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 mx-auto">
                          <span className="text-lg font-bold text-pink-600">
                            {profile.first_name[0]}{profile.last_name[0]}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {shouldBlur && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
                        Premium Only
                      </div>
                    </div>
                  )}
                </div>
                
                <div className={`p-3 ${shouldBlur ? 'blur-sm' : ''}`}>
                  <h3 className="font-semibold text-gray-800 truncate">
                    {profile.first_name} {profile.last_name}
                    {profile.age && <span className="text-sm">, {profile.age}</span>}
                  </h3>
                  {profile.city && profile.country && (
                    <p className="text-xs text-gray-500 truncate">
                      {profile.city}, {profile.country}
                    </p>
                  )}
                  {profile.interests && profile.interests.length > 0 && (
                    <div className="mt-2">
                      <span className="inline-block px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs">
                        {profile.interests[0]}
                      </span>
                      {profile.interests.length > 1 && (
                        <span className="text-xs text-gray-500 ml-1">
                          +{profile.interests.length - 1}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedProfile && (
        <UserProfileModal
          profile={selectedProfile}
          currentUser={currentUser}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  );
};

export default LikedMePage;

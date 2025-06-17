
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, MapPin, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DiscoverPageProps {
  currentUser: any;
}

const DiscoverPage = ({ currentUser }: DiscoverPageProps) => {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfiles();
  }, [currentUser]);

  const fetchProfiles = async () => {
    if (!currentUser?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUser.id)
        .limit(10);
      
      if (error) throw error;
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

  const handleSwipe = (direction: 'like' | 'pass') => {
    if (direction === 'like') {
      toast({
        title: "Liked!",
        description: `You liked ${profiles[currentIndex]?.first_name}`,
      });
    }
    
    setCurrentIndex(prev => prev + 1);
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

  return (
    <div className="max-w-md mx-auto">
      <Card className="overflow-hidden shadow-2xl">
        <div className="relative h-96 bg-gradient-to-br from-pink-200 to-purple-200">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-4 mx-auto">
                <span className="text-4xl">
                  {currentProfile.first_name?.[0]}{currentProfile.last_name?.[0]}
                </span>
              </div>
            </div>
          </div>
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
    </div>
  );
};

export default DiscoverPage;

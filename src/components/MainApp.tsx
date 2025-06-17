
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Users, User } from 'lucide-react';
import DiscoverPage from '@/components/DiscoverPage';
import ChatPage from '@/components/ChatPage';
import LikedMePage from '@/components/LikedMePage';
import ProfilePage from '@/components/ProfilePage';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MainAppProps {
  user: any;
  onLogout: () => void;
}

const MainApp = ({ user, onLogout }: MainAppProps) => {
  const [activeTab, setActiveTab] = useState('discover');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserProfile();
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    try {
      console.log('Fetching profile for user:', user.id);
      
      // Try to fetch the profile with a more specific query
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Profile fetch error:', error);
        // If no profile exists or there's an error, create a basic one
        if (error.code === '42P17' || !data) {
          console.log('Creating basic profile for user');
          await createBasicProfile();
        } else {
          throw error;
        }
      } else if (data) {
        console.log('Profile loaded successfully:', data);
        setProfile(data);
      } else {
        console.log('No profile found, creating basic profile');
        await createBasicProfile();
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      // Fallback: create a basic profile structure from user data
      const basicProfile = {
        id: user.id,
        first_name: user.user_metadata?.first_name || 'User',
        last_name: user.user_metadata?.last_name || '',
        email: user.email || '',
        bio: '',
        city: '',
        country: '',
        distance_preference: 50,
        gender: '',
        preference: '',
        relationship_intent: '',
        smoking: '',
        drinking: '',
        exercise_level: '',
        sleeping_schedule: '',
        occupation: '',
        industry: '',
        education_level: '',
        zip_code: '',
        introvert_extrovert: 50,
        spontaneous_planner: 50,
        messy_organized: 50,
        fun_fact: '',
        perfect_first_date: '',
        last_googled: '',
        interests: [],
      };
      setProfile(basicProfile);
    } finally {
      setLoading(false);
    }
  };

  const createBasicProfile = async () => {
    try {
      const profileData = {
        id: user.id,
        first_name: user.user_metadata?.first_name || 'User',
        last_name: user.user_metadata?.last_name || '',
        email: user.email || '',
        date_of_birth: user.user_metadata?.date_of_birth || '1990-01-01',
        bio: user.user_metadata?.bio || '',
        city: user.user_metadata?.city || '',
        country: user.user_metadata?.country || '',
        preference: user.user_metadata?.preference || 'both',
        gender: user.user_metadata?.gender || '',
        interests: user.user_metadata?.interests || [],
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error('Error creating basic profile:', error);
        // Even if upsert fails, set a basic profile structure
        setProfile(profileData);
      } else {
        console.log('Basic profile created/updated:', data);
        setProfile(data);
      }
    } catch (error) {
      console.error('Error in createBasicProfile:', error);
      // Set a minimal profile structure as fallback
      setProfile({
        id: user.id,
        first_name: user.user_metadata?.first_name || 'User',
        last_name: user.user_metadata?.last_name || '',
        email: user.email || '',
      });
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
        </div>
      );
    }

    switch (activeTab) {
      case 'discover':
        return <DiscoverPage currentUser={user} />;
      case 'chat':
        return <ChatPage currentUser={user} />;
      case 'liked':
        return <LikedMePage currentUser={user} />;
      case 'profile':
        return <ProfilePage currentUser={user} profile={profile} onProfileUpdate={fetchUserProfile} onLogout={onLogout} />;
      default:
        return <DiscoverPage currentUser={user} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex flex-col">
      {/* Header - Hidden on mobile, visible on desktop */}
      <div className="hidden md:block bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Heart className="w-8 h-8 text-pink-600" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              LoveConnect
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">
              Welcome, {profile?.first_name || 'User'}!
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden bg-white shadow-sm border-b">
        <div className="px-4 py-3 flex justify-center items-center">
          <div className="flex items-center space-x-2">
            <Heart className="w-6 h-6 text-pink-600" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              LoveConnect
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        <div className="hidden md:block w-64 bg-white shadow-sm border-r">
          <nav className="p-4">
            <div className="space-y-2">
              <button
                onClick={() => setActiveTab('discover')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'discover'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Heart className="w-5 h-5" />
                <span>Discover</span>
              </button>
              
              <button
                onClick={() => setActiveTab('chat')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <MessageCircle className="w-5 h-5" />
                <span>Chat</span>
              </button>
              
              <button
                onClick={() => setActiveTab('liked')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'liked'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Liked Me</span>
              </button>
              
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <User className="w-5 h-5" />
                <span>Profile</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto pb-20 md:pb-6 p-2 sm:p-4 md:p-6">
          {renderContent()}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 safe-area-pb">
        <div className="flex justify-around items-center">
          <button
            onClick={() => setActiveTab('discover')}
            className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-colors ${
              activeTab === 'discover'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <Heart className={`w-5 h-5 ${activeTab === 'discover' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Discover</span>
          </button>
          
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-colors ${
              activeTab === 'chat'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <MessageCircle className={`w-5 h-5 ${activeTab === 'chat' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Chat</span>
          </button>
          
          <button
            onClick={() => setActiveTab('liked')}
            className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-colors ${
              activeTab === 'liked'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <Users className={`w-5 h-5 ${activeTab === 'liked' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Liked Me</span>
          </button>
          
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-colors ${
              activeTab === 'profile'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <User className={`w-5 h-5 ${activeTab === 'profile' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MainApp;

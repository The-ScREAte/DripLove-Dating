
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Users, User, LogOut, Upload } from 'lucide-react';
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
  const { toast } = useToast();

  useEffect(() => {
    fetchUserProfile();
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      onLogout();
      toast({
        title: "Logged out",
        description: "See you again soon!",
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'discover':
        return <DiscoverPage currentUser={user} />;
      case 'chat':
        return <ChatPage currentUser={user} />;
      case 'liked':
        return <LikedMePage currentUser={user} />;
      case 'profile':
        return <ProfilePage currentUser={user} profile={profile} onProfileUpdate={fetchUserProfile} />;
      default:
        return <DiscoverPage currentUser={user} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Heart className="w-8 h-8 text-pink-600" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              LoveConnect
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600 hidden md:block">
              Welcome, {profile?.first_name || 'User'}!
            </span>
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="flex items-center space-x-2 border-pink-200 text-pink-600 hover:bg-pink-50"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:block">Logout</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-h-[calc(100vh-80px)]">
        {/* Sidebar Navigation */}
        <div className="w-20 md:w-64 bg-white shadow-sm border-r">
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
                <span className="hidden md:block">Discover</span>
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
                <span className="hidden md:block">Chat</span>
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
                <span className="hidden md:block">Liked Me</span>
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
                <span className="hidden md:block">Profile</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default MainApp;

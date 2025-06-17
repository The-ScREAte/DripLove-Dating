
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
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="flex items-center space-x-2 border-pink-200 text-pink-600 hover:bg-pink-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </Button>
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
        <div className="flex-1 overflow-auto pb-20 md:pb-6 p-4 md:p-6">
          {renderContent()}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 safe-area-pb">
        <div className="flex justify-around items-center">
          <button
            onClick={() => setActiveTab('discover')}
            className={`flex flex-col items-center space-y-1 py-2 px-3 rounded-lg transition-colors ${
              activeTab === 'discover'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <Heart className={`w-6 h-6 ${activeTab === 'discover' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Discover</span>
          </button>
          
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center space-y-1 py-2 px-3 rounded-lg transition-colors ${
              activeTab === 'chat'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <MessageCircle className={`w-6 h-6 ${activeTab === 'chat' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Chat</span>
          </button>
          
          <button
            onClick={() => setActiveTab('liked')}
            className={`flex flex-col items-center space-y-1 py-2 px-3 rounded-lg transition-colors ${
              activeTab === 'liked'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <Users className={`w-6 h-6 ${activeTab === 'liked' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Liked Me</span>
          </button>
          
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center space-y-1 py-2 px-3 rounded-lg transition-colors ${
              activeTab === 'profile'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <User className={`w-6 h-6 ${activeTab === 'profile' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MainApp;

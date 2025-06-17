
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Users, User, Bell } from 'lucide-react';
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
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserProfile();
    fetchUnreadCount();
  }, [user]);

  useEffect(() => {
    // Set up real-time subscription for unread messages
    const channel = supabase
      .channel('unread-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches'
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const fetchUnreadCount = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('user1_unread_count, user2_unread_count, user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
      
      if (error) throw error;
      
      const total = data?.reduce((sum, match) => {
        const isUser1 = match.user1_id === user.id;
        const unread = isUser1 ? match.user1_unread_count : match.user2_unread_count;
        return sum + (unread || 0);
      }, 0) || 0;
      
      setUnreadCount(total);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'discover':
        return <DiscoverPage currentUser={user} />;
      case 'chat':
        return <ChatPage currentUser={user} onUnreadChange={fetchUnreadCount} />;
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
            <img 
              src="/lovable-uploads/ef9367e7-bcc2-40e6-8a31-b92465c0e20b.png" 
              alt="AfroVibe Logo" 
              className="w-8 h-8"
            />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              AfroVibe
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
            <img 
              src="/lovable-uploads/ef9367e7-bcc2-40e6-8a31-b92465c0e20b.png" 
              alt="AfroVibe Logo" 
              className="w-6 h-6"
            />
            <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              AfroVibe
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
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors relative ${
                  activeTab === 'chat'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <MessageCircle className="w-5 h-5" />
                <span>Chat</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                    {unreadCount}
                  </span>
                )}
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
            className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-colors relative ${
              activeTab === 'chat'
                ? 'text-pink-600'
                : 'text-gray-500'
            }`}
          >
            <MessageCircle className={`w-5 h-5 ${activeTab === 'chat' ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">Chat</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[16px] text-center">
                {unreadCount}
              </span>
            )}
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

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
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserProfile();
    fetchUnreadCount();
  }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('unread-messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
      }, () => {
        fetchUnreadCount();
      })
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
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: 'Profile not found',
          description: 'No profile found for this user.',
          variant: 'destructive',
        });
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: 'Profile Error',
        description: 'Failed to load profile.',
        variant: 'destructive',
      });
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

  const handleNavigateToChat = (userId: string) => {
    setActiveTab('chat');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'discover':
        return <DiscoverPage currentUser={user} onNavigateToChat={handleNavigateToChat} />;
      case 'chat':
        return <ChatPage currentUser={user} onUnreadChange={fetchUnreadCount} />;
      case 'liked':
        return <LikedMePage currentUser={user} />;
      case 'profile':
        return <ProfilePage currentUser={user} profile={profile} onProfileUpdate={fetchUserProfile} onLogout={onLogout} />;
      default:
        return <DiscoverPage currentUser={user} onNavigateToChat={handleNavigateToChat} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-pink-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="container mx-auto px-4 py-2 flex justify-start items-center">
          <img 
            src="/lovable-uploads/0e9bd84b-0f71-493b-8c1f-1a2883e5109d.png" 
            alt="AfroVibe Logo" 
            className="h-10"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 z-50 flex-shrink-0">
        <div className="flex justify-around items-center">
          {[
            { label: 'Discover', icon: Heart }, 
            { label: 'Chat', icon: MessageCircle }, 
            { label: 'Liked', icon: Users }, 
            { label: 'Profile', icon: User }
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => setActiveTab(label.toLowerCase())}
              className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-colors relative ${
                activeTab === label.toLowerCase() ? 'text-pink-600' : 'text-gray-500'
              }`}
            >
              <Icon className={`w-5 h-5 ${activeTab === label.toLowerCase() ? 'fill-current' : ''}`} />
              <span className="text-xs font-medium">{label}</span>
              {label === 'Chat' && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[16px] text-center">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MainApp;

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Users, User } from 'lucide-react';
import DiscoverPage from '@/components/DiscoverPage';
import ChatPage from '@/components/ChatPage';
import LikedMePage from '@/components/LikedMePage';
import ProfilePage from '@/components/ProfilePage';
import TermsOfService from '@/components/TermsOfService';
import PrivacyPolicy from '@/components/PrivacyPolicy';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface MainAppProps {
  user: any;
  onLogout: () => void;
}

const MainApp = ({ user, onLogout }: MainAppProps) => {
  const [activeTab, setActiveTab] = useState('discover');
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  // Initialize push notifications silently in background
  const {
    isInitialized: pushInitialized,
    isSupported: pushSupported,
    deviceToken,
    error: pushError,
    sendMatchNotification,
    sendMessageNotification,
    sendLikeNotification
  } = usePushNotifications(user?.id);

    // Silent push notification initialization - no user notifications
  useEffect(() => {
    if (pushSupported && !pushError) {
      // Silently initialize notifications
    }
  }, [pushSupported, pushError]);

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

  const handleNavigateToChat = () => {
    setActiveTab('chat');
  };

  const handleShowTerms = () => {
    setShowTerms(true);
  };

  const handleShowPrivacy = () => {
    setShowPrivacy(true);
  };

  const handleBackFromTerms = () => {
    setShowTerms(false);
  };

  const handleBackFromPrivacy = () => {
    setShowPrivacy(false);
  };

  const renderContent = () => {
    if (showTerms) {
      return <TermsOfService onBack={handleBackFromTerms} />;
    }
    
    if (showPrivacy) {
      return <PrivacyPolicy onBack={handleBackFromPrivacy} />;
    }

    switch (activeTab) {
      case 'discover':
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} />;
      case 'chat':
        return <ChatPage currentUser={profile} onUnreadChange={fetchUnreadCount} />;
      case 'liked':
        return <LikedMePage currentUser={profile} />;
      case 'profile':
        return (
          <ProfilePage 
            currentUser={profile} 
            profile={profile} 
            onProfileUpdate={fetchUserProfile} 
            onLogout={onLogout}
            onShowTerms={handleShowTerms}
            onShowPrivacy={handleShowPrivacy}
          />
        );
      default:
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} />;
    }
  };

  return (
    <div className="w-full h-screen bg-gray-100">
      <div className="w-full h-screen flex flex-col bg-white relative shadow-md overflow-hidden">
        
        {/* Fixed Header - Hide when showing terms/privacy */}
        {!showTerms && !showPrivacy && (
          <div className="fixed top-0 left-0 right-0 w-full bg-white shadow-sm border-b z-50">
            <div className="px-4 py-2 flex justify-start items-center">
              <img 
                src="/driplove-logo.png" 
                alt="DripLove Logo" 
                className="h-12"
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className={`flex-1 overflow-y-auto ${!showTerms && !showPrivacy ? 'pt-[60px] pb-[70px]' : ''}`}>
          {renderContent()}
        </div>

        {/* Fixed Bottom Nav - Hide when showing terms/privacy */}
        {!showTerms && !showPrivacy && (
          <div className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-gray-200 px-2 py-2 z-50">
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
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-pink-600 border border-white z-10" />
                )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MainApp;

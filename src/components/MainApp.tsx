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
import { SafeAreaView, useSafeAreaInsets } from '@/hooks/useSafeArea';

interface MainAppProps {
  user: any;
  onLogout: () => void;
}

const MainApp = ({ user, onLogout }: MainAppProps) => {
  const [activeTab, setActiveTab] = useState('discover');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Simple keyboard detection for mobile
  useEffect(() => {
    const handleViewportChange = () => {
      const visualViewport = window.visualViewport;
      if (visualViewport) {
        const heightDifference = window.innerHeight - visualViewport.height;
        setIsKeyboardOpen(heightDifference > 150);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      return () => {
        window.visualViewport?.removeEventListener('resize', handleViewportChange);
      };
    }
  }, []);
  // Register device token for push notifications (mobile only)
  useEffect(() => {
    const registerDeviceToken = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform() && user?.id) {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          
          // Request permission first to prevent crashes
          const permissionResult = await PushNotifications.requestPermissions();
          if (permissionResult.receive === 'granted') {
            await PushNotifications.register();
            
            PushNotifications.addListener('registration', async (token) => {
              try {
                // Save token to Supabase
                await supabase.from('push_tokens').upsert({
                  user_id: user.id,
                  token: token.value,
                  platform: Capacitor.getPlatform()
                });
                console.log('Push token registered successfully');
              } catch (error) {
                console.error('Failed to save push token:', error);
              }
            });

            PushNotifications.addListener('registrationError', (error) => {
              console.error('Push registration error:', error);
            });
          }
        }
      } catch (err) {
        console.error('Push notification setup error:', err);
        // Don't throw error to prevent app crash
      }
    };
    registerDeviceToken();
  }, [user?.id]);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

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
      .channel('nav-matches')
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

      // [MainApp] Profile fetched
      setProfile(data);
      // Check premium status from user_subscriptions
      if (data?.id) {
        const { data: subData, error: subError } = await supabase
          .from('user_subscriptions')
          .select('plan_name, status')
          .eq('user_id', data.id)
          .eq('plan_name', 'premium')
          .eq('status', 'active')
          .maybeSingle();
        setIsPremium(!!subData);
        // [MainApp] Subscription fetched
      } else {
        setIsPremium(false);
      }
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
      // Always use matches table for unread count
      const { data, error } = await supabase
        .from('matches')
        .select('user1_unread_count, user2_unread_count, user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (error) throw error;

      const total = data?.reduce((sum, match) => {
        const isUser1 = match.user1_id === user.id;
        const unread = isUser1 ? Number(match.user1_unread_count) : Number(match.user2_unread_count);
        return sum + (Number.isFinite(unread) && unread > 0 ? unread : 0);
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

    // Use isPremium from subscription table, not profile
    switch (activeTab) {
      case 'discover':
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} isPremium={isPremium} />;
      case 'chat':
        return <ChatPage currentUser={profile} onUnreadChange={fetchUnreadCount} />;
      case 'liked':
        return <LikedMePage currentUser={profile} isPremium={isPremium} />;
      case 'profile':
        return (
          <ProfilePage 
            currentUser={profile} 
            profile={profile} 
            onProfileUpdate={fetchUserProfile} 
            onLogout={onLogout}
            onShowTerms={handleShowTerms}
            onShowPrivacy={handleShowPrivacy}
            isPremium={isPremium}
          />
        );
      default:
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} isPremium={isPremium} />;
    }
  };

  return (
    <div className="w-full h-screen bg-gray-100">
      <div className="w-full h-screen flex flex-col bg-white relative shadow-md overflow-hidden">
        
        {/* Fixed Header with Professional Safe Area */}
        {!showTerms && !showPrivacy && (
          <SafeAreaView edges={['top']} className="fixed top-0 left-0 right-0 w-full bg-white shadow-sm border-b z-50">
            <div className="px-4 py-2 flex justify-between items-center">
              <img 
                src="/driplove-logo.png" 
                alt="DripLove Logo" 
                className="h-12"
              />
              <div className="text-right">
                <div className="text-sm font-bold text-black leading-tight">
                  <div>Find Your</div>
                  <div>Perfect Match 💖</div>
                </div>
              </div>
            </div>
          </SafeAreaView>
        )}

        {/* Main Content */}
        <div 
          className={`flex-1 overflow-y-auto ${!showTerms && !showPrivacy ? 'pb-[70px]' : ''}`}
          style={{ 
            paddingTop: !showTerms && !showPrivacy ? (60 + insets.top) : 0 
          }}
        >
          {renderContent()}
        </div>

        {/* Fixed Bottom Nav with Professional Safe Area */}
        {!showTerms && !showPrivacy && !isKeyboardOpen && (
          <SafeAreaView edges={['bottom']} className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-gray-200 px-2 py-2 z-50">
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
                     <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 border-2 border-white z-10 flex items-center justify-center">
                       <span className="text-xs text-white font-bold">
                         {unreadCount > 9 ? '9+' : unreadCount}
                       </span>
                     </div>
                   )}
                </button>
              ))}
            </div>
          </SafeAreaView>
        )}
      </div>
    </div>
  );
};

export default MainApp;

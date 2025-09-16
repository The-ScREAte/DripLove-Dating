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
  // Safety check - if no user data, show error
  if (!user || !user.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 p-4">
        <div className="text-center bg-white rounded-lg p-8 shadow-lg max-w-md w-full">
          <h2 className="text-xl font-bold text-gray-800 mb-4">No User Data</h2>
          <p className="text-gray-600 mb-6">
            Unable to load user information. Please log in again.
          </p>
          <button 
            onClick={onLogout}
            className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-lg font-medium"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

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
  // Register device token for push notifications (mobile only) - with error handling
  useEffect(() => {
    const registerDeviceToken = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || !user?.id) {
          console.log('[MainApp] Skipping push notifications - not native platform or no user');
          return;
        }

        console.log('[MainApp] Attempting to setup push notifications...');
        const { PushNotifications } = await import('@capacitor/push-notifications');
        
        // Add error listener first to catch Firebase initialization errors
        PushNotifications.addListener('registrationError', (error) => {
          console.error('[MainApp] Push registration error (Firebase may not be configured):', error);
        });
        
        // Request permission first to prevent crashes
        console.log('[MainApp] Requesting push notification permissions...');
        const permissionResult = await PushNotifications.requestPermissions();
        
        if (permissionResult.receive === 'granted') {
          console.log('[MainApp] Permission granted, attempting to register...');
          
          // Use setTimeout to prevent blocking the main thread
          setTimeout(async () => {
            try {
              await PushNotifications.register();
              console.log('[MainApp] Push notification registration successful');
              
              PushNotifications.addListener('registration', async (token) => {
                try {
                  // Save token to Supabase
                  await supabase.from('push_tokens').upsert({
                    user_id: user.id,
                    token: token.value,
                    platform: Capacitor.getPlatform()
                  });
                  console.log('[MainApp] Push token saved successfully');
                } catch (error) {
                  console.error('[MainApp] Failed to save push token:', error);
                }
              });
            } catch (regError) {
              console.error('[MainApp] Push registration failed (likely Firebase not configured):', regError);
              // Continue without push notifications
            }
          }, 500);
        } else {
          console.log('[MainApp] Push notification permission not granted');
        }
      } catch (err) {
        console.error('[MainApp] Push notification setup error:', err);
        // Don't throw error to prevent app crash
      }
    };
    
    // Add a small delay to prevent race conditions
    setTimeout(registerDeviceToken, 1000);
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
    if (user?.id) {
      fetchUserProfile();
      fetchUnreadCount();
    }
  }, [user?.id]); // More specific dependency

  useEffect(() => {
    if (!user?.id) return;

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
  }, [user?.id]); // Depend on user.id rather than full user object

  const fetchUserProfile = async () => {
    if (!user?.id) {
      console.warn('[MainApp] No user ID provided');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[MainApp] Profile fetch error:', error);
        toast({
          title: 'Profile Error',
          description: 'Failed to load profile data. Please try refreshing.',
          variant: 'destructive',
        });
        return;
      }

      if (!data) {
        console.warn('[MainApp] No profile found for user:', user.id);
        toast({
          title: 'Profile not found',
          description: 'No profile found for this user.',
          variant: 'destructive',
        });
        return;
      }

      console.log('[MainApp] Profile fetched successfully');
      setProfile(data);
      
      // Check premium status from user_subscriptions
      if (data?.id) {
        try {
          const { data: subData, error: subError } = await supabase
            .from('user_subscriptions')
            .select('plan_name, status')
            .eq('user_id', data.id)
            .eq('plan_name', 'premium')
            .eq('status', 'active')
            .maybeSingle();
          
          if (subError) {
            console.error('[MainApp] Subscription fetch error:', subError);
          }
          
          setIsPremium(!!subData);
          console.log('[MainApp] Subscription status checked');
        } catch (subErr) {
          console.error('[MainApp] Subscription check failed:', subErr);
          setIsPremium(false); // Default to free
        }
      }
    } catch (err) {
      console.error('[MainApp] Fatal error in fetchUserProfile:', err);
      toast({
        title: 'Error',
        description: 'Failed to load user data. Please restart the app.',
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
        {!showTerms && !showPrivacy && activeTab !== 'discover' && (
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
            paddingTop: !showTerms && !showPrivacy && activeTab !== 'discover' ? (60 + insets.top) : 0 
          }}
        >
          {renderContent()}
        </div>

        {/* Fixed Bottom Nav with Professional Safe Area */}
        {!showTerms && !showPrivacy && !isKeyboardOpen && (
          <SafeAreaView edges={['bottom']} className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-gray-200 px-2 py-2 z-50">
            <div className="flex justify-around items-center">
              {[
                { label: 'DripCheck', icon: Heart }, 
                { label: 'Chat', icon: MessageCircle }, 
                { label: 'Liked', icon: Users }, 
                { label: 'Profile', icon: User }
              ].map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => setActiveTab(label === 'DripCheck' ? 'discover' : label.toLowerCase())}
                  className={`flex flex-col items-center space-y-1 py-2 px-2 rounded-lg transition-colors relative ${
                    (label === 'DripCheck' ? activeTab === 'discover' : activeTab === label.toLowerCase()) ? 'text-pink-600' : 'text-gray-500'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${(label === 'DripCheck' ? activeTab === 'discover' : activeTab === label.toLowerCase()) ? 'fill-current' : ''}`} />
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

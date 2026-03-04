import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MessageCircle, Users, User } from 'lucide-react';
// ⭐ ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { isAndroidPlatform, isIOSPlatform, getPlatformSync, getPlatformSafe } from '@/utils/platformUtils';
import TermsOfService from '@/components/TermsOfService';
import PrivacyPolicy from '@/components/PrivacyPolicy';
import DripCoupleIcon from '@/components/DripCoupleIcon';
import RatingDialog from '@/components/RatingDialog';
import AppUpdatePopup from '@/components/AppUpdatePopup';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { loadUserLanguage } from '@/utils/languageSync';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import type { ChatMatchesCacheValue, LikedMeCacheValue } from '@/types/cacheTypes';
import ProfilePage from '@/components/ProfilePage';
import { calculateProfileCompletion } from '@/utils/profileCompletion';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

// Lazy load tab components - reduces initial bundle by ~700KB
// Each component only loads when user navigates to that tab
const DiscoverPage = lazy(() => import('@/components/DiscoverPage'));
const ChatPage = lazy(() => import('@/components/ChatPage'));
const LikedMePage = lazy(() => import('@/components/LikedMePage'));

// Tab loading fallback
const TabLoader = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <style>{`
        @keyframes logoHop {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-15px) scale(1.05); }
        }
      `}</style>
      <div className="mb-2" style={{ animation: 'logoHop 0.8s ease-in-out infinite' }}>
        <img 
          src="/driplove-logo.png" 
          alt="Drip Love" 
          className="w-16 h-16 mx-auto"
          onError={(e) => {
            e.currentTarget.src = '/driplove-logo.webp';
          }}
        />
      </div>
      <p className="text-sm text-gray-500">Loading...</p>
    </div>
  </div>
);

// Import rating debug utilities for development
if (import.meta.env.DEV) {
  import('@/utils/ratingDebug');
}

// No SafeArea helpers here; header/nav will be fixed to viewport

interface MainAppProps {
  user: { id: string } | null;
  onLogout: () => void;
}

const MainApp = ({ user, onLogout }: MainAppProps) => {
  const { t, i18n } = useTranslation();
  const userId = user?.id;
  
  // ⭐ CRITICAL FIX: Move ALL hooks BEFORE any conditional returns
  // ⭐ STATE PRESERVATION: Restore active tab from sessionStorage when returning from games
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = sessionStorage.getItem('mainapp_active_tab');
      return saved || 'dripcheck';
    } catch {
      return 'dripcheck';
    }
  });
  const [isChatDetailOpen, setIsChatDetailOpen] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileCompletion, setProfileCompletion] = useState(0);
  const [userImages, setUserImages] = useState<any[]>([]);
  const { toast } = useToast();

  // ⭐ STATE PRESERVATION: Save active tab to sessionStorage whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem('mainapp_active_tab', activeTab);
    } catch {
      // Ignore storage errors
    }
  }, [activeTab]);

  // Cached set of match IDs for this user (used to cheaply filter realtime chat events)
  const userMatchIdSetRef = useRef<Set<string>>(new Set());
  
  // Track user activity for accurate "Active Users" stats
  useActivityTracker(userId);

  const fetchUserProfile = useCallback(async () => {
    if (!userId) {
      console.warn('[MainApp] No user ID provided');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
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
        console.warn('[MainApp] No profile found for user:', userId);
        toast({
          title: 'Profile not found',
          description: 'No profile found for this user.',
          variant: 'destructive',
        });
        return;
      }

      setProfile(data as unknown as ProfileRow);

      // Fetch user images for profile completion calculation
      try {
        const { data: images, error: imagesError } = await supabase
          .from('user_images')
          .select('image_url, is_approved, moderation_status')
          .eq('user_id', data.id);

        if (!imagesError && images) {
          setUserImages(images);
          // Calculate profile completion using the same method as ProfilePage
          const completionResult = calculateProfileCompletion(data, images);
          setProfileCompletion(completionResult.completion);
        }
      } catch (imgErr) {
        console.error('[MainApp] Failed to fetch images for profile completion:', imgErr);
      }

      // Check premium status (must respect cancelled-but-not-expired grace period)
      if (data?.id) {
        try {
          const { data: subData, error: subError } = await supabase.rpc('get_current_subscription_status', {
            p_user_id: data.id,
          });

          if (subError) {
            console.error('[MainApp] Subscription RPC failed, falling back:', subError);
            // Fallback: keep conservative behavior if RPC fails
            const { data: fallback, error: fallbackError } = await supabase
              .from('user_subscriptions')
              .select('plan_name, status, expires_at')
              .eq('user_id', data.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (fallbackError) {
              console.error('[MainApp] Subscription fallback failed:', fallbackError);
              setIsPremium(false);
            } else {
              const entitledByStatus = fallback?.status === 'active' || fallback?.status === 'cancelled';
              const notExpired = !fallback?.expires_at || new Date(fallback.expires_at) > new Date();
              setIsPremium(!!fallback && fallback.plan_name === 'premium' && entitledByStatus && notExpired);
            }
          } else {
            const status = Array.isArray(subData) ? subData[0] : (subData as any);
            setIsPremium(!!status && status.plan_name === 'premium' && status.is_active === true);
          }
        } catch (subErr) {
          console.error('[MainApp] Subscription check failed:', subErr);
          setIsPremium(false);
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
  }, [toast, userId]);

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      // Fetch matches where current user is user1 or user2.
      // Include minimal partner + latest chat fields so unread badge can match ChatPage visibility.
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id,
          user1_id,
          user2_id,
          user1_unread_count,
          user2_unread_count,
          user1:profiles!matches_user1_id_fkey(id, is_archived),
          user2:profiles!matches_user2_id_fkey(id, is_archived),
          chats(id, message, created_at)
        `)
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

      const { data: matchesWithLatestChat, error: latestChatError } = await supabase
        .from('matches')
        .select('id, chats(id, message, created_at)')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .limit(1, { foreignTable: 'chats' })
        .order('created_at', { foreignTable: 'chats', ascending: false });

      if (matchesError) throw matchesError;
      if (latestChatError) throw latestChatError;

      type NavMatchRow = {
        id: string;
        user1_id: string;
        user2_id: string;
        user1_unread_count?: unknown;
        user2_unread_count?: unknown;
        user1?: { id?: string; is_archived?: boolean } | null;
        user2?: { id?: string; is_archived?: boolean } | null;
        chats?: Array<{ id?: string; message?: string | null; created_at?: string | null }> | null;
      };

      const latestChatByMatchId = new Map<string, { message: string; created_at: string }>();
      for (const row of ((matchesWithLatestChat || []) as NavMatchRow[])) {
        const lastChat = Array.isArray(row.chats) ? row.chats[0] : undefined;
        if (!lastChat?.created_at) continue;
        latestChatByMatchId.set(row.id, {
          message: String(lastChat.message || ''),
          created_at: String(lastChat.created_at),
        });
      }

      const rows = (matchesData || []) as NavMatchRow[];
      userMatchIdSetRef.current = new Set(rows.map((r) => r.id));

      const DORMANT_DAYS = 30;
      const DORMANT_DELETE_AFTER_DAYS_IN_EARLIER = 15;
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Count unread ONLY for chats visible on Chat page:
      // - include Active + Earlier conversations
      // - exclude archived partners
      // - exclude auto-deletable dormant chats (already removed from list)
      let total = 0;
      for (const row of rows) {
        const isUser1 = row.user1_id === userId;
        const partner = isUser1 ? row.user2 : row.user1;

        // ChatPage excludes archived partner chats entirely.
        if (partner?.is_archived === true) continue;

        const latest = latestChatByMatchId.get(row.id);
        const hasLastMessage = Boolean(latest?.message);
        const lastMessageTime = latest?.created_at;

        // ChatPage list includes only conversations with a last message in Active/Earlier sections.
        // New matches (no message yet) are not part of those sections.
        if (!hasLastMessage || !lastMessageTime) continue;

        // Match ChatPage auto-delete exclusion: hide chats dormant for 45+ days.
        const lastActivityMs = new Date(lastMessageTime).getTime();
        const autoDeleteThresholdMs = (DORMANT_DAYS + DORMANT_DELETE_AFTER_DAYS_IN_EARLIER) * MS_PER_DAY;
        if (Number.isFinite(lastActivityMs) && (Date.now() - lastActivityMs > autoDeleteThresholdMs)) {
          continue;
        }

        // If user is user1, count user1_unread_count (messages user1 hasn't read)
        // If user is user2, count user2_unread_count (messages user2 hasn't read)
        const unreadForUser = isUser1 ? row.user1_unread_count : row.user2_unread_count;
        const n = Number(unreadForUser) || 0;
        if (n > 0) {
          total += n;
        }
      }

      setUnreadCount(total);
    } catch (err) {
      const message =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message?: unknown }).message)
          : undefined;
      console.error('[MainApp] ❌ Error fetching unread count:', message || err);
    }
  }, [userId]);

  // Throttled unread count refresh to prevent excessive calls from realtime events
  const lastUnreadRefreshRef = useRef<number>(0);
  const throttledFetchUnreadCount = useCallback(() => {
    const now = Date.now();
    if (now - lastUnreadRefreshRef.current >= 1500) {
      lastUnreadRefreshRef.current = now;
      void fetchUnreadCount();
    }
  }, [fetchUnreadCount]);

  // Force immediate refresh (bypasses throttle) - used after explicit user actions
  const forceRefreshUnreadCount = useCallback(() => {
    lastUnreadRefreshRef.current = Date.now();
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

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
        if (!Capacitor.isNativePlatform() || !userId) {
          // Silent notification handling
          return;
        }

        const { PushNotifications } = await import('@capacitor/push-notifications');
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        
        // Add ALL listeners FIRST before calling register()
        PushNotifications.addListener('registrationError', (error) => {
          console.error('[MainApp] Push registration error:', error);
        });
        
        // Add notification tap listener (when app is closed/background)
        PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
          const data = notification.notification.data;
          
          // Wait a bit for app to fully load
          setTimeout(() => {
            if (data?.type === 'message' && data?.chatId) {
              setActiveTab('chat');
              // Use hash navigation to pass matchId to ChatPage
              window.location.hash = `matchId=${data.chatId}`;
            } else if (data?.type === 'match') {
              setActiveTab('chat');
            } else if (data?.type === 'like') {
              setActiveTab('liked');
            } else {
              setActiveTab('chat');
            }
          }, 500);
        });
        
        // Add foreground notification listener
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          // Notification will be handled by the in-app toast
        });
        
        // Add token listener for APNS token (iOS needs this to trigger FCM)
        PushNotifications.addListener('registration', async (token) => {
          
          // For iOS, we need to get the FCM token from Firebase Messaging
          if (Capacitor.getPlatform() === 'ios') {
            try {
              const { token: fcmToken } = await FirebaseMessaging.getToken();
              
              // Save FCM token to database
              await savePushToken(fcmToken);
            } catch (error) {
              console.error('[MainApp] ❌ Failed to get FCM token:', error);
              // Fallback to APNS token (won't work with FCM but better than nothing)
              await savePushToken(token.value);
            }
          } else {
            // Android token is already FCM token
            await savePushToken(token.value);
          }
        });
        
        // Helper function to save token
        const savePushToken = async (tokenValue: string) => {
          // Verify user is authenticated before saving
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          
          if (!currentUser) {
            console.error('[MainApp] Cannot save push token - user not authenticated');
            return;
          }
          
          try {
            const { data, error } = await supabase.from('push_tokens').upsert({
              user_id: currentUser.id,
              token: tokenValue,
              platform: Capacitor.getPlatform(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,platform' // Match the unique constraint
            }).select();
            
            if (error) {
              console.error('[MainApp] ❌ Failed to save push token:', error);
              console.error('[MainApp] Error code:', error.code);
              console.error('[MainApp] Error details:', error.details);
              console.error('[MainApp] Error hint:', error.hint);
            }
          } catch (error) {
            console.error('[MainApp] 💥 Exception saving push token:', error);
          }
        };
        
        // Request permission
        const permissionResult = await PushNotifications.requestPermissions();
        
        if (permissionResult.receive === 'granted') {
          try {
            await PushNotifications.register();
          } catch (regError) {
            console.error('[MainApp] Push registration failed:', regError);
          }
        }
      } catch (err) {
        console.error('[MainApp] Push notification setup error:', err);
        // Don't throw error to prevent app crash
      }
    };
    
    // Add a small delay to prevent race conditions
    setTimeout(registerDeviceToken, 1000);
  }, [userId]);

  const ensureWindowCaches = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!window.likedMeCache) {
      window.likedMeCache = new Map<string, LikedMeCacheValue>();
    }
    if (!window.chatMatchesCache) {
      window.chatMatchesCache = new Map<string, ChatMatchesCacheValue>();
    }
  }, []);

  // Global liked me preloader function
  const preloadLikedMeData = useCallback(async (targetUserId: string) => {
    ensureWindowCaches();
    try {
      // 1. Get all likes for this user
      const { data: likes, error: likesError } = await supabase
        .from('likes')
        .select('liker_id, created_at')
        .eq('liked_id', targetUserId);
      
      if (likesError) throw likesError;
      if (!likes || likes.length === 0) {
        // Cache empty result
        window.likedMeCache?.set(targetUserId, {
          likers: [],
          userImages: {},
          timestamp: Date.now(),
        });
        return;
      }

      // 2. Get all matches and blocks in one go
      const [matchesRes, blocksRes] = await Promise.all([
        supabase
          .from('matches')
          .select('user1_id, user2_id')
          .or(`user1_id.eq.${targetUserId},user2_id.eq.${targetUserId}`),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${targetUserId},blocked_id.eq.${targetUserId}`)
      ]);

      if (matchesRes.error) throw matchesRes.error;
      if (blocksRes.error) throw blocksRes.error;

      const matches = matchesRes.data || [];
      const blockedUsers = blocksRes.data || [];
      const matchedIds = matches.map(match =>
        match.user1_id === targetUserId ? match.user2_id : match.user1_id
      );
      const blockedIds = blockedUsers.map(block =>
        block.blocker_id === targetUserId ? block.blocked_id : block.blocker_id
      );

      // 3. Filter likerIds
      const likerIds = likes
        .map(like => like.liker_id)
        .filter(id => !matchedIds.includes(id) && !blockedIds.includes(id));

      if (likerIds.length === 0) {
        // Cache empty result
        window.likedMeCache?.set(targetUserId, {
          likers: [],
          userImages: {},
          timestamp: Date.now(),
        });
        return;
      }

      // 4. Fetch all profiles in one go
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', likerIds)
        .neq('is_admin', true);

      if (profileError) throw profileError;

      const likers = (profiles || []) as unknown as LikedMeCacheValue['likers'];

      // 5. Fetch first images for these profiles
      let imagesData = null;
      if (likerIds.length > 0) {
        const { data: approvedImages, error: imagesError } = await supabase
          .from('user_images')
          .select('user_id, image_url, image_order')
          .in('user_id', likerIds)
          .eq('is_approved', true)
          .order('image_order', { ascending: true });

        if (imagesError && imagesError.message.includes('does not exist')) {
          const { data: fallbackImages, error: fallbackError } = await supabase
            .from('user_images')
            .select('user_id, image_url, image_order')
            .in('user_id', likerIds)
            .order('image_order', { ascending: true });

          if (fallbackError) throw fallbackError;
          imagesData = fallbackImages;
        } else if (imagesError) {
          throw imagesError;
        } else {
          imagesData = approvedImages;
        }
      }

        // Progressive Image Loading for LikedMe
        const imageMap: { [key: string]: string[] } = {};
        if (imagesData) {
          for (const img of imagesData) {
            if (!imageMap[img.user_id]) {
              // Only store 1 image per user for maximum speed initially
              imageMap[img.user_id] = [img.image_url];
            }
          }
        }
        
        window.likedMeCache?.set(targetUserId, {
          likers,
          userImages: imageMap,
          timestamp: Date.now(),
          fullyLoaded: false,
        });

        // Progressive loading: Load remaining images in background
        setTimeout(async () => {
          if (likerIds.length > 0) {
            try {
              const { data: allImages } = await supabase
                .from('user_images')
                .select('user_id, image_url, image_order')
                .in('user_id', likerIds)
                .eq('is_approved', true)
                .order('image_order', { ascending: true });

              if (allImages) {
                const fullImageMap: { [key: string]: string[] } = {};
                for (const img of allImages) {
                  if (!fullImageMap[img.user_id]) {
                    fullImageMap[img.user_id] = [];
                  }
                  fullImageMap[img.user_id].push(img.image_url);
                }

                // Update cache with all images
                const existingCache = window.likedMeCache?.get(targetUserId);
                if (existingCache) {
                  existingCache.userImages = fullImageMap;
                  existingCache.fullyLoaded = true;
                }
              }
            } catch (error) {
              // Silently handle errors
            }
          }
        }, 1000); // Load additional images after 1 second
    } catch (error) {
      // Silently handle preload errors
    }
  }, [ensureWindowCaches]);

  // Global chat preloader function - needs to match ChatPage cache
  const preloadChatMatches = useCallback(async (targetUserId: string) => {
    ensureWindowCaches();
    try {
      const { data: matches, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin),
          chats(id, message, created_at, sender_id)
        `)
        .or(`user1_id.eq.${targetUserId},user2_id.eq.${targetUserId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedMatches = (matches?.map(match => {
        const partner = match.user1_id === targetUserId ? match.user2 : match.user1;
        const lastMessage = match.chats?.[match.chats.length - 1];
        let unreadCount = 0;
        if ('user1_unread_count' in match && 'user2_unread_count' in match) {
          unreadCount = match.user1_id === targetUserId ? Number(match.user1_unread_count) : Number(match.user2_unread_count);
        }
        if (!Number.isFinite(unreadCount) || unreadCount < 0) unreadCount = 0;
        return {
          ...match,
          partner,
          last_message_obj: lastMessage,
          unread_messages: unreadCount,
          id: match.id,
          first_name: partner?.first_name || '',
          last_name: partner?.last_name || '',
          last_message: lastMessage?.message || '',
          last_message_time: lastMessage?.created_at || match.created_at
        };
      }) || [])
        .sort((a, b) => {
          const aTime = new Date(a.last_message_time || a.created_at).getTime();
          const bTime = new Date(b.last_message_time || b.created_at).getTime();
          return bTime - aTime;
        });

      // Store in cache for ChatPage to use
      window.chatMatchesCache?.set(targetUserId, {
        matches: processedMatches,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Silently handle preload errors
    }
  }, [ensureWindowCaches]);

  // Initialize push notifications silently in background
  const {
    isInitialized: pushInitialized,
    isSupported: pushSupported,
    deviceToken,
    error: pushError,
    sendMatchNotification,
    sendMessageNotification,
    sendLikeNotification,
    recordUserActivity
  } = usePushNotifications(userId);
  
  

  // Record activity on tab changes and meaningful interactions
  useEffect(() => {
    recordUserActivity();
  }, [activeTab, recordUserActivity]);

    // Silent push notification initialization - no user notifications
  useEffect(() => {
    if (pushSupported && !pushError) {
      // Silently initialize notifications
    }
  }, [pushSupported, pushError]);

  // Preload data as soon as app loads - OPTIMIZED FOR ANDROID PERFORMANCE
  useEffect(() => {
    if (!userId) return;

    loadUserLanguage(userId).catch(() => {});

    if (activeTab === 'chat') {
      void preloadChatMatches(userId);
    } else if (activeTab === 'liked') {
      void preloadLikedMeData(userId);
    }

    const timeout = setTimeout(() => {
      if (activeTab !== 'chat') {
        void preloadChatMatches(userId);
      }
      if (activeTab !== 'liked') {
        void preloadLikedMeData(userId);
      }
    }, 1000);

    const interval = setInterval(() => {
      if (activeTab !== 'chat') {
        void preloadChatMatches(userId);
      }
      if (activeTab !== 'liked') {
        void preloadLikedMeData(userId);
      }
    }, 60000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [activeTab, preloadChatMatches, preloadLikedMeData, userId]);

  // Listen for new match events to refresh chat data
  useEffect(() => {
    if (!userId) return;
    
    const handleNewMatch = (event: CustomEvent) => {
      if (event.detail.userId === userId) {
        // Reload chat matches in background
        void preloadChatMatches(userId);
        // Update unread count
        void fetchUnreadCount();
      }
    };
    
    window.addEventListener('newMatch', handleNewMatch as EventListener);
    
    return () => {
      window.removeEventListener('newMatch', handleNewMatch as EventListener);
    };
  }, [fetchUnreadCount, preloadChatMatches, userId]);

  // Initial load / user change: fetch profile + unread once.
  // Do not refetch unread purely on tab switch; it should only change due to realtime events or reading a thread.
  useEffect(() => {
    if (!userId) return;
    void fetchUserProfile();
    void fetchUnreadCount();
  }, [fetchUnreadCount, fetchUserProfile, userId]);

  // Preload tab-specific data without mutating unread state.
  useEffect(() => {
    if (!userId) return;
    if (activeTab === 'chat') {
      void preloadChatMatches(userId);
    } else if (activeTab === 'liked') {
      void preloadLikedMeData(userId);
    }
  }, [activeTab, preloadChatMatches, preloadLikedMeData, userId]);

  useEffect(() => {
    if (!userId) return;

    // Use two filtered subscriptions for better performance (matches user1 or user2)
    const channel1 = supabase
      .channel(`nav-matches-user1-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `user1_id=eq.${userId}`
      }, () => {
        throttledFetchUnreadCount();
      })
      .subscribe();

    const channel2 = supabase
      .channel(`nav-matches-user2-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `user2_id=eq.${userId}`
      }, () => {
        throttledFetchUnreadCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [throttledFetchUnreadCount, userId]);

  // Refresh unread badge based on chat events addressed to the user
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`nav-chats-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
        },
        (payload) => {
          const row = payload.new as { match_id?: string; sender_id?: string; is_read?: boolean | null };
          if (!row?.match_id) return;
          if (row.sender_id === userId) return;
          if (row.is_read === true) return;
          if (!userMatchIdSetRef.current.has(row.match_id)) return;
          throttledFetchUnreadCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chats',
        },
        (payload) => {
          const row = payload.new as { match_id?: string; sender_id?: string };
          if (!row?.match_id) return;
          if (!userMatchIdSetRef.current.has(row.match_id)) return;
          // Read receipts will come through as UPDATEs; refresh either way.
          throttledFetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [throttledFetchUnreadCount, userId]);

  const handleNavigateToChat = useCallback(() => {
    setActiveTab('chat');
  }, []);

  const handleShowTerms = useCallback(() => {
    setShowTerms(true);
  }, []);

  const handleShowPrivacy = useCallback(() => {
    setShowPrivacy(true);
  }, []);

  const handleBackFromTerms = useCallback(() => {
    setShowTerms(false);
  }, []);

  const handleBackFromPrivacy = useCallback(() => {
    setShowPrivacy(false);
  }, []);

  // Memoize tab change handler to prevent re-creating function on every render
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  // Memoize the current page component to prevent unnecessary re-renders
  const currentPageComponent = useMemo(() => {
    // Don't render pages until profile is loaded
    if (!profile) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-white">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
        </div>
      );
    }
    
    switch (activeTab) {
      case 'dripcheck':
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} onNavigateToProfile={() => setActiveTab('profile')} isPremium={isPremium} profileCompletion={profileCompletion} />;
      case 'chat':
        return <ChatPage currentUser={profile} onUnreadChange={forceRefreshUnreadCount} onDetailViewChange={setIsChatDetailOpen} />;
      case 'liked':
        return <LikedMePage key={profile.id} currentUser={profile} isPremium={isPremium} />;
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
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} onNavigateToProfile={() => setActiveTab('profile')} isPremium={isPremium} profileCompletion={profileCompletion} />;
    }
  }, [activeTab, profile, isPremium, profileCompletion, handleNavigateToChat, forceRefreshUnreadCount, setIsChatDetailOpen, fetchUserProfile, onLogout, handleShowTerms, handleShowPrivacy]);

  const renderContent = () => {
    if (showTerms) {
      return <TermsOfService onBack={handleBackFromTerms} />;
    }
    
    if (showPrivacy) {
      return <PrivacyPolicy onBack={handleBackFromPrivacy} />;
    }

    return currentPageComponent;
  };

  if (!userId) {
    return (
      <div className="min-h-fill flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 p-4">
        <div className="text-center bg-white rounded-lg p-8 shadow-lg max-w-md w-full">
          <h2 className="text-xl font-bold text-gray-800 mb-4">{t('errors.noUserData')}</h2>
          <p className="text-gray-600 mb-6">{t('errors.unableToLoadUser')}</p>
          <button
            onClick={onLogout}
            className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-lg font-medium"
          >
            {t('auth.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gray-100" style={{ margin: 0, padding: 0, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {/* Make this parent the scrolling container so sticky children (header/nav) stick relative to it */}
      <div className="w-full h-full flex flex-col bg-white relative shadow-md" style={{ margin: 0, padding: 0 }}>
        
        {/* Fixed Header - always visible */}
          {/* Fixed Header */}
          {!showTerms && !showPrivacy && (
            <div data-driplove-global-header className="fixed top-0 left-0 right-0 w-full bg-pink-50 shadow-sm z-50 border-2 border-pink-300 rounded-b-2xl" style={{ margin: 0, padding: 0, top: 0 }}>
              <div 
                className="px-2 py-2 flex justify-between items-center"
                style={{
                  paddingTop: getPlatformSync() === 'ios' 
                    ? 'clamp(10px, env(safe-area-inset-top, 10px), 40px)' 
                    : getPlatformSync() === 'android'
                    ? '24px'
                    : '8px'
                }}
              >
                <img src="/driplove-logo.webp" alt="DripLove Logo" className="h-10" loading="lazy" decoding="async" />
                <div className="text-right">
                  <div className="text-sm font-bold text-black leading-tight">
                    <div>{t('common.findYour')}</div>
                    <div>{t('common.perfectMatch')}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Main Content */}
        <div 
          className={`flex-1 overflow-auto ${!showTerms && !showPrivacy ? 'pt-[56px] pb-[80px]' : ''}`}
          style={{ height: '100%', position: 'relative' }}
        >
          {/* Lazy load tabs on first access, then keep mounted in background */}
          {/* Use visibility instead of conditional rendering to preserve state */}
          <Suspense fallback={<TabLoader />}>
            <div 
              className="w-full h-full" 
              style={{ display: activeTab === 'dripcheck' ? 'block' : 'none' }}
            > 
              <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} onNavigateToProfile={() => setActiveTab('profile')} isPremium={isPremium} profileCompletion={profileCompletion} />
            </div>
          </Suspense>

          <Suspense fallback={<TabLoader />}>
            <div 
              className="w-full h-full" 
              style={{ display: activeTab === 'chat' ? 'block' : 'none' }}
            > 
              <ChatPage currentUser={profile} onUnreadChange={forceRefreshUnreadCount} onDetailViewChange={setIsChatDetailOpen} />
            </div>
          </Suspense>

          <Suspense fallback={<TabLoader />}>
            <div 
              className="w-full h-full" 
              style={{ display: activeTab === 'liked' ? 'block' : 'none' }}
            > 
              <LikedMePage currentUser={profile} isPremium={isPremium} />
            </div>
          </Suspense>

          <Suspense fallback={<TabLoader />}>
            <div 
              className="w-full h-full" 
              style={{ display: activeTab === 'profile' ? 'block' : 'none' }}
            > 
              <ProfilePage 
                currentUser={profile} 
                profile={profile} 
                onProfileUpdate={fetchUserProfile} 
                onLogout={onLogout}
                onShowTerms={handleShowTerms}
                onShowPrivacy={handleShowPrivacy}
                isPremium={isPremium}
              />
            </div>
          </Suspense>
        </div>

        {/* Fixed Bottom Nav - always visible */}
  {!showTerms && !showPrivacy && !isKeyboardOpen && !isChatDetailOpen && (
          <div
            className="fixed bottom-0 left-0 right-0 w-full bg-pink-50 z-[99999] rounded-t-2xl border-2 border-pink-300"
            style={{ 
              paddingBottom: getPlatformSync() === 'android' 
                ? '24px' 
                : 'clamp(4px, env(safe-area-inset-bottom, 0px), 8px)' 
            }}
          >
            <div className={`flex justify-around items-center ${getPlatformSync() === 'ios' ? 'pb-5' : ''}`}>
              {[
                { label: t('discover.title'), value: 'dripcheck', icon: DripCoupleIcon }, 
                { label: t('chat.title'), value: 'chat', icon: MessageCircle }, 
                { label: t('matches.liked'), value: 'liked', icon: Users }, 
                { label: t('profile.title'), value: 'profile', icon: User }
              ].map(({ label, value, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => handleTabChange(value)}
                  className={`flex flex-col items-center space-y-1 py-1 px-2 rounded-lg transition-colors relative ${
                    activeTab === value ? 'text-pink-600' : 'text-gray-500'
                  }`}
                >
                  <Icon className="w-6 h-6 shrink-0" />
                  <span className="text-xs font-medium">{label}</span>
                   {value === 'chat' && unreadCount > 0 && (
                     <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 border-2 border-white z-10 flex items-center justify-center">
                       <span className="text-xs text-white font-bold">
                         {unreadCount > 9 ? '9+' : unreadCount}
                       </span>
                     </div>
                   )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rating Dialog - Now triggered by matches instead of timer */}

      {/* App Update Popup - Shows on native apps when update is available */}
      <AppUpdatePopup />
    </div>
  );
};

export default MainApp;

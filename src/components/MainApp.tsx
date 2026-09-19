import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MessageCircle, Users, User, Circle } from 'lucide-react';
// ⭐ ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { isAndroidPlatform, isIOSPlatform, getPlatformSafe } from '@/utils/platformUtils';
import DripCoupleIcon from '@/components/DripCoupleIcon';
import AppUpdatePopup from '@/components/AppUpdatePopup';
import FreeTrialBottomSheet from '@/components/FreeTrialBottomSheet';
import { App } from '@capacitor/app';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { loadUserLanguage } from '@/utils/languageSync';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import type { ChatMatchesCacheValue, CircleCacheValue, CircleRowsCacheValue, LikedMeCacheValue } from '@/types/cacheTypes';
import { fetchCirclePool } from '@/utils/circlePoolFetch';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import { readCachedPremiumStatus, writeCachedPremiumStatus } from '@/utils/premiumStatusCache';
import { reconcileStuckPendingImages } from '@/utils/invokeImageModeration';
import { enablePrivacyScreen, disablePrivacyScreen } from '@/utils/privacyScreenBridge';
import { setNotificationNavHandler } from '@/services/pushNotifications';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type UserImageRow = Database['public']['Tables']['user_images']['Row'];

// Lazy load tab components - reduces initial bundle by ~700KB

// Lazy load tab components - reduces initial bundle by ~700KB
// Each component only loads when user navigates to that tab
const DiscoverPage = lazy(() => import('@/components/DiscoverPage'));
const CirclePage = lazy(() => import('@/components/CirclePage'));
const ChatPage = lazy(() => import('@/components/ChatPage'));
const LikedMePage = lazy(() => import('@/components/LikedMePage'));
const TermsOfService = lazy(() => import('@/components/TermsOfService'));
const PrivacyPolicy = lazy(() => import('@/components/PrivacyPolicy'));
// Was statically imported (forcing it, plus ImageManagement and
// ProfilePreviewModal, into the main startup bundle for every user even if
// they never open Profile) despite the "warm secondary tab bundles" effect
// below already treating it as a separate lazy chunk to prefetch - that
// prefetch was a no-op the whole time since the static import already
// pulled it in. Now it's a real lazy chunk like the others.
const ProfilePage = lazy(() => import('@/components/ProfilePage'));

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

  // Keyed per-user (not a single global key) - otherwise a second account
  // logging in during the same app session would inherit whatever tab the
  // previous account last had open.
  const getInitialTab = (): string => {
    try {
      // A tapped/foreground-clicked notification (see pushNotifications.ts'
      // handleNotificationAction / showInAppNotification) navigates here via
      // window.location.href = '/?tab=<tab>[&matchId=...]', which reloads
      // the whole SPA fresh. Without reading it here, that reload always
      // landed on whatever tab sessionStorage/default said instead - which
      // is why every notification tap appeared to just open Discover.
      const tabFromUrl = new URLSearchParams(window.location.search).get('tab');
      if (tabFromUrl === 'chat' || tabFromUrl === 'liked' || tabFromUrl === 'profile' || tabFromUrl === 'dripcheck' || tabFromUrl === 'circle') {
        return tabFromUrl;
      }

      const savedUserId = sessionStorage.getItem('mainapp_active_tab_user');
      if (savedUserId !== userId) return 'dripcheck';
      const saved = sessionStorage.getItem('mainapp_active_tab');
      return saved || 'dripcheck';
    } catch {
      return 'dripcheck';
    }
  };
  
  // ⭐ CRITICAL FIX: Move ALL hooks BEFORE any conditional returns
  // ⭐ STATE PRESERVATION: Restore active tab from sessionStorage when returning from games
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => {
    const initialTab = getInitialTab();
    return new Set(['dripcheck', initialTab]);
  });
  const [profileTabSignal, setProfileTabSignal] = useState(0);
  const [advertiseSignal, setAdvertiseSignal] = useState(0);
  const handleNavigateToAdvertise = () => {
    setActiveTab('profile');
    setAdvertiseSignal(prev => prev + 1);
  };
  // Jump to Profile with the Photos section expanded (revealing the "Verify
  // Identity" card) - used by DiscoverPage's swipe-triggered verify prompt.
  const [verifySignal, setVerifySignal] = useState(0);
  const handleNavigateToVerify = () => {
    setActiveTab('profile');
    setVerifySignal(prev => prev + 1);
  };
  // A tapped notification, handled while the app is already running: these
  // carry the exact thing to open (a conversation, a person in Circle) into
  // the tab that owns it, which then clears them once consumed.
  const [chatDeepLinkMatchId, setChatDeepLinkMatchId] = useState<string | null>(null);
  const [circleDeepLinkProfileId, setCircleDeepLinkProfileId] = useState<string | null>(null);
  const [isChatDetailOpen, setIsChatDetailOpen] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  // undefined = premium status not yet resolved. DiscoverPage (and others)
  // key off `isPremium !== undefined` to know whether it's safe to enforce
  // the free-tier swipe limit - defaulting this to `false` made every app
  // load/resume briefly look like a free user to that check, which could
  // wrongly trigger the "out of swipes" block for an actual premium user
  // who already had >=29 swipes that day.
  // Seed optimistically from the last *confirmed* premium answer for this
  // device so a paying user never sees the free/upsell UI flash while the
  // subscription RPC is still in flight. We only ever seed `true` - a
  // cached `false` stays `undefined` so nothing is enforced prematurely.
  const [isPremium, setIsPremium] = useState<boolean | undefined>(
    () => (readCachedPremiumStatus(userId) === true ? true : undefined)
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileCompletion, setProfileCompletion] = useState(0);
  // Only the columns actually selected below are stored here.
  const [userImages, setUserImages] = useState<Pick<UserImageRow, 'image_url' | 'is_approved' | 'moderation_status'>[]>([]);
  const { toast } = useToast();

  // Strip the one-time `?tab=` deep-link param once it's been consumed by
  // getInitialTab above, so it doesn't linger in the address bar or get
  // treated as "the last tab" again on a later reload. `matchId` (if any)
  // is left alone - ChatPage's own deep-link effect still needs to read and
  // clear that once the Chat tab has actually mounted.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('tab')) {
      url.searchParams.delete('tab');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⭐ STATE PRESERVATION: Save active tab to sessionStorage whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem('mainapp_active_tab', activeTab);
      if (userId) {
        sessionStorage.setItem('mainapp_active_tab_user', userId);
      }
    } catch {
      // Ignore storage errors
    }
  }, [activeTab, userId]);

  // Screenshot/screen-recording protection for the whole logged-in app -
  // OFF everywhere before this (landing, auth, registration, profile
  // completion), ON for as long as MainApp is mounted. Individual screens
  // that should still be exempt (Profile, the mini-games) locally call
  // .disable() while they're showing and restore this baseline on their own
  // unmount - see useAllowScreenshots.ts. No-op on web (no such API there).
  //
  // Index.tsx already fires this the instant isAuthenticated flips true -
  // faster, since it doesn't wait on MainApp's own lazy-chunk load. This is
  // now just a defensive backup (calling enable()/disable() again is a
  // harmless no-op if already in that state).
  useEffect(() => {
    void enablePrivacyScreen();
    return () => {
      void disablePrivacyScreen();
    };
  }, []);

  // Measure the real rendered height of the fixed header and bottom nav (both
  // grow/shrink with env(safe-area-inset-*) - see their own styles below) and
  // publish them as CSS custom properties. Screens like DiscoverPage that need
  // to reserve exactly this much space read these vars instead of hardcoding a
  // guessed pixel number that silently goes stale the moment either bar's real
  // height changes on some device.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-driplove-global-header]');
    const bottomNav = document.querySelector<HTMLElement>('[data-driplove-bottom-nav]');
    const root = document.documentElement;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        if (entry.target === header) {
          root.style.setProperty('--app-header-height', `${height}px`);
        } else if (entry.target === bottomNav) {
          // borderBoxSize excludes margin, but the nav's marginBottom (safe-area
          // inset + gap) is real visual space below it that callers reserving
          // "the bottom nav's height" need included too - otherwise this var
          // undercounts by exactly that margin, which is 0 on web/Android but
          // ~34px on iOS devices with a home indicator, causing anything
          // positioned via this var to overlap the nav only on those devices.
          const marginBottom = parseFloat(getComputedStyle(entry.target).marginBottom) || 0;
          root.style.setProperty('--app-bottom-nav-height', `${height + marginBottom}px`);
        }
      }
    });

    if (header) observer.observe(header);
    if (bottomNav) observer.observe(bottomNav);

    return () => observer.disconnect();
  }, [activeTab, showTerms, showPrivacy, isKeyboardOpen, isChatDetailOpen]);

  // Keep visited tabs in sync even when activeTab changes outside handleTabChange.
  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
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
          .eq('user_id', data.id)
          // image_order = -1 marks a rejected/superseded row kept only for
          // the admin audit trail - same exclusion ProfilePage/ImageManagement
          // use, so completion here matches what the user actually sees.
          .neq('image_order', -1);

        if (!imagesError && images) {
          setUserImages(images);
          // Calculate profile completion using the same method as ProfilePage
          const completionResult = calculateProfileCompletion(data, images);
          setProfileCompletion(completionResult.completion);
        }
      } catch (imgErr) {
        console.error('[MainApp] Failed to fetch images for profile completion:', imgErr);
      }

      // Best-effort: silently retry moderation for any of this user's own
      // photos still stuck at 'pending' from an earlier failed attempt (see
      // invokeImageModeration.ts). Fire-and-forget - never blocks profile
      // load, and failures here are logged, not surfaced.
      if (data?.id) {
        void reconcileStuckPendingImages(data.id);
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
              // Both the RPC and the direct query failed - a transient lookup
              // failure, not a confirmed downgrade. Trust the last confirmed
              // status for this device instead of demoting a paying user to
              // the free swipe cap.
              const cachedPremium = readCachedPremiumStatus(data.id);
              setIsPremium(cachedPremium === true);
            } else {
              const entitledByStatus = fallback?.status === 'active' || fallback?.status === 'cancelled';
              const notExpired = !fallback?.expires_at || new Date(fallback.expires_at) > new Date();
              const entitled = !!fallback && fallback.plan_name === 'premium' && entitledByStatus && notExpired;
              setIsPremium(entitled);
              writeCachedPremiumStatus(data.id, entitled);
            }
          } else {
            const statusRaw = Array.isArray(subData) ? subData[0] : subData;
            const status = (statusRaw && typeof statusRaw === 'object')
              ? (statusRaw as { plan_name?: unknown; is_active?: unknown })
              : null;
            const entitled = Boolean(status && status.plan_name === 'premium' && status.is_active === true);
            setIsPremium(entitled);
            writeCachedPremiumStatus(data.id, entitled);
          }
        } catch (subErr) {
          console.error('[MainApp] Subscription check failed:', subErr);
          // Transient failure (network blip, thrown exception) - not a
          // confirmed status change. Fall back to the last confirmed answer.
          const cachedPremium = readCachedPremiumStatus(data.id);
          setIsPremium(cachedPremium === true);
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
      // Include minimal partner fields so unread badge can match ChatPage
      // visibility - the last-message data comes from the separate,
      // properly bounded query below (unread counts themselves come from
      // the user1_unread_count/user2_unread_count columns, not from
      // inspecting individual chat rows here).
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id,
          user1_id,
          user2_id,
          user1_unread_count,
          user2_unread_count,
          user1:profiles!matches_user1_id_fkey(id, is_archived),
          user2:profiles!matches_user2_id_fkey(id, is_archived)
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

  // The app's actual visible height, tracked live - not assumed from 100vh/100dvh.
  // `position: fixed; inset: 0` (or 100dvh) sizes against the browser's LAYOUT
  // viewport, which on a real mobile browser (Chrome/Safari's own address bar +
  // nav buttons, not a device notch/home-indicator env() covers) can be taller
  // than what's actually visible on screen - the bottom nav then renders "correctly"
  // by CSS, but ends up sitting underneath the browser's own UI chrome, invisible.
  // window.visualViewport.height is the one number that always reflects the real,
  // currently-visible area (shrinks when the browser chrome or keyboard is showing,
  // grows back the instant either is dismissed) - driving the app's own height from
  // it directly, in JS, sidesteps any CSS viewport-unit ambiguity entirely.
  const [appViewportHeight, setAppViewportHeight] = useState<number | null>(
    () => (typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : null)
  );
  useEffect(() => {
    const sync = () => {
      setAppViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', sync);
      window.visualViewport.addEventListener('scroll', sync);
    }
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', sync);
        window.visualViewport.removeEventListener('scroll', sync);
      }
    };
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
    if (!window.circleCache) {
      window.circleCache = new Map<string, CircleCacheValue>();
    }
    if (!window.circleRowsCache) {
      window.circleRowsCache = new Map<string, CircleRowsCacheValue>();
    }
  }, []);

  // Global Circle preloader - mirrors preloadChatMatches/preloadLikedMeData
  // below so Circle gets the same "already warm by the time you tap the tab"
  // treatment instead of always starting from a blank loading spinner.
  const preloadCircleData = useCallback(async (targetUserId: string) => {
    ensureWindowCaches();
    if (!profile) return;
    try {
      const pool = await fetchCirclePool(profile, isPremium);
      window.circleCache?.set(targetUserId, { pool, timestamp: Date.now() });
    } catch {
      // Silently handle preload errors - CirclePage falls back to its own
      // live fetch if no cache ends up populated.
    }
  }, [ensureWindowCaches, profile, isPremium]);

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
          .neq('image_order', -1)
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
          .neq('image_order', -1)
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
        .order('created_at', { ascending: false })
        .limit(1, { foreignTable: 'chats' })
        .order('created_at', { foreignTable: 'chats', ascending: false });

      if (error) throw error;

      const processedMatches = (matches?.map(match => {
        const partner = match.user1_id === targetUserId ? match.user2 : match.user1;
        const lastMessage = match.chats?.[0];
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

  // The push icon badge (iOS aps.badge / Android setNumber, both driven by
  // profiles.badge_count - see send-push-notification) only ever goes UP,
  // incremented by 1 per push sent server-side. Resetting it back to 0 is
  // this app's job, whenever the user actually opens/returns to it - both
  // on cold start and every time the app comes back to the foreground.
  useEffect(() => {
    if (!userId) return;

    const resetBadge = () => {
      supabase.rpc('reset_badge_count').then(({ error }) => {
        if (error) console.error('Failed to reset badge count:', error);
      });
    };

    resetBadge();
    const listenerPromise = App.addListener('resume', resetBadge);
    return () => {
      listenerPromise.then((listener) => listener.remove()).catch(() => {});
    };
  }, [userId]);

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
    } else if (activeTab === 'circle') {
      void preloadCircleData(userId);
    }

    const timeout = setTimeout(() => {
      if (activeTab !== 'chat') {
        void preloadChatMatches(userId);
      }
      if (activeTab !== 'liked') {
        void preloadLikedMeData(userId);
      }
      if (activeTab !== 'circle') {
        void preloadCircleData(userId);
      }
    }, 1000);

    const interval = setInterval(() => {
      if (activeTab !== 'chat') {
        void preloadChatMatches(userId);
      }
      if (activeTab !== 'liked') {
        void preloadLikedMeData(userId);
      }
      if (activeTab !== 'circle') {
        void preloadCircleData(userId);
      }
    }, 60000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [activeTab, preloadChatMatches, preloadLikedMeData, preloadCircleData, userId]);

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

    const unreadDelayMs = isAndroidPlatform() ? 1300 : 700;
    const unreadTimer = window.setTimeout(() => {
      void fetchUnreadCount();
    }, unreadDelayMs);

    return () => {
      window.clearTimeout(unreadTimer);
    };
  }, [fetchUnreadCount, fetchUserProfile, userId]);

  // Warm secondary tab bundles after startup so first tab switch feels instant.
  useEffect(() => {
    if (!profile) return;

    const warm = () => {
      void import('@/components/ChatPage');
      void import('@/components/LikedMePage');
      void import('@/components/ProfilePage');
      void import('@/components/CirclePage');
    };

    const warmDelayMs = isAndroidPlatform() ? 2200 : 1500;
    const timer = window.setTimeout(() => {
      const w = window as Window & {
        requestIdleCallback?: (callback: () => void) => number;
      };

      if (typeof w.requestIdleCallback === 'function') {
        w.requestIdleCallback(() => warm());
      } else {
        warm();
      }
    }, warmDelayMs);

    return () => window.clearTimeout(timer);
  }, [profile]);

  // Preload tab-specific data without mutating unread state.
  useEffect(() => {
    if (!userId) return;
    if (activeTab === 'chat') {
      void preloadChatMatches(userId);
    } else if (activeTab === 'liked') {
      void preloadLikedMeData(userId);
    } else if (activeTab === 'circle') {
      void preloadCircleData(userId);
    }
  }, [activeTab, preloadChatMatches, preloadLikedMeData, preloadCircleData, userId]);

  useEffect(() => {
    if (!userId) return;
    // Once the Chat tab has been visited, it stays mounted (hidden, not
    // unmounted - see the visitedTabs render logic below) and keeps its own
    // equivalent matches subscriptions alive for the rest of the session,
    // already forwarding every relevant change to forceRefreshUnreadCount
    // via its onUnreadChange prop. Without this bail, both this component
    // and ChatPage would run near-duplicate matches subscriptions
    // indefinitely once Chat has ever been opened once - real, unnecessary
    // realtime connection overhead that only grows with concurrent users.
    if (visitedTabs.has('chat')) return;

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
  }, [throttledFetchUnreadCount, userId, visitedTabs]);

  // Refresh unread badge based on chat events addressed to the user - see
  // the identical visitedTabs('chat') bail above; ChatPage's own copy of
  // this subscription already forwards every event here via onUnreadChange
  // once it's mounted.
  useEffect(() => {
    if (!userId) return;
    if (visitedTabs.has('chat')) return;

    // Filtered server-side by recipient_id (see the chats.recipient_id
    // migration) instead of subscribing to every INSERT/UPDATE on the whole
    // table and filtering client-side after receiving it - that old pattern
    // broadcasts every message any user sends to every connected client.
    const channel = supabase
      .channel(`nav-chats-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { match_id?: string; sender_id?: string; is_read?: boolean | null };
          if (!row?.match_id) return;
          if (row.sender_id === userId) return;
          if (row.is_read === true) return;
          throttledFetchUnreadCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chats',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          // Read receipts will come through as UPDATEs; refresh either way.
          throttledFetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [throttledFetchUnreadCount, userId, visitedTabs]);

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
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    setActiveTab(tab);
    // Bump a signal every time Profile is (re-)selected, including taps while it's
    // already the active tab, so ProfilePage always drops its preview screen and
    // shows the real profile instead of leaving the preview stuck open.
    if (tab === 'profile') {
      setProfileTabSignal((s) => s + 1);
    }
  }, []);

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
    <div
      className="w-full bg-black"
      style={{
        margin: 0,
        padding: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // Prefer the live-tracked visualViewport height (see appViewportHeight above)
        // over any CSS viewport unit - it's the one source of truth for what's
        // actually visible right now, not what the layout viewport claims. Falls
        // back to 100dvh (which itself falls back to 100vh in browsers that don't
        // understand the unit - an unsupported value is simply ignored, leaving the
        // previous declaration in effect) only before the very first measurement.
        height: appViewportHeight != null ? `${appViewportHeight}px` : '100dvh',
        bottom: 'auto',
        overflow: 'hidden',
        // Landscape on a notched/rounded-corner device puts the notch or a rounded
        // corner on the LEFT or RIGHT edge instead of top/bottom - env() reports
        // that as inset-left/right, not inset-top/bottom, so it's a separate pair
        // of insets from the header/nav's own top/bottom handling below.
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        boxSizing: 'border-box',
      }}
    >
      {/* Make this parent the scrolling container so sticky children (header/nav) stick relative to it */}
      <div className="w-full h-full flex flex-col bg-black relative shadow-md" style={{ margin: 0, padding: 0 }}>
        
        {/* Fixed Header - always visible */}
          {/* Fixed Header */}
          {!showTerms && !showPrivacy && (
            <div
              data-driplove-global-header
              // A real flex child (first item in MainApp's own flex column), not
              // position: fixed - its natural rendered height is what pushes the
              // content below it down, guaranteed by the browser's own layout
              // engine. No JS measurement, no CSS var, no timing race: the
              // content area below can never start any higher than this box's
              // real bottom edge, on any device, on the very first frame.
              className="relative w-full z-50 flex-shrink-0"
              style={{
                margin: 0,
                padding: 0,
                // Same compact, fully solid bar sized to its own content on
                // every tab - this box's own size never changes. The pink
                // border is drawn by a dedicated overlay div (last child
                // below), not this element's own `border`, so it always
                // paints on top of the feather tail instead of the two
                // fighting over the exact same shared bottom-edge pixels.
                pointerEvents: 'none',
              }}
            >
              {/* Background - fully solid, no fade, clipped to match the rounded
                  bottom corners of the pink border. */}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background: 'rgba(0,0,0,0.95)',
                  backdropFilter: 'blur(18px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                  borderBottomLeftRadius: '18px',
                  borderBottomRightRadius: '18px',
                }}
              />
              <div
                className="relative flex justify-between items-center"
                style={{
                  // env(safe-area-inset-top) is now reliable on Android too (see
                  // @capacitor-community/safe-area setup in src/main.tsx), so this no
                  // longer needs a platform branch with a hardcoded Android guess.
                  // Floor nudged up from 8px to 16px - a bit of breathing room above
                  // the logo/header text even on devices with no safe-area inset.
                  // The extra +8px on top of the safe-area inset itself (and raised
                  // ceiling to match) gives a bit more clearance below the safe area
                  // on notched/Dynamic Island devices, where the header previously
                  // sat right at its edge.
                  paddingTop: 'clamp(16px, calc(env(safe-area-inset-top, 16px) + 8px), 48px)',
                  // Scales with viewport width instead of a fixed px-4 py-2, so a
                  // narrow/small-screen Android phone gets a proportionally smaller
                  // header instead of the same absolute padding as a large phone.
                  paddingLeft: 'clamp(10px, 4vw, 16px)',
                  paddingRight: 'clamp(10px, 4vw, 16px)',
                  paddingBottom: 'clamp(6px, 2vw, 8px)',
                }}
              >
                <img
                  src="/driplove-logo.webp"
                  alt="DripLove Logo"
                  loading="lazy"
                  decoding="async"
                  style={{ height: 'clamp(30px, 9vw, 40px)', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }}
                />
                <div className="text-right">
                  <div
                    className="font-brush font-bold"
                    style={{
                      color: '#ffffff',
                      // Script fonts read smaller than a sans font at the same
                      // px size, so this clamp runs a bit larger than the
                      // plain-text version did.
                      fontSize: 'clamp(15px, 4.2vw, 19px)',
                      textShadow: '0 1px 3px rgba(0,0,0,0.5), 0 1px 8px rgba(0,0,0,0.35)',
                    }}
                  >
                    <div>{t('common.findYour')}</div>
                    <div>{t('common.perfectMatch')}</div>
                  </div>
                </div>
              </div>

              {/* Small unbordered feather tail for Discover/DripCheck only -
                  positioned right below the border box via top: 100%, so it
                  can never affect the border box's own size/position. */}
              {activeTab === 'dripcheck' && (
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0"
                  style={{
                    top: 'calc(100% - 10px)',
                    height: '44px',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), transparent)',
                  }}
                />
              )}

              {/* Border overlay - painted last (on top of the background AND
                  the feather tail above), so it's always visible instead of
                  getting covered where the feather starts right at this same
                  bottom edge. */}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  borderLeft: '1px solid rgba(236,72,153,0.55)',
                  borderRight: '1px solid rgba(236,72,153,0.55)',
                  borderBottom: '1px solid rgba(236,72,153,0.55)',
                  borderBottomLeftRadius: '20px',
                  borderBottomRightRadius: '20px',
                }}
              />
            </div>
          )}

        {/* Main Content */}
        <div
          // Discover's own card is a fixed, non-scrolling swipe surface - it never
          // needs this wrapper's scroll. Real mobile browsers (iOS Safari/Chrome
          // especially) rubber-band/overscroll an `overflow-auto` box by a few px on
          // any touch, which - if the card were ever even marginally taller than
          // its reserved space (e.g. the CSS vars below not being populated yet on
          // the very first paint, before MainApp's ResizeObserver has measured the
          // real header/nav) - would momentarily reveal that clipped sliver, making
          // the card look like it slides out from under the nav. overflow-hidden on
          // this one tab removes that possibility outright: there is nothing to
          // scroll to reveal, no matter what. Other tabs keep normal scrolling.
          className={`flex-1 ${activeTab === 'dripcheck' ? 'overflow-hidden' : 'overflow-auto'}`}
          style={{
            // No padding-top/padding-bottom guesswork here anymore: header and nav
            // are now real flex siblings of this box (see above/below), not
            // position: fixed overlays this box had to reserve space for via a
            // JS-measured pixel guess. flex: 1 (from className) + min-height: 0
            // means this box's height is WHATEVER IS LEFT after the browser lays
            // out the header and nav - it structurally cannot start any higher
            // than the header's bottom edge or extend any lower than the nav's
            // top edge, on any device, with no measurement involved at all.
            minHeight: 0,
            position: 'relative',
            // Small breathing room between the discover card's rounded bottom edge and the
            // floating nav pill below it, so they read as two distinct surfaces instead of
            // touching. Other tabs don't need this gap.
            paddingBottom: activeTab === 'dripcheck' ? 'clamp(6px, 2vw, 10px)' : undefined,
          }}
        >
          {showTerms ? (
            <Suspense fallback={<TabLoader />}>
              <TermsOfService onBack={handleBackFromTerms} />
            </Suspense>
          ) : showPrivacy ? (
            <Suspense fallback={<TabLoader />}>
              <PrivacyPolicy onBack={handleBackFromPrivacy} />
            </Suspense>
          ) : (
          <>
          {/* Lazy load tabs on first access, then keep mounted in background */}
          {/* Use visibility instead of conditional rendering to preserve state */}
          {visitedTabs.has('dripcheck') && (
            <Suspense fallback={<TabLoader />}>
              <div 
                className="w-full h-full" 
                style={{ display: activeTab === 'dripcheck' ? 'block' : 'none' }}
              > 
                <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} onNavigateToProfile={() => handleTabChange('profile')} onNavigateToAdvertise={handleNavigateToAdvertise} onNavigateToVerify={handleNavigateToVerify} isPremium={isPremium} profileCompletion={profileCompletion} isActiveTab={activeTab === 'dripcheck'} />
              </div>
            </Suspense>
          )}

          {visitedTabs.has('circle') && (
            <Suspense fallback={<TabLoader />}>
              <div
                className="w-full h-full"
                style={{ display: activeTab === 'circle' ? 'block' : 'none' }}
              >
                <CirclePage currentUser={profile} isPremium={isPremium} isActiveTab={activeTab === 'circle'} />
              </div>
            </Suspense>
          )}

          {visitedTabs.has('chat') && (
            <Suspense fallback={<TabLoader />}>
              <div 
                className="w-full h-full" 
                style={{ display: activeTab === 'chat' ? 'block' : 'none' }}
              > 
                <ChatPage currentUser={profile} onUnreadChange={forceRefreshUnreadCount} onDetailViewChange={setIsChatDetailOpen} />
              </div>
            </Suspense>
          )}

          {visitedTabs.has('liked') && (
            <Suspense fallback={<TabLoader />}>
              <div 
                className="w-full h-full" 
                style={{ display: activeTab === 'liked' ? 'block' : 'none' }}
              > 
                <LikedMePage currentUser={profile} isPremium={isPremium} isActiveTab={activeTab === 'liked'} onNavigateToChat={handleNavigateToChat} />
              </div>
            </Suspense>
          )}

          {visitedTabs.has('profile') && (
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
                  isActiveTab={activeTab === 'profile'}
                  profileTabSignal={profileTabSignal}
                  advertiseSignal={advertiseSignal}
                  verifySignal={verifySignal}
                />
              </div>
            </Suspense>
          )}
          </>
          )}
        </div>

        {/* Fixed Bottom Nav - always visible */}
  {!showTerms && !showPrivacy && !isKeyboardOpen && !isChatDetailOpen && (
          <div
            data-driplove-bottom-nav
            // A real flex child (last item in MainApp's own flex column), not
            // position: fixed - the content area above (flex: 1) can only ever
            // occupy the space this box's presence leaves behind, guaranteed by
            // the browser's layout engine rather than a JS-measured padding
            // guess. The floating-pill inset from the screen edges/bottom (which
            // `left-3 right-3` + a fixed `bottom` used to provide) is now plain
            // margin instead.
            className="z-[99999] flex-shrink-0"
            style={{
              // env(safe-area-inset-bottom) is now reliable on Android too (see
              // @capacitor-community/safe-area setup in src/main.tsx). The fixed
              // 22px gap above it is now a clamp so a small-screen phone gets a
              // proportionally smaller gap instead of the same absolute value as
              // a large phone.
              marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + clamp(12px, 4vw, 22px))',
              // Bigger side margins than the old flat mx-3 (12px) - that made
              // the bar stretch nearly edge-to-edge, which is what read as
              // "too wide" even after the internal item spacing was tightened.
              // This actually narrows the bar itself, not just what's inside it.
              marginLeft: 'clamp(28px, 9vw, 46px)',
              marginRight: 'clamp(28px, 9vw, 46px)',
              // A large flat value, not a clamp tuned to roughly match the bar's
              // height - the browser automatically caps an oversized border-radius
              // at half the box's shorter side, so this always renders as a true
              // full pill/stadium shape, at any screen size, without needing to
              // keep re-tuning it against the bar's actual computed height.
              borderRadius: '9999px',
              // Solid: the nav is the fixed end of the page, same role as the header at
              // the top. Page content stops above it on its own now (a real flex
              // sibling, not an overlay), so there's nothing behind this bar that
              // would ever need to show through it.
              background: 'linear-gradient(180deg, #0a0d16, #05060b)',
              border: '1px solid rgba(236,72,153,0.55)',
              boxShadow: '0 10px 30px -8px rgba(236, 72, 153, 0.35), 0 2px 8px rgba(0,0,0,0.2)',
              // Without this, the border-radius above only paints a rounded
              // background/border - it doesn't clip content. The active tab's
              // own highlight pill can then sit close enough to this
              // container's edge that it visually squares off the corner
              // instead of following its curve. Clipping to the same radius
              // guarantees every corner reads as genuinely rounded, always.
              overflow: 'hidden',
            }}
          >
            <div
              className="flex justify-between items-center"
              style={{
                paddingTop: 'clamp(3px, 1.1vw, 5px)',
                paddingBottom: 'clamp(3px, 1.1vw, 5px)',
                // justify-around reserves a HALF-size gap at each edge on top
                // of a full-size gap between items - with only 4 items in a
                // wide bar that's what made both the item-to-item spacing
                // and the edge-to-DripCheck gap read as too loose. Explicit
                // horizontal padding here + justify-between gives direct
                // control over the edge inset instead, independent of and
                // tighter than the between-items spacing.
                paddingLeft: 'clamp(6px, 2vw, 12px)',
                paddingRight: 'clamp(6px, 2vw, 12px)',
              }}
            >
              {[
                { label: t('discover.title'), value: 'dripcheck', icon: DripCoupleIcon },
                { label: 'Circle', value: 'circle', icon: Circle },
                { label: t('chat.title'), value: 'chat', icon: MessageCircle },
                { label: t('matches.liked'), value: 'liked', icon: Users },
                { label: t('profile.title'), value: 'profile', icon: User }
              ].map(({ label, value, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => handleTabChange(value)}
                  className={`flex flex-col items-center gap-0.5 transition-all duration-200 relative ${
                    activeTab === value ? 'text-pink-500' : 'text-gray-400'
                  }`}
                  style={{
                    // Scales down on narrow screens instead of a fixed py-1.5 px-4,
                    // which is what made the whole pill read as oversized on a
                    // small phone.
                    paddingTop: 'clamp(2px, 0.8vw, 4px)',
                    paddingBottom: 'clamp(2px, 0.8vw, 4px)',
                    paddingLeft: 'clamp(6px, 2.5vw, 12px)',
                    paddingRight: 'clamp(6px, 2.5vw, 12px)',
                    ...(activeTab === value ? {
                      // Subtle flat fill, no border/scale - a tight rounded
                      // rectangle that hugs the icon+label, not an oval pill.
                      // Own fixed vertical padding + negative margin (not the
                      // button's own clamp) so the pill stays compact and snug
                      // instead of inheriting the button's taller base padding.
                      background: 'rgba(236,72,153,0.18)',
                      // Now that the box itself is tight (fixed 5px vertical
                      // padding, not the button's taller clamp), a full pill
                      // radius reads as a proper rounded capsule instead of
                      // an oval - the earlier oval came from a big radius on
                      // an oversized box, not the radius value itself.
                      borderRadius: '9999px',
                      marginTop: '-2px',
                      marginBottom: '-2px',
                      // Slightly wider than tall - a touch more horizontal
                      // breathing room around the label than the vertical
                      // gap above/below the icon, so it reads as a proper
                      // pill instead of a perfectly square-ish blob. Top/
                      // bottom trimmed down further and handed straight to
                      // the icon/label below (see their bigger clamp()s) -
                      // same overall pill height, just less empty padding
                      // and a bigger, cleaner icon+text.
                      paddingTop: '3px',
                      paddingBottom: '3px',
                      paddingLeft: '18px',
                      paddingRight: '18px',
                    } : undefined),
                  }}
                >
                  <Icon style={{ width: 'clamp(15px, 4.2vw, 18px)', height: 'clamp(15px, 4.2vw, 18px)' }} className="shrink-0" />
                  <span className="font-medium" style={{ fontSize: 'clamp(9px, 2.6vw, 10px)' }}>{label}</span>
                   {value === 'chat' && unreadCount > 0 && (
                     <div className="absolute top-0 right-0.5 h-4 w-4 rounded-full bg-red-500 border border-white z-10 flex items-center justify-center">
                       <span className="text-[9px] text-white font-bold leading-none">
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

      {/* Free trial offer - one-time bottom sheet, first eligible app open */}
      <FreeTrialBottomSheet userId={userId} />
    </div>
  );
};

export default MainApp;


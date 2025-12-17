import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Users, User } from 'lucide-react';
// ⭐ ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { isAndroidPlatform, isIOSPlatform, getPlatformSync, getPlatformSafe } from '@/utils/platformUtils';
import TermsOfService from '@/components/TermsOfService';
import PrivacyPolicy from '@/components/PrivacyPolicy';
import DripCoupleIcon from '@/components/DripCoupleIcon';
import RatingDialog from '@/components/RatingDialog';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { loadUserLanguage } from '@/utils/languageSync';

// Lazy load tab components - reduces initial bundle by ~700KB
// Each component only loads when user navigates to that tab
const DiscoverPage = lazy(() => import('@/components/DiscoverPage'));
const ChatPage = lazy(() => import('@/components/ChatPage'));
const LikedMePage = lazy(() => import('@/components/LikedMePage'));
const ProfilePage = lazy(() => import('@/components/ProfilePage'));
import AppUpdatePopup from '@/components/AppUpdatePopup';

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
  user: any;
  onLogout: () => void;
}

const MainApp = ({ user, onLogout }: MainAppProps) => {
  const { t, i18n } = useTranslation();
  
  // ⭐ CRITICAL FIX: Move ALL hooks BEFORE any conditional returns
  const [activeTab, setActiveTab] = useState('dripcheck');
  const [isChatDetailOpen, setIsChatDetailOpen] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  // Safety check - if no user data, show error (AFTER all hooks)
  if (!user || !user.id) {
    return (
      <div className="min-h-fill flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 p-4">
        <div className="text-center bg-white rounded-lg p-8 shadow-lg max-w-md w-full">
          <h2 className="text-xl font-bold text-gray-800 mb-4">{t('errors.noUserData')}</h2>
          <p className="text-gray-600 mb-6">
            {t('errors.unableToLoadUser')}
          </p>
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
  }, [user?.id]);

  /**
   * PROGRESSIVE LOADING SYSTEM FOR DISCOVER PAGE
   * 
   * This system implements a 3-phase progressive loading strategy:
   * 
   * PHASE 1 (Immediate): Load first image only for first 5 profiles
   * - Ensures instant display when user opens DripCheck tab
   * - Minimal data transfer for fastest initial load
   * 
   * PHASE 2 (500ms delay): Load remaining images for first 5 profiles
   * - Happens after initial render is complete
   * - Loads 2nd, 3rd, 4th, 5th images for smooth swiping
   * 
   * PHASE 3 (2s delay): Load first images for next 10 profiles (6-15)
   * - Prepares upcoming profiles while user is swiping
   * - Ensures continuous smooth experience
   * 
   * REFILL SYSTEM: Continuously monitors profile count and refills when needed
   * - Triggers when less than 5 profiles remain
   * - Fetches 15 new profiles and preloads their first images
   * - Maintains infinite scrolling experience
   */
  const preloadDiscoverData = async (userId: string) => {
    try {
      // Parallel queries for better performance
      const [
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses },
        { data: currentUserData }
      ] = await Promise.all([
        supabase
          .from('likes')
          .select('liked_id')
          .eq('liker_id', userId),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
        supabase
          .from('passes')
          .select('passed_id, passed_at')
          .match({ passer_id: userId })
          .gte('passed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('profiles')
          .select('max_distance, distance_preference, country, min_age, max_age, preference')
          .eq('id', userId)
          .single()
      ]);

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const hiddenPassedIds = recentPasses?.map(p => p.passed_id) || [];
      const excludedIds = [...likedUserIds, ...blockedUserIds, ...hiddenPassedIds, userId];
      
      const userMaxDistance = currentUserData?.max_distance || currentUserData?.distance_preference || 50;
      // Fix: Match the correct values stored in database ('male', 'female', 'everyone')
      const allowedGenders = currentUserData?.preference === 'male' ? ['male'] : 
                            currentUserData?.preference === 'female' ? ['female'] : 
                            currentUserData?.preference === 'everyone' || currentUserData?.preference === 'both' ? ['male', 'female', 'other'] :
                            ['male', 'female', 'other']; // Default to all if preference is not set

      // Skip query if user country is not set
      if (!currentUserData?.country) {
        console.log('[MainApp] Skipping preload - user country not set');
        return;
      }

      // Get location-based matches (simplified for preloading)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('country', currentUserData.country)
        .limit(25);

      if (error) throw error;

      // Apply age filtering
      const userMinAge = currentUserData?.min_age || 18;
      const userMaxAge = currentUserData?.max_age || 99;
      
      const calculateAge = (dateOfBirth: string): number => {
        const today = new Date();
        const birthDate = new Date(dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        
        return age;
      };

      let filteredProfiles = (profiles || []).filter(profile => {
        if (!profile.date_of_birth) return false;
        const age = calculateAge(profile.date_of_birth);
        return age >= userMinAge && age <= userMaxAge;
      });

      // Add empty images array and shuffle
      const profilesWithImages = filteredProfiles
        .filter(profile => profile.id !== userId)
        .map(profile => ({
          ...profile,
          images: []
        }));

      const shuffled = profilesWithImages.sort(() => 0.5 - Math.random());

      // Load saved profile index
      const savedId = localStorage.getItem('driplove_last_profile_id');
      const savedTime = parseInt(localStorage.getItem('driplove_last_profile_time') || '0');
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const isSavedValid = savedId && Date.now() - savedTime < twentyFourHours;

      let indexToShow = 0;
      if (isSavedValid) {
        const savedIndex = shuffled.findIndex(p => p.id === savedId);
        if (savedIndex !== -1) {
          indexToShow = savedIndex;
        }
      }

      // Progressive Image Loading System
      const imageMap: { [key: string]: string[] } = {};
      
      if (shuffled.length > 0) {
        // PHASE 1: Load ONLY first image for immediate display (first 5 profiles)
        const immediateProfiles = shuffled.slice(0, 5);
        for (const profile of immediateProfiles) {
          try {
            const { data: images } = await supabase
              .from('user_images')
              .select('user_id, image_url, image_order')
              .eq('user_id', profile.id)
              .eq('is_approved', true)
              .order('image_order', { ascending: true })
              .limit(1); // Only first image for speed

            if (images?.length) {
              imageMap[profile.id] = images.map(img => img.image_url);
            }
          } catch (error) {
            // Silently handle individual image loading errors
          }
        }

        // Store initial cache with first images only
        if (typeof window !== 'undefined' && (window as any).discoverCache) {
          (window as any).discoverCache.set(userId, {
            potentialMatches: shuffled,
            userImages: imageMap,
            userDistances: {},
            currentIndex: indexToShow,
            timestamp: Date.now(),
            fullyLoaded: false // Flag to track loading state
          });
        }

        // PHASE 2: Progressive loading of remaining images in background
        setTimeout(async () => {
          // Load remaining images for first 5 profiles (2nd, 3rd, 4th images)
          for (const profile of immediateProfiles) {
            try {
              const { data: additionalImages } = await supabase
                .from('user_images')
                .select('user_id, image_url, image_order')
                .eq('user_id', profile.id)
                .eq('is_approved', true)
                .order('image_order', { ascending: true })
                .limit(5); // Get up to 5 images

              if (additionalImages?.length && additionalImages.length > 1) {
                imageMap[profile.id] = additionalImages.map(img => img.image_url);
                
                // Update cache with additional images
                if (typeof window !== 'undefined' && (window as any).discoverCache) {
                  const existingCache = (window as any).discoverCache.get(userId);
                  if (existingCache) {
                    existingCache.userImages[profile.id] = additionalImages.map(img => img.image_url);
                  }
                }
              }
            } catch (error) {
              // Silently handle errors
            }
          }
        }, 500); // Small delay to let initial render happen

        // PHASE 3: Load first images for next batch of profiles
        setTimeout(async () => {
          const nextBatchProfiles = shuffled.slice(5, 15);
          for (const profile of nextBatchProfiles) {
            try {
              const { data: images } = await supabase
                .from('user_images')
                .select('user_id, image_url, image_order')
                .eq('user_id', profile.id)
                .eq('is_approved', true)
                .order('image_order', { ascending: true })
                .limit(1);

              if (images?.length) {
                if (typeof window !== 'undefined' && (window as any).discoverCache) {
                  const existingCache = (window as any).discoverCache.get(userId);
                  if (existingCache) {
                    existingCache.userImages[profile.id] = images.map(img => img.image_url);
                  }
                }
              }
            } catch (error) {
              // Silently handle errors
            }
          }
        }, 2000); // Load next batch after 2 seconds
      }
    } catch (error) {
      // Silently handle preload errors
    }
  };

  // Continuous Profile Refill System - triggered when user approaches end of profiles
  const refillProfilesWhenNeeded = async (userId: string, currentIndex: number) => {
    try {
      const cache = (window as any).discoverCache?.get(userId);
      if (!cache) return;

      const remainingProfiles = cache.potentialMatches.length - currentIndex;
      
      // If less than 5 profiles remaining, load more
      if (remainingProfiles <= 5) {
        // Refilling profiles
        
        // Get current exclusions
        const existingIds = cache.potentialMatches.map((p: any) => p.id);
        const [
          { data: likedUsers },
          { data: blockedUsers },
          { data: recentPasses },
          { data: currentUserData }
        ] = await Promise.all([
          supabase.from('likes').select('liked_id').eq('liker_id', userId),
          supabase.from('blocks').select('blocked_id, blocker_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
          supabase.from('passes').select('passed_id, passed_at').match({ passer_id: userId }).gte('passed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
          supabase.from('profiles').select('max_distance, distance_preference, country, min_age, max_age, preference').eq('id', userId).single()
        ]);

        const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
        const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
        const hiddenPassedIds = recentPasses?.map(p => p.passed_id) || [];
        const excludedIds = [...likedUserIds, ...blockedUserIds, ...hiddenPassedIds, userId, ...existingIds];

        // Fix: Match the correct values stored in database ('male', 'female', 'everyone')
        const allowedGenders = currentUserData?.preference === 'male' ? ['male'] : 
                              currentUserData?.preference === 'female' ? ['female'] : 
                              currentUserData?.preference === 'everyone' || currentUserData?.preference === 'both' ? ['male', 'female', 'other'] :
                              ['male', 'female', 'other']; // Default to all if preference is not set

        // Skip if user country is not set
        if (!currentUserData?.country) {
          console.log('[MainApp] Skipping refill - user country not set');
          return;
        }

        // Fetch new profiles
        const { data: newProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
          .not('id', 'in', `(${excludedIds.join(',')})`)
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .eq('country', currentUserData.country)
          .limit(15);

        if (newProfiles?.length) {
          // Age filtering
          const userMinAge = currentUserData?.min_age || 18;
          const userMaxAge = currentUserData?.max_age || 99;
          
          const calculateAge = (dateOfBirth: string): number => {
            const today = new Date();
            const birthDate = new Date(dateOfBirth);
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
            return age;
          };

          const filteredNewProfiles = newProfiles.filter(profile => {
            if (!profile.date_of_birth) return false;
            const age = calculateAge(profile.date_of_birth);
            return age >= userMinAge && age <= userMaxAge;
          });

          const profilesWithImages = filteredNewProfiles.map(profile => ({
            ...profile,
            images: []
          }));

          // Shuffle new profiles
          const shuffledNew = profilesWithImages.sort(() => 0.5 - Math.random());
          
          // Add to existing cache
          cache.potentialMatches.push(...shuffledNew);
          
          // Preload first images for new profiles in a single batched query for fewer round-trips
          setTimeout(async () => {
            try {
              const profileIds = shuffledNew.slice(0, 5).map(p => p.id);
              if (profileIds.length === 0) return;

              const { data: imagesBatch } = await supabase
                .from('user_images')
                .select('user_id, image_url, image_order')
                .in('user_id', profileIds)
                .eq('is_approved', true)
                .order('image_order', { ascending: true });

              if (imagesBatch && imagesBatch.length) {
                // Group by user_id and set first image for each profile
                const grouped: { [key: string]: string[] } = {};
                imagesBatch.forEach((row: any) => {
                  if (!grouped[row.user_id]) grouped[row.user_id] = [];
                  grouped[row.user_id].push(row.image_url);
                });

                Object.keys(grouped).forEach(uid => {
                  cache.userImages[uid] = grouped[uid];
                });
              }
            } catch (err) {
              // Silently handle errors
            }
          }, 100);

          // Profiles added
        }
      }
    } catch (error) {
      console.error('Error refilling profiles:', error);
    }
  };

  // Make refill function globally available for DiscoverPage to call
  if (typeof window !== 'undefined') {
    (window as any).refillProfilesWhenNeeded = refillProfilesWhenNeeded;
  }

  // Global liked me preloader function
  const preloadLikedMeData = async (userId: string) => {
    try {
      // 1. Get all likes for this user
      const { data: likes, error: likesError } = await supabase
        .from('likes')
        .select('liker_id, created_at')
        .eq('liked_id', userId);
      
      if (likesError) throw likesError;
      if (!likes || likes.length === 0) {
        // Cache empty result
        if (typeof window !== 'undefined' && (window as any).likedMeCache) {
          (window as any).likedMeCache.set(userId, {
            likers: [],
            userImages: {},
            timestamp: Date.now()
          });
        }
        return;
      }

      // 2. Get all matches and blocks in one go
      const [matchesRes, blocksRes] = await Promise.all([
        supabase
          .from('matches')
          .select('user1_id, user2_id')
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
      ]);

      if (matchesRes.error) throw matchesRes.error;
      if (blocksRes.error) throw blocksRes.error;

      const matches = matchesRes.data || [];
      const blockedUsers = blocksRes.data || [];
      const matchedIds = matches.map(match =>
        match.user1_id === userId ? match.user2_id : match.user1_id
      );
      const blockedIds = blockedUsers.map(block =>
        block.blocker_id === userId ? block.blocked_id : block.blocker_id
      );

      // 3. Filter likerIds
      const likerIds = likes
        .map(like => like.liker_id)
        .filter(id => !matchedIds.includes(id) && !blockedIds.includes(id));

      if (likerIds.length === 0) {
        // Cache empty result
        if (typeof window !== 'undefined' && (window as any).likedMeCache) {
          (window as any).likedMeCache.set(userId, {
            likers: [],
            userImages: {},
            timestamp: Date.now()
          });
        }
        return;
      }

      // 4. Fetch all profiles in one go
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', likerIds)
        .neq('is_admin', true);

      if (profileError) throw profileError;

      const likers = profiles || [];

      // 5. Fetch first images for these profiles
      let imagesData = null;
      if (likerIds.length > 0) {
        try {
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
        } catch (error) {
          throw error;
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
        
        // Store initial cache with first images
        if (typeof window !== 'undefined' && (window as any).likedMeCache) {
          (window as any).likedMeCache.set(userId, {
            likers,
            userImages: imageMap,
            timestamp: Date.now(),
            fullyLoaded: false
          });
        }

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
                if (typeof window !== 'undefined' && (window as any).likedMeCache) {
                  const existingCache = (window as any).likedMeCache.get(userId);
                  if (existingCache) {
                    existingCache.userImages = fullImageMap;
                    existingCache.fullyLoaded = true;
                  }
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
  };

  // Global chat preloader function - needs to match ChatPage cache
  const preloadChatMatches = async (userId: string) => {
    try {
      const { data: matches, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin),
          chats(id, message, created_at, sender_id)
        `)
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedMatches = (matches?.map(match => {
        const partner = match.user1_id === userId ? match.user2 : match.user1;
        const lastMessage = match.chats?.[match.chats.length - 1];
        let unreadCount = 0;
        if ('user1_unread_count' in match && 'user2_unread_count' in match) {
          unreadCount = match.user1_id === userId ? Number(match.user1_unread_count) : Number(match.user2_unread_count);
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
      if (typeof window !== 'undefined' && (window as any).chatMatchesCache) {
        (window as any).chatMatchesCache.set(userId, {
          matches: processedMatches,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      // Silently handle preload errors
    }
  };

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

  // Preload data as soon as app loads - OPTIMIZED FOR ANDROID PERFORMANCE
  useEffect(() => {
    if (user?.id) {
      // Load user's saved language preference (non-blocking)
      loadUserLanguage(user.id).catch(() => {});
      
      // IMMEDIATE: Load only the currently active tab's data
      if (activeTab === 'dripcheck') {
        preloadDiscoverData(user.id);
      } else if (activeTab === 'chat') {
        preloadChatMatches(user.id);
      } else if (activeTab === 'liked') {
        preloadLikedMeData(user.id);
      }
      
      // DEFERRED: Load other tabs in background after 1 second (prevents UI blocking)
      setTimeout(() => {
        if (activeTab !== 'dripcheck') {
          preloadDiscoverData(user.id);
        }
        if (activeTab !== 'chat') {
          preloadChatMatches(user.id);
        }
        if (activeTab !== 'liked') {
          preloadLikedMeData(user.id);
        }
      }, 1000);
      
      // Set up periodic refresh every 60 seconds when not on respective tabs
      const interval = setInterval(() => {
        if (activeTab !== 'dripcheck') {
          preloadDiscoverData(user.id);
        }
        if (activeTab !== 'chat') {
          preloadChatMatches(user.id);
        }
        if (activeTab !== 'liked') {
          preloadLikedMeData(user.id);
        }
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [user?.id]);

  // Refresh discover data when switching to dripcheck tab if cache is missing
  useEffect(() => {
    if (user?.id && activeTab === 'dripcheck') {
      // Check if discover cache exists
      const cache = typeof window !== 'undefined' && (window as any).discoverCache?.get(user.id);
      if (!cache) {
        // Defer to prevent blocking tab switch animation
        requestAnimationFrame(() => {
          preloadDiscoverData(user.id);
        });
      }
    }
  }, [activeTab, user?.id]);

  // Listen for new match events to refresh chat data
  useEffect(() => {
    if (!user?.id) return;
    
    const handleNewMatch = (event: CustomEvent) => {
      if (event.detail.userId === user.id) {
        // Reload chat matches in background
        preloadChatMatches(user.id);
        // Update unread count
        fetchUnreadCount();
      }
    };
    
    window.addEventListener('newMatch', handleNewMatch as EventListener);
    
    return () => {
      window.removeEventListener('newMatch', handleNewMatch as EventListener);
    };
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchUserProfile();
      fetchUnreadCount();
      
      // Only preload data for the active tab to save resources
      // Other tabs will load on demand when user switches to them
      if (activeTab === 'dripcheck') {
        preloadDiscoverData(user.id);
      } else if (activeTab === 'chat') {
        preloadChatMatches(user.id);
      } else if (activeTab === 'liked') {
        preloadLikedMeData(user.id);
      }
    }
  }, [user?.id, activeTab]); // Preload based on active tab

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('nav-matches')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
      }, (payload) => {
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

      // Profile fetch complete
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
          // Subscription status updated
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
      console.error('[MainApp] ❌ Error fetching unread count:', error);
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
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} isPremium={isPremium} />;
      case 'chat':
        return <ChatPage currentUser={profile} onUnreadChange={fetchUnreadCount} onDetailViewChange={setIsChatDetailOpen} />;
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
        return <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} isPremium={isPremium} />;
    }
  }, [activeTab, profile, isPremium, handleNavigateToChat, fetchUnreadCount, setIsChatDetailOpen, fetchUserProfile, onLogout, handleShowTerms, handleShowPrivacy]);

  const renderContent = () => {
    if (showTerms) {
      return <TermsOfService onBack={handleBackFromTerms} />;
    }
    
    if (showPrivacy) {
      return <PrivacyPolicy onBack={handleBackFromPrivacy} />;
    }

    return currentPageComponent;
  };

  return (
    <div className="w-full h-screen bg-gray-100" style={{ margin: 0, padding: 0, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {/* Make this parent the scrolling container so sticky children (header/nav) stick relative to it */}
      <div className="w-full h-full flex flex-col bg-white relative shadow-md" style={{ margin: 0, padding: 0 }}>
        
        {/* Fixed Header - always visible */}
          {/* Fixed Header */}
          {!showTerms && !showPrivacy && (
            <div className="fixed top-0 left-0 right-0 w-full bg-white shadow-sm z-50" style={{ margin: 0, padding: 0, top: 0 }}>
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
              <DiscoverPage currentUser={profile} onNavigateToChat={handleNavigateToChat} isPremium={isPremium} />
            </div>
          </Suspense>

          <Suspense fallback={<TabLoader />}>
            <div 
              className="w-full h-full" 
              style={{ display: activeTab === 'chat' ? 'block' : 'none' }}
            > 
              <ChatPage currentUser={profile} onUnreadChange={fetchUnreadCount} onDetailViewChange={setIsChatDetailOpen} />
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
            className="fixed bottom-0 left-0 right-0 w-full bg-white z-[99999]"
            style={{ 
              paddingBottom: getPlatformSync() === 'android' 
                ? '24px' 
                : 'clamp(4px, env(safe-area-inset-bottom, 0px), 6px)' 
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
                  {value === 'dripcheck' ? (
                    <Icon className={`w-7 h-7 ${activeTab === value ? 'fill-current' : ''}`} />
                  ) : (
                    <Icon className={`w-6 h-6 ${activeTab === value ? 'fill-current' : ''}`} />
                  )}
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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, Heart, X, Calendar, MapPin, Shield, ChevronDown, ChevronUp, 
  Briefcase, GraduationCap, Crown, Lock, Clock, User, Quote, Coffee, Search 
} from 'lucide-react';

// ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { getPlatformSync } from '@/utils/platformUtils';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import BlockDialog from './BlockDialog';
import PremiumUpgrade from './PremiumUpgrade';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';

// FIX #1: Import blob cache for instant Android image loading
import { preloadImageToBlob } from '@/utils/imageCache';

// =========================================================
// GLOBAL CACHES
// =========================================================

const LIKED_ME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LIKED_ME_STORAGE_KEY_PREFIX = 'likedMe_v1_';

type LikedMeCacheValue = { 
  likers: any[]; 
  userImages: { [key: string]: string[] }; 
  timestamp: number;
};

const getStorageKey = (userId: string) =>
  `${LIKED_ME_STORAGE_KEY_PREFIX}${userId}`;

const readCacheFromStorage = (userId: string): LikedMeCacheValue | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(getStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LikedMeCacheValue;
    if (!parsed.timestamp) return null;

    const isExpired = Date.now() - parsed.timestamp > LIKED_ME_CACHE_TTL;
    if (isExpired) {
      sessionStorage.removeItem(getStorageKey(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCacheToStorage = (userId: string, value: LikedMeCacheValue) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(getStorageKey(userId), JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const likedMeCache = new Map<string, LikedMeCacheValue>();

const likedMePollIntervals = new Map<string, ReturnType<typeof setInterval>>();

const hasListChanged = (previous: any[], next: any[]) => {
  if (previous.length !== next.length) return true;
  for (let i = 0; i < previous.length; i++) {
    const prev = previous[i];
    const curr = next[i];
    if (!curr || prev.id !== curr.id || prev.updated_at !== curr.updated_at) {
      return true;
    }
  }
  return false;
};

if (typeof window !== 'undefined') {
  (window as any).likedMeCache = likedMeCache;
}

// =========================================================
// COMPONENT START
// =========================================================

interface LikedMePageProps {
  currentUser: any;
  isPremium?: boolean;
}

const LikedMePage = ({ currentUser, isPremium = false }: LikedMePageProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // ------------------
  // STATE HOOKS (must stay in same order forever)
  // ------------------
  const [likers, setLikers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [lockoutEndDate, setLockoutEndDate] = useState<Date | null>(null);
  const [hasInteractedToday, setHasInteractedToday] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  // ------------------
  // REFS
  // ------------------
  const backgroundFetchingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageAbortController = useRef<AbortController | null>(null);

  // ------------------
  // MEMOIZED PLATFORM
  // ------------------
  const platform = useMemo(() => getPlatformSync(), []);

  // ------------------
  // SAFE IMAGE RESOLVER (stable, never creates hooks)
  // ------------------
  const getSafeImageSrc = useCallback(
    (urlOrBlob?: string) => {
      if (!urlOrBlob) return "";

      // Blob URLs always safe
      if (urlOrBlob.startsWith("blob:")) return urlOrBlob;

      // Android NEVER loads remote images directly → must use blob cache
      if (platform === "android") return "";

      // iOS/Web use direct URL
      return urlOrBlob;
    },
    [platform]
  );


  // ⭐ ANDROID OPTIMIZATION: Single debounced resize handler
  const [columnsPerRow, setColumnsPerRow] = useState(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 375;
    if (width >= 1024) return 4;
    if (width >= 768) return 3;
    return 2;
  });
  
  useEffect(() => {
    let rafId: number | null = null;
    
    const updateColumns = () => {
      if (rafId) return; // Skip if already scheduled
      
      rafId = requestAnimationFrame(() => {
        const width = window.innerWidth;
        const newColumns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
        setColumnsPerRow(prev => prev !== newColumns ? newColumns : prev);
        rafId = null;
      });
    };
    
    window.addEventListener('resize', updateColumns, { passive: true });
    return () => {
      window.removeEventListener('resize', updateColumns);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  
  // Ensure virtualizer count is always stable (never undefined)
  const virtualizerCount = useMemo(() => {
    return likers.length > 0 ? Math.ceil(likers.length / columnsPerRow) : 0;
  }, [likers.length, columnsPerRow]);
  
  // ⭐ ANDROID OPTIMIZATION: Memoized row config calculation (replaces 4 separate useStates + useEffect)
  const rowConfig = useMemo(() => {
    const maxWidth = 1400;
    const containerWidth = scrollContainerRef.current 
      ? Math.min(scrollContainerRef.current.clientWidth, maxWidth) 
      : Math.min(typeof window !== 'undefined' ? window.innerWidth : 375, maxWidth);

    // Responsive padding based on columns
    const paddingMap: Record<number, number> = { 2: 8, 3: 32, 4: 48 };
    const gapMap: Record<number, number> = { 2: 12, 3: 40, 4: 56 };
    const vGapMap: Record<number, number> = { 2: 100, 3: 175, 4: 220 };

    const rowPadding = paddingMap[columnsPerRow] ?? 8;
    const horizontalGap = gapMap[columnsPerRow] ?? 12;
    const verticalGap = vGapMap[columnsPerRow] ?? 180;

    const innerWidth = Math.max(0, containerWidth - rowPadding * 2);
    const totalGaps = horizontalGap * (columnsPerRow - 1);
    const cardWidth = (innerWidth - totalGaps) / Math.max(1, columnsPerRow);

    const imageHeight = Math.round(cardWidth * 3 / 4);
    const contentHeight = 56;
    const extra = 8;
    const cardHeight = imageHeight + contentHeight + extra;

    return {
      estimatedRowHeight: Math.max(200, cardHeight),
      rowVerticalGap: verticalGap,
      rowPaddingHorizontal: rowPadding,
      rowColumnGap: horizontalGap
    };
  }, [columnsPerRow]);

  // Destructure for backwards compatibility
  const { estimatedRowHeight, rowVerticalGap, rowPaddingHorizontal, rowColumnGap } = rowConfig;

  // ⭐ CRITICAL FIX: Create stable callbacks OUTSIDE useVirtualizer (hooks can't be nested)
  const getScrollElement = useCallback(() => scrollContainerRef.current, []);
  const getEstimateSize = useCallback(() => estimatedRowHeight, [estimatedRowHeight]);

  // ⭐ Always create virtualizer - don't conditionally enable/disable based on state
  const rowVirtualizer = useVirtualizer({
    count: virtualizerCount,
    getScrollElement,
    estimateSize: getEstimateSize,
    overscan: 5
  });

  const calculateAge = useCallback((dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }, []);

  const checkLockoutStatus = useCallback(async () => {
    if (!currentUser?.id || isPremium) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('like_me_cooldown_until')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching cooldown:', error);
        return;
      }

      if (data?.like_me_cooldown_until) {
        const cooldownDate = new Date(data.like_me_cooldown_until);
        if (cooldownDate > new Date()) {
          setLockoutEndDate(cooldownDate);
        }
      }
    } catch (error) {
      console.error('Error in fetchCooldown:', error);
    }
  }, [currentUser?.id, isPremium]);


  // Background fetching function
  const fetchLikersInBackground = useCallback(async () => {
    if (!currentUser?.id || backgroundFetchingRef.current) return;
    backgroundFetchingRef.current = true;

    try {
      const result = await fetchLikersData(currentUser.id);
      if (result) {
        const { likers: newLikers, userImages: newUserImages } = result;
        const cached = likedMeCache.get(currentUser.id);
        const shouldUpdate = hasListChanged(cached?.likers || [], newLikers);

        if (shouldUpdate) {
          const cacheValue: LikedMeCacheValue = {
            likers: newLikers,
            userImages: newUserImages,
            timestamp: Date.now()
          };

          likedMeCache.set(currentUser.id, cacheValue);
          writeCacheToStorage(currentUser.id, cacheValue);

          setLikers(newLikers);
          setUserImages(newUserImages);
        } else if (cached) {
          cached.timestamp = Date.now();
          writeCacheToStorage(currentUser.id, cached);
        }
      }
    } catch (error) {
      // Silently handle background fetch errors
    } finally {
      backgroundFetchingRef.current = false;
    }
  }, [currentUser?.id]);

  // Shared data fetching logic
  const fetchLikersData = useCallback(async (userId: string) => {
    // 1. Get all likes for this user
    const { data: likes, error: likesError } = await supabase
      .from('likes')
      .select('liker_id, created_at')
      .eq('liked_id', userId);
    
    if (likesError) throw likesError;
    if (!likes || likes.length === 0) {
      return { likers: [], userImages: {} };
    }

    // 2. Get all matches, blocks, and passes in one go
    const [matchesRes, blocksRes, passesRes] = await Promise.all([
      supabase
        .from('matches')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
      supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
      supabase
        .from('passes')
        .select('passed_id')
        .eq('passer_id', userId)
    ]);

    if (matchesRes.error) throw matchesRes.error;
    if (blocksRes.error) throw blocksRes.error;
    if (passesRes.error) throw passesRes.error;

    const matches = matchesRes.data || [];
    const blockedUsers = blocksRes.data || [];
    const passes = passesRes.data || [];
    const matchedIds = matches.map(match =>
      match.user1_id === userId ? match.user2_id : match.user1_id
    );
    const blockedIds = blockedUsers.map(block =>
      block.blocker_id === userId ? block.blocked_id : block.blocker_id
    );
    const passedIds = passes.map(pass => pass.passed_id);

    // 3. Filter likerIds - exclude matched, blocked, and passed profiles
    const likerIds = likes
      .map(like => like.liker_id)
      .filter(id => !matchedIds.includes(id) && !blockedIds.includes(id) && !passedIds.includes(id));

    if (likerIds.length === 0) {
      return { likers: [], userImages: {} };
    }

    // 4. Fetch all profiles in one go
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', likerIds)
      .neq('is_admin', true);

    if (profileError) throw profileError;

    const likers = profiles || [];

    // 5. Fetch all first images for these profiles in one query
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

    // ⭐ FIX #3: TINDER-STYLE - Load ONLY first image for first 3 profiles (not all 200+)
    const imageMap: { [key: string]: string[] } = {};
    if (imagesData) {
      // Group images by user_id
      const imagesByUser: { [key: string]: typeof imagesData } = {};
      for (const img of imagesData) {
        if (!imagesByUser[img.user_id]) {
          imagesByUser[img.user_id] = [];
        }
        imagesByUser[img.user_id].push(img);
      }
      
      // ⭐ Only load first image for first 3 users (priority loading)
      const priorityUserIds = likerIds.slice(0, 3);
      for (const userId of priorityUserIds) {
        if (imagesByUser[userId]?.[0]) {
          imageMap[userId] = [imagesByUser[userId][0].image_url];
        }
      }
    }

    return { likers, userImages: imageMap };
  }, []);

  // ⭐ ANDROID OPTIMIZATION: Lighter preload - skip createImageBitmap on Android (causes lag)
  const preloadFirstProfilesWithBlobs = useCallback(async (
    profiles: { id: string }[], 
    imageUrls: { [key: string]: string[] }
  ) => {
    // ⭐ FIX #4: Cancel previous loads
    if (imageAbortController.current) {
      imageAbortController.current.abort();
    }
    
    const controller = new AbortController();
    imageAbortController.current = controller;

    // ⭐ ANDROID FIX: Only preload first 2 profiles (reduced from 3)
    const profilesToPreload = profiles.slice(0, 2);

    for (const profile of profilesToPreload) {
      const firstImageUrl = imageUrls[profile.id]?.[0];
      if (!firstImageUrl || controller.signal.aborted) break;

      try {
        // ⭐ FIX #1: Preload as blob URL
        const blobUrl = await preloadImageToBlob(firstImageUrl);
        
        if (controller.signal.aborted) break;
        
        // ⭐ ANDROID FIX: Skip createImageBitmap on Android - it causes main thread blocking
        // Standard image preloading is sufficient for smooth rendering
        if (blobUrl && platform !== 'android' && typeof createImageBitmap !== 'undefined') {
          try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();
            await createImageBitmap(blob);
          } catch {
            // Silent fail - image still works without pre-decode
          }
        }

        // Update userImages with blob URL
        if (!controller.signal.aborted) {
          setUserImages(prev => ({
            ...prev,
            [profile.id]: blobUrl ? [blobUrl] : prev[profile.id]
          }));
        }
      } catch {
        // Silent fail for individual images
      }
    }
  }, [platform]); // Add platform dependency

  // Optimized: batch queries and filter in SQL
  const fetchLikers = useCallback(async (showLoading = false) => {
    if (!currentUser?.id) {
      setLikers([]);
      setUserImages({});
      setLoading(false);
      return;
    }
    try {
      if (showLoading) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      const result = await fetchLikersData(currentUser.id);
      if (result) {
        const { likers: newLikers, userImages: newUserImages } = result;
        
        const cacheValue: LikedMeCacheValue = {
          likers: newLikers,
          userImages: newUserImages,
          timestamp: Date.now()
        };

        // Update cache
        likedMeCache.set(currentUser.id, cacheValue);
        writeCacheToStorage(currentUser.id, cacheValue);

        setLikers(newLikers);
        setUserImages(newUserImages);

        // ⭐ FIX #1: Preload first 3 profile images as blob URLs for instant Android rendering
        if (newLikers && newLikers.length > 0) {
          preloadFirstProfilesWithBlobs(newLikers.slice(0, 3), newUserImages);
        }
      }
    } catch (error) {
      console.error('Error fetching likers:', error);
      if (showLoading) {
        toast({
          title: t('matches.error'),
          description: t('matches.failedToRefresh'),
          variant: "destructive",
        });
      }
    } finally {
      if (showLoading) {
        setIsRefreshing(false);
        setPullDistance(0);
      } else {
        setLoading(false);
      }
    }
  }, [currentUser?.id, toast, t, fetchLikersData, preloadFirstProfilesWithBlobs]);

  // Load additional images when profile is selected - only approved onesclicked
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 1) return; // Already loaded

    // ⭐ FIX #4: Cancel previous image loads
    if (imageAbortController.current) {
      imageAbortController.current.abort();
    }

    const controller = new AbortController();
    imageAbortController.current = controller;

    try {
      // Try to fetch approved images first
      let { data: images, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', profileId)
        .eq('is_approved', true) // Only show approved images
        .order('image_order')
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      // If moderation columns don't exist, fall back to basic query
      if (error && error.message.includes('does not exist')) {
        const { data: fallbackImages, error: fallbackError } = await supabase
          .from('user_images')
          .select('image_url')
          .eq('user_id', profileId)
          .order('image_order')
          .abortSignal(controller.signal);

        if (fallbackError || controller.signal.aborted) return; // Silent fail for fallback
        images = fallbackImages;
      } else if (error || controller.signal.aborted) {
        return; // Silent fail
      }

      if (images?.length && !controller.signal.aborted) {
        const imageUrls = images.map(img => img.image_url);
        
        // ⭐ FIX #1: Preload all images as blobs for instant flipping
        const blobUrls = await Promise.all(
          imageUrls.map(url => preloadImageToBlob(url))
        );

        if (!controller.signal.aborted) {
          setUserImages(prev => ({
            ...prev,
            [profileId]: blobUrls.filter(Boolean) as string[]
          }));
        }
      }
    } catch (error) {
      // Silent fail for image loading - don't log for aborted requests
    }
  }, [userImages]); // Removed platform dependency - it's stable via useMemo

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false);
      setLikers([]);
      setUserImages({});
      return;
    }

    // 1) Try in-memory cache
    let cached = likedMeCache.get(currentUser.id) as LikedMeCacheValue | undefined;

    // 2) If no in-memory cache, try sessionStorage
    if (!cached) {
      const stored = readCacheFromStorage(currentUser.id);
      if (stored) {
        cached = stored;
        likedMeCache.set(currentUser.id, stored);
      }
    }

    if (cached) {
      // 👉 Show cached UI immediately (no spinner)
      setLikers(cached.likers);
      setUserImages(cached.userImages);
      setLoading(false);

      // 👉 Always refresh in background (non-blocking)
      fetchLikersInBackground();
    } else {
      // No cache at all → do a real fetch
      fetchLikers();
    }

    checkLockoutStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // ⭐ ANDROID OPTIMIZATION: Increased polling interval (60s instead of 30s)
  useEffect(() => {
    if (!currentUser?.id) return;
    const existingInterval = likedMePollIntervals.get(currentUser.id);
    if (existingInterval) {
      return () => clearInterval(existingInterval);
    }

    // ⭐ ANDROID FIX: Reduced polling frequency from 30s to 60s
    const interval = setInterval(() => {
      void fetchLikersInBackground();
    }, 60000);

    likedMePollIntervals.set(currentUser.id, interval);

    return () => {
      clearInterval(interval);
      likedMePollIntervals.delete(currentUser.id);
    };
  }, [currentUser?.id, fetchLikersInBackground]);

  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false);
    setCurrentSlide(0);
  }, [selectedProfile]);

  // ⭐ FIX #6: Memoize slides calculation with stable dependencies
  const slides = useMemo(() => {
    if (!selectedProfile) return [];
    
    const profileImages = userImages[selectedProfile.id] || [];
    const result: Array<{ type: 'image' | 'about' | 'funfact' | 'placeholder', imageIndex?: number }> = [];
    
    const hasContent = (type: string) => {
      if (type === 'image') return true;
      if (type === 'about') return !!selectedProfile.bio;
      if (type === 'funfact') return !!(selectedProfile.fun_fact || selectedProfile.perfect_first_date || selectedProfile.last_googled);
      return false;
    };
    
    if (profileImages.length > 0) {
      for (let i = 0; i < profileImages.length; i++) {
        result.push({ type: 'image', imageIndex: i });
        const infoType: 'about' | 'funfact' = i % 2 === 0 ? 'about' : 'funfact';
        if (hasContent(infoType)) {
          result.push({ type: infoType });
        }
      }
    } else {
      // When no images, show placeholder with initials first
      result.push({ type: 'placeholder' });
      if (hasContent('about')) result.push({ type: 'about' });
      if (hasContent('funfact')) result.push({ type: 'funfact' });
    }
    
    return result;
  }, [
    selectedProfile?.id, 
    selectedProfile?.bio, 
    selectedProfile?.fun_fact, 
    selectedProfile?.perfect_first_date, 
    selectedProfile?.last_googled,
    userImages
  ]);

  // Clamp currentSlide if slides array shrinks
  useEffect(() => {
    if (currentSlide > Math.max(0, slides.length - 1)) {
      setCurrentSlide(Math.max(0, slides.length - 1));
    }
  }, [slides.length, currentSlide]);

  // ⭐ FIX #6: Memoize getRemainingDays (prevents recalc on every render)
  const getRemainingDays = useMemo(() => {
    if (!lockoutEndDate) return 0;
    const now = new Date();
    const diff = lockoutEndDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [lockoutEndDate]);

  const isInLockout = useMemo(() => 
    !isPremium && lockoutEndDate && new Date() < lockoutEndDate,
    [isPremium, lockoutEndDate]
  );

  const setLockoutPeriod = async () => {
    if (isPremium) return;

    try {
      const lockoutDate = new Date();
      lockoutDate.setDate(lockoutDate.getDate() + 50);

      const { error } = await supabase
        .from('profiles')
        .update({ like_me_cooldown_until: lockoutDate.toISOString() })
        .eq('id', currentUser.id);

      if (error) throw error;

      setLockoutEndDate(lockoutDate);
    } catch (error) {
      console.error('Error setting cooldown:', error);
    }
  };

    const handleNavigationClick = useCallback((e: React.MouseEvent) => {
    if (!selectedProfile) return;
    
    const x = e.clientX;
    const width = window.innerWidth;
    const clickX = (x / width) * 100;

    if (clickX < 50) {
      // Left half - go to previous slide
      setCurrentSlide(prev => Math.max(0, prev - 1));
    } else {
      // Right half - go to next slide
      setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1));
    }
  }, [selectedProfile, slides.length]);

  const handleLikeBack = async (profileId: string) => {
    // Optimistic update - remove profile immediately
    const profileToRemove = likers.find(liker => liker.id === profileId);
    setLikers(prev => prev.filter(liker => liker.id !== profileId));
    setSelectedProfile(null);
    
    // Update cache immediately
    if (currentUser?.id) {
      const cached = likedMeCache.get(currentUser.id);
      if (cached) {
        const updatedLikers = cached.likers.filter(liker => liker.id !== profileId);
        const updatedImages = { ...cached.userImages };
        delete updatedImages[profileId];
        
        const cacheValue: LikedMeCacheValue = {
          likers: updatedLikers,
          userImages: updatedImages,
          timestamp: Date.now()
        };

        likedMeCache.set(currentUser.id, cacheValue);
        writeCacheToStorage(currentUser.id, cacheValue);
      }
    }

    try {
      // Use the proper function that creates matches on mutual likes
      const { data, error } = await supabase.rpc('like_and_usage_batched', {
        liker_id_param: currentUser.id,
        liked_id_param: profileId,
        premium_param: isPremium || false
      });

      if (error) throw error;

      // Set lockout period for free users
      if (!isPremium && !hasInteractedToday) {
        await setLockoutPeriod();
        setHasInteractedToday(true);
      }
    } catch (error) {
      // Revert optimistic update on error
      if (profileToRemove) {
        setLikers(prev => [profileToRemove, ...prev]);
        
        // Revert cache
        if (currentUser?.id) {
          const cached = likedMeCache.get(currentUser.id);
          if (cached) {
            const cacheValue: LikedMeCacheValue = {
              likers: [profileToRemove, ...cached.likers],
              userImages: cached.userImages,
              timestamp: Date.now()
            };

            likedMeCache.set(currentUser.id, cacheValue);
            writeCacheToStorage(currentUser.id, cacheValue);
          }
        }
      }
      
      toast({
        title: "Error",
        description: "Failed to like back. Profile has been restored.",
        variant: "destructive",
      });
    }
  };

  const handlePass = async (profileId: string) => {
    // Optimistic update - remove profile immediately
    const profileToRemove = likers.find(liker => liker.id === profileId);
    setLikers(prev => prev.filter(liker => liker.id !== profileId));
    setSelectedProfile(null);
    
    // Update cache immediately
    if (currentUser?.id) {
      const cached = likedMeCache.get(currentUser.id);
      if (cached) {
        const updatedLikers = cached.likers.filter(liker => liker.id !== profileId);
        const updatedImages = { ...cached.userImages };
        delete updatedImages[profileId];
        
        const cacheValue: LikedMeCacheValue = {
          likers: updatedLikers,
          userImages: updatedImages,
          timestamp: Date.now()
        };

        likedMeCache.set(currentUser.id, cacheValue);
        writeCacheToStorage(currentUser.id, cacheValue);
      }
    }

    // Show success message immediately
    toast({
      title: "Passed",
      description: "Profile removed from your likes",
    });

    try {
      // Use the same RPC as DiscoverPage for consistency
      const rpcName = 'pass_and_usage_batched';
      const { data: rpcData, error: rpcError } = await supabase.rpc((rpcName as any), {
        passer_id_param: currentUser.id,
        passed_id_param: profileId,
        premium_param: !!isPremium
      } as any);

      if (rpcError) {
        console.error('RPC error:', rpcError);
        // Fallback: insert pass directly
        const { data: existingPass } = await supabase
          .from('passes')
          .select('id')
          .match({ passer_id: currentUser.id, passed_id: profileId })
          .maybeSingle();

        if (!existingPass) {
          const { error: insertError } = await supabase
            .from('passes')
            .insert({ passer_id: currentUser.id, passed_id: profileId });
          
          if (insertError) {
            console.error('Error inserting pass:', insertError);
            throw insertError;
          }
        }
      }

      // Invalidate cache to force refresh on next load
      if (currentUser?.id) {
        likedMeCache.delete(currentUser.id);
        sessionStorage.removeItem(getStorageKey(currentUser.id));
      }
      
      // Set lockout period for free users
      if (!isPremium && !hasInteractedToday) {
        await setLockoutPeriod();
        setHasInteractedToday(true);
      }
    } catch (error) {
      console.error('Error in handlePass:', error);
      // Revert optimistic update on error
      if (profileToRemove) {
        setLikers(prev => [profileToRemove, ...prev]);
        
        // Revert cache
        if (currentUser?.id) {
          const cached = likedMeCache.get(currentUser.id);
          if (cached) {
            const cacheValue: LikedMeCacheValue = {
              likers: [profileToRemove, ...cached.likers],
              userImages: cached.userImages,
              timestamp: Date.now()
            };

            likedMeCache.set(currentUser.id, cacheValue);
            writeCacheToStorage(currentUser.id, cacheValue);
          }
        }
      }

      toast({
        title: "Error",
        description: "Failed to pass. Profile has been restored.",
        variant: "destructive",
      });
    }
  };

  const handleBlock = () => {
    setBlockDialogOpen(true);
  };

  const handleBlockSuccess = () => {
    if (selectedProfile) {
      setLikers(prev => prev.filter(liker => liker.id !== selectedProfile.id));
      setSelectedProfile(null);
    }
  };

  const handleProfileClick = (liker: any, index: number) => {
    // For free users, only allow clicking if they're premium
    if (!isPremium) {
      setShowPremiumUpgrade(true);
      return;
    }

    setSelectedProfile(liker);
    // Load full images when profile is selected
    loadFullImages(liker.id);
  };

  // Pull to refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!selectedProfile) {
      const container = e.currentTarget as HTMLElement;
      if (container.scrollTop === 0) {
        setStartY(e.touches[0].clientY);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!selectedProfile && startY > 0 && !isRefreshing) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, Math.min(100, currentY - startY));
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (!selectedProfile && pullDistance > 50 && !isRefreshing) {
      fetchLikers(true);
    } else {
      setPullDistance(0);
    }
    setStartY(0);
  };
  // ⭐ FIX #7: Memoize entire selected profile card (1,200+ lines) to prevent re-render storms on Android
  const selectedProfileCard = useMemo(() => {
    if (!selectedProfile) return null;

    const profileImages = userImages[selectedProfile.id] || [];
    const totalSlides = slides.length;
    const currentSlideInfo = slides[currentSlide] || slides[0];
    
    const isImageSlide = currentSlideInfo.type === 'image';
    const isAboutSlide = currentSlideInfo.type === 'about';
    const isFunFactSlide = currentSlideInfo.type === 'funfact';
    const isPlaceholderSlide = currentSlideInfo.type === 'placeholder';
    const currentImageIndex = currentSlideInfo.imageIndex || 0;

    // Background colors for cards
    const getCardColor = () => {
      let hash = 0;
      const str = selectedProfile.id.toString();
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      const colors = [
        'from-blue-400 to-blue-600',
        'from-purple-400 to-purple-600',
        'from-pink-400 to-pink-600',
        'from-indigo-400 to-indigo-600',
        'from-teal-400 to-teal-600',
      ];
      return colors[Math.abs(hash) % colors.length];
    };

    return (
      <div 
        className="h-full w-full relative flex flex-col bg-white"
        style={{
          paddingTop: platform === 'web' ? '0px' : '0px',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        {/* Main Slide Area */}
        <div 
          className="flex-1 relative" 
          style={{
            height: platform === 'ios' 
              ? 'calc(100vh - env(safe-area-inset-top, 0px) - 56px)'
              : platform === 'web'
                ? 'calc(100vh - 56px - 80px)'
                : 'calc(100vh - 56px)',
            minHeight: platform === 'ios'
              ? 'calc(100vh - env(safe-area-inset-top, 0px) - 56px)'
              : platform === 'web'
                ? 'calc(100vh - 56px - 80px)'
                : 'calc(100vh - 56px)',
            maxHeight: platform === 'ios'
              ? 'calc(100vh - env(safe-area-inset-top, 0px) - 56px)'
              : platform === 'web'
                ? 'calc(100vh - 56px - 80px)'
                : 'calc(100vh - 56px)',
            marginBottom: platform === 'web'
              ? '0px'
              : 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
            overflow: 'hidden'
          }}
        >
          {/* Placeholder Slide - when no images */}
          {isPlaceholderSlide && (
            <div 
              className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center relative"
              onClick={handleNavigationClick}
              style={{ cursor: 'pointer' }}
            >
              <div className="text-center">
                <span className="text-6xl font-bold text-gray-700">
                  {selectedProfile.first_name?.[0]}{selectedProfile.last_name?.[0]}
                </span>
                <p className="text-gray-600 mt-4 text-sm">No photos uploaded yet</p>
              </div>
            </div>
          )}

          {/* Image Slide */}
          {isImageSlide && profileImages.length > 0 && currentImageIndex < profileImages.length && (
            <>
              <img
                loading="eager"
                decoding="async"
                src={getSafeImageSrc(profileImages[currentImageIndex])}
                alt={`${selectedProfile.first_name}'s photo`}
                className="w-full h-full object-cover"
                style={{
                  height: '100%',
                  width: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                  pointerEvents: 'none'
                }}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              {/* Click/Touch handler overlay */}
              <div 
                className="absolute inset-0 z-0" 
                onClick={handleNavigationClick}
                style={{ cursor: 'pointer' }}
              />
            </>
          )}

          {/* About Card */}
          {isAboutSlide && (
            <div 
              className={`w-full h-full bg-gradient-to-br ${getCardColor()} flex flex-col items-center justify-start pt-20 pb-6 px-6 text-white relative overflow-hidden`}
              onClick={handleNavigationClick}
              style={{ cursor: 'pointer' }}
            >
              <User className="w-10 h-10 mb-3 opacity-90" />
              <h2 className="text-xl font-bold mb-3 text-center">About</h2>
              <div className="max-w-md w-full space-y-2 text-center overflow-y-auto px-2" style={{ maxHeight: '70%' }}>
                {selectedProfile.bio ? (
                  <p className="text-sm leading-relaxed">{selectedProfile.bio}</p>
                ) : (
                  <p className="text-sm opacity-75 italic">No bio yet</p>
                )}
              </div>
            </div>
          )}

          {/* Fun Fact Card */}
          {isFunFactSlide && (
            <div 
              className={`w-full h-full bg-gradient-to-br ${getCardColor()} flex flex-col items-center justify-start pt-20 pb-6 px-6 text-white relative overflow-hidden`}
              onClick={handleNavigationClick}
              style={{ cursor: 'pointer' }}
            >
              <Quote className="w-10 h-10 mb-3 opacity-90" />
              <h2 className="text-xl font-bold mb-3 text-center">Fun Questions</h2>
              <div className="max-w-md w-full space-y-3 overflow-y-auto px-2" style={{ maxHeight: '70%' }}>
                {selectedProfile.fun_fact && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Heart className="w-4 h-4 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-xs opacity-75 mb-1">Fun Fact</p>
                        <p className="text-sm">{selectedProfile.fun_fact}</p>
                      </div>
                    </div>
                  </div>
                )}
                {selectedProfile.perfect_first_date && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Coffee className="w-4 h-4 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-xs opacity-75 mb-1">Perfect First Date</p>
                        <p className="text-sm">{selectedProfile.perfect_first_date}</p>
                      </div>
                    </div>
                  </div>
                )}
                {selectedProfile.last_googled && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Search className="w-4 h-4 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-xs opacity-75 mb-1">Last Googled</p>
                        <p className="text-sm">{selectedProfile.last_googled}</p>
                      </div>
                    </div>
                  </div>
                )}
                {!selectedProfile.fun_fact && !selectedProfile.perfect_first_date && !selectedProfile.last_googled && (
                  <p className="text-sm opacity-75 italic text-center">No fun questions answered yet</p>
                )}
              </div>
            </div>
          )}

          {/* Slide indicators */}
          <div 
            className="absolute left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10"
            style={{
              top: platform === 'ios'
                ? '50px'
                : platform === 'android'
                  ? '32px'
                  : '16px'
            }}
          >
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all duration-200 ${
                  idx === currentSlide ? 'bg-white w-8' : 'bg-white/50 w-2'
                }`}
              />
            ))}
          </div>

          {/* Header buttons */}
          <Button
            onClick={() => {
              setSelectedProfile(null);
              setCurrentSlide(0);
            }}
            variant="outline"
            className="absolute left-4 bg-white/80 hover:bg-white z-10 h-10 px-3"
            style={{
              top: platform === 'ios' 
                ? 'clamp(40px, calc(env(safe-area-inset-top, 10px) + 25px), 60px)'
                : '16px'
            }}
          >
            ← {t('matches.back')}
          </Button>

          <Button
            onClick={handleBlock}
            variant="outline"
            size="sm"
            className="absolute right-4 bg-white/80 hover:bg-white z-10 h-10 w-10 p-0"
            style={{
              top: platform === 'ios' 
                ? 'clamp(40px, calc(env(safe-area-inset-top, 10px) + 25px), 60px)'
                : '16px'
            }}
          >
            <Shield className="w-4 h-4" />
          </Button>

          {/* Profile Info Overlay - Only show on image slides */}
          {isImageSlide && (
            <div 
              className="absolute bottom-0 left-0 right-0 text-white"
              style={{
                paddingBottom: platform === 'ios' 
                  ? 'clamp(180px, calc(env(safe-area-inset-bottom, 10px) + 190px), 190px)'
                  : platform === 'android'
                    ? '180px'
                    : '180px'
              }}
            >
              <div className="px-6">
                <div className="mb-2">
                  <h2 className="text-xl font-bold mb-1">
                    {selectedProfile.first_name} {selectedProfile.last_name}
                  </h2>
                  <div className="flex items-center space-x-3 text-xs">
                    <div className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span>{calculateAge(selectedProfile.date_of_birth)} {t('matches.yearsOld')}</span>
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      <span>{selectedProfile.city}, {selectedProfile.country}</span>
                    </div>
                  </div>
                </div>

                {selectedProfile.occupation && (
                  <div className="flex items-center text-xs mb-2">
                    <Briefcase className="w-3 h-3 mr-2" />
                    <span>{selectedProfile.occupation}</span>
                  </div>
                )}

                {selectedProfile.interests && selectedProfile.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedProfile.interests.slice(0, 5).map((interest: string, index: number) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-white/20 rounded-full text-xs backdrop-blur-sm"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                )}

                {/* Show More Button */}
                <div className="flex justify-center mt-3">
                  <button
                    onClick={() => setShowMoreInfo(!showMoreInfo)}
                    className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1 transition-colors"
                    style={{ 
                      color: 'white !important',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.color = 'white';
                    }}
                  >
                    {showMoreInfo ? (
                      <>
                        <ChevronUp className="w-3 h-3" style={{ color: 'white', stroke: 'white' }} />
                        <span className="text-[10px]" style={{ color: 'white' }}>Show Less</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" style={{ color: 'white', stroke: 'white' }} />
                        <span className="text-[10px]" style={{ color: 'white' }}>Show More</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Expanded Info */}
                {showMoreInfo && (
                  <div className="mt-4 space-y-3 bg-white/90 backdrop-blur-sm rounded-lg p-4 max-h-64 overflow-y-auto text-gray-800">
                    {selectedProfile.adinkra_symbols && selectedProfile.adinkra_symbols.length > 0 && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">✨</div>
                        <div className="w-full">
                          <p className="text-xs text-gray-600 mb-1">Cultural Signs</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedProfile.adinkra_symbols.map((symbol: string, index: number) => (
                              <span key={index} className="px-2 py-1 bg-primary/10 rounded-full text-xs text-primary font-medium">
                                {symbol}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {selectedProfile.preferred_language && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">🗣️</div>
                        <div>
                          <p className="text-xs text-gray-600">Preferred Language</p>
                          <p className="text-sm font-medium">{selectedProfile.preferred_language}</p>
                        </div>
                      </div>
                    )}
                    {selectedProfile.education_level && (
                      <div className="flex items-start gap-2">
                        <GraduationCap className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-600">Education</p>
                          <p className="text-sm font-medium">{selectedProfile.education_level}</p>
                        </div>
                      </div>
                    )}
                    {selectedProfile.industry && (
                      <div className="flex items-start gap-2">
                        <Briefcase className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-600">Industry</p>
                          <p className="text-sm font-medium">{selectedProfile.industry}</p>
                        </div>
                      </div>
                    )}
                    {selectedProfile.drinking && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">🍷</div>
                        <div>
                          <p className="text-xs text-gray-600">Drinking</p>
                          <p className="text-sm font-medium">{selectedProfile.drinking}</p>
                        </div>
                      </div>
                    )}
                    {selectedProfile.smoking && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">🚭</div>
                        <div>
                          <p className="text-xs text-gray-600">Smoking</p>
                          <p className="text-sm font-medium">{selectedProfile.smoking}</p>
                        </div>
                      </div>
                    )}
                    {selectedProfile.exercise_level && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">💪</div>
                        <div>
                          <p className="text-xs text-gray-600">Exercise</p>
                          <p className="text-sm font-medium">{selectedProfile.exercise_level}</p>
                        </div>
                      </div>
                    )}
                    {selectedProfile.sleeping_schedule && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">😴</div>
                        <div>
                          <p className="text-xs text-gray-600">Sleep Schedule</p>
                          <p className="text-sm font-medium">{selectedProfile.sleeping_schedule}</p>
                        </div>
                      </div>
                    )}
                    {selectedProfile.relationship_intent && (
                      <div className="flex items-start gap-2">
                        <Heart className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-600">Looking For</p>
                          <p className="text-sm font-medium">{selectedProfile.relationship_intent}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons - positioned above mobile nav */}
          <div 
            className="absolute bottom-0 left-0 right-0 flex justify-center space-x-6 px-6 z-10"
            style={{
              paddingBottom: platform === 'ios' 
                ? 'clamp(130px, calc(env(safe-area-inset-bottom, 10px) + 120px), 150px)'
                : platform === 'android'
                  ? '120px'
                  : '100px'
            }}
          >
            <Button
              onClick={() => handlePass(selectedProfile.id)}
              variant="outline"
              className="w-14 h-14 rounded-full border-2 border-red-400/80 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm"
            >
              <X className="w-6 h-6 text-red-400" />
            </Button>

            <Button
              onClick={() => handleLikeBack(selectedProfile.id)}
              variant="outline"
              className="w-14 h-14 rounded-full border-2 border-green-400/80 bg-green-500/20 hover:bg-green-500/30 backdrop-blur-sm"
            >
              <Heart className="w-6 h-6 text-green-400" />
            </Button>
          </div>
        </div>

        <BlockDialog
          isOpen={blockDialogOpen}
          onClose={() => setBlockDialogOpen(false)}
          userToBlock={selectedProfile}
          currentUserId={currentUser?.id || ''}
          onBlockSuccess={handleBlockSuccess}
        />
      </div>
    );
  }, [selectedProfile, userImages, slides, currentSlide, showMoreInfo, platform, handleNavigationClick, handleBlock, handlePass, handleLikeBack, blockDialogOpen, currentUser?.id, handleBlockSuccess, calculateAge, t]);

  // ⭐ All early returns MUST be after all hooks
  if (showPremiumUpgrade) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} preselectedPlan="premium" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  // ⭐ CRITICAL: Early return if currentUser is null (prevents crash during session refresh)
  // Guard must run after all hooks have been declared
  if (!currentUser || !currentUser.id) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  // ⭐ FIX #7: Return memoized card to prevent re-render storms
  if (selectedProfile) {
    return selectedProfileCard;
  }

  return (
    <div 
      className="h-full flex flex-col bg-white"
      style={{ 
        touchAction: 'pan-x pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="flex items-center justify-center bg-pink-50 transition-all duration-200"
          style={{ height: `${pullDistance}px` }}
        >
          <div className="text-pink-600 text-sm">
            {pullDistance > 50 ? (isRefreshing ? `🔄 ${t('matches.refreshing')}` : `↓ ${t('matches.releaseToRefresh')}`) : `↓ ${t('matches.pullToRefresh')}`}
          </div>
        </div>
      )}
      
  <div 
    className="flex-shrink-0 bg-white border-b px-4 py-4 mx-4"
    style={{
      marginTop: platform === 'ios' 
        ? 'clamp(20px, calc(env(safe-area-inset-top, 10px) + 23px), 50px)'
        : platform === 'android'
        ? '20px'
        : '0'
    }}
  >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-1.5">
            <Users className="w-4 h-4 text-pink-600" />
            <h1 className="text-sm font-bold text-gray-800">{t('matches.peopleWhoLikedYou')}</h1>
          </div>
          {!isPremium && (
            <Button
              onClick={() => setShowPremiumUpgrade(true)}
              size="sm"
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-semibold text-[10px] px-2 py-0.5 h-6"
            >
              <Crown className="w-3 h-3 mr-0.5" />
              {t('matches.upgrade')}
            </Button>
          )}
        </div>
        <p className="text-gray-500 text-xs">({t('matches.peopleCount', { count: likers.length })})</p>
        
        {!isPremium && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-2">
            <div className="flex items-center space-x-1.5 text-yellow-800">
              <Lock className="w-3 h-3" />
              <span className="text-[10px] font-medium">
                {t('matches.upgradeToPremium')}
              </span>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white" ref={scrollContainerRef}>
        {likers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{t('matches.noNewLikes')}</h3>
              <p className="text-gray-600">{t('matches.keepSwiping')}</p>
            </div>
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              height: `${rowVirtualizer.getTotalSize() + virtualizerCount * rowVerticalGap}px`
            }}
          >
            {rowVirtualizer.getVirtualItems().map(row => {
              const startIndex = row.index * columnsPerRow;
              const rowLikers = likers.slice(startIndex, startIndex + columnsPerRow);
              const isLocked = !isPremium;
              
              return (
                <div
                  key={row.index}
                  style={{
                    position: 'absolute',
                    top: `${row.start + row.index * rowVerticalGap}px`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    maxWidth: '1400px',
                    width: '100%',
                    height: `${row.size}px`,
                    paddingLeft: `${rowPaddingHorizontal}px`,
                    paddingRight: `${rowPaddingHorizontal}px`,
                    columnGap: `${rowColumnGap}px`,
                    rowGap: `${rowVerticalGap}px`,
                    boxSizing: 'border-box'
                  }}
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {rowLikers.map((liker, colIndex) => {
                    const likerIndex = startIndex + colIndex;
                    const isFirstThree = likerIndex < 3;
                    return (
                    <Card
                      key={liker.id}
                      className={`cursor-pointer hover:shadow-lg transition-shadow flex flex-col h-full ${isLocked ? 'opacity-75' : ''}`}
                      onClick={() => handleProfileClick(liker, likerIndex)}
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-lg">
                        {(() => {
                          const profileImages = userImages[liker.id] || [];
                          return profileImages.length > 0 ? (
                            <img
                              loading={isFirstThree ? "eager" : "lazy"}
                              decoding="async"
                              src={getSafeImageSrc(profileImages[0])}
                              alt={`${liker.first_name}'s photo`}
                              className={`w-full h-full object-cover ${isLocked ? 'blur-md' : ''}`}
                              style={{
                                height: '100%',
                                width: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center',
                                display: 'block',
                                minHeight: '100%',
                                minWidth: '100%',
                                WebkitTransform: 'translateZ(0)',
                                transform: 'translateZ(0)'
                              }}
                            />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center ${isLocked ? 'blur-md' : ''}`}>
                              <span className="text-2xl font-bold text-gray-700">
                                {liker.first_name?.[0]}{liker.last_name?.[0]}
                              </span>
                            </div>
                          );
                        })()}
                        {isLocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="bg-white/90 backdrop-blur-sm rounded-full p-3">
                              <Lock className="w-6 h-6 text-gray-700" />
                            </div>
                          </div>
                        )}
                      </div>
                      <CardContent className="p-3 flex-1">
                        <h3 className={`font-semibold text-gray-800 truncate text-sm ${isLocked ? 'blur-sm' : ''}`}>
                          {liker.first_name}, {calculateAge(liker.date_of_birth)}
                        </h3>
                        <p className="text-xs text-gray-600 truncate">
                          {liker.country}, {liker.city}
                        </p>
                      </CardContent>
                    </Card>
                  );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LikedMePage, (prevProps, nextProps) => {
  // Only re-render if currentUser.id or isPremium changes
  return prevProps.currentUser?.id === nextProps.currentUser?.id && 
         prevProps.isPremium === nextProps.isPremium;
});

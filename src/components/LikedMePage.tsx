import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Heart, X, Calendar, MapPin, Shield, ChevronDown, ChevronUp, Briefcase, GraduationCap, Crown, Lock, Clock, User, Quote, Coffee, Search } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import BlockDialog from './BlockDialog';
import PremiumUpgrade from './PremiumUpgrade';
import { useTranslation } from 'react-i18next';

// Global cache for liked me data - persists across component mounts
const likedMeCache = new Map<string, { 
  likers: any[], 
  userImages: { [key: string]: string[] }, 
  timestamp: number 
}>();
const LIKED_ME_CACHE_DURATION = 30000; // 30 seconds

// Make cache globally accessible for preloading
if (typeof window !== 'undefined') {
  (window as any).likedMeCache = likedMeCache;
}

interface LikedMePageProps {
  currentUser: any;
  isPremium?: boolean;
}

const LikedMePage = ({ currentUser, isPremium = false }: LikedMePageProps) => {
  const { t } = useTranslation();
  const [likers, setLikers] = useState<any[]>(() => {
    // Initialize with cached data immediately if available
    const cached = currentUser?.id ? likedMeCache.get(currentUser.id) : null;
    if (cached && Date.now() - cached.timestamp < LIKED_ME_CACHE_DURATION) {
      return cached.likers;
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    // Don't show loading if we have cached data
    const cached = currentUser?.id ? likedMeCache.get(currentUser.id) : null;
    return !(cached && Date.now() - cached.timestamp < LIKED_ME_CACHE_DURATION);
  });
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>(() => {
    // Initialize with cached images if available
    const cached = currentUser?.id ? likedMeCache.get(currentUser.id) : null;
    if (cached && Date.now() - cached.timestamp < LIKED_ME_CACHE_DURATION) {
      return cached.userImages;
    }
    return {};
  });
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0); // For image + about + fun fact slides
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [lockoutEndDate, setLockoutEndDate] = useState<Date | null>(null);
  const [hasInteractedToday, setHasInteractedToday] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const backgroundFetchingRef = useRef(false);
  const { toast } = useToast();

  const { subscription, getLikedMeVisibleCount } = useSubscription(currentUser?.id);

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
  // ...removed log...
        return;
      }

      if (data?.like_me_cooldown_until) {
        const cooldownDate = new Date(data.like_me_cooldown_until);
        if (cooldownDate > new Date()) {
          setLockoutEndDate(cooldownDate);
        }
      }
    } catch (error) {
  // ...removed log...
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
        
        // Update cache
        likedMeCache.set(currentUser.id, {
          likers: newLikers,
          userImages: newUserImages,
          timestamp: Date.now()
        });

        // Update state with fresh data
        setLikers(newLikers);
        setUserImages(newUserImages);
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

    // Process images
    const imageMap: { [key: string]: string[] } = {};
    if (imagesData) {
      for (const img of imagesData) {
        if (!imageMap[img.user_id]) {
          imageMap[img.user_id] = [img.image_url];
        }
      }
    }

    return { likers, userImages: imageMap };
  }, []);

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
        
        // Update cache
        likedMeCache.set(currentUser.id, {
          likers: newLikers,
          userImages: newUserImages,
          timestamp: Date.now()
        });

        setLikers(newLikers);
        setUserImages(newUserImages);

        // Preload next profile images in the background
        if (newLikers && newLikers.length > 0) {
          preloadNextProfileImages(newLikers, newUserImages);
        }
      }
    } catch (error) {
  // ...removed log...
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
  }, [currentUser?.id, toast]);

  // Load additional images when profile is selected - only approved ones
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 1) return; // Already loaded

    try {
      // Try to fetch approved images first
      let { data: images, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', profileId)
        .eq('is_approved', true) // Only show approved images
        .order('image_order');

      // If moderation columns don't exist, fall back to basic query
      if (error && error.message.includes('does not exist')) {
        const { data: fallbackImages, error: fallbackError } = await supabase
          .from('user_images')
          .select('image_url')
          .eq('user_id', profileId)
          .order('image_order');

        if (fallbackError) return; // Silent fail for fallback
        images = fallbackImages;
      } else if (error) {
        return; // Silent fail
      }

      if (images?.length) {
        setUserImages(prev => ({
          ...prev,
          [profileId]: images.map(img => img.image_url)
        }));
      }
    } catch (error) {
  // ...removed log...
    }
  }, [userImages]);

  // Preload images for the next few profiles for smoother UX
  const preloadNextProfileImages = useCallback(
    async (likersList: { id: string }[], alreadyLoaded: { [key: string]: string[] }) => {
      // Preload for only the next 1 profile for maximum performance
      const toPreload = likersList
        .filter(liker => !alreadyLoaded[liker.id] || alreadyLoaded[liker.id].length <= 1)
        .slice(0, 1); // Reduced to 1 for better performance
      for (const liker of toPreload) {
        // Add delay to reduce server load
        setTimeout(() => {
          void loadFullImages(liker.id);
        }, 1000);
      }
    },
    [loadFullImages]
  );

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false);
      setLikers([]);
      setUserImages({});
      return;
    }

    // Check if we have fresh cached data first
    const cached = likedMeCache.get(currentUser.id);
    if (cached && Date.now() - cached.timestamp < LIKED_ME_CACHE_DURATION) {
      setLikers(cached.likers);
      setUserImages(cached.userImages);
      setLoading(false);
      // Still fetch in background to get latest data
      fetchLikersInBackground();
    } else if (likers.length === 0) {
      // No cache or stale cache, fetch immediately
      fetchLikers();
    }
    
    checkLockoutStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false);
  }, [selectedProfile]);

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
  // ...removed log...
    }
  };

    const handleTouch = (e: React.TouchEvent) => {
    // Don't navigate if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="button"]')) {
      return;
    }

    const touch = e.changedTouches[0] || e.touches[0];
    if (!touch) return;
    
    const x = touch.clientX;
    const screenWidth = window.innerWidth;
    
    if (!selectedProfile) return;
    
    // Build the same slide sequence to get total count
    const profileImages = userImages[selectedProfile.id] || [];
    const slides: Array<{ type: string, imageIndex?: number }> = [];
    
    if (profileImages.length > 0) {
      for (let i = 0; i < profileImages.length; i++) {
        slides.push({ type: 'image', imageIndex: i });
        slides.push({ type: i % 2 === 0 ? 'about' : 'funfact' });
      }
    } else {
      slides.push({ type: 'about' });
      slides.push({ type: 'funfact' });
    }
    
    const totalSlides = slides.length;
    
    // Larger tap zones - left 40% and right 40%
    if (x < screenWidth * 0.4 && currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    } else if (x > screenWidth * 0.6 && currentSlide < totalSlides - 1) {
      setCurrentSlide(prev => prev + 1);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="button"]')) {
      return;
    }

    const x = e.clientX;
    const screenWidth = window.innerWidth;
    
    if (!selectedProfile) return;
    
    // Build the same slide sequence to get total count
    const profileImages = userImages[selectedProfile.id] || [];
    const slides: Array<{ type: string, imageIndex?: number }> = [];
    
    if (profileImages.length > 0) {
      for (let i = 0; i < profileImages.length; i++) {
        slides.push({ type: 'image', imageIndex: i });
        slides.push({ type: i % 2 === 0 ? 'about' : 'funfact' });
      }
    } else {
      slides.push({ type: 'about' });
      slides.push({ type: 'funfact' });
    }
    
    const totalSlides = slides.length;
    
    // Larger tap zones - left 35% and right 35%, prevent accidental swipes in middle
    if (x < screenWidth * 0.35 && currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    } else if (x > screenWidth * 0.65 && currentSlide < totalSlides - 1) {
      setCurrentSlide(prev => prev + 1);
    }
  };

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
        
        likedMeCache.set(currentUser.id, {
          likers: updatedLikers,
          userImages: updatedImages,
          timestamp: Date.now()
        });
      }
    }

    // Show success message immediately
    // Removed: Match success toast

    try {
      const { data: existingLike } = await supabase
        .from('likes')
        .select('*')
        .eq('liker_id', currentUser.id)
        .eq('liked_id', profileId)
        .maybeSingle();

      if (existingLike) {
        // Already liked - this shouldn't happen with optimistic UI, but handle gracefully
        return;
      }

      const { error: likeError } = await supabase
        .from('likes')
        .insert({
          liker_id: currentUser.id,
          liked_id: profileId
        });

      if (likeError) throw likeError;

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
            likedMeCache.set(currentUser.id, {
              likers: [profileToRemove, ...cached.likers],
              userImages: cached.userImages,
              timestamp: Date.now()
            });
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
        
        likedMeCache.set(currentUser.id, {
          likers: updatedLikers,
          userImages: updatedImages,
          timestamp: Date.now()
        });
      }
    }

    // Show success message immediately
    toast({
      title: "Passed",
      description: "Profile removed from your likes",
    });

    try {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('liker_id', profileId)
        .eq('liked_id', currentUser.id);

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
            likedMeCache.set(currentUser.id, {
              likers: [profileToRemove, ...cached.likers],
              userImages: cached.userImages,
              timestamp: Date.now()
            });
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

  const getRemainingDays = () => {
    if (!lockoutEndDate) return 0;
    const now = new Date();
    const diff = lockoutEndDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const isInLockout = useMemo(() => 
    !isPremium && lockoutEndDate && new Date() < lockoutEndDate,
    [isPremium, lockoutEndDate]
  );

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

  if (showPremiumUpgrade) {
    return <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} preselectedPlan="premium" />;
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (selectedProfile) {
    const profileImages = userImages[selectedProfile.id] || [];
    
    // Build slide sequence: alternate between images and info cards
    // Pattern: Image1, About, Image2, FunFact, Image3, About, Image4, FunFact...
    const slides: Array<{ type: 'image' | 'about' | 'funfact', imageIndex?: number }> = [];
    
    if (profileImages.length > 0) {
      for (let i = 0; i < profileImages.length; i++) {
        // Add image
        slides.push({ type: 'image', imageIndex: i });
        
        // Add info card after each image
        // Alternate: About after 1st/3rd/5th image, FunFact after 2nd/4th/6th image
        if (i % 2 === 0) {
          slides.push({ type: 'about' });
        } else {
          slides.push({ type: 'funfact' });
        }
      }
    } else {
      // No images, just show info cards
      slides.push({ type: 'about' });
      slides.push({ type: 'funfact' });
    }
    
    const totalSlides = slides.length;
    const currentSlideInfo = slides[currentSlide] || slides[0];
    
    // Debug logging
    console.log('Total slides:', totalSlides);
    console.log('Current slide index:', currentSlide);
    console.log('Current slide type:', currentSlideInfo.type);
    console.log('All slides:', slides.map((s, i) => `${i}: ${s.type}${s.imageIndex !== undefined ? ` (img${s.imageIndex})` : ''}`));
    
    const isImageSlide = currentSlideInfo.type === 'image';
    const isAboutSlide = currentSlideInfo.type === 'about';
    const isFunFactSlide = currentSlideInfo.type === 'funfact';
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
      <div className="h-full w-full relative flex flex-col bg-white">
        {/* Main Slide Area */}
        <div 
          className="flex-1 relative" 
          onTouchEnd={handleTouch}
          onClick={handleClick}
          style={{
            height: 'calc(100vh - 120px)',
            minHeight: 'calc(100vh - 120px)',
            maxHeight: 'calc(100vh - 120px)',
            overflow: 'hidden'
          }}
        >
          {/* Image Slide */}
          {isImageSlide && profileImages.length > 0 && currentImageIndex < profileImages.length && (
            <>
              <img
                src={profileImages[currentImageIndex]}
                alt={`${selectedProfile.first_name}'s photo`}
                className="w-full h-full object-cover"
                style={{
                  height: '100%',
                  width: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block'
                }}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
            </>
          )}

          {/* About Card */}
          {isAboutSlide && (
            <div className={`w-full h-full bg-gradient-to-br ${getCardColor()} flex flex-col items-center justify-center p-8 text-white`}>
              <User className="w-16 h-16 mb-6 opacity-90" />
              <h2 className="text-3xl font-bold mb-4 text-center">About</h2>
              <div className="max-w-md w-full space-y-4 text-center">
                {selectedProfile.bio ? (
                  <p className="text-lg leading-relaxed">{selectedProfile.bio}</p>
                ) : (
                  <p className="text-lg opacity-75 italic">No bio yet</p>
                )}
              </div>
            </div>
          )}

          {/* Fun Fact Card */}
          {isFunFactSlide && (
            <div className={`w-full h-full bg-gradient-to-br ${getCardColor()} flex flex-col items-center justify-center p-8 text-white`}>
              <Quote className="w-16 h-16 mb-6 opacity-90" />
              <h2 className="text-3xl font-bold mb-8 text-center">Fun Questions</h2>
              <div className="max-w-md w-full space-y-6">
                {selectedProfile.fun_fact && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Heart className="w-5 h-5 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-sm opacity-75 mb-1">Fun Fact</p>
                        <p className="text-base">{selectedProfile.fun_fact}</p>
                      </div>
                    </div>
                  </div>
                )}
                {selectedProfile.perfect_first_date && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Coffee className="w-5 h-5 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-sm opacity-75 mb-1">Perfect First Date</p>
                        <p className="text-base">{selectedProfile.perfect_first_date}</p>
                      </div>
                    </div>
                  </div>
                )}
                {selectedProfile.last_googled && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Search className="w-5 h-5 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-sm opacity-75 mb-1">Last Googled</p>
                        <p className="text-base">{selectedProfile.last_googled}</p>
                      </div>
                    </div>
                  </div>
                )}
                {!selectedProfile.fun_fact && !selectedProfile.perfect_first_date && !selectedProfile.last_googled && (
                  <p className="text-lg opacity-75 italic text-center">No fun questions answered yet</p>
                )}
              </div>
            </div>
          )}

          {/* Slide indicators */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10">
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
              top: Capacitor.getPlatform() === 'ios' 
                ? 'clamp(50px, calc(env(safe-area-inset-top, 10px) + 35px), 70px)'
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
              top: Capacitor.getPlatform() === 'ios' 
                ? 'clamp(50px, calc(env(safe-area-inset-top, 10px) + 35px), 70px)'
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
                paddingBottom: Capacitor.getPlatform() === 'ios' 
                  ? 'clamp(90px, calc(env(safe-area-inset-bottom, 10px) + 80px), 110px)'
                  : '96px'
              }}
            >
              <div className="px-6 pb-4">
                <div className="mb-3">
                  <h2 className="text-2xl font-bold mb-1">
                    {selectedProfile.first_name} {selectedProfile.last_name}
                  </h2>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      <span>{calculateAge(selectedProfile.date_of_birth)} {t('matches.yearsOld')}</span>
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span>{selectedProfile.city}, {selectedProfile.country}</span>
                    </div>
                  </div>
                </div>

                {selectedProfile.occupation && (
                  <div className="flex items-center text-sm mb-2">
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
                  <Button
                    onClick={() => setShowMoreInfo(!showMoreInfo)}
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/10 flex items-center gap-1"
                  >
                    {showMoreInfo ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        <span className="text-xs">Show Less</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span className="text-xs">Show More</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Expanded Info */}
                {showMoreInfo && (
                  <div className="mt-4 space-y-3 bg-white/90 backdrop-blur-sm rounded-lg p-4 max-h-64 overflow-y-auto text-gray-800">
                    {selectedProfile.adinkra_symbols && selectedProfile.adinkra_symbols.length > 0 && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">✨</div>
                        <div className="w-full">
                          <p className="text-xs text-gray-600 mb-1">Adinkra Symbols</p>
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
            className="absolute bottom-0 left-0 right-0 flex justify-center space-x-6 px-6"
            style={{
              paddingBottom: Capacitor.getPlatform() === 'ios' 
                ? 'clamp(24px, calc(env(safe-area-inset-bottom, 10px) + 16px), 40px)'
                : '16px'
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
          currentUserId={currentUser.id}
          onBlockSuccess={handleBlockSuccess}
        />
      </div>
    );
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
      marginTop: Capacitor.getPlatform() === 'ios' 
        ? 'clamp(20px, calc(env(safe-area-inset-top, 10px) + 23px), 50px)'
        : '0'
    }}
  >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Users className="w-6 h-6 text-pink-600" />
            <h1 className="text-xl font-bold text-gray-800">{t('matches.peopleWhoLikedYou')}</h1>
          </div>
          {!isPremium && (
            <Button
              onClick={() => setShowPremiumUpgrade(true)}
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold text-xs px-2 py-1"
            >
              <Crown className="w-4 h-4 mr-1" />
              {t('matches.upgrade')}
            </Button>
          )}
        </div>
        <p className="text-gray-600 text-sm">({t('matches.peopleCount', { count: likers.length })})</p>
        
        {!isPremium && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
            <div className="flex items-center space-x-2 text-yellow-800">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-medium">
                {t('matches.upgradeToPremium')}
              </span>
            </div>
          </div>
        )} 
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white">
        {likers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{t('matches.noNewLikes')}</h3>
              <p className="text-gray-600">{t('matches.keepSwiping')}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {likers.map((liker, index) => {
              const profileImages = userImages[liker.id] || [];
              const isLocked = !isPremium;
              
              return (
                <Card
                  key={liker.id}
                  className={`cursor-pointer hover:shadow-lg transition-shadow flex flex-col relative ${isLocked ? 'opacity-75' : ''}`}
                  onClick={() => handleProfileClick(liker, index)}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-lg">
                    {profileImages.length > 0 ? (
                      <img
                        src={profileImages[0]}
                        alt={`${liker.first_name}'s photo`}
                        className={`w-full h-full object-cover ${isLocked ? 'blur-md' : ''}`}
                        style={{
                          height: '100%',
                          width: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center',
                          display: 'block',
                          // iOS-specific fixes for proper image scaling
                          minHeight: '100%',
                          minWidth: '100%',
                          WebkitTransform: 'translateZ(0)', // Force hardware acceleration
                          transform: 'translateZ(0)'
                        }}
                        loading="lazy"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center ${isLocked ? 'blur-md' : ''}`}>
                        <span className="text-2xl font-bold text-gray-700">
                          {liker.first_name?.[0]}{liker.last_name?.[0]}
                        </span>
                      </div>
                    )}
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
                    <p className={`text-xs text-gray-600 truncate ${isLocked ? 'blur-sm' : ''}`}>
                      {liker.city}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LikedMePage;

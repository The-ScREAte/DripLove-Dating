/**
 * App Rating Service
 * Centralized service for handling app ratings across platforms
 * Includes preloading for instant native modal display
 */

import { detectPlatform, openRatingInterface, isRatingAvailable } from '@/utils/ratingPlatform';
import { 
  incrementMatchCount, 
  markUserHasRated, 
  incrementDismissCount, 
  shouldShowRatingPopup,
  getMatchCount,
  isApproachingThreshold,
  markRatingShown
} from '@/utils/ratingStorage';

// Cache the preloaded state
let isNativeRatingPreloaded = false;
let preloadPromise: Promise<void> | null = null;

/**
 * Preload the native rating interface for instant display
 * This should be called early (e.g., on 2nd match, before 3rd)
 */
export const preloadNativeRating = async (): Promise<void> => {
  const platform = detectPlatform();
  
  // Only preload on native platforms
  if (platform === 'web') {
    isNativeRatingPreloaded = true;
    return;
  }
  
  // Don't preload again if already done
  if (isNativeRatingPreloaded || preloadPromise) {
    return preloadPromise || Promise.resolve();
  }
  
  // Check if rating is available
  if (!isRatingAvailable()) {
    isNativeRatingPreloaded = true;
    return;
  }
  
  // Preload the capacitor plugin module
  preloadPromise = (async () => {
    try {
      // Dynamic import to warm up the module and ensure it's ready
      const { RateApp } = await import('capacitor-rate-app');
      // The plugin is now loaded in memory
      isNativeRatingPreloaded = true;
      console.log('[Rating] Native rating preloaded successfully');
    } catch (error) {
      console.warn('[Rating] Preload warning:', error);
      isNativeRatingPreloaded = true; // Mark as done even on error
    }
  })();
  
  return preloadPromise;
};

/**
 * Check if native rating is preloaded and ready
 */
export const isRatingPreloaded = (): boolean => {
  return isNativeRatingPreloaded;
};

/**
 * Handle a new match event - call this when a match is created
 * Returns true if rating dialog should be shown
 */
export const handleMatchForRating = async (): Promise<boolean> => {
  const shouldShow = incrementMatchCount();
  
  // Preload if approaching threshold (2nd match means 3rd is next)
  if (isApproachingThreshold()) {
    preloadNativeRating();
  }
  
  return shouldShow;
};

/**
 * Show the native rating interface immediately
 * For iOS/Android: Shows the native in-app review modal
 * For Web: Should be handled with a rating value
 */
export const showNativeRating = async (rating?: number): Promise<void> => {
  const platform = detectPlatform();
  
  try {
    // Ensure preload is complete before showing
    if (preloadPromise) {
      await preloadPromise;
    }
    
    // Mark as shown first for responsiveness
    markRatingShown();
    
    await openRatingInterface(rating);
    markUserHasRated(platform);
  } catch (error) {
    console.error(`[Rating] Error showing ${platform} rating:`, error);
    throw error;
  }
};

/**
 * Handle user dismissing the rating dialog
 */
export const dismissRating = (): void => {
  markRatingShown();
  incrementDismissCount();
};

/**
 * Check if rating dialog should be shown
 */
export const shouldPromptRating = (): boolean => {
  return shouldShowRatingPopup();
};

/**
 * Get current platform type
 */
export const getCurrentPlatform = () => {
  return detectPlatform();
};

/**
 * Check if native rating is available
 */
export const isNativeRatingSupported = (): boolean => {
  return isRatingAvailable();
};

/**
 * Get current match count for display/debugging
 */
export const getCurrentMatchCount = (): number => {
  return getMatchCount();
};

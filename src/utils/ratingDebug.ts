/**
 * Rating System Testing Utilities
 * Use these functions in the browser console to test the rating system
 */

import { resetRatingData, getRatingData, shouldShowRatingPopup, getMatchCount } from './ratingStorage';
import { detectPlatform } from './ratingPlatform';
import { preloadNativeRating } from '@/services/appRatingService';

/**
 * Debug: Check current rating status
 */
export const debugRatingStatus = () => {
  const data = getRatingData();
  const platform = detectPlatform();
  const shouldShow = shouldShowRatingPopup();
  const matchCount = getMatchCount();
  
  console.log('[Rating Debug]', { platform, data, shouldShow, matchCount });
  
  return {
    platform,
    data,
    shouldShow,
    matchCount
  };
};

/**
 * Debug: Reset rating data (for testing)
 */
export const debugResetRating = () => {
  resetRatingData();
  debugRatingStatus();
};

/**
 * Debug: Force show rating dialog (reload page after calling this)
 */
export const debugForceShowRating = () => {
  resetRatingData();
};

/**
 * Debug: Preload native rating (to test instant loading)
 */
export const debugPreloadRating = async () => {
  await preloadNativeRating();
  console.log('[Rating Debug] Native rating preloaded');
};

// Make functions available in window for console access
if (typeof window !== 'undefined') {
  (window as any).debugRating = {
    status: debugRatingStatus,
    reset: debugResetRating,
    forceShow: debugForceShowRating,
    preload: debugPreloadRating
  };
  
  // Debug utils loaded - available as window.debugRating
  // Use: window.debugRating.status(), reset(), forceShow(), or preload()
}

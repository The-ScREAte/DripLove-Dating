/**
 * Rating System Testing Utilities
 * Use these functions in the browser console to test the rating system
 */

import { resetRatingData, getRatingData, shouldShowRatingPopup } from './ratingStorage';
import { detectPlatform } from './ratingPlatform';

/**
 * Debug: Check current rating status
 */
export const debugRatingStatus = () => {
  const data = getRatingData();
  const platform = detectPlatform();
  const shouldShow = shouldShowRatingPopup();
  
  return {
    platform,
    data,
    shouldShow
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

// Make functions available in window for console access
if (typeof window !== 'undefined') {
  (window as any).debugRating = {
    status: debugRatingStatus,
    reset: debugResetRating,
    forceShow: debugForceShowRating
  };
  
  // Debug utils loaded - available as window.debugRating
  // Use: window.debugRating.status(), reset(), or forceShow()
}

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
  
  console.log('=== Rating System Debug ===');
  console.log('Current Platform:', platform);
  console.log('Rating Data:', data);
  console.log('Should Show Popup:', shouldShow);
  console.log('==========================');
  
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
  console.log('✅ Rating data has been reset');
  debugRatingStatus();
};

/**
 * Debug: Force show rating dialog (reload page after calling this)
 */
export const debugForceShowRating = () => {
  resetRatingData();
  console.log('✅ Rating reset. Reload the page to see the rating dialog after 2 minutes.');
  console.log('💡 To show immediately, set initialDelay={0} in RatingDialog component');
};

// Make functions available in window for console access
if (typeof window !== 'undefined') {
  (window as any).debugRating = {
    status: debugRatingStatus,
    reset: debugResetRating,
    forceShow: debugForceShowRating
  };
  
  console.log('💡 Rating Debug Utils loaded! Use:');
  console.log('  window.debugRating.status() - Check current status');
  console.log('  window.debugRating.reset() - Reset rating data');
  console.log('  window.debugRating.forceShow() - Force show on next load');
}

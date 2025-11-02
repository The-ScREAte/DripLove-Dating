/**
 * Rating Storage Utilities
 * Manages local storage for rating pop-up timing and user preferences
 */

const RATING_STORAGE_KEY = 'driplove_rating';

export interface RatingStorageData {
  lastShown: number | null;
  hasRated: boolean;
  dismissCount: number;
  platform: 'ios' | 'android' | 'web' | null;
}

/**
 * Get rating data from local storage
 */
export const getRatingData = (): RatingStorageData => {
  try {
    const stored = localStorage.getItem(RATING_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[Rating] Error reading rating data:', error);
  }
  
  return {
    lastShown: null,
    hasRated: false,
    dismissCount: 0,
    platform: null,
  };
};

/**
 * Save rating data to local storage
 */
export const saveRatingData = (data: Partial<RatingStorageData>): void => {
  try {
    const current = getRatingData();
    const updated = { ...current, ...data };
    localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[Rating] Error saving rating data:', error);
  }
};

/**
 * Check if enough time has passed to show the rating pop-up
 */
export const shouldShowRatingPopup = (): boolean => {
  const data = getRatingData();
  
  // Don't show if user has already rated
  if (data.hasRated) {
    return false;
  }
  
  const now = Date.now();
  
  // First time - show after 2 minutes (120000ms)
  if (data.lastShown === null) {
    return true; // Will be shown after 2 minutes by the component
  }
  
  // Subsequent shows - check if 7 days have passed
  const sevenDays = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const timeSinceLastShown = now - data.lastShown;
  
  return timeSinceLastShown >= sevenDays;
};

/**
 * Mark that the rating pop-up was shown
 */
export const markRatingShown = (): void => {
  saveRatingData({ lastShown: Date.now() });
};

/**
 * Mark that user has rated the app
 */
export const markUserHasRated = (platform: 'ios' | 'android' | 'web'): void => {
  saveRatingData({ 
    hasRated: true, 
    platform,
    lastShown: Date.now() 
  });
};

/**
 * Increment dismiss count
 */
export const incrementDismissCount = (): void => {
  const data = getRatingData();
  saveRatingData({ dismissCount: data.dismissCount + 1 });
};

/**
 * Reset rating data (for testing)
 */
export const resetRatingData = (): void => {
  localStorage.removeItem(RATING_STORAGE_KEY);
};

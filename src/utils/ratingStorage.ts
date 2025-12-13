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
  matchCount: number;
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
    matchCount: 0,
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
 * Check if we should show the rating pop-up based on match count
 * Shows on second match, then again after 3 weeks
 */
export const shouldShowRatingPopup = (): boolean => {
  const data = getRatingData();
  
  // Don't show if user has already rated
  if (data.hasRated) {
    return false;
  }
  
  const now = Date.now();
  
  // First time - check if we have at least 2 matches
  if (data.lastShown === null) {
    return data.matchCount >= 2;
  }
  
  // Subsequent shows - check if 3 weeks have passed
  const threeWeeks = 21 * 24 * 60 * 60 * 1000; // 3 weeks in milliseconds
  const timeSinceLastShown = now - data.lastShown;
  
  return timeSinceLastShown >= threeWeeks;
};

/**
 * Increment match count and check if rating should be shown
 * Returns true if the rating popup should be triggered
 */
export const incrementMatchCount = (): boolean => {
  const data = getRatingData();
  const newCount = data.matchCount + 1;
  saveRatingData({ matchCount: newCount });
  
  // Show on exactly 2nd match if never shown before
  if (data.lastShown === null && newCount === 2 && !data.hasRated) {
    return true;
  }
  
  // Also check for recurring (3 weeks passed)
  if (data.lastShown !== null && !data.hasRated) {
    const threeWeeks = 21 * 24 * 60 * 60 * 1000;
    const timeSinceLastShown = Date.now() - data.lastShown;
    if (timeSinceLastShown >= threeWeeks) {
      return true;
    }
  }
  
  return false;
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

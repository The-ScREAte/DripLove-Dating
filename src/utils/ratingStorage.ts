/**
 * Rating Storage Utilities
 * Manages local storage for rating pop-up timing and user preferences
 * 
 * Best Practices:
 * - Show after positive moments only (2nd or 3rd match)
 * - Minimum 3 weeks between prompts
 * - If dismissed, wait longer before showing again
 * - Once rated, never show again
 */

const RATING_STORAGE_KEY = 'driplove_rating';

export interface RatingStorageData {
  lastShown: number | null;
  hasRated: boolean;
  dismissCount: number;
  platform: 'ios' | 'android' | 'web' | null;
  matchCount: number;
  lastDismissedAt: number | null;
}

/**
 * Get rating data from local storage
 */
export const getRatingData = (): RatingStorageData => {
  try {
    const stored = localStorage.getItem(RATING_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // Ensure lastDismissedAt exists for backwards compatibility
      return {
        ...data,
        lastDismissedAt: data.lastDismissedAt ?? null
      };
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
    lastDismissedAt: null,
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
 * Calculate the waiting period based on dismiss count
 * Each dismiss adds more time before showing again
 */
const getWaitingPeriod = (dismissCount: number): number => {
  // Base: 3 weeks = 21 days
  // After 1 dismiss: 4 weeks
  // After 2 dismisses: 6 weeks
  // After 3+ dismisses: 8 weeks
  const baseWeeks = 3;
  const additionalWeeks = Math.min(dismissCount, 3) * 1.5;
  const totalDays = (baseWeeks + additionalWeeks) * 7;
  return totalDays * 24 * 60 * 60 * 1000; // Convert to milliseconds
};

/**
 * Check if we should show the rating pop-up based on match count
 * Shows on 2nd or 3rd match, then again after 3+ weeks
 */
export const shouldShowRatingPopup = (): boolean => {
  const data = getRatingData();
  
  // Never show if user has already rated
  if (data.hasRated) {
    return false;
  }
  
  const now = Date.now();
  
  // First time - check if we have 2+ matches (positive moment)
  if (data.lastShown === null) {
    return data.matchCount >= 2;
  }
  
  // If user dismissed, use increased waiting period based on dismiss count
  const waitingPeriod = getWaitingPeriod(data.dismissCount);
  
  // Check if enough time has passed since last shown
  const timeSinceLastShown = now - data.lastShown;
  if (timeSinceLastShown < waitingPeriod) {
    return false;
  }
  
  // If dismissed, also check time since last dismiss
  if (data.lastDismissedAt) {
    const timeSinceDismiss = now - data.lastDismissedAt;
    if (timeSinceDismiss < waitingPeriod) {
      return false;
    }
  }
  
  return true;
};

/**
 * Increment match count and check if rating should be shown
 * Returns true if the rating popup should be triggered
 * Only triggers on positive moments (matches, not failures)
 */
export const incrementMatchCount = (): boolean => {
  const data = getRatingData();
  const newCount = data.matchCount + 1;
  saveRatingData({ matchCount: newCount });
  
  // Never show if already rated
  if (data.hasRated) {
    return false;
  }
  
  // Show on exactly 2nd or 3rd match if never shown before
  if (data.lastShown === null && (newCount === 2 || newCount === 3)) {
    return true;
  }
  
  // Check for recurring (minimum 3 weeks passed, with dismiss penalty)
  if (data.lastShown !== null) {
    const waitingPeriod = getWaitingPeriod(data.dismissCount);
    const timeSinceLastShown = Date.now() - data.lastShown;
    
    // Also require a new match to be a positive moment
    if (timeSinceLastShown >= waitingPeriod) {
      // If dismissed recently, wait for dismiss period too
      if (data.lastDismissedAt) {
        const timeSinceDismiss = Date.now() - data.lastDismissedAt;
        if (timeSinceDismiss < waitingPeriod) {
          return false;
        }
      }
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
 * Increment dismiss count and record dismiss time
 * Longer wait before showing again after each dismiss
 */
export const incrementDismissCount = (): void => {
  const data = getRatingData();
  saveRatingData({ 
    dismissCount: data.dismissCount + 1,
    lastDismissedAt: Date.now()
  });
};

/**
 * Reset rating data (for testing)
 */
export const resetRatingData = (): void => {
  localStorage.removeItem(RATING_STORAGE_KEY);
};

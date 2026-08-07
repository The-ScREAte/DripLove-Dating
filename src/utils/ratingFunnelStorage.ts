/**
 * Two-step rating funnel storage
 * Triggers exactly once, 3s after the user's first-ever match screen closes.
 */

const STORAGE_KEY = 'driplove_rating_funnel';

interface RatingFunnelData {
  /** Has the funnel already been triggered once, ever (one-time only) */
  triggered: boolean;
  /** Has the user had at least one match (used to detect the first-ever match) */
  hasHadFirstMatch: boolean;
}

const defaultData: RatingFunnelData = {
  triggered: false,
  hasHadFirstMatch: false,
};

const getData = (): RatingFunnelData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultData, ...JSON.parse(stored) };
  } catch (error) {
    console.error('[RatingFunnel] Error reading storage:', error);
  }
  return { ...defaultData };
};

const saveData = (data: Partial<RatingFunnelData>): void => {
  try {
    const current = getData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }));
  } catch (error) {
    console.error('[RatingFunnel] Error saving storage:', error);
  }
};

/**
 * Call when a match screen is shown. Returns true if this is the user's
 * first-ever match (the moment that should arm the funnel trigger).
 */
export const registerMatchAndCheckIsFirst = (): boolean => {
  const data = getData();
  if (data.hasHadFirstMatch) return false;
  saveData({ hasHadFirstMatch: true });
  return true;
};

/** Whether the one-time funnel is still eligible to be shown */
export const isRatingFunnelEligible = (): boolean => {
  return !getData().triggered;
};

/** Permanently mark the funnel as triggered (one-time only, ever) */
export const markRatingFunnelTriggered = (): void => {
  saveData({ triggered: true });
};

export const resetRatingFunnelData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

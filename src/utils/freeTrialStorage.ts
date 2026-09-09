// One-time-per-user "first open" bottom sheet flag, same pattern as
// ratingFunnelStorage.ts / verifyPromptStorage.ts elsewhere in this codebase.

const STORAGE_KEY = 'driplove_free_trial_sheet';

interface FreeTrialSheetData {
  shownUserIds: string[];
}

const getData = (): FreeTrialSheetData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed?.shownUserIds)) return { shownUserIds: parsed.shownUserIds };
    }
  } catch {
    // ignore malformed/inaccessible storage
  }
  return { shownUserIds: [] };
};

const saveData = (data: FreeTrialSheetData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
};

export const isFreeTrialSheetEligible = (userId: string | undefined): boolean => {
  if (!userId) return false;
  return !getData().shownUserIds.includes(userId);
};

export const markFreeTrialSheetShown = (userId: string | undefined): void => {
  if (!userId) return;
  const data = getData();
  if (!data.shownUserIds.includes(userId)) {
    data.shownUserIds.push(userId);
    saveData(data);
  }
};

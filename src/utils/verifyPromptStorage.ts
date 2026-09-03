/**
 * "Verify your identity" swipe prompt storage.
 * Triggers once, ever, the first time an unverified user crosses the swipe
 * threshold - same one-shot pattern as ratingFunnelStorage.ts.
 */

const STORAGE_KEY = 'driplove_verify_prompt';

interface VerifyPromptData {
  /** Has the prompt already been shown once, ever (one-time only) */
  triggered: boolean;
}

const defaultData: VerifyPromptData = {
  triggered: false,
};

const getData = (): VerifyPromptData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultData, ...JSON.parse(stored) };
  } catch (error) {
    console.error('[VerifyPrompt] Error reading storage:', error);
  }
  return { ...defaultData };
};

const saveData = (data: Partial<VerifyPromptData>): void => {
  try {
    const current = getData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }));
  } catch (error) {
    console.error('[VerifyPrompt] Error saving storage:', error);
  }
};

/** Whether the one-time prompt is still eligible to be shown */
export const isVerifyPromptEligible = (): boolean => {
  return !getData().triggered;
};

/** Permanently mark the prompt as shown (one-time only, ever) */
export const markVerifyPromptTriggered = (): void => {
  saveData({ triggered: true });
};

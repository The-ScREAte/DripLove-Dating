/**
 * LEGACY reader. The "verify your identity" nudge is a coordinator popup (src/popups/registry.tsx)
 * that records its own history; this only lets it import the old device-level "already shown"
 * flag once, so users who saw the prompt before are not asked again.
 */

const STORAGE_KEY = 'driplove_verify_prompt';

/** true when the old flag says the prompt was never shown. */
export const isVerifyPromptEligible = (): boolean => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return !JSON.parse(stored)?.triggered;
  } catch {
    // unreadable: treat as not shown
  }
  return true;
};

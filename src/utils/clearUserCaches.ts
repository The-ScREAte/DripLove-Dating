import { removeUserScopedKeys } from '@/utils/storagePrefix';
import { clearChatCache } from '@/cache/chatCache';
import { clearImageCache } from '@/utils/imageCache';
import { clearPersistentImageCache } from '@/utils/persistentImageCache';
import { clearCircleTotalsCache } from '@/utils/circleCountQuery';
import { clearCircleTeaserCache } from '@/utils/circleTeaserPhotos';
import { resetIcebreakerState } from '@/services/icebreaker';

// Per-member keys that are harmless UX flags and may survive a logout (everything else with a user id in
// its name - discover deck, circle pool/rows, swiped list, liked-me copy, premium status... - is removed).
const KEEP_PREFIXES = ['driplove_swipe_guide_shown_', 'dl_popups_v1'];
// Device-level keys that still describe the previous session.
const SESSION_KEYS = ['mainapp_active_tab', 'mainapp_active_tab_user', 'driplove_last_activity'];

const LAST_UID_KEY = 'dl_last_uid';

const clearMaps = (w: Record<string, unknown>) => {
  for (const name of ['chatMatchesCache', 'chatMessagesCache', 'discoverCache', 'circleCache', 'circleRowsCache', 'likedMeCache']) {
    const m = w[name] as { clear?: () => void } | undefined;
    try {
      m?.clear?.();
    } catch {
      // ignore
    }
  }
};

/**
 * Logout / user switch: drop everything one member's session cached so the next person on this device
 * can never see it (matches, photos, circle counts, icebreaker quota, per-user localStorage).
 */
export const clearAllUserCaches = (): void => {
  clearChatCache();
  clearImageCache();
  void clearPersistentImageCache();
  clearCircleTotalsCache();
  clearCircleTeaserCache();
  resetIcebreakerState();
  if (typeof window === 'undefined') return;
  clearMaps(window as unknown as Record<string, unknown>);
  try {
    removeUserScopedKeys(window.localStorage, KEEP_PREFIXES);
    window.localStorage.removeItem(LAST_UID_KEY);
  } catch {
    // storage unavailable
  }
  try {
    removeUserScopedKeys(window.sessionStorage, KEEP_PREFIXES);
    SESSION_KEYS.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // storage unavailable
  }
};

/**
 * Safety net for a user switch that never produced SIGNED_OUT (session replaced, app killed mid-logout):
 * if the signed-in id differs from the last one seen on this device, wipe the old member's caches.
 */
export const noteSignedInUser = (userId: string | null | undefined): void => {
  if (!userId || typeof window === 'undefined') return;
  try {
    const prev = window.localStorage.getItem(LAST_UID_KEY);
    if (prev && prev !== userId) clearAllUserCaches();
    if (prev !== userId) window.localStorage.setItem(LAST_UID_KEY, userId);
  } catch {
    // storage unavailable
  }
};

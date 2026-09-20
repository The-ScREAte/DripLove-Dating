// Single source of truth for "is this person online right now" - based on
// profiles.last_login_at (updated every ~5 minutes while a user is active,
// see useActivityTracker), the only presence signal this app tracks.
// ChatHeader already showed this for an open conversation's partner; these
// same windows now back the green dot everywhere else a person's status
// shows (chat list, Discover, Circle, Liked Me).
export const CHAT_ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const SWIPE_ONLINE_WINDOW_MS = 15 * 60 * 1000;

export const isRecentlyOnline = (
  lastLoginAt: string | null | undefined,
  windowMs: number
): boolean => {
  if (!lastLoginAt) return false;
  const lastActiveMs = new Date(lastLoginAt).getTime();
  return Number.isFinite(lastActiveMs) && (Date.now() - lastActiveMs) < windowMs;
};

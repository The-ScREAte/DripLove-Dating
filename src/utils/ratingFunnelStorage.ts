/**
 * Rating funnel storage.
 *
 * Neither Apple's SKStoreReviewController nor Google's Play In-App Review API
 * tell the calling app whether their native review sheet actually displayed -
 * both platforms silently no-op it under their own internal quota, especially
 * for newer accounts. Because of that, "the user tapped Yes" (engaged with
 * our own prompt) is the only real signal we ever get, and it's the ONLY
 * thing that permanently stops us from asking again - not merely deciding to
 * show our prompt, and not the user picking "Not Really" either (their mind
 * can change later). Everything else re-asks on a growing cooldown, the same
 * way the free-trial and profile-completion nudges already do elsewhere in
 * this app, since a single missed shot at a brand-new, quota-throttled OS
 * prompt should never be the only chance a user ever gets.
 */

const STORAGE_KEY = 'driplove_rating_funnel_v2';

interface RatingFunnelData {
  /** Permanent, one-way flag - user tapped "Yes" and the native review prompt
   *  was invoked. Mirrors profiles.has_rated_app in the DB (the source of
   *  truth across devices/reinstalls); this is just the fast local cache. */
  respondedYes: boolean;
  /** Timestamp our own prompt was last actually shown, if ever. */
  lastShownAt: number | null;
  /** How many times the user has picked "Not Really" - grows the cooldown
   *  before we ask again, same backoff shape as the free-trial nudge. */
  notNowCount: number;
}

const defaultData: RatingFunnelData = {
  respondedYes: false,
  lastShownAt: null,
  notNowCount: 0,
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

const BASE_COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000; // 3 weeks
const COOLDOWN_STEP_MS = 10 * 24 * 60 * 60 * 1000; // +10 days per "Not Really"
const MAX_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000; // cap at 60 days

const cooldownFor = (notNowCount: number): number =>
  Math.min(BASE_COOLDOWN_MS + notNowCount * COOLDOWN_STEP_MS, MAX_COOLDOWN_MS);

/** Whether the funnel is still eligible to be shown right now. */
export const isRatingFunnelEligible = (): boolean => {
  const data = getData();
  if (data.respondedYes) return false;
  if (data.lastShownAt === null) return true;
  return Date.now() - data.lastShownAt >= cooldownFor(data.notNowCount);
};

/** Call only once the prompt is actually about to be shown to the user. */
export const markRatingFunnelShown = (): void => {
  saveData({ lastShownAt: Date.now() });
};

/** Call when the user picks "Not Really" - eligible again after a cooldown. */
export const markRatingFunnelNotNow = (): void => {
  const data = getData();
  saveData({ notNowCount: data.notNowCount + 1 });
};

/** Permanent, one-way: the user tapped "Yes" - never ask again, this device. */
export const markRatingFunnelRespondedYes = (): void => {
  saveData({ respondedYes: true });
};

/** Sync the DB's authoritative has_rated_app flag into the local cache, so a
 *  different device (or a reinstall) also stops asking once it catches up. */
export const syncRatingFunnelFromDb = (hasRatedInDb: boolean): void => {
  if (hasRatedInDb) {
    saveData({ respondedYes: true });
  }
};

export const resetRatingFunnelData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

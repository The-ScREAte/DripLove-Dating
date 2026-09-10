// Tracks when to (re-)show the free-trial bottom sheet, per account, on a
// repeating cadence instead of a single "show once, ever" flag - so it
// nudges free users toward the trial without ever bugging them:
//   - The very first appearance waits until the user has been on DripLove
//     for at least 10 minutes (real wall-clock time since first seen), so it
//     never interrupts the first moments of onboarding/browsing.
//   - While still trial-eligible (hasn't started it, hasn't subscribed),
//     re-shows every 3 days if they still haven't started it.
//   - Once their trial has been used (or a subscription cancelled) - no
//     longer trial-eligible, but also not premium - backs off to once every
//     3 weeks, nudging them back toward paying instead of the free-trial
//     pitch (which no longer applies to them).
//   - Stops entirely once they're premium. This module only tracks *when*
//     to show; the caller (FreeTrialBottomSheet) still gates *whether* to
//     show at all on useFreeTrialOffer's real eligibleForTrial/trialEnded
//     state, which already excludes premium users.

const STORAGE_KEY = 'driplove_free_trial_sheet_v2';

const FIRST_SHOW_DELAY_MS = 10 * 60 * 1000; // 10 minutes
const ELIGIBLE_CADENCE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const TRIAL_ENDED_CADENCE_MS = 21 * 24 * 60 * 60 * 1000; // 3 weeks

export type FreeTrialSheetCadenceState = 'eligible' | 'trialEnded';

interface FreeTrialSheetRecord {
  firstSeenAt: number;
  lastShownAt: number | null;
}

type StoredData = Record<string, FreeTrialSheetRecord>;

const getAllData = (): StoredData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as StoredData;
      }
    }
  } catch {
    // ignore malformed/inaccessible storage
  }
  return {};
};

const saveAllData = (data: StoredData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
};

// Creates the record (firstSeenAt = now) on the very first call for this
// user, and returns it unchanged on every call after that.
const getOrInitRecord = (userId: string): FreeTrialSheetRecord => {
  const data = getAllData();
  const existing = data[userId];
  if (existing) return existing;

  const record: FreeTrialSheetRecord = { firstSeenAt: Date.now(), lastShownAt: null };
  data[userId] = record;
  saveAllData(data);
  return record;
};

const cadenceForState = (state: FreeTrialSheetCadenceState): number =>
  state === 'eligible' ? ELIGIBLE_CADENCE_MS : TRIAL_ENDED_CADENCE_MS;

/**
 * Milliseconds from now until the sheet should next be shown for this user
 * in their current cadence state. <= 0 means "show now". Also lazily
 * initializes firstSeenAt on first-ever call for this user.
 */
export const msUntilNextFreeTrialSheet = (
  userId: string | undefined,
  state: FreeTrialSheetCadenceState
): number => {
  if (!userId) return Infinity;
  const record = getOrInitRecord(userId);
  const now = Date.now();

  if (record.lastShownAt === null) {
    // Never shown yet - gate purely on time-since-first-seen.
    return record.firstSeenAt + FIRST_SHOW_DELAY_MS - now;
  }

  return record.lastShownAt + cadenceForState(state) - now;
};

export const markFreeTrialSheetShown = (userId: string | undefined): void => {
  if (!userId) return;
  const data = getAllData();
  const existing = data[userId] ?? { firstSeenAt: Date.now(), lastShownAt: null };
  data[userId] = { ...existing, lastShownAt: Date.now() };
  saveAllData(data);
};

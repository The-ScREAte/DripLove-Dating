/**
 * Shared date helpers. This is the single implementation of age calculation
 * used across the app (Discover, Circle, Liked Me, profile, admin).
 */

// Cache of computed ages by date of birth. Ages only change at midnight, so
// the cache is dropped whenever the calendar day rolls over - otherwise a
// long-running session would keep showing the old age after a birthday.
const ageCache = new Map<string, number>();
const AGE_CACHE_MAX = 1000;
let ageCacheDay = '';

const computeAge = (birthDate: Date, today: Date): number => {
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

/**
 * Whole years since `dateOfBirth` (ISO date string). Returns NaN for an
 * unparseable date, matching the previous per-component implementations.
 */
export const calculateAge = (dateOfBirth: string): number => {
  const today = new Date();
  const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  if (dayKey !== ageCacheDay) {
    ageCache.clear();
    ageCacheDay = dayKey;
  }

  const cached = ageCache.get(dateOfBirth);
  if (cached !== undefined) return cached;

  // A bare "YYYY-MM-DD" is a calendar date, not an instant: new Date() reads it as UTC
  // midnight, and getMonth()/getDate() then shift it to the previous day west of UTC
  // (the Americas), making people turn a year older - and 18 - a day early.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  const birth = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(dateOfBirth);
  const age = computeAge(birth, today);

  if (ageCache.size >= AGE_CACHE_MAX) {
    const oldestKey = ageCache.keys().next().value;
    if (oldestKey !== undefined) ageCache.delete(oldestKey);
  }
  ageCache.set(dateOfBirth, age);
  return age;
};

/** Null-safe variant for optional/unvalidated DOB input. */
export const calculateAgeOrNull = (dateOfBirth: string | null | undefined): number | null => {
  if (!dateOfBirth) return null;
  const age = calculateAge(dateOfBirth);
  return Number.isNaN(age) ? null : age;
};

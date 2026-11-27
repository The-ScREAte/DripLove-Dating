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

  const age = computeAge(new Date(dateOfBirth), today);

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

import { SIGN_COMPATIBILITY } from '@/constants/signCompatibility';

// Two signs are compatible if either one explicitly lists the other in its
// curated compatibility set (checked in both directions, since the source
// data isn't perfectly symmetric - e.g. Gye Nyame lists Ankh but that
// doesn't guarantee Ankh's own entry lists Gye Nyame back), or if they're
// literally the same sign. A sign with no curated entry at all (see
// src/constants/signCompatibility.ts's header) still matches this way on
// an identical sign, just not on any other one yet.
const areSignsCompatible = (a: string, b: string): boolean => {
  if (a === b) return true;
  const aList = SIGN_COMPATIBILITY[a];
  if (aList?.includes(b)) return true;
  const bList = SIGN_COMPATIBILITY[b];
  if (bList?.includes(a)) return true;
  return false;
};

// True if any sign in `mySigns` is compatible with any sign in `theirSigns`
// - the single check Discover's Sign Match filter runs per candidate
// profile (see filterBySignCompatibility in DiscoverPage.tsx).
export const hasSignCompatibility = (mySigns: string[], theirSigns: string[]): boolean => {
  if (mySigns.length === 0 || theirSigns.length === 0) return false;
  return mySigns.some((mine) => theirSigns.some((theirs) => areSignsCompatible(mine, theirs)));
};

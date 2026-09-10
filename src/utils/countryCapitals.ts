// Fallback coordinates for when a user's chosen city can't be geocoded
// (typed a custom city name not in our known-city list). Using the
// country's capital keeps them discoverable in distance-based matching
// instead of silently ending up with no coordinates at all - see the
// matching backfill migration (20260914000000_backfill_missing_coordinates_with_capitals.sql)
// for the same list applied to existing profiles.
export const COUNTRY_CAPITAL_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  GH: { latitude: 5.6037, longitude: -0.1870 },   // Accra
  NG: { latitude: 9.0765, longitude: 7.3986 },    // Abuja
  US: { latitude: 38.9072, longitude: -77.0369 }, // Washington, D.C.
  CA: { latitude: 45.4215, longitude: -75.6972 }, // Ottawa
  GB: { latitude: 51.5072, longitude: -0.1276 },  // London
  ZA: { latitude: -25.7461, longitude: 28.1881 }, // Pretoria
  UG: { latitude: 0.3476, longitude: 32.5825 },   // Kampala
  KE: { latitude: -1.2921, longitude: 36.8219 },  // Nairobi
  FR: { latitude: 48.8566, longitude: 2.3522 },   // Paris
  DE: { latitude: 52.5200, longitude: 13.4050 },  // Berlin
  TZ: { latitude: -6.1630, longitude: 35.7516 },  // Dodoma
  AU: { latitude: -35.2809, longitude: 149.1300 },// Canberra
  SN: { latitude: 14.7167, longitude: -17.4677 }, // Dakar
  BJ: { latitude: 6.4969, longitude: 2.6289 },    // Porto-Novo
  NL: { latitude: 52.3676, longitude: 4.9041 },   // Amsterdam
  EG: { latitude: 30.0444, longitude: 31.2357 },  // Cairo
};

/**
 * Best-effort fallback coordinates for a country code, or undefined if we
 * don't have one on file. Callers should only use this when the user's
 * actual pick (detected or typed city) didn't come with real coordinates.
 */
export const getCapitalCoordinates = (
  countryCode: string | null | undefined
): { latitude: number; longitude: number } | undefined => {
  if (!countryCode) return undefined;
  return COUNTRY_CAPITAL_COORDINATES[countryCode.trim().toUpperCase()];
};

import { normalizeCountryCode } from '@/utils/countryCode';

/**
 * Single source of truth for how distances are DISPLAYED across the app.
 *
 * Everything is STORED and COMPUTED in kilometres (max_distance, the
 * haversine helpers, the DB radius params). Only the presentation layer
 * converts - and it converts to exactly one unit for the whole app at a
 * time, based on the viewer's own country. Never mix km and miles on
 * screen at the same time.
 */

const KM_PER_MILE = 1.609344;
const STORAGE_KEY = 'driplove_distance_country';

// Countries that use miles for road/everyday distance. (The UK uses miles
// on roads even though it is otherwise metric.) US territories included so
// they don't silently fall back to km.
const MILES_COUNTRIES = new Set([
  'US', 'GB', 'LR', 'MM',
  'PR', 'GU', 'VI', 'AS', 'MP',
]);

export type DistanceUnit = 'km' | 'mi';

let cachedCountry = '';

const readStoredCountry = (): string => {
  if (cachedCountry) return cachedCountry;
  try {
    cachedCountry = normalizeCountryCode(localStorage.getItem(STORAGE_KEY) || '');
  } catch {
    cachedCountry = '';
  }
  return cachedCountry;
};

/** Called once the viewer's profile is known (country_code or country name). */
export const setDistanceUnitCountry = (countryCode: unknown, country?: unknown) => {
  const cc = normalizeCountryCode(String(countryCode || '')) || normalizeCountryCode(String(country || ''));
  if (!cc || cc === cachedCountry) return;
  cachedCountry = cc;
  try {
    localStorage.setItem(STORAGE_KEY, cc);
  } catch {
    // ignore
  }
};

export const getDistanceUnit = (countryCode?: unknown): DistanceUnit => {
  const cc = countryCode ? normalizeCountryCode(String(countryCode)) : readStoredCountry();
  return MILES_COUNTRIES.has(cc) ? 'mi' : 'km';
};

export const getDistanceUnitLabel = (countryCode?: unknown): string => getDistanceUnit(countryCode);

export const kmToMiles = (km: number): number => km / KM_PER_MILE;
export const milesToKm = (mi: number): number => mi * KM_PER_MILE;

/** Convert a stored km value into the viewer's display unit (rounded). */
export const toDisplayDistance = (km: number, countryCode?: unknown): number => {
  if (!Number.isFinite(km)) return 0;
  return Math.round(getDistanceUnit(countryCode) === 'mi' ? kmToMiles(km) : km);
};

/** Convert a value the user picked in display units back into stored km. */
export const fromDisplayDistance = (value: number, countryCode?: unknown): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(getDistanceUnit(countryCode) === 'mi' ? milesToKm(value) : value);
};

/** "42 km" / "26 mi" - always at least 1 so nothing reads as "0 away". */
export const formatDistance = (km: number, countryCode?: unknown): string => {
  const unit = getDistanceUnit(countryCode);
  const value = Math.max(1, toDisplayDistance(km, countryCode));
  return `${value} ${unit}`;
};

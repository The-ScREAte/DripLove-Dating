import { COUNTRY_DIAL_CODES } from './countryDialCodes';
import { normalizeCountryCode } from './countryCode';

// Short, internationally recognised country labels for places shown on profiles ("Accra, GH", "Austin, USA").
// ISO 3166-1 alpha-2 codes, except the few countries people know by a longer acronym.
const DISPLAY_OVERRIDES: Record<string, string> = { US: 'USA', GB: 'UK', AE: 'UAE' };

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
let byName: Map<string, string> | null = null;
const nameMap = () => {
  if (!byName) {
    byName = new Map();
    for (const c of COUNTRY_DIAL_CODES) byName.set(key(c.name), c.code.toUpperCase());
  }
  return byName;
};

/** "United States" -> "USA", "Ghana" -> "GH", "GH" -> "GH". Unknown names are returned unchanged. */
export function countryShort(country?: string | null): string {
  const raw = (country ?? '').trim();
  if (!raw) return '';
  let code = nameMap().get(key(raw)) || '';
  if (!code) {
    const n = normalizeCountryCode(raw);
    if (n.length === 2 && (raw.length <= 3 || n !== raw.toUpperCase().replace(/[^A-Z]/g, ''))) code = n;
  }
  if (!code) return raw;
  return DISPLAY_OVERRIDES[code] || code;
}

/** "City, COUNTRY" with the short country label. */
export function placeShort(city?: string | null, country?: string | null): string {
  return [city?.trim(), countryShort(country)].filter(Boolean).join(', ');
}

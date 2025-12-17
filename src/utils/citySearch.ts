import type { CityData } from '@/constants/locationData';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; data: CityData[] }>();

const ALLOWED_PLACE_TYPES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'locality',
  'suburb',
  'neighbourhood',
  'quarter',
  'borough',
  'district',
  'administrative'
]);

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

function getPlaceName(item: any): string {
  const address = item?.address;
  return (
    item?.name ||
    address?.city ||
    address?.town ||
    address?.village ||
    address?.hamlet ||
    address?.suburb ||
    address?.neighbourhood ||
    address?.quarter ||
    address?.municipality ||
    address?.locality ||
    (typeof item?.display_name === 'string' ? item.display_name.split(',')[0]?.trim() : '') ||
    ''
  );
}

function getPlaceRegion(item: any): string | undefined {
  const address = item?.address;
  return (
    address?.state ||
    address?.province ||
    address?.state_district ||
    address?.region ||
    address?.county ||
    address?.administrative ||
    undefined
  );
}

function dedupeCities(cities: CityData[]): CityData[] {
  const seen = new Set<string>();
  const out: CityData[] = [];
  for (const c of cities) {
    const key = `${c.name.toLowerCase()}|${(c.state || '').toLowerCase()}|${c.latitude.toFixed(4)}|${c.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export async function searchCitiesForCountry(
  countryCode: string,
  query: string,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<CityData[]> {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < 2) return [];

  const limit = options?.limit ?? 10;
  const cacheKey = `${countryCode}:${normalizedQuery.toLowerCase()}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Try primary search with settlement focus
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(Math.min(limit * 5, 50))); // Fetch even more results for better coverage
  url.searchParams.set('countrycodes', countryCode.toLowerCase());
  url.searchParams.set('q', normalizedQuery);
  // Don't set featuretype - it may exclude results in countries with less data

  try {
    const res = await fetch(url.toString(), {
      signal: options?.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DripLove Dating App'
      }
    });

    if (!res.ok) {
      console.warn(`City search API error: ${res.status}`);
      return [];
    }

    const raw: any[] = await res.json();

  const mapped = raw
    .filter((item) => {
      const cls = String(item?.class || '');
      const type = String(item?.type || '');
      const address = item?.address;
      
      // Accept place types (cities, towns, villages, etc.)
      if (cls === 'place' && ALLOWED_PLACE_TYPES.has(type)) return true;
      
      // Accept administrative boundaries that have settlement data
      // This helps with countries that classify locations differently
      if (cls === 'boundary' && type === 'administrative') {
        return !!(address?.city || address?.town || address?.village || 
                 address?.hamlet || address?.suburb || address?.municipality);
      }
      
      // For countries with sparse data, also accept any result with valid settlement address
      // but prioritize place class results by putting them first
      if (address && (address.city || address.town || address.village)) {
        return true;
      }
      
      return false;
    })
    .map((item) => {
      const name = getPlaceName(item);
      const state = getPlaceRegion(item);
      const latitude = Number.parseFloat(String(item?.lat || ''));
      const longitude = Number.parseFloat(String(item?.lon || ''));

      if (!name || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

      const cls = String(item?.class || '');
      const type = String(item?.type || '');
      
      // Add priority score to sort better results first
      let priority = 0;
      if (cls === 'place') {
        if (type === 'city') priority = 100;
        else if (type === 'town') priority = 90;
        else if (type === 'village') priority = 80;
        else if (type === 'hamlet') priority = 70;
        else priority = 60;
      } else if (cls === 'boundary') {
        priority = 50;
      }

      const city: CityData = {
        name,
        state,
        latitude,
        longitude
      };

      return { city, priority };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.priority || 0) - (a?.priority || 0)) // Sort by priority
    .map(item => item?.city)
    .filter(Boolean) as CityData[];

    const results = dedupeCities(mapped).slice(0, limit);

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: results });
    return results;
  } catch (error) {
    console.warn('City search error:', error);
    return [];
  }
}

import { supabase } from '@/integrations/supabase/client';
import { getCountriesList } from '@/constants/locationData';

// Cache for enabled countries to avoid repeated API calls
let enabledCountriesCache: { country_code: string; country_name: string }[] | null = null;
let cacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getEnabledCountries() {
  // Check cache first
  const now = Date.now();
  if (enabledCountriesCache && now < cacheExpiry) {
    const allCountries = getCountriesList();
    return allCountries.filter(country => 
      enabledCountriesCache!.some(enabled => enabled.country_code === country.code)
    );
  }

  try {
    // Fetch enabled countries from database (with timeout so mobile doesn't hang forever)
    const rpcPromise = supabase.rpc('get_enabled_countries');
    const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Timeout fetching enabled countries') }), 8000)
    );

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

    if (error) {
      console.error('Error fetching enabled countries:', error);
      // Fallback to all countries if there's an error
      return getCountriesList();
    }

    // Update cache
    enabledCountriesCache = data || [];
    cacheExpiry = now + CACHE_DURATION;

    // Filter the full countries list to only include enabled ones
    const allCountries = getCountriesList();
    const enabledCountries = allCountries.filter(country => 
      enabledCountriesCache!.some(enabled => enabled.country_code === country.code)
    );

    // If no countries are enabled, return all countries as fallback
    return enabledCountries.length > 0 ? enabledCountries : allCountries;
  } catch (error) {
    console.error('Error fetching enabled countries:', error);
    // Fallback to all countries if there's an error
    return getCountriesList();
  }
}

export function clearEnabledCountriesCache() {
  enabledCountriesCache = null;
  cacheExpiry = 0;
}
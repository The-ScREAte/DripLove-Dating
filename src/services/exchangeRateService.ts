/**
 * Exchange Rate Service
 * Uses exchangerate-api.io free tier for currency conversion
 * Caches rates for 24 hours to minimize API calls
 */

interface ExchangeRateCache {
  rates: Record<string, number>;
  timestamp: number;
  baseCurrency: string;
}

const CACHE_KEY = 'exchange_rates_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const API_URL = 'https://api.exchangerate-api.com/v4/latest';

/**
 * Get cached exchange rates if still valid
 */
function getCachedRates(): ExchangeRateCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const cacheData: ExchangeRateCache = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid (less than 24 hours old)
    if (now - cacheData.timestamp < CACHE_DURATION) {
      return cacheData;
    }

    // Cache expired, remove it
    localStorage.removeItem(CACHE_KEY);
    return null;
  } catch (error) {
    console.error('[ExchangeRate] Error reading cache:', error);
    return null;
  }
}

/**
 * Save exchange rates to cache
 */
function cacheRates(baseCurrency: string, rates: Record<string, number>): void {
  try {
    const cacheData: ExchangeRateCache = {
      rates,
      timestamp: Date.now(),
      baseCurrency,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('[ExchangeRate] Error saving cache:', error);
  }
}

/**
 * Fetch fresh exchange rates from API
 */
async function fetchExchangeRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
  try {
    const response = await fetch(`${API_URL}/${baseCurrency}`);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.rates) {
      throw new Error('Invalid API response format');
    }

    return data.rates;
  } catch (error) {
    console.error('[ExchangeRate] Error fetching rates:', error);
    throw error;
  }
}

/**
 * Get exchange rate from one currency to another
 * @param fromCurrency - Source currency code (e.g., 'USD')
 * @param toCurrency - Target currency code (e.g., 'GHS')
 * @returns Exchange rate or null if unavailable
 */
export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number | null> {
  try {
    // If same currency, rate is 1
    if (fromCurrency === toCurrency) {
      return 1;
    }

    // Check cache first
    const cached = getCachedRates();
    
    if (cached && cached.baseCurrency === fromCurrency) {
      const rate = cached.rates[toCurrency];
      if (rate) {
        return rate;
      }
    }

    // If not in cache or cache miss, fetch fresh rates
    const rates = await fetchExchangeRates(fromCurrency);
    
    // Save to cache
    cacheRates(fromCurrency, rates);

    const rate = rates[toCurrency];
    if (!rate) {
      return null;
    }

    return rate;
  } catch (error) {
    console.error('[ExchangeRate] Error getting exchange rate:', error);
    return null;
  }
}

/**
 * Convert amount from one currency to another
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency code
 * @param toCurrency - Target currency code
 * @returns Converted amount or null if conversion failed
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number | null> {
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  
  if (rate === null) {
    return null;
  }

  return amount * rate;
}

/**
 * Convert amount to GHS (Ghanaian Cedis) from any currency
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency code
 * @returns Amount in GHS or fallback value if API fails
 */
export async function convertToGHS(
  amount: number,
  fromCurrency: string
): Promise<number> {
  try {
    const converted = await convertCurrency(amount, fromCurrency, 'GHS');
    
    if (converted !== null) {
      return Math.round(converted); // Round to nearest whole GHS
    }

    // Fallback to approximate rates if API fails
    console.warn('[ExchangeRate] Using fallback conversion rates');
    const fallbackRates: Record<string, number> = {
      USD: 16,
      EUR: 17,
      GBP: 20,
      NGN: 0.01,
      ZAR: 0.85,
      KES: 0.12,
      GHS: 1,
    };

    const rate = fallbackRates[fromCurrency] || fallbackRates.USD;
    return Math.round(amount * rate);
  } catch (error) {
    console.error('[ExchangeRate] Error converting to GHS:', error);
    
    // Ultimate fallback: use USD rate
    return Math.round(amount * 16);
  }
}

/**
 * Clear the exchange rate cache (useful for testing or manual refresh)
 */
export function clearExchangeRateCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore cache clear errors
  }
}

/**
 * Preload exchange rates for better UX
 * Call this on app initialization to cache rates in the background
 */
export async function preloadExchangeRates(): Promise<void> {
  try {
    const cached = getCachedRates();
    
    // Only fetch if cache is empty or expired
    if (!cached) {
      await fetchExchangeRates('USD');
    }
  } catch {
    // Silently fail - not critical for app functionality
  }
}

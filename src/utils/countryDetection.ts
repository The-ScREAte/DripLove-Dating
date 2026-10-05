/**
 * Auto-detect user's country using GPS and IP geolocation
 */

async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

interface GeolocationResult {
  countryCode: string;
  countryName: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  method: 'gps' | 'ip' | 'failed';
}

// Map country codes to full names
export const countryCodeMap: Record<string, string> = {
  'NG': 'Nigeria',
  'GH': 'Ghana',
  'SN': 'Senegal',
  'BJ': 'Benin',
  'TG': 'Togo',
  'CI': 'Côte d\'Ivoire',
  'BF': 'Burkina Faso',
  'ML': 'Mali',
  'NE': 'Niger',
  'GN': 'Guinea',
  'SL': 'Sierra Leone',
  'LR': 'Liberia',
  'GM': 'The Gambia',
  'MR': 'Mauritania',
  'CM': 'Cameroon',
  'TD': 'Chad',
  'CF': 'Central African Republic',
  'CG': 'Republic of the Congo',
  'CD': 'Democratic Republic of the Congo',
  'GA': 'Gabon',
  'GQ': 'Equatorial Guinea',
  'KE': 'Kenya',
  'ET': 'Ethiopia',
  'UG': 'Uganda',
  'TZ': 'Tanzania',
  'RW': 'Rwanda',
  'BI': 'Burundi',
  'SO': 'Somalia',
  'DJ': 'Djibouti',
  'ER': 'Eritrea',
  'ZA': 'South Africa',
  'ZW': 'Zimbabwe',
  'AO': 'Angola',
  'NA': 'Namibia',
  'BW': 'Botswana',
  'ZM': 'Zambia',
  'MW': 'Malawi',
  'MZ': 'Mozambique',
  'MG': 'Madagascar',
  'MU': 'Mauritius',
  'EG': 'Egypt',
  'MA': 'Morocco',
  'DZ': 'Algeria',
  'TN': 'Tunisia',
  'LY': 'Libya',
  'SD': 'Sudan',
  'SS': 'South Sudan',
  'LS': 'Lesotho',
  'SZ': 'Eswatini',
  'CV': 'Cape Verde',
  'ST': 'São Tomé and Príncipe',
  'KM': 'Comoros',
  'SC': 'Seychelles',
  'US': 'United States',
  'GB': 'United Kingdom',
  'DE': 'Germany',
  'FR': 'France',
  'ES': 'Spain',
  'IT': 'Italy',
  'NL': 'Netherlands',
  'CA': 'Canada',
  'AU': 'Australia',
  'IN': 'India',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'JP': 'Japan',
  'CN': 'China',
  'KR': 'South Korea'
};

/**
 * Reverse geocode coordinates to get country and city
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<{ countryCode: string; city?: string } | null> {
  try {
    // Using OpenStreetMap Nominatim (free, no API key needed)
    // NOTE: Browsers/WKWebView forbid setting some headers (like User-Agent),
    // so keep headers minimal to avoid failures on iOS/Android WebView.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
      {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      }
    );
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const countryCode = data.address?.country_code?.toUpperCase();
    
    // Try to get city from various address fields (different regions use different fields)
    const city = data.address?.city || 
                 data.address?.town || 
                 data.address?.village || 
                 data.address?.municipality || 
                 data.address?.county ||
                 data.address?.state_district;
    
    return { 
      countryCode: countryCode || '', 
      city: city || undefined 
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

/**
 * Get country from IP address using multiple fallback services
 */
async function getCountryFromIP(): Promise<string | null> {
  // List of IP geolocation services to try in order
  const services = [
    {
      url: 'https://ipapi.co/json/',
      getCountry: (data: any) => data.country_code
    },
    {
      url: 'https://ipwho.is/',
      getCountry: (data: any) => data.country_code
    },
    {
      url: 'https://api.country.is/',
      getCountry: (data: any) => data.country
    },
    {
      url: 'https://freeipapi.com/api/json',
      getCountry: (data: any) => data.countryCode
    },
    {
      url: 'http://ip-api.com/json/',
      getCountry: (data: any) => data.countryCode
    }
  ];

  for (const service of services) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(service.url, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const countryCode = service.getCountry(data);
        if (countryCode) {
          return countryCode;
        }
      }
    } catch (error) {
      console.warn(`IP service ${service.url} failed:`, error);
      // Continue to next service
    }
  }
  
  console.error('All IP geolocation services failed');
  return null;
}

/**
 * Auto-detect user's country using GPS first, then IP as fallback
 */
export async function autoDetectCountry(): Promise<GeolocationResult> {
  const native = await isNativePlatform();

  // On iOS/Android WebViews, navigator.geolocation can hang without rejecting.
  // Prefer IP detection on native to avoid infinite spinners; use GPS only when safe.
  if (!native && 'geolocation' in navigator) {
    try {
      const position = await withTimeout(
        new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            enableHighAccuracy: true,
          });
        }),
        11000,
        'navigator.geolocation.getCurrentPosition'
      );

      const { latitude, longitude } = position.coords;
      const geocodeResult = await withTimeout(reverseGeocode(latitude, longitude), 8000, 'reverseGeocode');

      if (geocodeResult?.countryCode && countryCodeMap[geocodeResult.countryCode]) {
        return {
          countryCode: geocodeResult.countryCode,
          countryName: countryCodeMap[geocodeResult.countryCode],
          city: geocodeResult.city,
          latitude,
          longitude,
          method: 'gps',
        };
      }
    } catch (error) {
      console.warn('GPS detection failed, falling back to IP:', error);
    }
  }

  // IP geolocation (primary for native; fallback for web)
  const countryCode = await withTimeout(getCountryFromIP(), 15000, 'getCountryFromIP');
  if (countryCode && countryCodeMap[countryCode]) {
    return {
      countryCode,
      countryName: countryCodeMap[countryCode],
      method: 'ip'
    };
  }

  // If all fails, return failure
  return {
    countryCode: '',
    countryName: '',
    method: 'failed'
  };
}

/**
 * Get country name from country code
 */
export function getCountryName(countryCode: string): string {
  return countryCodeMap[countryCode.toUpperCase()] || '';
}

/**
 * Check if country detection is supported
 */
export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator;
}

/**
 * Check if user is currently outside their profile country
 * Returns { isOutside: boolean, currentCountryCode: string | null }
 */
export async function checkIfUserIsOutsideCountry(profileCountryCode: string): Promise<{
  isOutside: boolean;
  currentCountryCode: string | null;
  currentCountryName: string | null;
  method: 'gps' | 'ip' | 'failed';
}> {
  // If no profile country set, allow editing
  if (!profileCountryCode) {
    return { isOutside: true, currentCountryCode: null, currentCountryName: null, method: 'failed' };
  }

  const result = await autoDetectCountry();
  
  if (result.method === 'failed') {
    // Can't determine location, lock country for safety
    return { isOutside: false, currentCountryCode: null, currentCountryName: null, method: 'failed' };
  }

  const isOutside = result.countryCode.toUpperCase() !== profileCountryCode.toUpperCase();
  
  return {
    isOutside,
    currentCountryCode: result.countryCode,
    currentCountryName: result.countryName,
    method: result.method
  };
}

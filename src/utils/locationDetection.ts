/**
 * Location Detection Utility
 * Detects user's actual location using IP geolocation and device GPS
 */

import { getCountryByCode } from '@/constants/locationData';

interface DetectedLocation {
  country: string;
  countryCode: string;
  city: string;
  latitude?: number;
  longitude?: number;
  accuracy?: 'high' | 'medium' | 'low';
  method?: 'gps' | 'ip' | 'none';
}

/**
 * Get user's location from browser GPS
 */
export const getGPSLocation = async (): Promise<DetectedLocation | null> => {
  if (!navigator.geolocation) {
    console.log('Geolocation not supported');
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocode to get country/city
          const location = await reverseGeocode(latitude, longitude);
          
          resolve({
            country: location.country,
            countryCode: location.countryCode,
            city: location.city,
            latitude,
            longitude,
            accuracy: 'high',
            method: 'gps'
          });
        } catch (error) {
          console.error('Error reverse geocoding:', error);
          resolve(null);
        }
      },
      (error) => {
        console.error('GPS location error:', error);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes cache
      }
    );
  });
};

/**
 * Get user's location from IP address
 */
export const getIPLocation = async (): Promise<DetectedLocation | null> => {
  try {
    // Try multiple IP geolocation services for reliability
    const services = [
      'https://ipapi.co/json/',
      'https://ip-api.com/json/',
      'https://ipwhois.app/json/'
    ];

    for (const service of services) {
      try {
        const response = await fetch(service);
        if (!response.ok) continue;
        
        const data = await response.json();
        
        // Parse response based on service
        let country = '';
        let countryCode = '';
        let city = '';
        let latitude: number | undefined;
        let longitude: number | undefined;

        if (service.includes('ipapi.co')) {
          country = data.country_name;
          countryCode = data.country_code;
          city = data.city;
          latitude = data.latitude;
          longitude = data.longitude;
        } else if (service.includes('ip-api.com')) {
          country = data.country;
          countryCode = data.countryCode;
          city = data.city;
          latitude = data.lat;
          longitude = data.lon;
        } else if (service.includes('ipwhois.app')) {
          country = data.country;
          countryCode = data.country_code;
          city = data.city;
          latitude = data.latitude;
          longitude = data.longitude;
        }

        // Verify we got valid data
        if (country && countryCode) {
          return {
            country,
            countryCode: countryCode.toUpperCase(),
            city: city || '',
            latitude,
            longitude,
            accuracy: 'medium',
            method: 'ip'
          };
        }
      } catch (error) {
        console.error(`Error with ${service}:`, error);
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting IP location:', error);
    return null;
  }
};

/**
 * Reverse geocode coordinates to get location details
 */
const reverseGeocode = async (latitude: number, longitude: number): Promise<{
  country: string;
  countryCode: string;
  city: string;
}> => {
  try {
    // Use Nominatim (OpenStreetMap) for reverse geocoding
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
      {
        headers: {
          'User-Agent': 'DripLove Dating App'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }

    const data = await response.json();
    const address = data.address || {};

    return {
      country: address.country || '',
      countryCode: address.country_code?.toUpperCase() || '',
      city: address.city || address.town || address.village || address.state || ''
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    throw error;
  }
};

/**
 * Get user's actual location using GPS first, fallback to IP
 */
export const detectUserLocation = async (): Promise<DetectedLocation | null> => {
  try {
    // Try GPS first (most accurate)
    console.log('Attempting GPS location detection...');
    const gpsLocation = await getGPSLocation();
    
    if (gpsLocation) {
      console.log('GPS location detected:', gpsLocation);
      return gpsLocation;
    }

    // Fallback to IP geolocation
    console.log('GPS failed, attempting IP geolocation...');
    const ipLocation = await getIPLocation();
    
    if (ipLocation) {
      console.log('IP location detected:', ipLocation);
      return ipLocation;
    }

    console.log('All location detection methods failed');
    return null;
  } catch (error) {
    console.error('Error detecting user location:', error);
    return null;
  }
};

/**
 * Verify if detected location matches a country in our system
 */
export const verifyLocationInSystem = (countryCode: string): boolean => {
  const country = getCountryByCode(countryCode);
  return country !== null;
};

/**
 * Check if user is in their claimed location (distance verification)
 */
export const verifyUserInLocation = async (
  claimedLat: number,
  claimedLng: number,
  maxDistanceKm: number = 500
): Promise<{ verified: boolean; actualDistance?: number }> => {
  try {
    const detectedLocation = await detectUserLocation();
    
    if (!detectedLocation || !detectedLocation.latitude || !detectedLocation.longitude) {
      return { verified: false };
    }

    // Calculate distance between claimed and detected location
    const distance = calculateDistance(
      claimedLat,
      claimedLng,
      detectedLocation.latitude,
      detectedLocation.longitude
    );

    return {
      verified: distance <= maxDistanceKm,
      actualDistance: distance
    };
  } catch (error) {
    console.error('Error verifying location:', error);
    return { verified: false };
  }
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

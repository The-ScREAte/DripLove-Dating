import { reverseGeocode, countryCodeMap } from '@/utils/countryDetection';

export interface CurrentLocation {
  latitude: number;
  longitude: number;
  city?: string;
  countryCode?: string;
  countryName?: string;
}

export type CurrentLocationError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class CurrentLocationFailure extends Error {
  constructor(public reason: CurrentLocationError) {
    super(reason);
  }
}

// navigator.geolocation can hang without ever calling back inside some
// iOS/Android WebViews, so every attempt is capped with our own timer too.
function getPosition(options: PositionOptions, capMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new CurrentLocationFailure('timeout')), capMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve(pos);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(new CurrentLocationFailure(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable'));
      },
      options
    );
  });
}

/**
 * The device's current position plus the city/country it falls in. Only call
 * this from a user action ("Use my current location") - it triggers the
 * system location permission prompt the first time.
 *
 * Tries a precise GPS fix first, then a quicker network-based fix (indoors,
 * GPS can take a long time or fail outright). The coordinates are what match
 * distances are calculated from; the city name is just for display, so a
 * failed reverse-geocode still returns the exact coordinates.
 */
export async function getCurrentLocation(): Promise<CurrentLocation> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new CurrentLocationFailure('unsupported');
  }

  let position: GeolocationPosition;
  try {
    position = await getPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }, 12000);
  } catch (error) {
    if (error instanceof CurrentLocationFailure && error.reason === 'denied') throw error;
    position = await getPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }, 10000);
  }

  const { latitude, longitude } = position.coords;
  const place = await reverseGeocode(latitude, longitude).catch(() => null);
  const countryCode = place?.countryCode || undefined;
  return {
    latitude,
    longitude,
    city: place?.city,
    countryCode,
    countryName: countryCode ? countryCodeMap[countryCode] : undefined,
  };
}

export function describeLocationError(reason: CurrentLocationError): string {
  switch (reason) {
    case 'denied':
      return 'Location access is turned off for DripLove. You can allow it in your phone settings, or choose your city below.';
    case 'timeout':
      return "We couldn't get your location in time. Try again, or choose your city below.";
    case 'unsupported':
      return "This device can't share its location. Please choose your city below.";
    default:
      return "We couldn't find your location right now. Please choose your city below.";
  }
}

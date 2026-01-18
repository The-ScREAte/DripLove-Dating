import { supabase } from '@/integrations/supabase/client';
import { calculateDistance, getCityCoordinates, getCountryByCode } from '@/constants/locationData';

const normalizeCountryCode = (c: string | null | undefined): string => {
  const cleaned = (c || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return '';

  // Keep ISO2 codes; map ISO3/names to ISO2 when possible.
  if (cleaned.length === 2) return cleaned;

  const iso3Map: Record<string, string> = {
    USA: 'US',
    CAN: 'CA',
    GBR: 'GB',
    IRL: 'IE',
    AUS: 'AU', 
    NZL: 'NZ',
    IND: 'IN',
    PAK: 'PK',
    KEN: 'KE',
    NGA: 'NG',
    GHA: 'GH',
    ZAF: 'ZA',
  };

  const nameMap: Record<string, string> = {
    UNITEDSTATES: 'US',
    UNITEDSTATESOFAMERICA: 'US',
    AMERICA: 'US',
    CANADA: 'CA',
    UNITEDKINGDOM: 'GB',
    GREATBRITAIN: 'GB',
    ENGLAND: 'GB',
    IRELAND: 'IE',
    AUSTRALIA: 'AU',
    NEWZEALAND: 'NZ',
    INDIA: 'IN',
    PAKISTAN: 'PK',
    KENYA: 'KE',
    NIGERIA: 'NG',
    GHANA: 'GH',
    SOUTHAFRICA: 'ZA',
  };

  return iso3Map[cleaned] || nameMap[cleaned] || cleaned;
};

export interface LocationMatch {
  profile_id: string;
  distance_km: number;
  city: string;
  country_code: string;
  first_name?: string;
  age?: number;
}

export interface UserLocation {
  country: string;
  countryCode: string;
  city: string;
  latitude?: number;
  longitude?: number;
  maxDistance?: number;
}

// Simple TTL cache to prevent repeated calls during rapid swiping
interface CacheEntry {
  data: LocationMatch[];
  timestamp: number;
}

class LocationService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes TTL

  /**
   * Get potential matches based on user's location and preferences
   * Uses RPC for server-side filtering (fast), falls back to safe JS filtering if needed
   */
  async getLocationBasedMatches(
    userId: string, 
    maxDistance?: number,
    isPremium: boolean = false
  ): Promise<LocationMatch[]> {
    if (!userId) return [];

    // Check cache first
    const cacheKey = `${userId}:${maxDistance || 'default'}:${isPremium ? 'premium' : 'free'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      // Try RPC first (server-side filtering - fast)
      const result = await this.getRpcLocationMatches(userId, maxDistance, isPremium);
      
      if (result.length > 0) {
        // Cache the result
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
      
      // If RPC returns empty, try safe fallback
      const fallback = await this.getSafeFallbackMatches(userId, maxDistance, isPremium);
      this.cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
      return fallback;
      
    } catch (error) {
      // RPC failed, use safe fallback
      try {
        const fallback = await this.getSafeFallbackMatches(userId, maxDistance, isPremium);
        this.cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
        return fallback;
      } catch {
        return [];
      }
    }
  }

  /**
   * Use the database RPC function for server-side location filtering
   */
  private async getRpcLocationMatches(
    userId: string,
    maxDistance?: number,
    isPremium: boolean = false
  ): Promise<LocationMatch[]> {
    // Get user's max_distance preference and (for free mode) base country.
    const { data: user } = await supabase
      .from('profiles')
      .select('max_distance, country, country_code')
      .eq('id', userId)
      .single();

    const searchDistance = maxDistance || user?.max_distance || 50;
    const userCountryIso2 = normalizeCountryCode(user?.country_code || user?.country);

    // Free users must have a country; otherwise fail-closed.
    if (!isPremium && !userCountryIso2) return [];

    // Call the RPC function that does server-side filtering
    const { data, error } = await supabase.rpc('find_matches_by_location', {
      user_id: userId,
      max_distance_km: searchDistance
    });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Map RPC results to LocationMatch format
    const rows = data as Array<{
      profile_id: string;
      distance_km?: number | null;
      city?: string | null;
      country_code?: string | null;
    }>;

    const mapped = rows.map((row) => ({
      profile_id: row.profile_id,
      distance_km: Math.round(((row.distance_km || 0) as number) * 10) / 10,
      city: row.city || '',
      country_code: normalizeCountryCode(row.country_code || '')
    }));

    // Client-side hard gate for free users until RPC enforces same-country.
    if (!isPremium) {
      return mapped.filter((m) => normalizeCountryCode(m.country_code) === userCountryIso2);
    }

    return mapped;
  }

  /**
   * Safe fallback with proper filters and limits - NOT fetching all profiles
   */
  private async getSafeFallbackMatches(
    userId: string, 
    maxDistance: number = 50,
    isPremium: boolean = false
  ): Promise<LocationMatch[]> {
    if (!userId) return [];

    try {
      // Get current user's location
      const { data: currentUser, error: userError } = await supabase
        .from('profiles')
        .select('country, country_code, city, latitude, longitude, max_distance')
        .eq('id', userId)
        .single();

      if (userError || !currentUser) {
        return [];
      }

      const searchDistance = maxDistance || currentUser.max_distance || 50;
      const userCountryIso2 = normalizeCountryCode(currentUser.country_code || currentUser.country);

      // Free users must have a country; otherwise fail-closed.
      if (!isPremium && !userCountryIso2) return [];

      // Build a SAFE query with proper filters and limits
      let query = supabase
        .from('profiles')
        .select('id, first_name, date_of_birth, country, country_code, city, latitude, longitude')
        .neq('id', userId)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('is_archived', false);

      // FREE users: ALWAYS same country, regardless of coords.
      if (!isPremium && userCountryIso2) {
        query = query.eq('country_code', userCountryIso2);
      }

      // If user has coordinates, prioritize users with coordinates
      if (currentUser.latitude && currentUser.longitude) {
        query = query
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);
      } else {
        // If no coordinates and premium: prefer same-country to avoid wildly irrelevant results.
        if (isPremium && userCountryIso2) {
          query = query.eq('country_code', userCountryIso2);
        }
      }

      // IMPORTANT: Always limit results to prevent massive payloads
      query = query.limit(300);

      const { data: profiles, error: profilesError } = await query;

      if (profilesError || !profiles) {
        return [];
      }

      // Filter and calculate distances on the smaller set
      const matches: LocationMatch[] = [];

      for (const profile of profiles) {
        if (!profile.city) continue;

        let distance = 999;
        let includeProfile = false;

        const age = profile.date_of_birth ? this.calculateAge(profile.date_of_birth) : undefined;

        // Calculate distance if both have coordinates
        if (
          currentUser.latitude && currentUser.longitude &&
          profile.latitude && profile.longitude
        ) {
          distance = calculateDistance(
            currentUser.latitude,
            currentUser.longitude,
            profile.latitude,
            profile.longitude
          );
          
          if (distance > 1000) {
            // Suspicious distance - fall back to country/city matching
            const userCountryIso2 = normalizeCountryCode(currentUser.country_code || currentUser.country);
            const profileCountryIso2 = normalizeCountryCode(
              profile.country_code || (profile as { country?: string | null }).country
            );
            if (userCountryIso2 && profileCountryIso2 && profileCountryIso2 === userCountryIso2) {
              if (profile.city?.toLowerCase() === currentUser.city?.toLowerCase()) {
                distance = 0;
                includeProfile = true;
              } else {
                distance = 25;
                includeProfile = searchDistance >= 25;
              }
            }
          } else {
            includeProfile = distance <= searchDistance;
          }
        } else {
          // Country/city matching - use country_code OR country name as fallback
          const userCountryIso2 = normalizeCountryCode(currentUser.country_code || currentUser.country);
          const profileCountryIso2 = normalizeCountryCode(
            profile.country_code || (profile as { country?: string | null }).country
          );
          if (userCountryIso2 && profileCountryIso2 && profileCountryIso2 === userCountryIso2) {
            if (profile.city?.toLowerCase() === currentUser.city?.toLowerCase()) {
              distance = 0;
              includeProfile = true;
            } else {
              distance = 25;
              includeProfile = searchDistance >= 25;
            }
          }
        }

        // Final hard gate: FREE users can never include other countries.
        if (!isPremium) {
          const profileCountryIso2 = normalizeCountryCode(
            (profile as { country?: string | null; country_code?: string | null }).country_code ||
              (profile as { country?: string | null }).country
          );
          if (!profileCountryIso2 || profileCountryIso2 !== userCountryIso2) {
            includeProfile = false;
          }
        }

        if (includeProfile) {
          matches.push({
            profile_id: profile.id,
            distance_km: Math.round(distance * 10) / 10,
            city: profile.city,
            country_code: normalizeCountryCode(
              profile.country_code || (profile as { country?: string | null }).country
            ),
            first_name: profile.first_name,
            age
          });
        }
      }

      matches.sort((a, b) => a.distance_km - b.distance_km);
      return matches;

    } catch (error) {
      return [];
    }
  }

  /**
   * Clear the location cache (useful when user updates location preferences)
   */
  clearCache(userId?: string): void {
    if (userId) {
      // Clear all cache entries for this user
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Update user's location information
   */
  async updateUserLocation(
    userId: string, 
    location: UserLocation
  ): Promise<boolean> {
    try {
      const updateData: Record<string, unknown> = {
        country: location.country,
        country_code: normalizeCountryCode(location.countryCode || location.country),
        city: location.city,
        max_distance: location.maxDistance || 50
      };

      if (location.latitude && location.longitude) {
        updateData.latitude = location.latitude;
        updateData.longitude = location.longitude;
        updateData.is_custom_city = false;
      } else {
        const cityData = getCityCoordinates(location.countryCode, location.city);
        if (cityData) {
          updateData.latitude = cityData.latitude;
          updateData.longitude = cityData.longitude;
          updateData.is_custom_city = false;
        } else {
          updateData.is_custom_city = true;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        return false;
      }

      // Clear cache when location is updated
      this.clearCache(userId);
      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Get user's current location settings
   */
  async getUserLocation(userId: string): Promise<UserLocation | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('country, country_code, city, latitude, longitude, max_distance')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        country: data.country || '',
        countryCode: data.country_code || '',
        city: data.city || '',
        latitude: data.latitude || undefined,
        longitude: data.longitude || undefined,
        maxDistance: data.max_distance || 50
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dateOfBirth: string): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Get location statistics for debugging
   */
  async getLocationStats(): Promise<{
    totalWithLocation: number;
    totalWithCoordinates: number;
    countryCounts: Record<string, number>;
  }> {
    try {
      // Use a limited query for stats too
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('country_code, latitude, longitude')
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .limit(1000);

      if (error || !profiles) {
        return { totalWithLocation: 0, totalWithCoordinates: 0, countryCounts: {} };
      }

      const totalWithLocation = profiles.filter(p => p.country_code).length;
      const totalWithCoordinates = profiles.filter(p => p.latitude && p.longitude).length;
      
      const countryCounts: Record<string, number> = {};
      profiles.forEach(p => {
        if (p.country_code) {
          countryCounts[p.country_code] = (countryCounts[p.country_code] || 0) + 1;
        }
      });

      return { totalWithLocation, totalWithCoordinates, countryCounts };

    } catch (error) {
      return { totalWithLocation: 0, totalWithCoordinates: 0, countryCounts: {} };
    }
  }
}

export const locationService = new LocationService();

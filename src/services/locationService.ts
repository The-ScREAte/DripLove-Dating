import { supabase } from '@/integrations/supabase/client';
import { calculateDistance, getCityCoordinates, getCountryByCode } from '@/constants/locationData';

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

class LocationService {
  /**
   * Get potential matches based on user's location and preferences
   */
  async getLocationBasedMatches(
    userId: string, 
    maxDistance?: number
  ): Promise<LocationMatch[]> {
    try {
  // ...removed log...
      
      // First try to use the database function
      const { data: dbMatches, error: dbError } = await supabase
        .rpc('find_matches_by_location', {
          user_id: userId,
          max_distance_km: maxDistance
        });

  // ...removed log...

      if (!dbError && dbMatches && dbMatches.length > 0) {
  // ...removed log...
        return dbMatches;
      }

  // ...removed log...
      // Fallback to manual location matching
      return await this.getFallbackLocationMatches(userId, maxDistance);
      
    } catch (error) {
      console.error('❌ Error getting location matches:', error);
      return await this.getFallbackLocationMatches(userId, maxDistance);
    }
  }

  /**
   * Fallback location matching when database functions aren't available
   */
  private async getFallbackLocationMatches(
    userId: string, 
    maxDistance: number = 50
  ): Promise<LocationMatch[]> {
    try {
      // Get current user's location
      const { data: currentUser, error: userError } = await supabase
        .from('profiles')
        .select('country, country_code, city, latitude, longitude, max_distance')
        .eq('id', userId)
        .single();

      if (userError || !currentUser) {
        console.error('❌ Error getting user location:', userError);
        return [];
      }

      const searchDistance = maxDistance || currentUser.max_distance || 50;

      // Get all potential matches
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, date_of_birth, country, country_code, city, latitude, longitude')
        .neq('id', userId);

      if (profilesError || !profiles) {
        console.error('❌ Error getting profiles:', profilesError);
        return [];
      }

      // Filter and calculate distances
      const matches: LocationMatch[] = [];

      for (const profile of profiles) {
        // Skip profiles without location data
        if (!profile.country_code || !profile.city) continue;

        let distance = 999; // Default high distance
        let includeProfile = false;

        // Calculate age from date_of_birth
        const age = profile.date_of_birth ? this.calculateAge(profile.date_of_birth) : undefined;

        // If both users have coordinates, calculate exact distance
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
          includeProfile = distance <= searchDistance;
        }
        // Otherwise, use country/city matching
        else {
          // Same country gets priority
          if (profile.country_code === currentUser.country_code) {
            // Same city gets even higher priority
            if (profile.city && currentUser.city && profile.city.toLowerCase() === currentUser.city.toLowerCase()) {
              distance = 0; // Same city
              includeProfile = true;
            } else {
              distance = 25; // Same country, different city
              includeProfile = searchDistance >= 25;
            }
          }
          // Different country but within region could be considered
          else if (currentUser.country_code && this.areCountriesInSameRegion(currentUser.country_code, profile.country_code)) {
            distance = 100; // Regional match
            includeProfile = searchDistance >= 100;
          }
        }

        if (includeProfile) {
          matches.push({
            profile_id: profile.id,
            distance_km: Math.round(distance * 10) / 10, // Round to 1 decimal
            city: profile.city,
            country_code: profile.country_code,
            first_name: profile.first_name,
            age: age
          });
        }
      }

      // Sort by distance
      matches.sort((a, b) => a.distance_km - b.distance_km);

      return matches;

    } catch (error) {
      console.error('❌ Error in fallback location matching:', error);
      return [];
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
      const updateData: any = {
        country: location.country,
        country_code: location.countryCode,
        city: location.city,
        max_distance: location.maxDistance || 50
      };

      // Add coordinates if available
      if (location.latitude && location.longitude) {
        updateData.latitude = location.latitude;
        updateData.longitude = location.longitude;
        updateData.is_custom_city = false;
      } else {
        // Try to get coordinates from our data
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
        console.error('❌ Error updating user location:', error);
        return false;
      }

      return true;

    } catch (error) {
      console.error('❌ Error updating user location:', error);
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
        console.error('❌ Error getting user location:', error);
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
      console.error('❌ Error getting user location:', error);
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
   * Check if two countries are in the same region (for broader matching)
   * Updated for global compatibility - all users can connect worldwide
   */
  private areCountriesInSameRegion(country1: string, country2: string): boolean {
    // For global compatibility, we'll prioritize same country matches
    // but allow connections worldwide
    if (country1 === country2) return true;
    
    // All users worldwide can connect regardless of region
    return true;
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
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('country_code, latitude, longitude');

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
      console.error('❌ Error getting location stats:', error);
      return { totalWithLocation: 0, totalWithCoordinates: 0, countryCounts: {} };
    }
  }
}

export const locationService = new LocationService();

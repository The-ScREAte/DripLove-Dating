/**
 * Date utility functions optimized for performance
 * Caches date strings to avoid repeated toISOString() calls
 */

// Cache for today's date string (updates once per minute)
let cachedDateString: string | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60000; // 1 minute

/**
 * Get current date in ISO format with caching
 * Much faster than calling new Date().toISOString() repeatedly
 */
export const getCurrentISOString = (): string => {
  const now = Date.now();
  
  // Return cached value if still valid
  if (cachedDateString && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedDateString;
  }
  
  // Update cache
  cachedDateString = new Date(now).toISOString();
  cacheTimestamp = now;
  
  return cachedDateString;
};

/**
 * Get today's date string (YYYY-MM-DD format) with caching
 */
let cachedTodayString: string | null = null;
let todayCacheTimestamp = 0;

export const getTodayString = (): string => {
  const now = Date.now();
  
  if (cachedTodayString && (now - todayCacheTimestamp) < CACHE_DURATION) {
    return cachedTodayString;
  }
  
  cachedTodayString = new Date(now).toISOString().split('T')[0];
  todayCacheTimestamp = now;
  
  return cachedTodayString;
};

/**
 * Calculate age from date of birth (cached per DOB)
 */
const ageCache = new Map<string, number>();

export const calculateAge = (dateOfBirth: string): number => {
  // Check cache first
  if (ageCache.has(dateOfBirth)) {
    return ageCache.get(dateOfBirth)!;
  }
  
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  // Cache the result
  ageCache.set(dateOfBirth, age);
  
  // Clear cache if it gets too large (memory management)
  if (ageCache.size > 1000) {
    const firstKey = ageCache.keys().next().value;
    ageCache.delete(firstKey);
  }
  
  return age;
};

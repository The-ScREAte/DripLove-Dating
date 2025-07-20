// Performance optimization utilities for the dating app

// 1. Debounce function for search and other frequent operations
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// 2. Throttle function for scroll events and other high-frequency events
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// 3. Image lazy loading and optimization
export const optimizeImageUrl = (url: string, maxWidth: number = 400): string => {
  // Add image optimization parameters for better mobile performance
  if (url.includes('supabase')) {
    return `${url}?width=${maxWidth}&quality=80&format=webp`;
  }
  return url;
};

// 4. Memory cleanup utilities
export const cleanupLocalStorage = (): void => {
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  
  // Clean old profile data
  const savedTime = parseInt(localStorage.getItem('driplove_last_profile_time') || '0');
  if (now - savedTime > oneWeek) {
    localStorage.removeItem('driplove_last_profile_id');
    localStorage.removeItem('driplove_last_profile_time');
  }
};

// 5. Pagination helper
export const createPagination = (page: number, limit: number = 20) => ({
  from: page * limit,
  to: (page + 1) * limit - 1
});

// 6. Cache management for user data
class UserDataCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const userDataCache = new UserDataCache();

// 7. Batch processing for likes/matches
export const batchProcess = async <T>(
  items: T[],
  processor: (batch: T[]) => Promise<void>,
  batchSize: number = 10
): Promise<void> => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
    // Small delay to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};

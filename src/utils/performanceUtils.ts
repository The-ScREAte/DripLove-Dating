/**
 * Performance utilities for Android optimization
 * Prevents main thread blocking and improves UI responsiveness
 */

/**
 * Defer a function to run after the main thread is free
 * This prevents blocking the UI during critical operations
 */
export function deferToNextFrame<T>(fn: () => Promise<T> | T): Promise<T> {
  return new Promise((resolve, reject) => {
    requestAnimationFrame(() => {
      setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, 0);
    });
  });
}

/**
 * Debounce a function to prevent rapid repeated calls
 * Useful for search, API calls, etc.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function to limit execution rate
 * Ensures function runs at most once per specified time period
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Simple in-memory cache for API responses
 * Prevents redundant network calls
 */
class SimpleCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.ttl = ttlMs;
  }

  get(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

// Export a singleton cache instance
export const profileCache = new SimpleCache<any>(5 * 60 * 1000); // 5 minutes TTL

/**
 * Measure and log slow operations (dev only)
 */
export async function measurePerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  
  try {
    const result = await fn();
    const duration = performance.now() - start;
    
    if (duration > 1000) {
      console.warn(`⚠️ Slow operation: ${name} took ${duration.toFixed(2)}ms`);
    } else if (duration > 100) {
      console.log(`⏱️ ${name} took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`❌ ${name} failed after ${duration.toFixed(2)}ms`, error);
    throw error;
  }
}

/**
 * Batch multiple async operations to run in parallel
 * More efficient than sequential awaits
 */
export async function batchAsync<T>(
  operations: (() => Promise<T>)[]
): Promise<T[]> {
  return Promise.all(operations.map(op => op()));
}

// Performance optimization utilities for the dating app

/**
 * Detect if running on Android
 */
export const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
};

/**
 * Detect if running on iOS
 */
export const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/**
 * Get device performance tier (low, medium, high)
 */
export const getDevicePerformanceTier = (): 'low' | 'medium' | 'high' => {
  if (typeof window === 'undefined') return 'medium';
  
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as any).deviceMemory || 4;
  
  if (memory <= 2 || cores <= 4) return 'low';
  if (memory >= 6 && cores >= 8) return 'high';
  return 'medium';
};

/**
 * Get optimal image quality based on device performance
 */
export const getOptimalImageQuality = (): number => {
  const tier = getDevicePerformanceTier();
  
  // Android gets lower quality by default for better performance
  if (isAndroid()) {
    switch (tier) {
      case 'low': return 50;
      case 'medium': return 60;
      case 'high': return 70;
      default: return 60;
    }
  }
  
  // iOS can handle higher quality
  switch (tier) {
    case 'low': return 60;
    case 'medium': return 75;
    case 'high': return 85;
    default: return 75;
  }
};

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

// 3. Image lazy loading and optimization - ULTRA OPTIMIZED FOR SPEED
export const optimizeImageUrl = (url: string, maxWidth: number = 300): string => {
  // Get optimal quality based on device
  const quality = getOptimalImageQuality();
  
  // Android devices get more aggressive optimization
  const width = isAndroid() ? Math.min(maxWidth, 800) : maxWidth;
  
  // Ultra-aggressive optimization for maximum speed and concurrent users
  if (url.includes('supabase')) {
    return `${url}?width=${width}&quality=${quality}&format=webp&resize=fill`;
  }
  return url;
};

// 3.1. Progressive Profile Refill System
export const checkAndTriggerRefill = (userId: string, currentIndex: number) => {
  if (typeof window !== 'undefined' && (window as any).refillProfilesWhenNeeded) {
    (window as any).refillProfilesWhenNeeded(userId, currentIndex);
  }
};

// 3.1.1. Progressive Image Loading Manager
export class ProgressiveImageLoader {
  private loadingQueue: string[] = [];
  private loadedImages: Set<string> = new Set();
  private maxConcurrentLoads = 3;
  private currentLoads = 0;

  addToQueue(imageUrls: string[]) {
    const newUrls = imageUrls.filter(url => !this.loadedImages.has(url) && !this.loadingQueue.includes(url));
    this.loadingQueue.push(...newUrls);
    this.processQueue();
  }

  private async processQueue() {
    while (this.loadingQueue.length > 0 && this.currentLoads < this.maxConcurrentLoads) {
      const url = this.loadingQueue.shift();
      if (!url) continue;

      this.currentLoads++;
      try {
        await this.loadImage(url);
        this.loadedImages.add(url);
      } catch (error) {
        // Silently handle failed loads
      } finally {
        this.currentLoads--;
        // Continue processing
        if (this.loadingQueue.length > 0) {
          setTimeout(() => this.processQueue(), 100);
        }
      }
    }
  }

  private loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = optimizeImageUrl(url);
    });
  }

  isLoaded(url: string): boolean {
    return this.loadedImages.has(url);
  }
}

// Global progressive image loader instance
export const globalImageLoader = new ProgressiveImageLoader();

// 3.2. Batch image preloader for discover page
export const preloadImagesBatch = async (imageUrls: string[], maxConcurrent: number = 3): Promise<HTMLImageElement[]> => {
  const results: HTMLImageElement[] = [];
  
  for (let i = 0; i < imageUrls.length; i += maxConcurrent) {
    const batch = imageUrls.slice(i, i + maxConcurrent);
    const batchPromises = batch.map((url) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          // Create a placeholder image for failed loads
          const placeholder = new Image();
          placeholder.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzlmYTZiNyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
          resolve(placeholder);
        };
        // Ultra-optimized image loading for maximum concurrent users
        img.src = optimizeImageUrl(url, 280);
      });
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to prevent overwhelming the browser
    if (i + maxConcurrent < imageUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  return results;
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

// 8. Smart image cache with LRU eviction
class ImageCache {
  private cache = new Map<string, HTMLImageElement>();
  private accessOrder = new Map<string, number>();
  private maxSize: number;
  private accessCounter = 0;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  set(url: string, image: HTMLImageElement): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestUrl = this.findOldestUrl();
      if (oldestUrl) {
        this.cache.delete(oldestUrl);
        this.accessOrder.delete(oldestUrl);
      }
    }

    this.cache.set(url, image);
    this.accessOrder.set(url, ++this.accessCounter);
  }

  get(url: string): HTMLImageElement | null {
    const image = this.cache.get(url);
    if (image) {
      this.accessOrder.set(url, ++this.accessCounter);
      return image;
    }
    return null;
  }

  private findOldestUrl(): string | null {
    let oldestUrl: string | null = null;
    let oldestAccess = Infinity;

    for (const [url, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestUrl = url;
      }
    }

    return oldestUrl;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  size(): number {
    return this.cache.size;
  }
}

export const imageCache = new ImageCache(50);

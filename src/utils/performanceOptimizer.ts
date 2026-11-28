// Performance optimization utilities for the dating app

/**
 * Get device performance tier (low, medium, high)
 */
const getDevicePerformanceTier = (): 'low' | 'medium' | 'high' => {
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
const getOptimalImageQuality = (): number => {
  const tier = getDevicePerformanceTier();
  
  // Same table on every platform so photos look the same on Android as on iOS.
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
// 3. Image lazy loading and optimization - ULTRA OPTIMIZED FOR SPEED
const optimizeImageUrl = (url: string, maxWidth: number = 300): string => {
  // Get optimal quality based on device
  const quality = getOptimalImageQuality();
  
  const width = maxWidth;
  const format = 'webp';
  
  // Ultra-aggressive optimization for maximum speed and concurrent users
  if (url.includes('supabase')) {
    return `${url}?width=${width}&quality=${quality}&format=${format}&resize=fill`;
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
class ProgressiveImageLoader {
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
const globalImageLoader = new ProgressiveImageLoader();

// 3.2. Batch image preloader for discover page
// 4. Memory cleanup utilities
// 5. Pagination helper
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

const imageCache = new ImageCache(50);

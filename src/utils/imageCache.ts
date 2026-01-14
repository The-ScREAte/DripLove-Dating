import { isAndroidPlatform } from './platformUtils';

// ⭐ GLOBAL IMAGE CACHE - Shared across all components for instant loading
export const globalImageCache = new Map<string, string>(); // url => blobURL
export const failedImages = new Set<string>(); // Track failed images to avoid retry loops

// ⭐ EFFICIENT IMAGE PRELOADER - Converts images to blob URLs for instant rendering
// ⭐ ANDROID OPTIMIZATION: Shorter timeout and smaller blob cache for Android
export const preloadImageToBlob = async (url: string): Promise<string> => {
  // Return cached blob URL if available
  if (globalImageCache.has(url)) {
    return globalImageCache.get(url)!;
  }

  // Don't retry failed images
  if (failedImages.has(url)) {
    return url;
  }

  try {
    // ⭐ ANDROID FIX: Shorter timeout for Android (5s vs 10s for iOS)
    const isAndroid = isAndroidPlatform();
    const timeoutMs = isAndroid ? 5000 : 10000;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // Fetch image as blob with timeout
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      failedImages.add(url);
      return url;
    }
    
    const blob = await res.blob();
    
    // Verify it's actually an image
    if (!blob.type.startsWith('image/')) {
      failedImages.add(url);
      return url;
    }
    
    const blobUrl = URL.createObjectURL(blob);
    
    // Cache the blob URL
    globalImageCache.set(url, blobUrl);
    return blobUrl;
  } catch (error) {
    // Mark as failed and return original URL
    failedImages.add(url);
    return url;
  }
};

// Cleanup blob URLs when needed (optional, for memory management)
// ⭐ ANDROID FIX: Lower threshold for Android to prevent memory pressure
export const cleanupOldBlobUrls = () => {
  const isAndroid = isAndroidPlatform();
  const threshold = isAndroid ? 50 : 100; // Android: more aggressive cleanup
  const removeCount = isAndroid ? 15 : 20;
  
  if (globalImageCache.size > threshold) {
    const entries = Array.from(globalImageCache.entries());
    const toRemove = entries.slice(0, removeCount);
    toRemove.forEach(([url, blobUrl]) => {
      URL.revokeObjectURL(blobUrl);
      globalImageCache.delete(url);
    });
  }
};

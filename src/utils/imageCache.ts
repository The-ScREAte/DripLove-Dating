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

// ⭐ PRELOAD FIRST 5 PROFILES - Returns when first 5 are cached (for instant Discover open)
export const preloadFirst5Profiles = async (
  profileImages: { profileId: string; imageUrl: string }[]
): Promise<Map<string, string>> => {
  const results = new Map<string, string>();
  
  // Take first 5 profiles only
  const first5 = profileImages.slice(0, 5);
  
  // Parallel preload with concurrency limit of 3
  const CONCURRENCY = 3;
  const chunks: typeof first5[] = [];
  for (let i = 0; i < first5.length; i += CONCURRENCY) {
    chunks.push(first5.slice(i, i + CONCURRENCY));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async ({ profileId, imageUrl }) => {
      const blobUrl = await preloadImageToBlob(imageUrl);
      results.set(profileId, blobUrl);
    });
    await Promise.all(promises);
  }
  
  return results;
};

// ⭐ BACKGROUND PRELOAD - Preload remaining profiles (6-15) with lower priority
export const preloadBackgroundProfiles = (
  profileImages: { profileId: string; imageUrl: string }[],
  concurrency: number = 2
): Promise<void> => {
  return new Promise((resolve) => {
    // Skip first 5 (already loaded)
    const remaining = profileImages.slice(5);
    if (remaining.length === 0) {
      resolve();
      return;
    }
    
    let index = 0;
    let active = 0;
    
    const processNext = () => {
      while (active < concurrency && index < remaining.length) {
        const { imageUrl } = remaining[index++];
        active++;
        preloadImageToBlob(imageUrl)
          .finally(() => {
            active--;
            if (index < remaining.length) {
              processNext();
            } else if (active === 0) {
              resolve();
            }
          });
      }
    };
    
    processNext();
  });
};

// ⭐ REVOKE BLOB URL FOR PROFILE - Clean up memory when profile is swiped
export const revokeBlobUrlsForProfile = (
  profileId: string,
  imageUrls: string[]
): void => {
  for (const url of imageUrls) {
    const blobUrl = globalImageCache.get(url);
    if (blobUrl && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
      globalImageCache.delete(url);
    }
  }
};

// ⭐ CLEANUP OLD BLOB URLS - Evict oldest entries when cache grows too large
export const cleanupOldBlobUrls = (maxSize: number = 100) => {
  if (globalImageCache.size > maxSize) {
    const entries = Array.from(globalImageCache.entries());
    const toRemove = entries.slice(0, Math.ceil(globalImageCache.size * 0.2)); // Remove 20%
    toRemove.forEach(([url, blobUrl]) => {
      if (blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
      globalImageCache.delete(url);
    });
  }
};

// ⭐ GET CACHED BLOB URL - Returns blob URL if cached, otherwise original URL
export const getCachedBlobUrl = (url: string): string => {
  return globalImageCache.get(url) || url;
};

// ⭐ CLEAR ALL CACHED BLOBS - Full cleanup (e.g., on logout)
export const clearAllBlobCache = () => {
  for (const [, blobUrl] of globalImageCache.entries()) {
    if (blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
  }
  globalImageCache.clear();
  failedImages.clear();
};

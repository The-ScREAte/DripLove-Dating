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

// Drops a blob URL that no longer resolves, so the next request re-fetches
// from the network instead of being handed the same dead string forever.
//
// A blob: URL is only valid while the document that created it is alive AND
// the underlying blob is still held. When iOS backgrounds the WebView and
// WebKit reclaims memory, those blobs can be purged while this module-level
// Map (and the React state built from it) survive - leaving entries that
// point at nothing. The card's text still renders from normal state, so the
// symptom is "everything is there except the photo". Without this, both
// preloadImageToBlob above and every other consumer keep serving the dead
// URL for the rest of the session.
//
// `failedImages` is cleared for the same url too: a blob going stale says
// nothing about whether the source image is fetchable, and leaving it in
// that set would block the retry this exists to enable.
export const dropBlobUrl = (url: string): void => {
  const blobUrl = globalImageCache.get(url);
  if (blobUrl) {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Already revoked - the entry still has to go.
    }
    globalImageCache.delete(url);
  }
  failedImages.delete(url);
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

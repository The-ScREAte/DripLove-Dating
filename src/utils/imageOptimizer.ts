/**
 * Image optimization utilities for Supabase Storage URLs
 * Uses Supabase's built-in image transformation capabilities
 * 
 * IMPORTANT: The `format` parameter is intentionally omitted because
 * Supabase periodically changes the allowed values, causing 400 errors.
 * Without `format`, Supabase serves the original format which always works.
 */

interface OptimizeOptions {
  width?: number;
  height?: number;
  quality?: number;
}

/**
 * Optimize a Supabase Storage image URL using image transformations.
 * Falls back to the original URL if the transformation endpoint is unavailable.
 */
export function optimizeImageUrl(
  url: string | null | undefined,
  options: OptimizeOptions = {}
): string {
  if (!url) return '';
  
  // If it's not a Supabase Storage URL, return as-is
  if (!url.includes('supabase.co/storage')) {
    return url;
  }
  
  // Check if URL is already using render endpoint
  if (url.includes('/render/image/')) {
    return url;
  }
  
  const {
    width = 400,
    height,
    quality = 80,
  } = options;
  
  try {
    const setOptimizationParams = (inputUrl: string): string => {
      const parsed = new URL(inputUrl);
      parsed.searchParams.set('width', String(width));
      if (height) parsed.searchParams.set('height', String(height));
      parsed.searchParams.set('quality', String(quality));
      // 'cover' crops to fill both dimensions - meaningless (and actively
      // harmful) without a height: Supabase's transform then leaves the
      // image at its ORIGINAL height while forcing width to the requested
      // value, silently squashing/stretching every image that only passes
      // width. 'contain' correctly scales the whole image proportionally
      // when only one dimension is given.
      parsed.searchParams.set('resize', height ? 'cover' : 'contain');
      return parsed.toString();
    };

    // Convert /object/public/ to /render/image/public/
    const transformedUrl = url.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/'
    );

    // Preserve existing query params and override optimization params safely.
    return setOptimizationParams(transformedUrl);
  } catch (error) {
    console.error('[imageOptimizer] Failed to optimize URL:', error);
    return url;
  }
}

/**
 * Get the raw (non-transformed) Supabase storage URL.
 * Use as a fallback when the /render/image/ endpoint fails.
 */
export function getRawStorageUrl(url: string | null | undefined): string {
  if (!url) return '';
  // Convert any /render/image/ URL back to /object/public/
  return url.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
}

/**
 * The URL to use everywhere a photo is displayed in the app.
 *
 * Supabase's "Storage Image Transformations" (the /render/image/ endpoint
 * optimizeImageUrl() above builds URLs for) is a billed, quota-limited
 * feature - the app blew through its monthly quota because many screens
 * each requested their own resized variant of the same photo. Every photo
 * is already resized to <=1024px / <=1MB at upload time (see compressImage
 * in src/utils/imageCompression.ts), so a further server-side transform
 * was rarely buying any real size reduction - it was mostly just spending
 * quota for free. To make the quota problem impossible to repeat, the
 * project's Image Transformations feature has been switched off entirely
 * (Storage > Settings in the Supabase dashboard), so every image request
 * in the app now goes through this - the raw, untransformed object URL.
 *
 * If Image Transformations is ever re-enabled for a specific real need
 * (e.g. serving true thumbnails to cut bandwidth on a very high-traffic
 * list), build that URL with optimizeImageUrl() directly at that one call
 * site rather than reintroducing a shared "small size" helper that quietly
 * spreads back out across the app the way this one did.
 */
export function getDetailImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  const raw = getRawStorageUrl(url);
  return raw || url;
}

/** @deprecated use getDetailImageUrl - kept only so old imports don't break. */
export function getCardImageUrl(url: string | null | undefined): string {
  return getDetailImageUrl(url);
}

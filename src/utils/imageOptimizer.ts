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
      parsed.searchParams.set('resize', 'cover');
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
 * Generate a thumbnail URL for profile images
 */
export function getThumbnailUrl(url: string | null | undefined): string {
  return optimizeImageUrl(url, {
    width: 200,
    height: 200,
    quality: 70,
  });
}

/**
 * Generate a medium-sized image URL for cards/previews
 */
export function getMediumImageUrl(url: string | null | undefined): string {
  return optimizeImageUrl(url, {
    width: 400,
    height: 500,
    quality: 80,
  });
}

/**
 * Generate a full-size optimized image URL
 */
export function getFullImageUrl(url: string | null | undefined): string {
  return optimizeImageUrl(url, {
    width: 800,
    quality: 85,
  });
}

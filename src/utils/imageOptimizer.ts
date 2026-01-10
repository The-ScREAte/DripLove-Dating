/**
 * Image optimization utilities for Supabase Storage URLs
 * Uses Supabase's built-in image transformation capabilities
 */

interface OptimizeOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'origin';
}

/**
 * Optimize a Supabase Storage image URL using image transformations
 * 
 * @param url - The original Supabase Storage URL
 * @param options - Optimization options (width, height, quality, format)
 * @returns Optimized URL with transformation parameters
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
    format = 'webp'
  } = options;
  
  try {
    // Convert /object/public/ to /render/image/public/
    const transformedUrl = url.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/'
    );
    
    // Build query parameters
    const params = new URLSearchParams();
    params.set('width', String(width));
    if (height) params.set('height', String(height));
    params.set('quality', String(quality));
    if (format !== 'origin') params.set('format', format);
    
    // Add resize mode for consistent sizing
    params.set('resize', 'cover');
    
    return `${transformedUrl}?${params.toString()}`;
  } catch (error) {
    console.error('[imageOptimizer] Failed to optimize URL:', error);
    return url;
  }
}

/**
 * Generate a thumbnail URL for profile images
 */
export function getThumbnailUrl(url: string | null | undefined): string {
  return optimizeImageUrl(url, {
    width: 200,
    height: 200,
    quality: 70,
    format: 'webp'
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
    format: 'webp'
  });
}

/**
 * Generate a full-size optimized image URL
 */
export function getFullImageUrl(url: string | null | undefined): string {
  return optimizeImageUrl(url, {
    width: 800,
    quality: 85,
    format: 'webp'
  });
}

/**
 * Native Face Comparison Utility
 * Works with base64-encoded descriptors from iOS Vision & Android ML Kit
 */

export type FaceDescriptor = string; // Base64-encoded descriptor
export type FaceCaptureAngle = 'front' | 'left' | 'right';
export type MultiAngleFaceDescriptors = Record<FaceCaptureAngle, FaceDescriptor>;

/**
 * Convert base64 descriptor to Float32Array for comparison
 */
function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return new Float32Array(bytes.buffer);
}

/**
 * Calculate Euclidean distance between two descriptors
 * Lower distance = more similar faces
 */
export function compareFaceDescriptors(
  descriptor1: FaceDescriptor,
  descriptor2: FaceDescriptor
): number {
  const arr1 = base64ToFloat32Array(descriptor1);
  const arr2 = base64ToFloat32Array(descriptor2);
  
  if (arr1.length !== arr2.length) {
    throw new Error('Descriptors must be same length');
  }
  
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    const diff = arr1[i] - arr2[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

/**
 * Normalize distance to 0-1 range for easier threshold comparison
 */
function normalizeDistance(distance: number): number {
  // Typical face descriptor distances range from 0 to ~100+
  // Normalize to 0-1 range where 0 = identical, 1 = completely different
  return Math.min(distance / 100, 1.0);
}

/**
 * Check if two faces match based on threshold
 * @param descriptor1 - First face descriptor (base64)
 * @param descriptor2 - Second face descriptor (base64)
 * @param threshold - Maximum normalized distance for a match (default: 0.6)
 * @returns True if faces match
 */
export function areFacesMatching(
  descriptor1: FaceDescriptor,
  descriptor2: FaceDescriptor,
  threshold: number = 0.6
): boolean {
  try {
    const distance = compareFaceDescriptors(descriptor1, descriptor2);
    const normalizedDistance = normalizeDistance(distance);
    
    console.log(`Face comparison - Raw distance: ${distance.toFixed(2)}, Normalized: ${normalizedDistance.toFixed(3)}, Match: ${normalizedDistance < threshold}`);
    
    return normalizedDistance < threshold;
  } catch (error) {
    console.error('Error comparing faces:', error);
    return false;
  }
}

/**
 * Validate uploaded photos against scanned face
 * At least one photo must match the scanned face
 * @param scannedDescriptor - Face descriptor from live scan (base64)
 * @param photoDescriptors - Array of descriptors from uploaded photos (base64)
 * @param threshold - Maximum distance for a match (default: 0.6)
 * @returns Validation result with detailed feedback
 */
export async function validatePhotosAgainstScan(
  scannedDescriptor: FaceDescriptor,
  photoDescriptors: FaceDescriptor[],
  threshold: number = 0.6
): Promise<{
  isValid: boolean;
  matchedPhotos: number;
  totalPhotos: number;
  results: Array<{ index: number; isMatch: boolean; distance: number | null }>;
  message: string;
}> {
  if (!photoDescriptors || photoDescriptors.length === 0) {
    return {
      isValid: false,
      matchedPhotos: 0,
      totalPhotos: 0,
      results: [],
      message: 'No photos provided'
    };
  }

  const results: Array<{ index: number; isMatch: boolean; distance: number | null }> = [];
  let matchedPhotos = 0;

  // Compare each photo descriptor with scanned descriptor
  for (let i = 0; i < photoDescriptors.length; i++) {
    try {
      const rawDistance = compareFaceDescriptors(scannedDescriptor, photoDescriptors[i]);
      const distance = normalizeDistance(rawDistance);
      const isMatch = distance < threshold;

      results.push({ index: i, isMatch, distance });

      if (isMatch) {
        matchedPhotos++;
      }
    } catch (error) {
      console.error(`Error comparing photo ${i}:`, error);
      results.push({ index: i, isMatch: false, distance: null });
    }
  }

  const isValid = matchedPhotos > 0;

  let message = '';
  if (isValid) {
    message = `✅ ${matchedPhotos} of ${photoDescriptors.length} photos matched your verified face`;
  } else {
    message = '❌ None of your photos match your verified face. Please upload photos of yourself.';
  }

  return {
    isValid,
    matchedPhotos,
    totalPhotos: photoDescriptors.length,
    results,
    message
  };
}

/**
 * Extract face descriptor from image file using native plugin
 * This would require extracting descriptor from uploaded photos
 * For now, this is a placeholder - you'll need to implement photo analysis
 */
export async function extractFaceDescriptor(
  imageFile: File | string
): Promise<FaceDescriptor | null> {
  // TODO: Implement this by either:
  // 1. Sending image to native plugin for analysis
  // 2. Using a lightweight JS model for static images
  // 3. Requiring users to capture all photos with native camera
  
  console.warn('extractFaceDescriptor not yet implemented for native descriptors');
  console.log('Image:', typeof imageFile === 'string' ? 'base64' : imageFile.name);
  
  // For now, return null - this will need to be implemented based on your needs
  return null;
}

/**
 * Generate a unique hash from descriptor for duplicate detection
 */
export function descriptorToHash(descriptor: FaceDescriptor): string {
  // The descriptor is already base64-encoded
  // We can use a portion of it as a hash
  return descriptor.substring(0, 32);
}

export function descriptorMapToHashes(
  descriptors: MultiAngleFaceDescriptors
): Record<FaceCaptureAngle, string> {
  return {
    front: descriptorToHash(descriptors.front),
    left: descriptorToHash(descriptors.left),
    right: descriptorToHash(descriptors.right),
  };
}

/**
 * Check similarity percentage between two faces
 * Returns a percentage (0-100) where 100 = identical
 */
export function getFaceSimilarityPercentage(
  descriptor1: FaceDescriptor,
  descriptor2: FaceDescriptor
): number {
  try {
    const distance = compareFaceDescriptors(descriptor1, descriptor2);
    const normalizedDistance = normalizeDistance(distance);
    
    // Convert distance to similarity percentage
    // 0 distance = 100% similar
    // 1 distance = 0% similar
    const similarity = (1 - normalizedDistance) * 100;
    
    return Math.max(0, Math.min(100, similarity));
  } catch (error) {
    console.error('Error calculating similarity:', error);
    return 0;
  }
}

/**
 * Face Comparison Utility
 * Compare scanned face descriptor with uploaded photos to verify authenticity
 */

import * as faceapi from '@vladmandic/face-api';
import { loadFaceModels } from './faceModels';

/**
 * Face descriptor type (128-dimensional vector)
 */
export type FaceDescriptor = Float32Array;

/**
 * Extract face descriptor from an image file
 * @param imageFile - File object or base64 data URL
 * @returns Face descriptor or null if no face detected
 */
export async function extractFaceDescriptor(
  imageFile: File | string
): Promise<FaceDescriptor | null> {
  try {
    // Ensure models are loaded
    await loadFaceModels();

    let img: HTMLImageElement;

    if (typeof imageFile === 'string') {
      // Handle base64 data URL
      img = await faceapi.fetchImage(imageFile);
    } else {
      // Handle File object
      const imageUrl = URL.createObjectURL(imageFile);
      img = await faceapi.fetchImage(imageUrl);
      URL.revokeObjectURL(imageUrl);
    }

    // Detect face with landmarks and descriptor
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      console.warn('No face detected in image');
      return null;
    }

    return detection.descriptor;
  } catch (error) {
    console.error('Error extracting face descriptor:', error);
    return null;
  }
}

/**
 * Compare two face descriptors and return similarity score
 * @param descriptor1 - First face descriptor
 * @param descriptor2 - Second face descriptor
 * @returns Distance value (0.0 - 1.0, lower = more similar)
 */
export function compareFaceDescriptors(
  descriptor1: FaceDescriptor,
  descriptor2: FaceDescriptor
): number {
  return faceapi.euclideanDistance(descriptor1, descriptor2);
}

/**
 * Check if two faces match based on threshold
 * @param scannedDescriptor - Face descriptor from live scan
 * @param imageFile - Uploaded photo to compare
 * @param threshold - Maximum distance for a match (default: 0.6)
 * @returns Object with match result and distance
 */
export async function compareFaces(
  scannedDescriptor: FaceDescriptor,
  imageFile: File | string,
  threshold: number = 0.6
): Promise<{ isMatch: boolean; distance: number | null; faceDetected: boolean }> {
  try {
    const imageDescriptor = await extractFaceDescriptor(imageFile);

    if (!imageDescriptor) {
      return { isMatch: false, distance: null, faceDetected: false };
    }

    const distance = compareFaceDescriptors(scannedDescriptor, imageDescriptor);
    const isMatch = distance < threshold;

    console.log(`Face comparison - Distance: ${distance.toFixed(3)}, Match: ${isMatch}`);

    return { isMatch, distance, faceDetected: true };
  } catch (error) {
    console.error('Error comparing faces:', error);
    return { isMatch: false, distance: null, faceDetected: false };
  }
}

/**
 * Validate uploaded photos against scanned face
 * At least one photo must match the scanned face
 * @param scannedDescriptor - Face descriptor from live scan
 * @param photoFiles - Array of uploaded photos
 * @param threshold - Maximum distance for a match (default: 0.6)
 * @returns Validation result with detailed feedback
 */
export async function validatePhotosAgainstScan(
  scannedDescriptor: FaceDescriptor,
  photoFiles: (File | string)[],
  threshold: number = 0.6
): Promise<{
  isValid: boolean;
  matchedPhotos: number;
  totalPhotos: number;
  results: Array<{ index: number; isMatch: boolean; distance: number | null; faceDetected: boolean }>;
  message: string;
}> {
  if (!photoFiles || photoFiles.length === 0) {
    return {
      isValid: false,
      matchedPhotos: 0,
      totalPhotos: 0,
      results: [],
      message: 'No photos provided'
    };
  }

  const results: Array<{ index: number; isMatch: boolean; distance: number | null; faceDetected: boolean }> = [];
  let matchedPhotos = 0;

  // Compare each photo
  for (let i = 0; i < photoFiles.length; i++) {
    const result = await compareFaces(scannedDescriptor, photoFiles[i], threshold);
    results.push({ index: i, ...result });

    if (result.isMatch) {
      matchedPhotos++;
    }
  }

  const isValid = matchedPhotos > 0;
  const photosWithNoFace = results.filter(r => !r.faceDetected).length;

  let message = '';
  if (isValid) {
    message = `✅ ${matchedPhotos} of ${photoFiles.length} photos matched your verified face`;
  } else if (photosWithNoFace === photoFiles.length) {
    message = '❌ No faces detected in uploaded photos. Please upload clear photos of your face.';
  } else {
    message = '❌ None of your photos match your verified face. Please upload photos of yourself.';
  }

  return {
    isValid,
    matchedPhotos,
    totalPhotos: photoFiles.length,
    results,
    message
  };
}

/**
 * Convert face descriptor to a storable hash (for duplicate account detection)
 * @param descriptor - Face descriptor
 * @returns Base64 encoded string of the descriptor
 */
export function descriptorToHash(descriptor: FaceDescriptor): string {
  return Buffer.from(descriptor).toString('base64');
}

/**
 * Convert hash back to face descriptor
 * @param hash - Base64 encoded descriptor
 * @returns Face descriptor
 */
export function hashToDescriptor(hash: string): FaceDescriptor {
  const buffer = Buffer.from(hash, 'base64');
  return new Float32Array(buffer.buffer);
}

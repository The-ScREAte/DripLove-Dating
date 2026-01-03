import { supabase } from '@/integrations/supabase/client';

export interface FaceComparisonResult {
  matchFound: boolean;
  similarity?: number;
  requiresReview: boolean;
  error?: string;
}

/**
 * Convert file to base64 string for AWS Rekognition
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix if present
      const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
      resolve(cleanBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compare an uploaded image with the user's verified face in AWS Rekognition
 * 
 * @param uploadedImage - The image file being uploaded
 * @param faceImageData - The stored face image data (base64) from face verification
 * @returns FaceComparisonResult indicating if faces match
 */
export async function compareFaceWithVerified(
  uploadedImage: File,
  faceImageData: string
): Promise<FaceComparisonResult> {
  try {
    // Convert uploaded image to base64
    const uploadedBase64 = await fileToBase64(uploadedImage);
    
    // Call the face-verify function with compare_faces action
    const { data, error } = await supabase.functions.invoke('face-verify', {
      body: {
        action: 'compare_faces',
        sourceImage: faceImageData, // The verified face
        targetImages: [uploadedBase64] // The uploaded image to check
      }
    });

    if (error) {
      console.error('Face comparison error:', error);
      return {
        matchFound: false,
        requiresReview: true,
        error: 'Face comparison service unavailable'
      };
    }

    if (!data?.success) {
      console.warn('Face comparison returned unsuccessful:', data);
      return {
        matchFound: false,
        requiresReview: true,
        error: data?.error || 'Face comparison failed'
      };
    }

    const matchResult = {
      matchFound: data.matchFound === true,
      similarity: data.similarity,
      requiresReview: !data.matchFound // Require review if no match
    };
    
    console.log('Face comparison result:', matchResult);
    return matchResult;
  } catch (err) {
    console.error('Face comparison error:', err);
    return {
      matchFound: false,
      requiresReview: true,
      error: 'Failed to compare faces'
    };
  }
}

/**
 * Detect if an image contains a human face
 * Uses AWS Rekognition's DetectFaces API
 * 
 * @param imageFile - The image file to check
 * @returns true if a human face is detected
 */
export async function detectHumanFace(imageFile: File): Promise<{
  hasFace: boolean;
  confidence?: number;
  error?: string;
}> {
  try {
    const imageBase64 = await fileToBase64(imageFile);
    
    const { data, error } = await supabase.functions.invoke('face-verify', {
      body: {
        action: 'detect_face',
        image: imageBase64
      }
    });

    if (error) {
      console.error('Face detection error:', error);
      return { hasFace: false, error: 'Face detection service unavailable' };
    }

    return {
      hasFace: data?.hasFace === true,
      confidence: data?.confidence
    };
  } catch (err) {
    console.error('Face detection error:', err);
    return { hasFace: false, error: 'Failed to detect face' };
  }
}

/**
 * Check if an image position requires face verification
 * First 2 images (positions 0 and 1) always require face verification
 * 
 * @param imagePosition - The 0-indexed position of the image
 * @param totalImages - Current total number of images
 * @returns true if face verification is required for this position
 */
export function requiresFaceVerification(imagePosition: number, totalImages: number): boolean {
  // First 2 positions (0 and 1) always require face verification
  return imagePosition < 2;
}

/**
 * Verify an uploaded image for face matching
 * 
 * @param file - The uploaded image file
 * @param faceImageData - The verified face data (base64)
 * @param imagePosition - The position of this image (0-indexed)
 * @param isVerified - Whether user has completed face verification
 * @returns Object with verification result and whether to proceed or send to review
 */
export async function verifyUploadedImage(
  file: File,
  faceImageData: string | null,
  imagePosition: number,
  isVerified: boolean
): Promise<{
  approved: boolean;
  requiresReview: boolean;
  reason?: string;
}> {
  // If this position doesn't require face verification, just check for human face
  if (!requiresFaceVerification(imagePosition, 0)) {
    // For positions 3-5, just ensure it's a human image or send to review
    const faceDetection = await detectHumanFace(file);
    if (!faceDetection.hasFace) {
      return {
        approved: false,
        requiresReview: true,
        reason: 'No human figure detected - requires admin review'
      };
    }
    return { approved: true, requiresReview: false };
  }

  // For first 2 positions, face verification is required
  if (!isVerified || !faceImageData) {
    // User hasn't done face verification - send to review
    return {
      approved: false,
      requiresReview: true,
      reason: 'Face verification not completed - requires admin review'
    };
  }

  // Compare with verified face
  const comparison = await compareFaceWithVerified(file, faceImageData);
  
  if (comparison.matchFound) {
    console.log(`Face verified for position ${imagePosition}, similarity: ${comparison.similarity}%`);
    return { approved: true, requiresReview: false };
  } else {
    console.warn(`Face verification failed for position ${imagePosition}:`, comparison.error);
    return {
      approved: false,
      requiresReview: true,
      reason: comparison.error || 'Uploaded image does not match verified face - requires admin review'
    };
  }
}

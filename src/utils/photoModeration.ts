/**
 * AI Photo Moderation Service for AfroVibe
 * Provides content moderation capabilities for user uploaded images
 */

import { supabase } from '@/integrations/supabase/client';

export interface ModerationResult {
  isApproved: boolean;
  confidence: number;
  flags: string[];
  details: {
    adultContent?: number;
    explicitContent?: number;
    suggestiveContent?: number;
    faceDetected?: boolean;
    imageQuality?: 'good' | 'poor' | 'blurry';
    requiresReview?: boolean;
  };
  message?: string;
}

export interface ModerationFlags {
  EXPLICIT_CONTENT: string;
  ADULT_CONTENT: string;
  VIOLENCE: string;
  INAPPROPRIATE: string;
  NO_FACE_DETECTED: string;
  POOR_QUALITY: string;
  MULTIPLE_FACES: string;
  INVALID_IMAGE: string;
}

const MODERATION_FLAGS: ModerationFlags = {
  EXPLICIT_CONTENT: 'Explicit content detected',
  ADULT_CONTENT: 'Adult content detected',
  VIOLENCE: 'Violent content detected',
  INAPPROPRIATE: 'Inappropriate content detected',
  NO_FACE_DETECTED: 'No face detected in image',
  POOR_QUALITY: 'Image quality is too poor',
  MULTIPLE_FACES: 'Multiple faces detected',
  INVALID_IMAGE: 'Invalid or corrupted image'
};

/**
 * Photo moderation service with improved content detection
 */
class PhotoModerationService {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Main moderation function - analyzes uploaded image
   */
  async moderateImage(file: File): Promise<ModerationResult> {
    try {
      console.log('🔍 Starting image moderation for:', file.name);
      
      const imageData = await this.loadImage(file);
      const analyses = await Promise.all([
        this.analyzeImageContent(imageData),
        this.detectFaces(imageData),
        this.checkImageQuality(imageData),
        this.validateImageProperties(file)
      ]);

      const result = this.combineResults(analyses);
      console.log('✅ Moderation complete:', result);
      
      return result;
    } catch (error) {
      console.error('❌ Moderation error:', error);
      return {
        isApproved: false,
        confidence: 0,
        flags: [MODERATION_FLAGS.INVALID_IMAGE],
        details: { requiresReview: true },
        message: 'Failed to analyze image. Please try again with a different image.'
      };
    }
  }

  /**
   * Load image file and create ImageData for analysis
   */
  private loadImage(file: File): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Optimize canvas performance
        this.canvas.width = Math.min(img.width, 800);
        this.canvas.height = Math.min(img.height, 800);
        
        const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        resolve(imageData);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Analyze image content for inappropriate material
   */
  private async analyzeImageContent(imageData: ImageData): Promise<Partial<ModerationResult>> {
    const data = imageData.data;
    const pixels = data.length / 4;
    
    let skinTonePixels = 0;
    let redDominantPixels = 0;
    let highSaturationPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Enhanced skin tone detection
      if (this.isSkinTone(r, g, b)) {
        skinTonePixels++;
      }
      
      // Detect dominant red areas
      if (r > g + 30 && r > b + 30 && r > 120) {
        redDominantPixels++;
      }
      
      // High saturation detection
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (saturation > 0.6 && max > 100) {
        highSaturationPixels++;
      }
    }

    const skinToneRatio = skinTonePixels / pixels;
    const redDominantRatio = redDominantPixels / pixels;
    
    console.log('📊 Content analysis:', {
      skinToneRatio: (skinToneRatio * 100).toFixed(1) + '%',
      redDominantRatio: (redDominantRatio * 100).toFixed(1) + '%',
      pixels
    });
    
    const flags: string[] = [];
    let adultContent = 0;
    let explicitContent = 0;
    let suggestiveContent = 0;

    // STRICT DATING APP MODERATION - NO AUTO-BYPASS
    // All images must pass through proper content analysis
    console.log('📊 Applying strict moderation thresholds for dating app');

    // Much stricter thresholds - 15% skin tone threshold as requested
    if (skinToneRatio > 0.50) { // 50%+ skin tone - explicit content
      explicitContent = 95;
      flags.push(MODERATION_FLAGS.EXPLICIT_CONTENT);
      console.log('🚨 Explicit content detected - 50%+ skin tone');
    }
    else if (skinToneRatio > 0.30) { // 30%+ skin tone - adult content (shirtless, bikini, etc.)
      adultContent = 85;
      flags.push(MODERATION_FLAGS.ADULT_CONTENT);
      console.log('🚨 Adult content detected - 30%+ skin tone (likely shirtless/bikini)');
    }
    else if (skinToneRatio > 0.15) { // 15%+ skin tone - suggestive, requires review
      suggestiveContent = 80;
      flags.push(MODERATION_FLAGS.INAPPROPRIATE);
      console.log('⚠️ Suggestive content detected - 15%+ skin tone, requires admin review');
    }
    else {
      // Only images with very minimal skin exposure (face/hands only) auto-approve
      console.log('✅ Minimal skin exposure detected - likely appropriate profile photo');
    }

    // Additional check for extremely red-dominant images (very rare)
    if (redDominantRatio > 0.8) { // 80% red dominant
      flags.push(MODERATION_FLAGS.INAPPROPRIATE);
      adultContent = Math.max(adultContent, 75);
      console.log('🚨 Inappropriate content detected - 80%+ red dominant');
    }

    return {
      flags,
      details: {
        adultContent,
        explicitContent,
        suggestiveContent
      }
    };
  }

  /**
   * Detect faces in the image
   */
  private async detectFaces(imageData: ImageData): Promise<Partial<ModerationResult>> {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Convert to grayscale for edge detection
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      gray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // Edge detection for face patterns
    let edgeCount = 0;
    const threshold = 30;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Sobel edge detection
        const sobelX = 
          -1 * gray[idx - width - 1] + 1 * gray[idx - width + 1] +
          -2 * gray[idx - 1] + 2 * gray[idx + 1] +
          -1 * gray[idx + width - 1] + 1 * gray[idx + width + 1];
        
        const sobelY = 
          -1 * gray[idx - width - 1] + -2 * gray[idx - width] + -1 * gray[idx - width + 1] +
          1 * gray[idx + width - 1] + 2 * gray[idx + width] + 1 * gray[idx + width + 1];
        
        const gradient = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
        
        if (gradient > threshold) {
          edgeCount++;
        }
      }
    }

    const edgeRatio = edgeCount / (width * height);
    const faceDetected = edgeRatio > 0.08 && edgeRatio < 0.6;
    
    const flags: string[] = [];
    if (!faceDetected) {
      flags.push(MODERATION_FLAGS.NO_FACE_DETECTED);
    }

    return {
      flags,
      details: {
        faceDetected
      }
    };
  }

  /**
   * Check image quality metrics
   */
  private async checkImageQuality(imageData: ImageData): Promise<Partial<ModerationResult>> {
    const data = imageData.data;
    const pixels = data.length / 4;
    
    // Calculate image sharpness using variance
    let variance = 0;
    let mean = 0;
    
    // Calculate mean brightness
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      mean += brightness;
    }
    mean /= pixels;
    
    // Calculate variance
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      variance += Math.pow(brightness - mean, 2);
    }
    variance /= pixels;
    
    const flags: string[] = [];
    let imageQuality: 'good' | 'poor' | 'blurry' = 'good';
    
    // Low variance indicates blurry image
    if (variance < 500) {
      imageQuality = 'blurry';
      flags.push(MODERATION_FLAGS.POOR_QUALITY);
    } else if (variance < 1000) {
      imageQuality = 'poor';
    }

    return {
      flags,
      details: {
        imageQuality
      }
    };
  }

  /**
   * Validate basic image properties
   */
  private async validateImageProperties(file: File): Promise<Partial<ModerationResult>> {
    const flags: string[] = [];
    
    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      flags.push(MODERATION_FLAGS.INVALID_IMAGE);
    }
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      flags.push(MODERATION_FLAGS.INVALID_IMAGE);
    }

    return { flags };
  }

  /**
   * Combine all analysis results into final moderation decision
   */
  private combineResults(analyses: Partial<ModerationResult>[]): ModerationResult {
    const allFlags = analyses.flatMap(a => a.flags || []);
    const combinedDetails = analyses.reduce((acc, curr) => ({
      ...acc,
      ...curr.details
    }), {} as ModerationResult['details']);

    console.log('📊 Moderation analysis:', {
      flags: allFlags,
      details: combinedDetails
    });

    const hasBlockingFlags = allFlags.some(flag =>
      flag === MODERATION_FLAGS.INVALID_IMAGE
    );

    const hasContentFlags = allFlags.some(flag =>
      flag === MODERATION_FLAGS.EXPLICIT_CONTENT ||
      flag === MODERATION_FLAGS.ADULT_CONTENT ||
      flag === MODERATION_FLAGS.INAPPROPRIATE
    );

    let isApproved = true;
    let confidence = 85;
    let message = '';
    let requiresReview = false;

    // Block completely invalid files
    if (hasBlockingFlags) {
      isApproved = false;
      confidence = 95;
      message = 'Image file is corrupted or invalid and cannot be uploaded.';
      console.log('❌ Image blocked: Invalid file');
    }
    // Send inappropriate content to admin review
    else if (hasContentFlags) {
      isApproved = true; // Allow upload but require review
      requiresReview = true;
      confidence = 20;
      message = 'Image uploaded but requires admin approval due to potentially inappropriate content.';
      console.log('🔍 Image flagged for admin review due to content flags');
    }
    // Send high-risk content scores to admin review with stricter thresholds
    else if (
      (combinedDetails.adultContent && combinedDetails.adultContent >= 50) ||
      (combinedDetails.explicitContent && combinedDetails.explicitContent >= 50) ||
      (combinedDetails.suggestiveContent && combinedDetails.suggestiveContent >= 50) // Much stricter threshold
    ) {
      isApproved = true; // Allow upload but require review
      requiresReview = true;
      confidence = 20;
      message = 'Image uploaded but requires admin approval before being visible to others due to potential inappropriate content.';
      console.log('🔍 Image requires review due to content scores:', {
        adultContent: combinedDetails.adultContent,
        explicitContent: combinedDetails.explicitContent,
        suggestiveContent: combinedDetails.suggestiveContent
      });
    }
    else {
      message = 'Image approved and uploaded successfully.';
      confidence = 95;
      console.log('✅ Image approved automatically');
      if (allFlags.includes(MODERATION_FLAGS.NO_FACE_DETECTED)) {
        message += ' Tip: Profile photos work best when they clearly show your face.';
      }
    }

    return {
      isApproved,
      confidence,
      flags: allFlags,
      details: { ...combinedDetails, requiresReview },
      message
    };
  }

  /**
   * Enhanced skin tone detection with improved accuracy for dating app content
   */
  private isSkinTone(r: number, g: number, b: number): boolean {
    // Enhanced skin tone detection for better moderation
    // Catches more skin tones including different ethnicities and lighting conditions
    
    // Skip very dark or very bright pixels (shadows, highlights, non-skin)
    if (r < 70 || g < 50 || b < 40 || r > 245 || g > 220 || b > 190) return false;
    
    // Enhanced skin tone criteria - more comprehensive detection
    const isBasicSkin = (
      r > 90 && g > 45 && b > 35 && // Broader minimum thresholds
      r > g + 10 && r > b + 15 && // Red dominance (key for skin)
      g > b && // Green higher than blue
      r - b > 8 && r - b < 120 && // Red-blue difference range
      Math.abs(r - g) < 70 // Red-green variation tolerance
    );
    
    // Additional check for darker skin tones
    const isDarkerSkin = (
      r > 80 && g > 60 && b > 45 &&
      r > g + 5 && r > b + 10 &&
      r - b > 5 && r - b < 60 &&
      Math.abs(r - g) < 40
    );
    
    // Additional check for lighter/tanned skin
    const isLighterSkin = (
      r > 120 && g > 80 && b > 60 &&
      r > g + 20 && r > b + 30 &&
      r - b > 15 && r - b < 90 &&
      Math.abs(r - g) < 50
    );
    
    return isBasicSkin || isDarkerSkin || isLighterSkin;
  }
}

// Create singleton instance
export const photoModerationService = new PhotoModerationService();

/**
 * Main export function for image moderation
 */
export async function moderateImage(file: File): Promise<ModerationResult> {
  return photoModerationService.moderateImage(file);
}

/**
 * Check if an image passes content guidelines
 */
export function isImageAppropriate(moderationResult: ModerationResult): boolean {
  return moderationResult.isApproved && !moderationResult.details.requiresReview;
}

/**
 * Get human-readable moderation message
 */
export function getModerationMessage(moderationResult: ModerationResult): string {
  return moderationResult.message || 'Image processed';
}

/**
 * Save moderation result to database
 */
export async function saveModerationResult(
  imageId: string, 
  moderationResult: ModerationResult
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_images')
      .update({
        is_approved: moderationResult.details.requiresReview ? false : moderationResult.isApproved,
        moderation_status: moderationResult.details.requiresReview ? 'pending' : 'approved',
        flagged_content: moderationResult.flags,
        confidence_score: moderationResult.confidence
      })
      .eq('id', imageId);

    if (error) {
      console.error('❌ Error saving moderation result:', error);
      return false;
    }

    console.log('✅ Moderation result saved for image:', imageId);
    return true;

  } catch (error) {
    console.error('❌ Error saving moderation result:', error);
    return false;
  }
}

interface PendingImage {
  id: string;
  image_url: string;
  is_approved: boolean;
  moderation_status: string;
  moderation_notes?: string;
  flagged_content?: string[];
  confidence_score?: number;
  created_at: string;
  profiles: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

/**
 * Get pending images for admin review
 */
export async function getPendingImages(): Promise<PendingImage[]> {
  try {
    const { data, error } = await supabase
      .from('user_images')
      .select(`
        id,
        image_url,
        is_approved,
        moderation_status,
        moderation_notes,
        flagged_content,
        confidence_score,
        created_at,
        profiles!user_id (
          first_name,
          last_name,
          email
        )
      `)
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching pending images:', error);
      return [];
    }

    return data || [];

  } catch (error) {
    console.error('❌ Error fetching pending images:', error);
    return [];
  }
}

/**
 * Approve an image (admin only)
 */
export async function approveImage(imageId: string, notes?: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('approve_image', {
      image_id: imageId,
      admin_notes: notes
    });

    if (error) {
      console.error('❌ Error approving image:', error);
      return false;
    }

    console.log('✅ Image approved:', imageId);
    return true;

  } catch (error) {
    console.error('❌ Error approving image:', error);
    return false;
  }
}

/**
 * Reject an image (admin only)
 */
export async function rejectImage(imageId: string, notes?: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('reject_image', {
      image_id: imageId,
      admin_notes: notes
    });

    if (error) {
      console.error('❌ Error rejecting image:', error);
      return false;
    }

    console.log('✅ Image rejected:', imageId);
    return true;

  } catch (error) {
    console.error('❌ Error rejecting image:', error);
    return false;
  }
}

/**
 * Export flags for external use
 */
export { MODERATION_FLAGS };
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
      pixels,
      skinTonePixels,
      threshold: 'AGGRESSIVE MODE - Lower thresholds for nude detection'
    });
    
    const flags: string[] = [];
    let adultContent = 0;
    let explicitContent = 0;
    let suggestiveContent = 0;

    // AGGRESSIVE MODERATION - Much stricter for nude content detection
    console.log('� Applying AGGRESSIVE moderation thresholds to catch nude content');

    // Balanced thresholds for dating app moderation
    if (skinToneRatio > 0.65) { // 65%+ skin tone - very likely nude/explicit
      explicitContent = 95;
      flags.push(MODERATION_FLAGS.EXPLICIT_CONTENT);
      console.log('🚨 FLAGGED: Very high skin exposure - 65%+ skin tone (nude/explicit content)');
    }
    else if (skinToneRatio > 0.50) { // 50-65% skin tone - shirtless/bikini content
      adultContent = 85;
      flags.push(MODERATION_FLAGS.ADULT_CONTENT);
      console.log('🚨 FLAGGED: High skin exposure - 50-65% skin tone (shirtless/bikini, requires review)');
    }
    else if (skinToneRatio > 0.35) { // 35-50% skin tone - tank tops, summer clothing
      suggestiveContent = 45; // Lower score to allow auto-approval
      console.log('✅ PASSED: Moderate skin exposure - 35-50% skin tone (summer clothing, auto-approved)');
    }
    else if (skinToneRatio > 0.15) { // 15-35% skin tone - casual clothing
      suggestiveContent = 25; // Low score to allow auto-approval
      console.log('✅ PASSED: Light skin exposure - 15-35% skin tone (casual clothing, auto-approved)');
    }
    else {
      // 0-15% skin tone - normal face/portrait photos
      console.log('✅ PASSED: Minimal skin exposure - 0-15% skin tone (normal portrait, auto-approved)');
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
    // Send high-risk content scores to admin review  
    else if (
      (combinedDetails.adultContent && combinedDetails.adultContent >= 75) ||  // Raised from 60 to 75
      (combinedDetails.explicitContent && combinedDetails.explicitContent >= 80) || // Raised from 70 to 80
      (combinedDetails.suggestiveContent && combinedDetails.suggestiveContent >= 70)  // Raised from 50 to 70
    ) {
      isApproved = true; // Allow upload but require review
      requiresReview = true;
      confidence = 30;
      message = 'Image uploaded but requires admin approval before being visible to others.';
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
   * AGGRESSIVE skin tone detection - catches all possible skin tones
   */
  private isSkinTone(r: number, g: number, b: number): boolean {
    // MUCH MORE AGGRESSIVE skin detection - we want to catch ALL skin
    // Better to over-detect than under-detect for nude content
    
    // Skip only extreme non-skin values (pure black, pure white, pure colors)
    if (r < 30 || g < 20 || b < 15 || (r > 250 && g > 250 && b > 250)) return false;
    
    // Method 1: Enhanced YCbCr with WIDER ranges
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
    
    // MUCH WIDER skin tone ranges - catches more skin variations
    const isSkinYCbCr = (
      y >= 60 && y <= 255 &&          // Wider luminance range
      cb >= 75 && cb <= 150 &&        // Wider blue chroma range  
      cr >= 120 && cr <= 200          // Wider red chroma range
    );
    
    // Method 2: Aggressive RGB detection - multiple algorithms
    const isBasicSkin = (
      r > 60 && g > 30 && b > 15 &&          // Lower thresholds
      r > g && r > b &&                      // Basic red dominance
      (r - g) > 10 && (r - b) > 15          // Minimum differences
    );
    
    // Method 3: Ratio-based detection (very aggressive)
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const isRatioSkin = (
      maxVal > 50 && minVal > 15 &&          // Not too dark/bright
      r > 0.35 * (r + g + b) &&             // Red component significant
      (maxVal - minVal) > 10                 // Some color variation
    );
    
    // Method 4: HSV-based detection
    const hsvMax = Math.max(r, g, b);
    const hsvMin = Math.min(r, g, b);
    const hsvDelta = hsvMax - hsvMin;
    
    let hue = 0;
    if (hsvDelta !== 0) {
      if (hsvMax === r) hue = ((g - b) / hsvDelta) % 6;
      else if (hsvMax === g) hue = (b - r) / hsvDelta + 2;
      else hue = (r - g) / hsvDelta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    
    const saturation = hsvMax === 0 ? 0 : hsvDelta / hsvMax;
    const value = hsvMax / 255;
    
    // Skin typically has hue 0-40 degrees and low-medium saturation
    const isHSVSkin = (
      value > 0.2 &&                        // Not too dark
      ((hue >= 0 && hue <= 50) || (hue >= 340 && hue <= 360)) && // Skin hue range
      saturation >= 0.1 && saturation <= 0.8 // Reasonable saturation
    );
    
    // Return true if ANY method detects skin (aggressive approach)
    return isSkinYCbCr || isBasicSkin || isRatioSkin || isHSVSkin;
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
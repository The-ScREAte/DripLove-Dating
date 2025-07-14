/**
 * AI Photo Moderation Service for AfroVibe
 * Provides content moderation capabilities for user uploaded images
 */

export interface ModerationResult {
  isApproved: boolean;
  confidence: number;
  flags: string[];
  details: {
    adultContent?: number;
    violenceContent?: number;
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
 * Basic content detection using client-side image analysis
 * This is a lightweight implementation that can be enhanced with cloud APIs
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
      const imageData = await this.loadImage(file);
      const analyses = await Promise.all([
        this.analyzeImageContent(imageData),
        this.detectFaces(imageData),
        this.checkImageQuality(imageData),
        this.validateImageProperties(file)
      ]);

      return this.combineResults(analyses);
    } catch (error) {
      console.error('Moderation error:', error);
      return {
        isApproved: false,
        confidence: 0,
        flags: [MODERATION_FLAGS.INVALID_IMAGE],
        details: {},
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
        
        // Set willReadFrequently for better performance
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
   * Analyze image content for inappropriate material - Enhanced Detection
   */
  private async analyzeImageContent(imageData: ImageData): Promise<Partial<ModerationResult>> {
    const data = imageData.data;
    const pixels = data.length / 4;
    
    // Enhanced analysis metrics
    let skinTonePixels = 0;
    let darkPixels = 0;
    let brightPixels = 0;
    let redDominantPixels = 0;
    let highSaturationPixels = 0;
    let fleshToneRegions = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Enhanced skin tone detection
      if (this.isSkinTone(r, g, b) || this.isFleshTone(r, g, b)) {
        skinTonePixels++;
        if (this.isFleshTone(r, g, b)) fleshToneRegions++;
      }
      
      // Detect dominant red areas (often problematic)
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
      
      // Brightness analysis
      const brightness = (r + g + b) / 3;
      if (brightness < 30) darkPixels++;
      if (brightness > 225) brightPixels++;
    }

    const skinToneRatio = skinTonePixels / pixels;
    const fleshToneRatio = fleshToneRegions / pixels;
    const redDominantRatio = redDominantPixels / pixels;
    const highSaturationRatio = highSaturationPixels / pixels;
    const darkRatio = darkPixels / pixels;
    
    const flags: string[] = [];
    let adultContent = 0;
    let explicitContent = 0;
    let suggestiveContent = 0;

    // More aggressive detection thresholds
    if (skinToneRatio > 0.35) { // Lowered from 0.6
      suggestiveContent = Math.min(skinToneRatio * 100, 95);
      
      if (skinToneRatio > 0.45) { // Lowered from 0.8
        adultContent = Math.min(skinToneRatio * 150, 95);
        flags.push(MODERATION_FLAGS.ADULT_CONTENT);
      }
      
      if (fleshToneRatio > 0.25 || skinToneRatio > 0.55) {
        explicitContent = Math.min((fleshToneRatio + skinToneRatio) * 100, 95);
        flags.push(MODERATION_FLAGS.EXPLICIT_CONTENT);
      }
    }

    // Additional inappropriate content indicators
    if (redDominantRatio > 0.3 && highSaturationRatio > 0.4) {
      flags.push(MODERATION_FLAGS.INAPPROPRIATE);
      adultContent = Math.max(adultContent, 70);
    }

    // Very dark images might be inappropriate or low quality
    if (darkRatio > 0.7) {
      flags.push(MODERATION_FLAGS.POOR_QUALITY);
    }

    // Combination detection - multiple indicators
    if (skinToneRatio > 0.3 && redDominantRatio > 0.2) {
      flags.push(MODERATION_FLAGS.ADULT_CONTENT);
      adultContent = Math.max(adultContent, 80);
    }

    return {
      flags,
      details: {
        adultContent,
        explicitContent,
        suggestiveContent: Math.max(suggestiveContent, skinToneRatio > 0.25 ? skinToneRatio * 80 : 0)
      }
    };
  }

  /**
   * Detect faces in the image using enhanced edge detection
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

    // Enhanced edge detection with multiple patterns
    let edgeCount = 0;
    let strongEdgeCount = 0;
    let facePatternCount = 0;
    const threshold = 30; // Lowered for more sensitivity
    const strongThreshold = 60;

    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
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
          if (gradient > strongThreshold) {
            strongEdgeCount++;
          }
        }
        
        // Look for face-like patterns (circular/oval shapes)
        if (this.detectFacePattern(gray, x, y, width, height)) {
          facePatternCount++;
        }
      }
    }

    const edgeRatio = edgeCount / (width * height);
    const strongEdgeRatio = strongEdgeCount / (width * height);
    const facePatternRatio = facePatternCount / (width * height);
    
    // Enhanced face detection logic
    const faceDetected = (edgeRatio > 0.08 && edgeRatio < 0.6) || facePatternRatio > 0.001;
    const multipleFaces = facePatternRatio > 0.005; // Might indicate group photos

    const flags: string[] = [];
    if (!faceDetected) {
      flags.push(MODERATION_FLAGS.NO_FACE_DETECTED);
    }
    
    if (multipleFaces) {
      flags.push(MODERATION_FLAGS.MULTIPLE_FACES);
    }

    return {
      flags,
      details: {
        faceDetected
      }
    };
  }

  /**
   * Detect face-like patterns in the image
   */
  private detectFacePattern(gray: Uint8Array, x: number, y: number, width: number, height: number): boolean {
    if (x < 10 || y < 10 || x >= width - 10 || y >= height - 10) return false;
    
    const center = gray[y * width + x];
    let circularPattern = 0;
    
    // Check for circular patterns that might indicate faces
    const radius = 8;
    for (let angle = 0; angle < 360; angle += 45) {
      const rad = (angle * Math.PI) / 180;
      const checkX = Math.round(x + radius * Math.cos(rad));
      const checkY = Math.round(y + radius * Math.sin(rad));
      
      if (checkX >= 0 && checkX < width && checkY >= 0 && checkY < height) {
        const pixelValue = gray[checkY * width + checkX];
        if (Math.abs(pixelValue - center) > 20) {
          circularPattern++;
        }
      }
    }
    
    return circularPattern >= 4; // At least half the points show variation
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
    
    // Check file size (already handled in upload, but double-check)
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
   * Combine all analysis results into final moderation decision - Enhanced Logic
   */
  private combineResults(analyses: Partial<ModerationResult>[]): ModerationResult {
    const allFlags = analyses.flatMap(a => a.flags || []);
    const combinedDetails = analyses.reduce((acc, curr) => ({
      ...acc,
      ...curr.details
    }), {} as ModerationResult['details']);

    // Enhanced decision logic with pending status for uncertain content
    const hasExplicitFlags = allFlags.some(flag => 
      flag === MODERATION_FLAGS.EXPLICIT_CONTENT
    );
    
    const hasAdultFlags = allFlags.some(flag => 
      flag === MODERATION_FLAGS.ADULT_CONTENT
    );
    
    const hasViolenceFlags = allFlags.some(flag => 
      flag === MODERATION_FLAGS.VIOLENCE
    );
    
    const hasInappropriateFlags = allFlags.some(flag =>
      flag === MODERATION_FLAGS.INAPPROPRIATE
    );

    const hasBlockingFlags = hasExplicitFlags || hasAdultFlags || hasViolenceFlags || allFlags.some(flag =>
      flag === MODERATION_FLAGS.INVALID_IMAGE
    );

    const hasWarningFlags = allFlags.some(flag =>
      flag === MODERATION_FLAGS.NO_FACE_DETECTED ||
      flag === MODERATION_FLAGS.POOR_QUALITY ||
      flag === MODERATION_FLAGS.MULTIPLE_FACES
    );

    let isApproved = true;
    let confidence = 85;
    let message = '';
    let requiresReview = false;

    // Log analysis for debugging
    console.log('🔍 Moderation Analysis:', {
      flags: allFlags,
      details: combinedDetails,
      adultContent: combinedDetails.adultContent,
      explicitContent: combinedDetails.explicitContent,
      suggestiveContent: combinedDetails.suggestiveContent,
      hasExplicitFlags,
      hasAdultFlags,
      hasViolenceFlags,
      hasInappropriateFlags
    });

    // Only reject completely invalid/corrupted images - all content issues go to pending review
    if (allFlags.includes(MODERATION_FLAGS.INVALID_IMAGE)) {
      isApproved = false;
      confidence = 95;
      message = 'Image file is corrupted or invalid and cannot be uploaded.';
      console.log('❌ Image rejected - invalid file');
    }
    // All content-related flags require admin review - two-step verification
    else if (
      hasExplicitFlags || 
      hasAdultFlags || 
      hasViolenceFlags ||
      (combinedDetails.adultContent && combinedDetails.adultContent > 5) || // Lowered from 20
      (combinedDetails.explicitContent && combinedDetails.explicitContent > 5) || // Lowered from 15
      (combinedDetails.suggestiveContent && combinedDetails.suggestiveContent > 10) || // Lowered from 30
      hasInappropriateFlags ||
      // Temporary: Force review for any image with skin tone detection above 20%
      (combinedDetails.suggestiveContent && combinedDetails.suggestiveContent > 20)
    ) {
      isApproved = true; // Allow upload but mark for review
      requiresReview = true;
      confidence = 40;
      message = 'Image uploaded successfully but requires admin approval before being visible to others.';
      console.log('🔍 Image requires review - pending approval', {
        adult: combinedDetails.adultContent,
        explicit: combinedDetails.explicitContent,
        suggestive: combinedDetails.suggestiveContent
      });
    }
    else if (hasWarningFlags) {
      // Allow with warnings
      confidence = 70;
      if (allFlags.includes(MODERATION_FLAGS.NO_FACE_DETECTED)) {
        message = 'No face detected. Profile photos work best when they clearly show your face.';
      } else if (allFlags.includes(MODERATION_FLAGS.POOR_QUALITY)) {
        message = 'Image quality could be better. Consider uploading a clearer photo.';
      } else if (allFlags.includes(MODERATION_FLAGS.MULTIPLE_FACES)) {
        message = 'Multiple faces detected. Solo photos work best for profiles.';
      }
    } 
    // TEMPORARY TESTING: Force every 2nd image to require review for testing
    else if (Math.random() > 0.5) {
      isApproved = true;
      requiresReview = true; 
      confidence = 45;
      message = 'Image uploaded successfully but requires admin approval before being visible to others. [TEST MODE]';
      console.log('🧪 TEST MODE: Forcing image to require review');
    }
    else {
      message = 'Image approved for upload.';
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
   * Helper function to detect skin tones - Enhanced algorithm
   */
  private isSkinTone(r: number, g: number, b: number): boolean {
    // Enhanced skin tone detection algorithm
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    
    if (max - min < 15) return false; // Low color variation
    if (r < 95 || g < 40 || b < 20) return false; // Too dark
    if (r > 255 || g > 220 || b > 170) return false; // Too bright
    if (r - g < 15) return false; // Not enough red vs green
    if (r < g || r < b) return false; // Red should be dominant
    
    // Additional checks for better accuracy
    const yellowish = (r + g) / 2 > b + 20; // Skin tends to be yellowish
    const ratio1 = r / Math.max(g, 1);
    const ratio2 = r / Math.max(b, 1);
    
    return yellowish && ratio1 > 1.1 && ratio2 > 1.1;
  }

  /**
   * Enhanced flesh tone detection for more explicit content
   */
  private isFleshTone(r: number, g: number, b: number): boolean {
    // More specific flesh tone detection
    const pinkish = r > 180 && g > 120 && g < 200 && b > 100 && b < 180;
    const beige = r > 200 && g > 170 && g < 220 && b > 140 && b < 190;
    const lightBrown = r > 160 && r < 220 && g > 120 && g < 180 && b > 80 && b < 140;
    
    // Ratios that indicate flesh tones
    const rToG = r / Math.max(g, 1);
    const rToB = r / Math.max(b, 1);
    const gToB = g / Math.max(b, 1);
    
    const fleshRatios = rToG > 1.0 && rToG < 1.4 && rToB > 1.2 && rToB < 2.0 && gToB > 1.1 && gToB < 1.6;
    
    return (pinkish || beige || lightBrown) && fleshRatios;
  }
}

// Export singleton instance
export const photoModerationService = new PhotoModerationService();

/**
 * Enhanced moderation with external API integration
 * This can be extended to use services like Google Vision API, AWS Rekognition, etc.
 */
export async function moderateImageWithExternalAPI(file: File): Promise<ModerationResult> {
  // This would integrate with external APIs like:
  // - Google Vision API Safe Search
  // - AWS Rekognition Content Moderation
  // - Microsoft Azure Content Moderator
  // - Cloudinary AI Content Analysis
  
  // For now, fallback to local analysis
  return photoModerationService.moderateImage(file);
}

export { MODERATION_FLAGS };

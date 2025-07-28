/**
 * AI Photo Moderation Service for DripLove
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
  BLOOD_GORE: string;
  AI_GENERATED: string;
}

const MODERATION_FLAGS: ModerationFlags = {
  EXPLICIT_CONTENT: 'Explicit content detected',
  ADULT_CONTENT: 'Adult content detected',
  VIOLENCE: 'Violent content detected',
  INAPPROPRIATE: 'Inappropriate content detected',
  NO_FACE_DETECTED: 'No face detected in image',
  POOR_QUALITY: 'Image quality is too poor',
  MULTIPLE_FACES: 'Multiple faces detected',
  INVALID_IMAGE: 'Invalid or corrupted image',
  BLOOD_GORE: 'Blood or gore content detected',
  AI_GENERATED: 'Potentially AI-generated content detected'
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
      const imageData = await this.loadImage(file);
      const analyses = await Promise.all([
        this.analyzeImageContent(imageData),
        this.detectFaces(imageData),
        this.checkImageQuality(imageData),
        this.validateImageProperties(file)
      ]);

      const result = this.combineResults(analyses);
      
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
   * Analyze image content for inappropriate material - INCLUSIVE across all skin tones AND genders
   */
  private async analyzeImageContent(imageData: ImageData): Promise<Partial<ModerationResult>> {
    const data = imageData.data;
    const pixels = data.length / 4;
    const width = imageData.width;
    const height = imageData.height;
    
    let skinTonePixels = 0;
    let redDominantPixels = 0;
    let highSaturationPixels = 0;
    let nudityIndicators = 0;
    let maleNudityIndicators = 0;
    let blackMaleNudityIndicators = 0;
    let bloodGoreIndicators = 0;
    let aiGeneratedIndicators = 0;

    // Advanced nudity detection patterns
    const nudityPatterns = this.analyzeNudityPatterns(imageData);
    const violencePatterns = this.analyzeViolencePatterns(imageData);
    const aiPatterns = this.analyzeAIPatterns(imageData);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Enhanced skin tone detection (now works for ALL skin tones)
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
      
      // Additional nudity indicators for better detection
      // Check for flesh-like colors across all skin tones
      const isFleshLike = this.isFleshColor(r, g, b);
      if (isFleshLike) {
        nudityIndicators++;
      }

      // Male-specific nudity detection (broader skin areas, torso patterns)
      const isMaleNudityPattern = this.isMaleNudityColor(r, g, b);
      if (isMaleNudityPattern) {
        maleNudityIndicators++;
      }

      // Black male nudity detection (enhanced for darker skin tones)
      const isBlackMaleNudity = this.isBlackMaleNudityColor(r, g, b);
      if (isBlackMaleNudity) {
        blackMaleNudityIndicators++;
      }

      // Blood and gore detection
      const isBloodGore = this.isBloodGoreColor(r, g, b);
      if (isBloodGore) {
        bloodGoreIndicators++;
      }

      // AI-generated content detection
      const isAIGenerated = this.isAIGeneratedPattern(r, g, b);
      if (isAIGenerated) {
        aiGeneratedIndicators++;
      }
    }

    const skinToneRatio = skinTonePixels / pixels;
    const redDominantRatio = redDominantPixels / pixels;
    const nudityRatio = nudityIndicators / pixels;
    const maleNudityRatio = maleNudityIndicators / pixels;
    const blackMaleNudityRatio = blackMaleNudityIndicators / pixels;
    const bloodGoreRatio = bloodGoreIndicators / pixels;
    const aiGeneratedRatio = aiGeneratedIndicators / pixels;
    
    const flags: string[] = [];
    let adultContent = 0;
    let explicitContent = 0;
    let suggestiveContent = 0;

    // PRIORITY 1: Check for blood/gore/violence FIRST (immediate flagging)
    if (bloodGoreRatio > 0.15 || violencePatterns.hasBloodSplatters || violencePatterns.hasViolentContent) {
      flags.push(MODERATION_FLAGS.BLOOD_GORE);
      adultContent = Math.max(adultContent, 90); // Send to admin review
    }

    // PRIORITY 2: Check for AI-generated content
    if (aiGeneratedRatio > 0.25 || aiPatterns.hasAIArtifacts || aiPatterns.hasUnrealisticSkinTexture) {
      flags.push(MODERATION_FLAGS.AI_GENERATED);
      suggestiveContent = Math.max(suggestiveContent, 70); // Send to admin review
    }

    // PRIORITY 3: UNIVERSAL NUDITY DETECTION - Works across ALL skin tones, genders, and ethnicities
    // Enhanced detection for explicit content regardless of skin color or gender

    // Apply advanced pattern analysis - take MAXIMUM of all detection methods
    let nudityScore = Math.max(skinToneRatio, nudityRatio, maleNudityRatio, blackMaleNudityRatio);
    
    // Boost score if multiple indicators align
    if (nudityPatterns.hasVerticalSkinStripes && nudityPatterns.hasLargeSkinAreas) {
      nudityScore = Math.min(nudityScore * 1.3, 1.0); // 30% boost for pattern matching
    }
    
    if (nudityPatterns.hasCentralSkinConcentration) {
      nudityScore = Math.min(nudityScore * 1.2, 1.0); // 20% boost for central skin areas
    }

    // Enhanced explicit content detection for ALL genders and ethnicities - LESS SENSITIVE
    if (nudityScore > 0.95 || 
        (skinToneRatio > 0.90 && (maleNudityRatio > 0.65 || blackMaleNudityRatio > 0.65)) ||
        (nudityRatio > 0.85 && (maleNudityRatio > 0.75 || blackMaleNudityRatio > 0.75))) { 
      explicitContent = 95;
      flags.push(MODERATION_FLAGS.EXPLICIT_CONTENT);
      // REJECTED: Complete nudity detected - very high skin exposure (all genders/ethnicities)
    }
    else if (nudityScore > 0.80 ||
             (skinToneRatio > 0.75 && (maleNudityRatio > 0.55 || blackMaleNudityRatio > 0.55)) ||
             (nudityRatio > 0.70 && (maleNudityRatio > 0.60 || blackMaleNudityRatio > 0.60))) { 
      adultContent = 75; // Send to admin review
      // REVIEW: High nudity probability - likely nude/explicit content (all genders/ethnicities)
    }
    else if (nudityScore > 0.65 ||
             (skinToneRatio > 0.60 && (maleNudityRatio > 0.45 || blackMaleNudityRatio > 0.45)) ||
             (nudityRatio > 0.55 && (maleNudityRatio > 0.45 || blackMaleNudityRatio > 0.45))) { 
      suggestiveContent = Math.max(suggestiveContent, 45); // Lower threshold for auto-approval
      // REVIEW: Moderate nudity risk - summer clothing, swimwear, sports, possible AI (all genders/ethnicities)
    }
    else if (nudityScore > 0.45 || skinToneRatio > 0.45 || nudityRatio > 0.40) { 
      suggestiveContent = Math.max(suggestiveContent, 25); // Much lower score to allow auto-approval
      // PASSED: Light skin exposure - casual clothing, portraits (all genders/ethnicities)
    }
    else {
      // Low skin exposure - normal photos, uniforms, regular clothing
      // PASSED: Normal clothing - low skin exposure (all genders/ethnicities)
    }

    // Additional check for extremely red-dominant images (crime scenes, gore)
    if (redDominantRatio > 0.6) { // Lowered threshold for better blood detection
      flags.push(MODERATION_FLAGS.BLOOD_GORE);
      adultContent = Math.max(adultContent, 80);
      // Potential blood/gore content detected - high red dominance
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
   * Additional flesh color detection method for better nudity detection
   */
  private isFleshColor(r: number, g: number, b: number): boolean {
    // This method focuses on detecting flesh-like colors that might indicate nudity
    // Works across different skin tones
    
    // Skip extreme values
    if ((r < 15 && g < 15 && b < 15) || (r > 245 && g > 245 && b > 245)) return false;
    
    // Check for typical flesh color patterns across ethnicities
    const total = r + g + b;
    if (total < 45 || total > 600) return false; // Basic bounds check
    
    // Light flesh tones
    const isLightFlesh = (
      r > 60 && g > 35 && b > 20 &&
      r > g && r > b &&
      (r / total) > 0.4 && (r / total) < 0.65
    );
    
    // Medium flesh tones  
    const isMediumFlesh = (
      r > 40 && g > 25 && b > 15 &&
      r >= g && r >= b &&
      Math.abs(r - g) < 30 &&
      (r / total) > 0.35 && (r / total) < 0.55
    );
    
    // Dark flesh tones
    const isDarkFlesh = (
      r > 25 && g > 18 && b > 12 &&
      Math.abs(r - g) < 20 &&
      Math.abs(r - b) < 25 &&
      Math.abs(g - b) < 20 &&
      (r / total) > 0.3 && (r / total) < 0.5
    );
    
    return isLightFlesh || isMediumFlesh || isDarkFlesh;
  }

  /**
   * Male-specific nudity detection - focuses on broader skin areas and torso patterns
   */
  private isMaleNudityColor(r: number, g: number, b: number): boolean {
    // Male nudity often presents as larger skin areas (chest, back, torso)
    // Less focused on specific body parts, more on overall skin exposure
    
    // Skip extreme values
    if ((r < 12 && g < 12 && b < 12) || (r > 248 && g > 248 && b > 248)) return false;
    
    const total = r + g + b;
    if (total < 40 || total > 650) return false;
    
    // Broader flesh detection for male torso areas
    const isMaleTorsoSkin = (
      r > 30 && g > 20 && b > 15 &&           // Lower minimum thresholds
      r >= g - 8 && r >= b - 8 &&            // Allow more variation in ratios
      Math.abs(r - g) < 40 &&                // Wider RGB tolerance
      Math.abs(r - b) < 50 &&
      (r / total) > 0.28 && (r / total) < 0.7 // Broader red ratio range
    );
    
    // Additional patterns for male skin (often less saturated)
    const isMaleSkinTone = (
      r > 25 && g > 18 && b > 12 &&
      r + g + b > 60 &&                      // Not too dark overall
      Math.abs(r - g) < 35 &&                // Close color values
      Math.abs(g - b) < 30 &&
      r >= g - 5 && g >= b - 5               // Gradual decrease pattern
    );
    
    return isMaleTorsoSkin || isMaleSkinTone;
  }

  /**
   * Black male nudity detection - enhanced for darker skin tones and male body patterns
   */
  private isBlackMaleNudityColor(r: number, g: number, b: number): boolean {
    // Specifically targets darker skin tones that might be missed by other methods
    // Focuses on male body patterns with darker skin
    
    // Skip extreme values
    if ((r < 8 && g < 8 && b < 8) || (r > 250 && g > 250 && b > 250)) return false;
    
    const total = r + g + b;
    if (total < 35 || total > 400) return false; // Adjusted for darker skin
    
    // Dark male skin tones (African, African-American, etc.)
    const isDarkMaleSkin = (
      r > 20 && g > 15 && b > 10 &&            // Minimum thresholds for dark skin
      r <= 120 && g <= 100 && b <= 80 &&       // Maximum thresholds for dark skin
      Math.abs(r - g) < 25 &&                  // Close RGB values for dark skin
      Math.abs(r - b) < 30 &&
      Math.abs(g - b) < 25 &&
      r >= g - 3 && g >= b - 3                 // Gradual color transition
    );
    
    // Brown/chocolate skin tones
    const isBrownMaleSkin = (
      r > 35 && g > 25 && b > 15 &&
      r <= 140 && g <= 110 && b <= 85 &&
      r >= g && r >= b &&                      // Red slightly dominant
      (r - g) <= 20 && (r - b) <= 30 &&       // Close but distinct values
      (r / total) > 0.32 && (r / total) < 0.48 // Specific ratio for brown skin
    );
    
    // Medium-dark skin tones
    const isMediumDarkSkin = (
      r > 40 && g > 30 && b > 20 &&
      r <= 160 && g <= 130 && b <= 100 &&
      Math.abs(r - g) < 30 &&
      Math.abs(r - b) < 35 &&
      r >= g - 5 && g >= b - 5
    );
    
    return isDarkMaleSkin || isBrownMaleSkin || isMediumDarkSkin;
  }

  /**
   * Blood and gore detection
   */
  private isBloodGoreColor(r: number, g: number, b: number): boolean {
    // Detect blood-like colors and gore patterns
    
    // Fresh blood (bright red)
    const isFreshBlood = (
      r > 120 && g < 60 && b < 60 &&           // High red, low green/blue
      r > g + 60 && r > b + 60 &&             // Strong red dominance
      (r / (r + g + b)) > 0.5                 // Red makes up >50% of color
    );
    
    // Dark blood (dried blood, darker reds)
    const isDarkBlood = (
      r > 60 && r < 150 && g < 50 && b < 50 && // Medium red, very low green/blue
      r > g + 30 && r > b + 30 &&
      (r + g + b) < 250                       // Overall darker tone
    );
    
    // Gore/meat tones (pinkish, raw flesh)
    const isGoreTone = (
      r > 100 && g > 40 && g < 80 && b > 40 && b < 80 &&
      r > g + 20 && r > b + 20 &&
      Math.abs(g - b) < 30                    // Green and blue similar
    );
    
    return isFreshBlood || isDarkBlood || isGoreTone;
  }

  /**
   * AI-generated content detection
   */
  private isAIGeneratedPattern(r: number, g: number, b: number): boolean {
    // Detect patterns common in AI-generated images
    
    // Over-smoothed skin (too perfect, lacks natural texture)
    const isOverSmoothed = (
      r > 80 && g > 60 && b > 50 &&
      Math.abs(r - g) < 15 &&                 // Very similar RGB values
      Math.abs(g - b) < 15 &&
      Math.abs(r - b) < 20 &&
      (r + g + b) > 200 &&                    // Bright/light colors
      (r + g + b) < 600                       // Not too bright
    );
    
    // Unnatural color gradients (AI artifacts)
    const hasAIArtifacts = (
      (r > 200 && g > 200 && b > 200) ||       // Over-brightened
      (Math.abs(r - 128) < 5 && Math.abs(g - 128) < 5 && Math.abs(b - 128) < 5) // Mid-gray artifacts
    );
    
    return isOverSmoothed || hasAIArtifacts;
  }

  /**
   * Violence pattern analysis
   */
  private analyzeViolencePatterns(imageData: ImageData): {
    hasBloodSplatters: boolean;
    hasViolentContent: boolean;
  } {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const pixels = data.length / 4;
    
    let redConcentrations = 0;
    let darkRedAreas = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Look for blood-like color concentrations
      if (this.isBloodGoreColor(r, g, b)) {
        redConcentrations++;
      }
      
      // Dark red concentrations (dried blood, violence)
      if (r > 80 && r > g + 40 && r > b + 40 && (r + g + b) < 300) {
        darkRedAreas++;
      }
    }
    
    const redRatio = redConcentrations / pixels;
    const darkRedRatio = darkRedAreas / pixels;
    
    return {
      hasBloodSplatters: redRatio > 0.1 || darkRedRatio > 0.15, // 10% blood-like colors or 15% dark red
      hasViolentContent: redRatio > 0.2 // 20% blood-like colors indicates violence
    };
  }

  /**
   * AI pattern analysis
   */
  private analyzeAIPatterns(imageData: ImageData): {
    hasAIArtifacts: boolean;
    hasUnrealisticSkinTexture: boolean;
  } {
    const data = imageData.data;
    const pixels = data.length / 4;
    
    let aiArtifacts = 0;
    let unrealisticSkin = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      if (this.isAIGeneratedPattern(r, g, b)) {
        aiArtifacts++;
      }
      
      // Check for unrealistic skin smoothness
      if (this.isSkinTone(r, g, b) && this.isAIGeneratedPattern(r, g, b)) {
        unrealisticSkin++;
      }
    }
    
    const aiRatio = aiArtifacts / pixels;
    const unrealisticSkinRatio = unrealisticSkin / pixels;
    
    return {
      hasAIArtifacts: aiRatio > 0.3, // 30% AI-like patterns
      hasUnrealisticSkinTexture: unrealisticSkinRatio > 0.2 // 20% unrealistic skin
    };
  }

  /**
   * Advanced pattern analysis for nudity detection
   */
  private analyzeNudityPatterns(imageData: ImageData): {
    hasVerticalSkinStripes: boolean;
    hasLargeSkinAreas: boolean;
    hasCentralSkinConcentration: boolean;
  } {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let verticalSkinStripes = 0;
    let largeSkinAreas = 0;
    let centralSkinPixels = 0;
    let totalCentralPixels = 0;
    
    // Analyze vertical strips for body-like patterns
    for (let x = 0; x < width; x += 10) { // Sample every 10 pixels
      let skinInColumn = 0;
      for (let y = 0; y < height; y += 5) { // Sample every 5 pixels
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        if (this.isSkinTone(r, g, b) || this.isFleshColor(r, g, b)) {
          skinInColumn++;
        }
      }
      
      const columnSkinRatio = skinInColumn / (height / 5);
      if (columnSkinRatio > 0.6) { // 60% of column is skin
        verticalSkinStripes++;
      }
    }
    
    // Analyze for large continuous skin areas
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const centerRadius = Math.min(width, height) / 4;
    
    for (let y = Math.max(0, centerY - centerRadius); y < Math.min(height, centerY + centerRadius); y += 3) {
      for (let x = Math.max(0, centerX - centerRadius); x < Math.min(width, centerX + centerRadius); x += 3) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        totalCentralPixels++;
        if (this.isSkinTone(r, g, b) || this.isFleshColor(r, g, b) || this.isMaleNudityColor(r, g, b)) {
          centralSkinPixels++;
        }
      }
    }
    
    const hasVerticalSkinStripes = verticalSkinStripes > (width / 10) * 0.3; // 30% of columns have skin
    const hasLargeSkinAreas = largeSkinAreas > 20; // Arbitrary threshold for large areas
    const hasCentralSkinConcentration = totalCentralPixels > 0 && (centralSkinPixels / totalCentralPixels) > 0.5;
    
    return {
      hasVerticalSkinStripes,
      hasLargeSkinAreas,
      hasCentralSkinConcentration
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
      // Image blocked: Invalid file
    }
    // ❌ REJECT only COMPLETE nudity - must be extremely explicit (90%+ confidence)
    else if (combinedDetails.explicitContent && combinedDetails.explicitContent >= 95) {
      isApproved = false;
      confidence = 95;
      message = 'Image contains explicit nudity and cannot be uploaded.';
    }
    // ⚠️ REVIEW blood/gore content (send to admin, don't auto-approve)
    else if (allFlags.includes(MODERATION_FLAGS.BLOOD_GORE)) {
      isApproved = true; // Allow upload but require review
      requiresReview = true;
      confidence = 20;
      message = 'Image uploaded but requires admin approval due to potential violent content.';
    }
    // ⚠️ REVIEW AI-generated content (send to admin)
    else if (allFlags.includes(MODERATION_FLAGS.AI_GENERATED)) {
      isApproved = true; // Allow upload but require review
      requiresReview = true;
      confidence = 25;
      message = 'Image uploaded but requires admin approval due to potential AI-generated content.';
    }
    // ⚠️ REVIEW high nudity probability (send to admin instead of rejecting)
    else if (combinedDetails.adultContent && combinedDetails.adultContent >= 70) {
      isApproved = true; // Allow upload but require review
      requiresReview = true;
      confidence = 30;
      message = 'Image uploaded but requires admin approval due to high skin exposure.';
    }
    // ⚠️ REVIEW moderate nudity risk (send to admin for AI nudes, borderline content)
    else if (combinedDetails.suggestiveContent && combinedDetails.suggestiveContent >= 50) {
      isApproved = true; // Allow upload but require review
      requiresReview = true;
      confidence = 40;
      message = 'Image uploaded but requires admin approval for content review.';
    }
    else {
      message = 'Image approved and uploaded successfully.';
      confidence = 95;
      // Image approved automatically
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
   * INCLUSIVE skin tone detection - works across ALL skin tones and ethnicities
   */
  private isSkinTone(r: number, g: number, b: number): boolean {
    // Inclusive skin detection that works for all ethnicities
    // Must detect skin tones from very light to very dark
    
    // Skip only pure black, pure white, and extreme colors
    if ((r < 10 && g < 10 && b < 10) || (r > 250 && g > 250 && b > 250)) return false;
    
    // Method 1: Enhanced YCbCr for ALL skin tones (light to dark)
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
    
    // INCLUSIVE ranges covering all skin tones from very light to very dark
    const isSkinYCbCr = (
      y >= 20 && y <= 240 &&          // FULL luminance range (dark to light)
      cb >= 70 && cb <= 155 &&        // Extended blue chroma range  
      cr >= 125 && cr <= 185          // Extended red chroma range
    );
    
    // Method 2: RGB detection for light skin tones
    const isLightSkin = (
      r > 70 && g > 40 && b > 25 &&          // Light skin thresholds
      r > g && r > b &&                      // Red dominance for light skin
      (r - g) > 8 && (r - b) > 15           // Light skin differences
    );
    
    // Method 3: RGB detection for medium skin tones
    const isMediumSkin = (
      r > 45 && g > 25 && b > 15 &&          // Medium skin thresholds
      r >= g && r >= b &&                    // Red dominance or equal
      Math.abs(r - g) <= 35 &&               // Closer RGB values for medium tones
      Math.abs(r - b) <= 45
    );
    
    // Method 4: RGB detection for dark skin tones
    const isDarkSkin = (
      r > 20 && g > 15 && b > 10 &&          // Dark skin minimum thresholds
      (r >= g - 5) && (r >= b - 5) &&       // Allow brown tones
      Math.abs(r - g) <= 25 &&               // Close RGB values for dark skin
      Math.abs(r - b) <= 30 &&
      Math.abs(g - b) <= 25
    );
    
    // Method 5: HSV-based detection for all skin tones
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let hue = 0;
    if (delta !== 0) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    
    const saturation = max === 0 ? 0 : delta / max;
    const value = max / 255;
    
    // Skin hue ranges covering all ethnicities
    const isHSVSkin = (
      value > 0.08 &&                       // Not too dark (allows dark skin)
      saturation <= 0.85 &&                 // Not oversaturated
      ((hue >= 0 && hue <= 60) ||           // Red-orange range
       (hue >= 300 && hue <= 360) ||        // Red range
       (hue >= 20 && hue <= 45))            // Orange-brown range
    );
    
    // Return true if YCbCr AND at least one RGB method OR HSV detects skin
    return isSkinYCbCr && (isLightSkin || isMediumSkin || isDarkSkin || isHSVSkin);
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

    // Moderation result saved for image
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

    // Image approved
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

    // Image rejected
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
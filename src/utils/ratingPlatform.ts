/**
 * Platform-Specific Rating Handler
 * Routes rating actions to the appropriate store based on platform
 */

import { Capacitor } from '@capacitor/core';
import { RateApp } from 'capacitor-rate-app';
import { supabase } from '@/integrations/supabase/client';

export type PlatformType = 'ios' | 'android' | 'web';

/**
 * Detect the current platform
 */
export const detectPlatform = (): PlatformType => {
  const platform = Capacitor.getPlatform();
  
  if (platform === 'ios') {
    return 'ios';
  } else if (platform === 'android') {
    return 'android';
  } else {
    return 'web';
  }
};

/**
 * Open the appropriate rating interface based on platform
 */
export const openRatingInterface = async (rating?: number): Promise<void> => {
  const platform = detectPlatform();
  
  try {
    if (platform === 'ios') {
      // iOS - Use Apple's SKStoreReviewController (in-app modal)
      // Limited to 3 prompts per user per 365 days
      await RateApp.requestReview();
      console.log('[Rating] iOS in-app rating dialog requested');
    } else if (platform === 'android') {
      // Android - Use Google Play In-App Review API (in-app modal)
      // Note: Google enforces time-bound quotas - may not show if user was recently prompted
      // If quota exceeded, dialog won't appear (this is expected behavior)
      await RateApp.requestReview();
      console.log('[Rating] Android in-app review requested (subject to Google Play quota)');
    } else {
      // Web - Handle internally (rating is required for web)
      if (rating !== undefined) {
        await saveWebRating(rating);
        console.log('[Rating] Web rating saved:', rating);
      } else {
        console.error('[Rating] Web platform requires a rating value');
      }
    }
  } catch (error) {
    console.error(`[Rating] Error opening ${platform} rating interface:`, error);
    throw error;
  }
};

/**
 * Save web rating to Supabase
 */
export const saveWebRating = async (ratingValue: number): Promise<void> => {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Save rating to database
    // Note: Type assertion needed until Supabase types are regenerated after migration
    const { error } = await supabase
      .from('web_ratings' as any)
      .insert({
        user_id: user.id,
        rating_value: ratingValue,
        platform: 'web',
      });
    
    if (error) {
      throw error;
    }
    
    console.log('[Rating] Web rating saved successfully');
  } catch (error) {
    console.error('[Rating] Error saving web rating:', error);
    throw error;
  }
};

/**
 * Check if the rating plugin is available
 */
export const isRatingAvailable = (): boolean => {
  const platform = detectPlatform();
  
  // Web ratings are always available
  if (platform === 'web') {
    return true;
  }
  
  // Check if native platform and RateApp plugin is available
  return Capacitor.isNativePlatform() && typeof RateApp !== 'undefined';
};

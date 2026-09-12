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
    } else if (platform === 'android') {
      // Android - Use Google Play In-App Review API (in-app modal)
      // Note: Google enforces time-bound quotas - may not show if user was recently prompted
      // If quota exceeded, dialog won't appear (this is expected behavior)
      await RateApp.requestReview();
    } else {
      // Web - Handle internally (rating is required for web)
      if (rating !== undefined) {
        await saveWebRating(rating);
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
  } catch (error) {
    console.error('[Rating] Error saving web rating:', error);
    throw error;
  }
};

/**
 * Activate a temporary algorithmic visibility boost for the current user,
 * as a thank-you for opening the native store review prompt.
 */
export const activateVisibilityBoost = async (
  hours = 24,
  multiplier = 1.5
): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const boostUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('profiles')
      .update({
        visibility_boost_until: boostUntil,
        visibility_boost_multiplier: multiplier,
      } as any)
      .eq('id', user.id);

    if (error) throw error;
  } catch (error) {
    console.error('[Rating] Error activating visibility boost:', error);
  }
};

/**
 * Fetch this account's authoritative "has rated" flag from the DB - checked
 * once per session so a different device (or a reinstall, which wipes
 * localStorage) also stops asking once it's already been answered "Yes"
 * anywhere.
 */
export const fetchHasRatedAppFromDb = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('has_rated_app')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as { has_rated_app?: boolean }).has_rated_app);
  } catch (error) {
    console.error('[Rating] Error fetching has_rated_app:', error);
    return false;
  }
};

/**
 * Permanently record, on the account itself (not just this device), that
 * the user tapped "Yes" on the rating prompt and the native review sheet was
 * invoked - the only real signal either store gives us, and the only thing
 * that should ever stop us from asking again.
 */
export const markHasRatedAppInDb = async (userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        has_rated_app: true,
        rated_app_at: new Date().toISOString(),
      } as any)
      .eq('id', userId);
    if (error) throw error;
  } catch (error) {
    console.error('[Rating] Error saving has_rated_app:', error);
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

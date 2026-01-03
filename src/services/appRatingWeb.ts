/**
 * Web-specific rating service
 * Handles web platform ratings with custom UI
 */

import { saveWebRating } from '@/utils/ratingPlatform';
import { markUserHasRated, markRatingShown } from '@/utils/ratingStorage';

/**
 * Submit a web rating
 */
export const submitWebRating = async (rating: number): Promise<void> => {
  markRatingShown();
  await saveWebRating(rating);
  markUserHasRated('web');
};

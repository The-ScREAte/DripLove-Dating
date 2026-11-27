import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { upsertOwnProfile } from '@/utils/myProfile';
import { invokeImageModeration } from '@/utils/invokeImageModeration';
import { withRetry } from '@/utils/withRetry';
import { fileToBase64 } from '@/utils/faceVerificationUtils';
import { getCapitalCoordinates } from '@/utils/countryCapitals';
import { uploadPhotoThumbnail, withThumbnailPaths } from '@/utils/photoThumbnails';
import { getLanguageForCountry } from '@/i18n/config';
import { buildOptionalProfileFields } from './optionalFields';
import type { ImageUpload, OnboardingFormData } from './types';

type Toast = (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => unknown;

export interface CompleteSubmitContext {
  user: User;
  formData: OnboardingFormData;
  images: ImageUpload[];
  toast: Toast;
  /** the UI language right now - used as the preferred_language fallback */
  currentLanguage: string;
  faceStorageKey: string;
}

function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err !== 'object' || !err) return undefined;
  if (!('message' in err)) return undefined;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === 'string' ? msg : undefined;
}

const extractStoragePathFromPublicUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/user-photos/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
};

/**
 * Complete-profile's final save (the wizard has already validated every step):
 * upsert the profile -> referral -> clear stale photo rows -> index face ->
 * persist photo order / upload photos whose live check failed.
 *
 * Returns true when the profile is saved and the user may continue to terms.
 * Behaviour is the original ProfileCompletionPage.handleSubmit, unchanged,
 * except photos restored from the database (imageId, no local file) now count
 * as ready, exactly as they do in sign-up.
 */
export async function submitCompletion(ctx: CompleteSubmitContext): Promise<boolean> {
  const { user, formData, images, toast, currentLanguage, faceStorageKey } = ctx;

  try {
    // A custom-typed city that isn't in our known-city list never gets
    // geocoded, which used to silently leave people with no coordinates (and
    // undiscoverable in distance matching). Fall back to the capital.
    const resolvedCoords =
      formData.latitude == null || formData.longitude == null
        ? getCapitalCoordinates(formData.countryCode)
        : undefined;

    const profileData = {
      first_name: formData.firstName,
      last_name: formData.lastName,
      date_of_birth: formData.dateOfBirth,
      country: formData.country,
      city: formData.city,
      zip_code: formData.zipCode,
      gender: formData.gender,
      preference: formData.preference,
      relationship_intent: formData.relationshipIntent,
      occupation: formData.occupation,
      industry: formData.industry,
      education_level: formData.educationLevel,
      bio: formData.bio || '',
      interests: formData.interests || [],
      smoking: formData.smoking || '',
      drinking: formData.drinking || '',
      exercise_level: formData.exerciseLevel || '',
      sleeping_schedule: formData.sleepingSchedule || '',
      introvert_extrovert: formData.introvertExtrovert?.[0] || 50,
      spontaneous_planner: formData.spontaneousPlanner?.[0] || 50,
      messy_organized: formData.messyOrganized?.[0] || 50,
      fun_fact: formData.funFact || '',
      perfect_first_date: formData.perfectFirstDate || '',
      last_googled: formData.lastGoogled || '',
      ...buildOptionalProfileFields(formData),
      latitude: formData.latitude ?? resolvedCoords?.latitude ?? null,
      longitude: formData.longitude ?? resolvedCoords?.longitude ?? null,
      is_custom_city: formData.isCustomCity || false,
      max_distance: formData.maxDistance || 250,
      country_code: formData.countryCode || '',
      adinkra_symbols: formData.adinkraSymbols || [],
      preferred_language: getLanguageForCountry(formData.country) || currentLanguage || 'en',
    };

    // Not .upsert(): ON CONFLICT DO UPDATE needs SELECT on email, which is locked down.
    const { error } = await upsertOwnProfile(user.id, { email: user.email, ...profileData });
    if (error) throw error;

    // Save referral if a promo code was used (never blocks completion).
    if (formData.promoCodeId) {
      try {
        const { error: refError } = await supabase
          .from('referrals')
          .insert({ user_id: user.id, promo_code_id: formData.promoCodeId });
        if (refError) console.error('Error saving referral:', refError);
      } catch (refErr) {
        console.error('Error saving referral:', refErr);
      }
    }

    // Photos ready to persist: approved/pending and either already uploaded
    // live (imageId) or still holding a local file to upload now.
    const approvedImages = images.filter(
      (img) => (img.status === 'approved' || img.status === 'pending') && (img.imageId || img.file !== null),
    );

    // Replace existing image records to avoid unique(user_id, image_order)
    // conflicts on retries - EXCEPT rows this same session already live-uploaded
    // and moderated, which are real, current, already-checked photos.
    const liveImageIds = new Set(images.map((img) => img.imageId).filter((id): id is string => Boolean(id)));

    const { data: existingUserImages, error: existingUserImagesError } = await supabase
      .from('user_images')
      .select('id, image_url')
      .eq('user_id', user.id);
    if (existingUserImagesError) throw existingUserImagesError;

    const staleUserImages = (existingUserImages || []).filter((img) => !liveImageIds.has(img.id));

    if (staleUserImages.length > 0) {
      const { error: deleteExistingImagesError } = await supabase
        .from('user_images')
        .delete()
        .in('id', staleUserImages.map((img) => img.id));
      if (deleteExistingImagesError) throw deleteExistingImagesError;

      // Best-effort storage cleanup for replaced photos.
      const oldStoragePaths = staleUserImages
        .map((img) => extractStoragePathFromPublicUrl(img.image_url))
        .filter((path): path is string => Boolean(path));

      if (oldStoragePaths.length > 0) {
        const { error: removeOldStorageError } = await supabase.storage
          .from('user-photos')
          .remove(withThumbnailPaths(oldStoragePaths));
        if (removeOldStorageError) console.warn('Old image cleanup warning:', removeOldStorageError);
      }
    }

    // Index the face in AWS Rekognition with the user's name (profile is saved,
    // photos not yet uploaded) - moderate-image's face match searches this
    // collection, so the user's own face must be indexed first.
    const pendingFace = localStorage.getItem(faceStorageKey);
    if (pendingFace && user.id) {
      try {
        const userName = `${formData.firstName} ${formData.lastName}`;
        const { error: faceError } = await supabase.functions.invoke('face-verify', {
          body: { action: 'index_face', front: pendingFace, userId: user.id, userName },
        });
        if (faceError) console.error('Face indexing error:', faceError);
        // face-verify persists profiles.face_descriptor itself (server-side,
        // service role, after confirming caller identity).
        localStorage.removeItem(faceStorageKey);
      } catch (faceErr) {
        console.error('Face indexing exception:', faceErr);
      }
    }

    const uploadFailures: string[] = [];
    let successfulUploads = 0;
    let removedCount = 0;
    let pendingCount = 0;
    let showedFaceTip = false;

    for (let index = 0; index < approvedImages.length; index++) {
      const image = approvedImages[index];
      try {
        // Already uploaded + moderated live while picking - just fix up its
        // image_order (which may have shifted) instead of re-uploading it.
        if (image.imageId) {
          const { error: orderError } = await supabase
            .from('user_images')
            .update({ image_order: index + 1 })
            .eq('id', image.imageId);
          if (orderError) throw orderError;
          successfulUploads++;
          if (image.status === 'rejected') removedCount++;
          continue;
        }

        if (!image.file) continue;

        const mimeToExt: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif',
        };
        const fileExt = mimeToExt[image.file.type] || 'jpg';
        const uniqueSuffix =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const filePath = `${user.id}/${uniqueSuffix}.${fileExt}`;

        await withRetry(async () => {
          const { error: uploadError } = await supabase.storage
            .from('user-photos')
            .upload(filePath, image.file as File, {
              contentType: (image.file as File).type,
              cacheControl: '3600',
              upsert: false,
            });
          if (uploadError) throw uploadError;
        });
        void uploadPhotoThumbnail(filePath, image.file as File);

        const {
          data: { publicUrl },
        } = supabase.storage.from('user-photos').getPublicUrl(filePath);

        // Existing rows were cleared above, so this is a fresh insert - only
        // columns a user may set (DB grants block is_approved/moderation_status
        // from the client). moderate-image makes the real call right after.
        const thisOrder = index + 1;
        const insertedRow = await withRetry(async () => {
          const { data, error: dbError } = await supabase
            .from('user_images')
            .insert({ user_id: user.id, image_url: publicUrl, image_order: thisOrder })
            .select('id')
            .single();
          if (!dbError) return data;
          if (dbError.code === '23505') {
            const { data: existing, error: fetchError } = await supabase
              .from('user_images')
              .select('id')
              .eq('user_id', user.id)
              .eq('image_order', thisOrder)
              .single();
            if (!fetchError && existing) return existing;
          }
          throw dbError;
        });

        successfulUploads++;

        // invokeImageModeration retries transient invoke failures, so a network
        // blip doesn't leave the photo stuck at its DB-default 'pending'.
        const imageBase64 = await fileToBase64(image.file);
        const modDecision = await invokeImageModeration(insertedRow.id, imageBase64);
        if (modDecision.status === 'rejected') {
          // Only confirmed explicit content is removed; a rejected photo's row
          // survives for the audit trail but must NOT count toward the
          // "at least 2 photos" requirement below.
          removedCount++;
          successfulUploads--;
        } else if (modDecision.status === 'pending') {
          pendingCount++;
        } else if (index === 0 && modDecision.hasFace === false && !showedFaceTip) {
          showedFaceTip = true;
          toast({
            title: 'Tip',
            description:
              'Photos with your face tend to get more matches - consider making your first photo a clear face photo.',
            variant: 'default',
          });
        }
      } catch (uploadErr) {
        const errorMessage = uploadErr instanceof Error ? uploadErr.message : 'Unknown upload error';
        console.error('Error uploading image:', uploadErr);
        uploadFailures.push(errorMessage);
      }
    }

    if (successfulUploads < 2) {
      throw new Error('Image upload failed: less than 2 images were saved successfully.');
    }

    if (uploadFailures.length > 0) {
      toast({
        title: 'Image upload warning',
        description: 'Some images failed, but required photos were saved. You can re-upload any missing ones later.',
        variant: 'default',
      });
    }

    if (removedCount > 0) {
      toast({
        title: 'Photos removed',
        description: `${removedCount} of your photos ${removedCount === 1 ? 'was' : 'were'} removed for violating our content guidelines.`,
        variant: 'destructive',
      });
    }

    if (pendingCount > 0) {
      toast({
        title: 'Photo(s) queued for review',
        description: `${pendingCount} of your photos ${pendingCount === 1 ? 'is' : 'are'} still being reviewed and will go live automatically within a few minutes.`,
        variant: 'default',
      });
    }

    return true;
  } catch (error: unknown) {
    console.error('Profile completion error:', error);
    toast({
      title: 'Error',
      description: getErrorMessage(error) || undefined,
      variant: 'destructive',
    });
    return false;
  }
}

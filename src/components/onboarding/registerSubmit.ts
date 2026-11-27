import type { MutableRefObject } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeImageModeration } from '@/utils/invokeImageModeration';
import { withRetry } from '@/utils/withRetry';
import { fileToBase64 } from '@/utils/faceVerificationUtils';
import { getCapitalCoordinates } from '@/utils/countryCapitals';
import { uploadPhotoThumbnail } from '@/utils/photoThumbnails';
import { buildOptionalProfileFields } from './optionalFields';
import type { ImageUpload, OnboardingFormData } from './types';

type Toast = (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => unknown;

export interface RegisterSubmitContext {
  formData: OnboardingFormData;
  images: ImageUpload[];
  setImages: (updater: (prev: ImageUpload[]) => ImageUpload[]) => void;
  accountUserId: string | null;
  setAccountUserId: (id: string) => void;
  /** true once this flow has saved the profile row + referral + face index */
  profileSavedRef: MutableRefObject<boolean>;
  setCreatingAccount: (v: boolean) => void;
  setIsSubmitting: (v: boolean) => void;
  setIsFinishing: (v: boolean) => void;
  toast: Toast;
  t: (key: string) => string;
  faceStorageKey: string;
  onRegistrationInProgressChange?: (inProgress: boolean) => void;
  onSubmit: (data: unknown) => void;
}

/**
 * Sign-up's final submit (everything after the wizard's own validation):
 * check photos -> create the account -> save profile + referral -> index face
 * -> persist photo order / upload any photo whose live check failed -> hand off.
 *
 * Behaviour is the original RegistrationForm.handleSubmit, unchanged, with one
 * fix: a resumed registration (account already exists) now saves its profile
 * data too instead of skipping straight to photos.
 */
export async function submitRegistration(ctx: RegisterSubmitContext): Promise<boolean> {
  const {
    formData, images, setImages, accountUserId, setAccountUserId, profileSavedRef,
    setCreatingAccount, setIsSubmitting, setIsFinishing, toast, t, faceStorageKey,
    onRegistrationInProgressChange, onSubmit,
  } = ctx;

  if (images.some((img) => img.status === 'moderating')) {
    toast({
      title: 'Still checking your photos',
      description: 'Give it just a moment - photos are quick to check.',
      variant: 'default',
    });
    return false;
  }

  const approvedImages = images.filter((img) => img.status === 'approved' || img.status === 'pending');

  if (approvedImages.length < 2) {
    toast({
      title: t('registration.errors.photosRequired'),
      description: t('registration.uploadAtLeastTwoPhotos'),
      variant: 'destructive',
    });
    return false;
  }

  const rejectedImages = images.filter((img) => img.status === 'rejected');
  if (rejectedImages.length > 0) {
    toast({
      title: t('registration.errors.someImagesRejected'),
      description: t('registration.removeRejectedImages'),
      variant: 'destructive',
    });
    return false;
  }

  // Ready = already uploaded live (imageId) or has a file to fall back to
  // uploading now (live check failed earlier, e.g. a network blip).
  const readyImages = approvedImages.filter((img) => img.imageId || img.file);
  if (readyImages.length < 2) {
    toast({
      title: t('registration.errors.photosNeedReupload'),
      description: t('registration.reuploadTwoPhotos'),
      variant: 'destructive',
    });
    setImages((prev) => prev.filter((img) => img.imageId || img.file));
    return false;
  }

  // The account is only created here, on final submit (once photos have
  // already passed the checks above) - guarded so a resumed session
  // (accountUserId already set) never tries to sign up the same email twice.
  let userId: string | null = accountUserId;
  setCreatingAccount(true);

  if (!userId) {
    try {
      // Does a profile for this email already exist? (the only check that matters)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', formData.email)
        .single();

      if (existingProfile) {
        toast({
          title: 'Account exists',
          description: 'An account with this email already exists. Please sign in instead.',
          variant: 'destructive',
        });
        setCreatingAccount(false);
        return false;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            date_of_birth: formData.dateOfBirth,
            country: formData.country,
            city: formData.city,
            zip_code: formData.zipCode,
            gender: formData.gender,
            preference: formData.preference,
            relationship_intent: formData.relationshipIntent,
            occupation: formData.occupation || '',
            industry: formData.industry || '',
            education_level: formData.educationLevel || '',
            bio: formData.bio || '',
          },
        },
      });

      if (signUpError) {
        toast({ title: 'Registration failed', description: signUpError.message, variant: 'destructive' });
        setCreatingAccount(false);
        return false;
      }

      userId = signUpData?.user?.id ?? null;
      if (!userId) {
        toast({
          title: 'Registration failed',
          description: 'Could not create your account. Please try again.',
          variant: 'destructive',
        });
        setCreatingAccount(false);
        return false;
      }

      // The account now exists - signUp's SIGNED_IN event (and the DB trigger
      // that creates a full `profiles` row in the same transaction) can make
      // the app's global auth-routing redirect away from this screen before
      // profile data and photos are saved. Tell the parent to hold off until
      // this handler explicitly hands off via onSubmit.
      onRegistrationInProgressChange?.(true);
    } catch (err: unknown) {
      setCreatingAccount(false);
      toast({
        title: 'Account Creation Error',
        description:
          (err as { message?: string })?.message ||
          'Failed to create account. Please try a different email or sign in if you already have an account.',
        variant: 'destructive',
      });
      return false;
    }
  }

  if (!profileSavedRef.current) {
    // Small delay so any database trigger from signUp has completed.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('id', userId)
        .single();

      // A typed city we couldn't geocode would otherwise be saved with no
      // coordinates (no distance to anyone) - fall back to the capital.
      const resolvedCoords =
        formData.latitude == null || formData.longitude == null
          ? getCapitalCoordinates(formData.countryCode)
          : undefined;

      const profileData = {
        id: userId,
        email: formData.email,
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
        // Optional lifestyle answers - only the ones actually given.
        ...(formData.smoking ? { smoking: formData.smoking } : {}),
        ...(formData.drinking ? { drinking: formData.drinking } : {}),
        ...(formData.exerciseLevel ? { exercise_level: formData.exerciseLevel } : {}),
        ...(formData.sleepingSchedule ? { sleeping_schedule: formData.sleepingSchedule } : {}),
        ...buildOptionalProfileFields(formData),
        latitude: formData.latitude ?? resolvedCoords?.latitude ?? null,
        longitude: formData.longitude ?? resolvedCoords?.longitude ?? null,
        is_custom_city: formData.isCustomCity || false,
        max_distance: formData.maxDistance || 250,
        country_code: formData.countryCode || '',
        adinkra_symbols: formData.adinkraSymbols || [],
      };

      if (existingProfile) {
        const { error: profileError } = await supabase.from('profiles').update(profileData).eq('id', userId);
        if (profileError) throw profileError;
      } else {
        const { error: profileError } = await supabase.from('profiles').insert(profileData);
        if (profileError) {
          if (
            profileError.code === '23505' ||
            profileError.message.includes('duplicate') ||
            profileError.message.includes('already exists')
          ) {
            const { error: updateError } = await supabase.from('profiles').update(profileData).eq('id', userId);
            if (updateError) throw updateError;
          } else {
            throw profileError;
          }
        }
      }

      // Save referral if a promo code was used. Supabase resolves to { error }
      // rather than throwing, so it must be read explicitly.
      if (formData.promoCodeId) {
        try {
          const { error: refError } = await supabase
            .from('referrals')
            .insert({ user_id: userId, promo_code_id: formData.promoCodeId });
          if (refError) console.error('Error saving referral:', refError);
        } catch (refErr) {
          console.error('Error saving referral:', refErr);
        }
      }
    } catch (err: unknown) {
      setCreatingAccount(false);
      toast({
        title: 'Profile Save Error',
        description: (err as { message?: string })?.message || 'Failed to save profile.',
        variant: 'destructive',
      });
      return false;
    }

    // Index the face in AWS Rekognition with the user's name - now that the
    // account exists but BEFORE the photos are moderated: moderate-image's face
    // match searches this collection, so the user's own face has to be indexed
    // first or every photo would come back as a false "doesn't match".
    const pendingFace = localStorage.getItem(faceStorageKey);
    if (pendingFace && userId) {
      try {
        const userName = `${formData.firstName} ${formData.lastName}`;
        const { error: faceError } = await supabase.functions.invoke('face-verify', {
          body: { action: 'index_face', front: pendingFace, userId, userName },
        });
        if (faceError) console.error('Face indexing error:', faceError);
        localStorage.removeItem(faceStorageKey);
      } catch (faceErr) {
        console.error('Face indexing exception:', faceErr);
      }
    }

    profileSavedRef.current = true;
  }

  setAccountUserId(userId);
  setCreatingAccount(false);

  setIsSubmitting(true);

  let imageOrder = 1;
  let successfulUploads = 0;
  for (const image of readyImages) {
    try {
      if (image.imageId) {
        // Already uploaded + moderated live - just fix up its image_order.
        const { error } = await withRetry(async () => {
          const result = await supabase
            .from('user_images')
            .update({ image_order: imageOrder })
            .eq('id', image.imageId);
          if (result.error) throw result.error;
          return result;
        });
        if (error) throw error;
        successfulUploads++;
      } else if (image.file) {
        // Fallback path - the live check failed earlier for this one, so
        // upload + moderate it for real now.
        const mimeToExt: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif',
        };
        const fileExt = mimeToExt[image.file.type] || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${fileExt}`;
        const filePath = `${userId}/${fileName}`;

        await withRetry(async () => {
          const { error: uploadError } = await supabase.storage
            .from('user-photos')
            .upload(filePath, image.file as File, { contentType: (image.file as File).type, cacheControl: '3600' });
          if (uploadError) throw uploadError;
        });
        void uploadPhotoThumbnail(filePath, image.file as File);

        const {
          data: { publicUrl },
        } = supabase.storage.from('user-photos').getPublicUrl(filePath);
        const thisOrder = imageOrder;

        const insertedRow = await withRetry(async () => {
          const { data, error: dbError } = await supabase
            .from('user_images')
            .insert({ user_id: userId, image_url: publicUrl, image_order: thisOrder })
            .select('id')
            .single();
          if (!dbError) return data;
          // Same "did the previous attempt actually land?" recovery as live upload.
          if (dbError.code === '23505') {
            const { data: existing, error: fetchError } = await supabase
              .from('user_images')
              .select('id')
              .eq('user_id', userId)
              .eq('image_order', thisOrder)
              .single();
            if (!fetchError && existing) return existing;
          }
          throw dbError;
        });

        // Record the row now, before moderation runs - if moderation throws,
        // this photo already has a real row (pending review) and must NOT be
        // re-uploaded as a duplicate on retry.
        const thisPreview = image.preview;
        setImages((prev) =>
          prev.map((img) => (img.preview === thisPreview ? { ...img, imageId: insertedRow.id, filePath } : img)),
        );
        successfulUploads++;

        const imageBase64 = await fileToBase64(image.file);
        const modDecision = await invokeImageModeration(insertedRow.id, imageBase64);
        if (modDecision.status === 'rejected') {
          successfulUploads--;
          setImages((prev) =>
            prev.map((img) =>
              img.preview === thisPreview ? { ...img, status: 'rejected', moderationMessage: modDecision.message } : img,
            ),
          );
          toast({
            title: 'Photo removed',
            description: modDecision.message || 'One of your photos was removed for violating our content guidelines.',
            variant: 'destructive',
          });
        }
      }

      imageOrder++;
    } catch (error) {
      console.error('Image upload error:', error);
      toast({
        title: 'Image Upload Error',
        description: `Image ${imageOrder} failed to upload. Please try again.`,
        variant: 'destructive',
      });
    }
  }

  setIsSubmitting(false);

  // Never finalize registration with fewer than 2 real, persisted photos - the
  // account exists at this point, but staying here means the next attempt
  // retries whatever photos are left instead of silently finishing with none.
  if (successfulUploads < 2) {
    toast({
      title: 'Photos failed to upload',
      description: 'At least 2 photos are required. Please try uploading again before continuing.',
      variant: 'destructive',
    });
    return false;
  }

  localStorage.removeItem(faceStorageKey);
  setIsFinishing(true);

  // Photos are saved - safe to hand routing back to the parent (it moves to
  // terms-acceptance in response to onSubmit below anyway).
  onRegistrationInProgressChange?.(false);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    onSubmit({ ...formData, images: approvedImages, ...(user ? { user } : {}) });
  } catch {
    onSubmit({ ...formData, images: approvedImages });
  }
  // Normally the parent has already switched to the terms screen in the same
  // render; if it didn't, drop back to the form rather than hang here.
  setIsFinishing(false);
  return true;
}

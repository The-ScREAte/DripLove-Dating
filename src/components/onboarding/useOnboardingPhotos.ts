import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeImageModeration } from '@/utils/invokeImageModeration';
import { withRetry } from '@/utils/withRetry';
import { compressImage } from '@/utils/imageCompression';
import { fileToBase64 } from '@/utils/faceVerificationUtils';
import { isSupportedImageFile, MAX_SOURCE_PHOTO_BYTES } from '@/utils/imageNormalizer';
import { uploadPhotoThumbnail, withThumbnailPaths } from '@/utils/photoThumbnails';
import { getFileHash } from '@/utils/fileHash';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { ImageUpload } from './types';

interface Options {
  /** The signed-in user who owns photo rows. Null until the account exists
   *  (sign-up creates it only at the very end) - photos picked before then
   *  stay 'pending' and are uploaded for real during the final submit. */
  userId: string | null;
  maxPhotos: number;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const extractStoragePath = (url: string): string | undefined => {
  try {
    const marker = '/storage/v1/object/public/user-photos/';
    const parsed = new URL(url);
    const idx = parsed.pathname.indexOf(marker);
    return idx === -1 ? undefined : decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return undefined;
  }
};

/**
 * Everything about the photo step, shared by sign-up and complete-profile:
 * picking, HEIC/RAW -> JPEG compression, duplicate detection, live upload +
 * moderation as soon as a photo is picked, cropping, removal and cleanup.
 */
export function useOnboardingPhotos({ userId, maxPhotos }: Options) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [croppingImage, setCroppingImage] = useState<{ preview: string } | null>(null);

  /** Rebuild the grid from rows already saved for this user (survives reloads,
   *  unlike blob: preview URLs which die with the page that made them). */
  const restoreFromDatabase = useCallback(async (ownerId: string) => {
    const { data: existingRows } = await supabase
      .from('user_images')
      .select('id, image_url, image_order, is_approved, moderation_status')
      .eq('user_id', ownerId)
      .order('image_order', { ascending: true });

    if (existingRows && existingRows.length > 0) {
      setImages(
        existingRows
          .filter((row) => row.image_order > 0)
          .map(
            (row): ImageUpload => ({
              file: null,
              preview: row.image_url,
              status: row.moderation_status === 'rejected' ? 'rejected' : row.is_approved ? 'approved' : 'pending',
              imageId: row.id,
              filePath: extractStoragePath(row.image_url),
            }),
          ),
      );
    }
  }, []);

  // Checks a photo for real (AWS Rekognition) right away, the moment it's
  // picked, instead of deferring to final submit - so the user finds out
  // immediately if a photo needs replacing. Needs a real DB row to attach the
  // result to, which needs the account to exist; before that it falls back to
  // 'pending' and final submit uploads it. Shared by the picker and re-crop.
  const uploadAndModerateImage = (file: File, preview: string, order: number) => {
    if (!userId) {
      setImages((prev) => prev.map((img) => (img.preview === preview ? { ...img, status: 'pending' } : img)));
      return;
    }

    (async () => {
      try {
        const fileExt = MIME_TO_EXT[file.type] || 'jpg';
        const uniqueSuffix =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const filePath = `${userId}/${uniqueSuffix}.${fileExt}`;

        await withRetry(async () => {
          const { error: uploadError } = await supabase.storage
            .from('user-photos')
            .upload(filePath, file, { contentType: file.type, cacheControl: '3600', upsert: false });
          if (uploadError) throw uploadError;
        });
        // Small copy for grids/cards (best-effort, doesn't block).
        void uploadPhotoThumbnail(filePath, file);

        const {
          data: { publicUrl },
        } = supabase.storage.from('user-photos').getPublicUrl(filePath);

        const insertedRow = await withRetry(async () => {
          const { data, error: dbError } = await supabase
            .from('user_images')
            .insert({ user_id: userId, image_url: publicUrl, image_order: order })
            .select('id')
            .single();
          if (!dbError) return data;
          // A prior attempt's insert may have landed server-side even though the
          // response never made it back; the unique(user_id, image_order)
          // constraint then reports a conflict - treat that as success.
          if (dbError.code === '23505') {
            const { data: existing, error: fetchError } = await supabase
              .from('user_images')
              .select('id')
              .eq('user_id', userId)
              .eq('image_order', order)
              .single();
            if (!fetchError && existing) return existing;
          }
          throw dbError;
        });

        const imageBase64 = await fileToBase64(file);
        const modDecision = await invokeImageModeration(insertedRow.id, imageBase64);

        setImages((prev) =>
          prev.map((img) =>
            img.preview === preview
              ? {
                  ...img,
                  status: modDecision.status === 'rejected' ? 'rejected' : 'approved',
                  imageId: insertedRow.id,
                  filePath,
                  moderationMessage: modDecision.message,
                }
              : img,
          ),
        );

        if (modDecision.status === 'rejected') {
          toast({
            title: 'Photo needs replacing',
            description: modDecision.message || 'This photo violates our content guidelines - please choose another.',
            variant: 'destructive',
          });
        }
      } catch (err) {
        console.error('Live moderation failed for a photo:', err);
        // Fall back to deferred behaviour - final submit uploads + moderates it
        // for real since it has no imageId.
        setImages((prev) => prev.map((img) => (img.preview === preview ? { ...img, status: 'pending' } : img)));
      }
    })();
  };

  const handleFiles = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    if (images.length + files.length > maxPhotos) {
      toast({
        title: 'Too many images',
        description: `You can upload a maximum of ${maxPhotos} images.`,
        variant: 'destructive',
      });
      return;
    }

    // `images` is a snapshot from when this handler started - it never reflects
    // the setImages() calls made later in this same loop. These locals are
    // mutated synchronously so in-batch duplicates and photo ordering stay
    // correct (otherwise every file in one selection got the same order and
    // violated unique(user_id, image_order)).
    const seenHashesThisBatch = new Set(images.map((img) => img.hash).filter(Boolean));
    let orderCounter = images.length;

    for (const file of files) {
      if (!isSupportedImageFile(file)) {
        toast({
          title: t('profileCompletion.invalidFileType'),
          description: t('profileCompletion.notAnImageFile', { filename: file.name }),
          variant: 'destructive',
        });
        continue;
      }

      if (file.size > MAX_SOURCE_PHOTO_BYTES) {
        toast({
          title: t('profileCompletion.fileTooLarge'),
          description: `${file.name} is larger than 80MB.`,
          variant: 'destructive',
        });
        continue;
      }

      // Compress (typically to JPEG); RAW/HEIC photos are converted here first.
      let compressedFile: File;
      try {
        compressedFile = await compressImage(file);
      } catch (error) {
        console.error('Could not read photo:', error);
        toast({
          title: "Couldn't read this photo",
          description: `${file.name} couldn't be opened. Try exporting it as a JPG and uploading that.`,
          variant: 'destructive',
        });
        continue;
      }

      // Hash AFTER compression for accurate duplicate detection.
      const fileHash = await getFileHash(compressedFile);

      if (seenHashesThisBatch.has(fileHash)) {
        toast({
          title: t('profileCompletion.duplicateImage'),
          description: t('profileCompletion.imageAlreadyUploaded'),
          variant: 'destructive',
        });
        continue;
      }
      seenHashesThisBatch.add(fileHash);

      const preview = URL.createObjectURL(compressedFile);
      const newImage: ImageUpload = { file: compressedFile, preview, status: 'moderating', hash: fileHash };

      setImages((prev) => [...prev, newImage]);
      orderCounter++;
      uploadAndModerateImage(compressedFile, preview, orderCounter);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await handleFiles(event.target.files);
    event.target.value = '';
  };

  const removeImage = (preview: string) => {
    const removed = images.find((img) => img.preview === preview);
    setImages((prev) => prev.filter((img) => img.preview !== preview));
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);

    // Already live-checked (a real row exists) - clean both up now instead of
    // leaving an orphaned row/file behind.
    if (removed?.imageId) {
      supabase
        .from('user_images')
        .delete()
        .eq('id', removed.imageId)
        .then(({ error }) => {
          if (error) console.error('Failed to remove photo row:', error);
        });
    }
    if (removed?.filePath) {
      supabase.storage
        .from('user-photos')
        .remove(withThumbnailPaths([removed.filePath]))
        .then(({ error }) => {
          if (error) console.error('Failed to remove photo file:', error);
        });
    }
  };

  const handleCroppedImage = ({ blob, previewUrl, originalUrl }: { blob: Blob; previewUrl: string; originalUrl: string }) => {
    const original = images.find((img) => img.preview === originalUrl);
    const croppedFile = new File([blob], original?.file?.name || 'cropped.jpg', { type: 'image/jpeg' });
    const order = images.findIndex((img) => img.preview === originalUrl) + 1;

    setImages((prev) =>
      prev.map((img) => {
        if (img.preview !== originalUrl) return img;
        if (img.preview.startsWith('blob:')) URL.revokeObjectURL(img.preview);
        return {
          ...img,
          file: croppedFile,
          preview: previewUrl,
          status: 'moderating',
          imageId: undefined,
          filePath: undefined,
          moderationMessage: undefined,
        };
      }),
    );
    setCroppingImage(null);

    // The crop changed the pixels, so the old row/file points at stale content.
    if (original?.imageId) {
      supabase
        .from('user_images')
        .delete()
        .eq('id', original.imageId)
        .then(({ error }) => {
          if (error) console.error('Failed to remove pre-crop photo row:', error);
        });
    }
    if (original?.filePath) {
      supabase.storage
        .from('user-photos')
        .remove(withThumbnailPaths([original.filePath]))
        .then(({ error }) => {
          if (error) console.error('Failed to remove pre-crop photo file:', error);
        });
    }
    uploadAndModerateImage(croppedFile, previewUrl, order > 0 ? order : images.length + 1);
  };

  return {
    images,
    setImages,
    croppingImage,
    setCroppingImage,
    handleImageUpload,
    removeImage,
    handleCroppedImage,
    restoreFromDatabase,
  };
}

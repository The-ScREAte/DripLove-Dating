import React, { useCallback, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCroppedImageBlob } from '@/utils/cropImage';

// Same aspect ratio the app actually displays profile photos in - a tall,
// portrait frame close to the swipe card's own proportions (which itself
// varies slightly by device, but this is representative of all three:
// Discover, Liked Me, and the profile preview all crop with object-cover
// against a box noticeably taller than it is wide).
export const PROFILE_PHOTO_ASPECT = 3 / 4;

interface PhotoCropModalProps {
  imageUrl: string;
  userId: string;
  onClose: () => void;
  /** Legacy immediate-save flow (Image Management): uploads right here. */
  onSaved?: (newUrl: string) => void;
  /**
   * Deferred flow (profile preview): hands the cropped result back to the
   * parent WITHOUT uploading, so the user can review it in the real preview
   * and then explicitly Save or Cancel there.
   */
  onApply?: (result: { blob: Blob; previewUrl: string; originalUrl: string }) => void;
}

/**
 * Persists a cropped photo: uploads the blob, repoints the existing
 * user_images row at it (keeps order + approval), and best-effort deletes the
 * old object. Shared by the immediate flow here and the deferred Save in
 * ProfilePreviewModal.
 */
export const uploadCroppedPhoto = async (
  userId: string,
  originalUrl: string,
  blob: Blob
): Promise<string> => {
  const safeFile = new File([blob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('user-photos')
    .upload(fileName, safeFile, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
  if (uploadError) throw uploadError;

  const storedPath = uploadData?.path;
  if (!storedPath) throw new Error('Upload succeeded but no path returned from storage');

  const { data: urlData } = await supabase.storage.from('user-photos').getPublicUrl(storedPath);
  if (!urlData?.publicUrl) throw new Error('Failed to generate public image URL');
  const newUrl = urlData.publicUrl;

  const { error: dbError } = await supabase
    .from('user_images')
    .update({ image_url: newUrl })
    .eq('user_id', userId)
    .eq('image_url', originalUrl);
  if (dbError) throw dbError;

  // Best-effort cleanup of the old object - deliberately not awaited. Nothing
  // downstream depends on it (the DB row already points at newUrl), so it
  // was only adding a third sequential network round-trip to every crop
  // save's perceived latency for zero benefit; errors are still swallowed,
  // it just no longer blocks the caller's UI (toast/spinner) from resolving.
  const urlParts = originalUrl.split('/');
  const bucketIndex = urlParts.findIndex((part) => part === 'user-photos');
  if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
    const oldPath = urlParts.slice(bucketIndex + 1).join('/');
    void supabase.storage.from('user-photos').remove([oldPath]).catch(() => {});
  }

  return newUrl;
};

const PhotoCropModal: React.FC<PhotoCropModalProps> = ({ imageUrl, userId, onClose, onSaved, onApply }) => {
  const { toast } = useToast();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels || isSaving) return;
    setIsSaving(true);
    try {
      const blob = await getCroppedImageBlob(imageUrl, croppedAreaPixels);

      // Deferred flow: don't touch storage or the database yet - just hand the
      // crop back so it can be previewed, then saved or discarded by the user.
      if (onApply) {
        onApply({ blob, previewUrl: URL.createObjectURL(blob), originalUrl: imageUrl });
        onClose();
        return;
      }

      const newUrl = await uploadCroppedPhoto(userId, imageUrl, blob);
      toast({ title: 'Photo updated', description: 'Your cropped photo has been saved.' });
      onSaved?.(newUrl);
      onClose();
    } catch (error) {
      console.error('Error saving cropped photo:', error);
      toast({
        title: 'Error',
        description: 'Failed to save your cropped photo. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="sm:max-w-md bg-black border border-pink-500/30 text-white p-4">
        <DialogHeader>
          <DialogTitle className="text-white">Crop Photo</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-white -mt-2 mb-1">
          Drag to reposition, pinch or use the slider to zoom. This frame matches how your photo appears in the app.
        </p>

        <div className="relative w-full rounded-lg overflow-hidden bg-neutral-900" style={{ height: 360 }}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={PROFILE_PHOTO_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
            cropShape="rect"
          />
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-white shrink-0">Zoom</span>
          <Slider
            value={[zoom]}
            onValueChange={(v) => setZoom(v[0])}
            min={1}
            max={3}
            step={0.01}
            className="w-full"
          />
        </div>

        <div className="flex flex-row items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="w-auto h-9 px-4 bg-white border-pink-500/30 text-black hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !croppedAreaPixels}
            className="w-auto h-9 px-4 bg-pink-600 hover:bg-pink-700 text-white"
          >
            {isSaving ? (onApply ? 'Applying...' : 'Saving...') : (onApply ? 'OK' : 'Save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoCropModal;

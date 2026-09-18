
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Upload, Trash2, Shield, CheckCircle, RefreshCw, Camera, Pencil, Clock, ImageOff, Plus, X, Tag, Check } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PHOTO_LABEL_OPTIONS } from '@/constants/photoLabels';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/utils/imageCompression';
import FaceVerification from '@/components/FaceVerification';
import { fileToBase64 } from '@/utils/faceVerificationUtils';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import PhotoCropModal, { uploadCroppedPhoto } from './PhotoCropModal';
import { invokeImageModeration } from '@/utils/invokeImageModeration';
import CachedImage from '@/components/common/CachedImage';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ImageManagementProps {
  currentUser: {
    id: string;
    email?: string;
  } | null;
  profile?: {
    face_descriptor?: string | null;
  } | null;
  onProfileUpdate?: () => void;
  // Dragging to reorder is only enabled while the section's Edit mode is on
  // (the pencil button in its header) - otherwise a tap on a thumbnail just
  // opens the preview.
  isEditing?: boolean;
}

interface UserImage {
  id: string;
  image_url: string;
  is_approved?: boolean;
  moderation_status?: string;
  label?: string | null;
  caption?: string | null;
}

interface ModerationDecision {
  status: 'approved' | 'rejected' | 'pending';
  message: string;
  hasFace?: boolean | null;
}

interface SortablePhotoThumbProps {
  userImage: UserImage;
  index: number;
  isBroken: boolean;
  pending?: { blob: Blob; previewUrl: string };
  savingCropUrl: string | null;
  isEditing: boolean;
  onImageError: (url: string) => void;
  onOpenPreview: (url: string) => void;
  onDiscardWarning: (url: string) => void;
  onSaveCrop: (url: string) => void;
}

const SortablePhotoThumb = ({
  userImage,
  index,
  isBroken,
  pending,
  savingCropUrl,
  isEditing,
  onImageError,
  onOpenPreview,
  onDiscardWarning,
  onSaveCrop,
}: SortablePhotoThumbProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: userImage.image_url,
    disabled: !!pending || !isEditing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Locked to 'none' only once actually dragging so the row's normal touch
    // scroll still works for a plain swipe - see useSortable's isDragging.
    touchAction: isDragging ? 'none' : 'pan-x',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { if (!pending) onOpenPreview(userImage.image_url); }}
      className={`relative shrink-0 w-16 h-24 sm:w-20 sm:h-28 select-none [-webkit-touch-callout:none] ${
        isDragging ? 'opacity-60 scale-105 z-10' : ''
      }`}
    >
      {isBroken && !pending ? (
        <div className="w-full h-full rounded-xl shadow-sm bg-neutral-800 border border-pink-500/20 flex flex-col items-center justify-center gap-1 text-white/40">
          <ImageOff className="w-6 h-6" />
          <span className="text-[10px]">Unavailable</span>
        </div>
      ) : (
        <CachedImage
          loading="lazy"
          decoding="async"
          draggable={false}
          src={pending ? pending.previewUrl : getDetailImageUrl(userImage.image_url)}
          alt={`User Image ${index + 1}`}
          className="w-full h-full object-cover rounded-xl shadow-sm pointer-events-none select-none"
          onLoadError={() => onImageError(userImage.image_url)}
        />
      )}

      {/* Main photo indicator */}
      {index === 0 && !pending && (
        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-full pointer-events-none">
          Main
        </div>
      )}

      {/* Pending approval indicator */}
      {userImage.is_approved === false && !pending && (
        <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
          <Shield className="w-3 h-3" /> Reviewing...
        </div>
      )}

      {/* Unsaved crop - review, then explicitly Save or Cancel; nothing
          else on this photo is actionable while a crop is pending. */}
      {pending && (
        <>
          <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full">
            Unsaved crop
          </div>
          <div className="absolute bottom-2 inset-x-2 flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDiscardWarning(userImage.image_url)}
              disabled={savingCropUrl === userImage.image_url}
              className="flex-1 h-7 px-2 text-xs bg-white border-pink-500/30 text-black hover:bg-neutral-200 hover:text-black"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onSaveCrop(userImage.image_url)}
              disabled={savingCropUrl === userImage.image_url}
              className="flex-1 h-7 px-2 text-xs bg-pink-600 hover:bg-pink-700 text-white"
            >
              {savingCropUrl === userImage.image_url ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

const ImageManagement = ({ currentUser, profile, onProfileUpdate, isEditing = false }: ImageManagementProps) => {
  const { t } = useTranslation();
  const [userImages, setUserImages] = useState<UserImage[]>([]);
  // Tracks photo URLs whose <img> failed to load, so we can swap in a clean
  // placeholder instead of leaving the browser's own broken-image glyph
  // showing (a bare triangle icon with no context).
  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [moderationResult, setModerationResult] = useState<ModerationDecision | null>(null);
  const [replacingImageUrl, setReplacingImageUrl] = useState<string | null>(null);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [croppingImageUrl, setCroppingImageUrl] = useState<string | null>(null);
  // Same deferred pattern as the profile preview's own crop: "OK" in the
  // modal only applies the crop locally so it can be reviewed against the
  // real thumbnail first; nothing touches storage/db until an explicit Save,
  // keyed by the original image_url so multiple photos can have their own
  // pending crop at once.
  const [pendingCrops, setPendingCrops] = useState<Record<string, { blob: Blob; previewUrl: string }>>({});
  const [savingCropUrl, setSavingCropUrl] = useState<string | null>(null);
  const [discardWarningUrl, setDiscardWarningUrl] = useState<string | null>(null);
  // Which photo's action overlay (crop/replace/delete) is open - tap-to-reveal
  // since hover doesn't exist on touch devices.
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  // Optional per-photo label/caption editor popup (opened from the preview
  // overlay's left-side tag button). Local draft state only - nothing is
  // saved until handleSaveLabelCaption runs.
  const [labelPopupUrl, setLabelPopupUrl] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [captionDraft, setCaptionDraft] = useState('');
  const [savingLabelCaption, setSavingLabelCaption] = useState(false);
  const { toast } = useToast();

  // Drag-to-reorder via dnd-kit: mouse activates on a small drag distance,
  // touch needs a brief hold first (so a normal swipe still scrolls the row
  // and a normal tap still opens the big preview). The first photo is the
  // profile's main one.
  const dragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const persistImageOrder = async (ordered: UserImage[]) => {
    try {
      // image_order has two DB constraints: a check constraint requiring
      // -1 (rejected) or 1-7 (NOT 0-based - a plain array index silently
      // failed slot 1 every time), and a unique index on (user_id,
      // image_order) for image_order > 0. Reassigning positions in a single
      // pass can collide mid-update (row A wants the slot row B currently
      // holds, before B has moved off it), so every row is cleared to -1
      // first - allowed to repeat, since that's the same value used for a
      // rejected photo - and only then does each take its real 1-based slot,
      // with nothing left occupying a positive value to collide with.
      const clearResults = await Promise.all(
        ordered.map((img) => supabase.from('user_images').update({ image_order: -1 }).eq('id', img.id))
      );
      const clearFailed = clearResults.find((r) => r.error);
      if (clearFailed?.error) throw clearFailed.error;

      const results = await Promise.all(
        ordered.map((img, index) =>
          supabase.from('user_images').update({ image_order: index + 1 }).eq('id', img.id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;

      toast({ title: 'Photo order saved', duration: 1500 });
      // The first slot is the profile's main photo - let the parent know so
      // the header avatar (and anything else reading the profile) picks up
      // the new order right away instead of showing a stale main photo.
      onProfileUpdate?.();
    } catch (error) {
      console.error('Error saving photo order:', error);
      toast({ title: 'Error', description: 'Failed to save the new photo order. Please try again.', variant: 'destructive' });
      void fetchUserImages();
    }
  };

  // The new order shows up instantly (local state below), but the DB write
  // is debounced - if the user reorders a few more photos in quick
  // succession, each one resets the timer instead of firing a save per
  // drag, and only the final arrangement is written once it's held stable
  // for 5s. Flushed immediately on unmount so a pending reorder is never
  // silently dropped.
  const pendingOrderRef = useRef<UserImage[] | null>(null);
  const persistTimerRef = useRef<number | null>(null);

  const flushPendingImageOrder = useCallback(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (pendingOrderRef.current) {
      const toSave = pendingOrderRef.current;
      pendingOrderRef.current = null;
      void persistImageOrder(toSave);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleImageOrderSave = (ordered: UserImage[]) => {
    pendingOrderRef.current = ordered;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(flushPendingImageOrder, 5000);
  };

  useEffect(() => {
    return () => flushPendingImageOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setUserImages((prev) => {
      const oldIndex = prev.findIndex((img) => img.image_url === active.id);
      const newIndex = prev.findIndex((img) => img.image_url === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      scheduleImageOrderSave(next);
      return next;
    });
  };

  // Warn on a real page unload while any crop is pending.
  useEffect(() => {
    if (Object.keys(pendingCrops).length === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCrops]);

  const handleSavePendingCrop = useCallback(async (originalUrl: string) => {
    const pending = pendingCrops[originalUrl];
    if (!pending || savingCropUrl || !currentUser?.id) return;
    setSavingCropUrl(originalUrl);
    try {
      const newUrl = await uploadCroppedPhoto(currentUser.id, originalUrl, pending.blob);
      URL.revokeObjectURL(pending.previewUrl);
      setPendingCrops((prev) => {
        const next = { ...prev };
        delete next[originalUrl];
        return next;
      });
      // Optimistic local update instead of waiting on a full re-fetch - we
      // already know exactly what changed (uploadCroppedPhoto's return value
      // *is* the new row's image_url), so there's nothing a round-trip back
      // to the DB would tell us that we don't already know. fetchUserImages
      // still runs to reconcile with the server, just not blocking the
      // Save button's spinner/toast on a fourth sequential network call.
      setUserImages((prev) => prev.map((img) => (img.image_url === originalUrl ? { ...img, image_url: newUrl } : img)));
      toast({ title: 'Photo updated', description: 'Your cropped photo has been saved.' });
      void fetchUserImages();
      onProfileUpdate?.();
    } catch (error) {
      console.error('Error saving cropped photo:', error);
      toast({ title: 'Error', description: 'Failed to save your cropped photo. Please try again.', variant: 'destructive' });
    } finally {
      setSavingCropUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCrops, savingCropUrl, currentUser?.id, toast, onProfileUpdate]);

  const handleDiscardPendingCrop = useCallback((originalUrl: string) => {
    const pending = pendingCrops[originalUrl];
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPendingCrops((prev) => {
      const next = { ...prev };
      delete next[originalUrl];
      return next;
    });
    setDiscardWarningUrl(null);
  }, [pendingCrops]);

  // Check if user is verified (has face_descriptor)
  const isVerified = !!profile?.face_descriptor;

  const handleFaceVerified = async (faceImageBase64: string) => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          action: "index_face",
          front: faceImageBase64,
          userId: currentUser?.id,
        },
      });

      if (error) {
        toast({
          title: "Verification Failed",
          description: "Could not complete face verification. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        // The face-verify edge function now persists profiles.face_descriptor
        // itself (server-side, service role) after confirming the caller's
        // identity, so the client no longer writes verification status
        // directly to the profiles table - that write is not something an
        // ordinary authenticated client should be trusted to set.
        // Face verified - no toast needed, verified badge shows on profile
        setShowFaceVerification(false);
        onProfileUpdate?.();
      } else {
        toast({
          title: "Verification Failed",
          description: data?.error || "Could not verify your face. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchUserImages = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      // image_order = -1 marks a rejected image kept only for the admin
      // audit trail (see reject_image()) - it no longer occupies a visible
      // slot, so it's excluded here.
      const { data: images, error } = await supabase
        .from('user_images')
        .select('id, image_url, is_approved, moderation_status, label, caption')
        .eq('user_id', currentUser.id)
        .neq('image_order', -1)
        .order('image_order', { ascending: true });

      if (error) throw error;

      setUserImages((images || []).map(img => ({
        id: img.id,
        image_url: img.image_url,
        is_approved: img.is_approved ?? true,
        moderation_status: img.moderation_status ?? 'approved',
        label: img.label ?? null,
        caption: img.caption ?? null,
      })));
    } catch (error) {
      console.error('Error fetching user images:', error);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchUserImages();
  }, [fetchUserImages, currentUser?.id]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Allow upload if replacing OR if under 5 images
    if (!replacingImageUrl && userImages.length >= 5) {
      toast({ title: "Maximum images reached", description: "You can upload a maximum of 5 images.", variant: "destructive" });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file type", description: "Please upload an image file.", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image smaller than 10MB.", variant: "destructive" });
      return;
    }

    // Helper function to generate file hash for duplicate detection
    const getFileHash = async (file: File): Promise<string> => {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      // Simple hash: combine file size with first and last bytes
      const firstBytes = Array.from(uint8Array.slice(0, 100)).join(',');
      const lastBytes = Array.from(uint8Array.slice(-100)).join(',');
      return `${file.size}-${file.type}-${firstBytes}-${lastBytes}`;
    };

    // Step 1: Compress (typically to JPEG) to keep uploads small and consistent
    setModerating(true);
    setModerationResult(null);

    // Compress image
    const compressedFile = await compressImage(file);
    
    // Generate hash AFTER compression for accurate duplicate detection
    const newFileHash = await getFileHash(compressedFile);

    // Check against existing images in the database by downloading and comparing
    let isDuplicate = false;
    for (const existingImage of userImages) {
      try {
        // Fetch the existing image
        const response = await fetch(existingImage.image_url);
        if (response.ok) {
          const blob = await response.blob();
          const existingFile = new File([blob], 'existing.jpg', { type: blob.type });
          const existingHash = await getFileHash(existingFile);
          
          if (existingHash === newFileHash) {
            isDuplicate = true;
            break;
          }
        }
      } catch (err) {
        // Continue checking other images if fetch fails
        console.error('Error checking duplicate:', err);
      }
    }

    if (isDuplicate) {
      toast({ 
        title: "Duplicate image", 
        description: "This image has already been uploaded.", 
        variant: "destructive" 
      });
      setModerating(false);
      event.target.value = '';
      return;
    }

    const wasReplacing = !!replacingImageUrl;

    setModerating(false);
    setUploading(true);

    try {
      // 🔒 Wrap compressed result in a proper File object to ensure correct MIME type
      // This fixes the application/json content-type bug from blob-like compression output
      const safeFile = new File(
        [compressedFile],
        `${Date.now()}.jpg`,
        { type: 'image/jpeg' }
      );

      const fileName = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;

      // Upload to storage with explicit content type
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(fileName, safeFile, {
          contentType: 'image/jpeg',  // 🔥 REQUIRED - prevents application/json
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload failed:', uploadError);
        throw uploadError;
      }

      // ✅ CRITICAL: Use uploadData.path (what Supabase actually stored), not our fileName
      const storedPath = uploadData?.path;
      if (!storedPath) {
        throw new Error("Upload succeeded but no path returned from storage");
      }

      const { data: urlData } = await supabase.storage
        .from('user-photos')
        .getPublicUrl(storedPath);

      if (!urlData?.publicUrl) throw new Error("Failed to generate public image URL");

      const publicUrl = urlData.publicUrl;

      let imageOrder: number;

      // If replacing an existing image
      if (replacingImageUrl) {
        // Get the image order of the image being replaced
        const { data: existingImage, error: orderError } = await supabase
          .from('user_images')
          .select('image_order')
          .eq('user_id', currentUser.id)
          .eq('image_url', replacingImageUrl)
          .single();

        if (orderError) throw orderError;

        imageOrder = existingImage?.image_order || 1;

        // Delete old image from storage
        const urlParts = replacingImageUrl.split('/');
        const bucketIndex = urlParts.findIndex(part => part === 'user-photos');
        if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
          const filePath = urlParts.slice(bucketIndex + 1).join('/');
          await supabase.storage
            .from('user-photos')
            .remove([filePath]);
        }

        // Delete old image from database
        await supabase
          .from('user_images')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('image_url', replacingImageUrl);
      } else {
        // Get the next available image order
        const { data: existingImages, error: orderError } = await supabase
          .from('user_images')
          .select('image_order')
          .eq('user_id', currentUser.id)
          .order('image_order', { ascending: true });

        if (orderError) {
          console.error('Error fetching image order:', orderError);
          throw orderError;
        }

        // Find the next available order
        let nextImageOrder = 1;
        const existingOrders = existingImages?.map(img => img.image_order).filter(order => order > 0).sort((a, b) => a - b) || [];

        for (let i = 1; i <= 7; i++) {
          if (!existingOrders.includes(i)) {
            nextImageOrder = i;
            break;
          }
        }
        imageOrder = nextImageOrder;
      }

      // Insert the row with only the columns a user is allowed to set - the
      // DB grants added alongside moderate-image block writing is_approved/
      // moderation_status directly, so those stay at their pending defaults
      // until the moderate-image edge function (below) makes the real call.
      const { data: insertedRow, error: dbError } = await supabase
        .from('user_images')
        .insert({ user_id: currentUser.id, image_url: publicUrl, image_order: imageOrder })
        .select('id')
        .single();

      if (dbError) {
        console.error('Error inserting image:', dbError);
        throw dbError;
      }

      setReplacingImageUrl(null);
      setUploading(false);
      setModerating(true);

      // Real, server-side moderation: only confirmed explicit content (AWS
      // Rekognition nudity/explicit-content labels) ever removes a photo.
      // Everything else goes live immediately - a face that doesn't clearly
      // match the account's verified face never blocks the photo, it just
      // queues a non-blocking glance for admins in the background.
      // invokeImageModeration retries transient invoke failures a few times
      // before giving up - and if it still can't complete, it reports an
      // honest 'pending' outcome rather than claiming the photo is live
      // when the DB row (still moderation_status='pending' by default)
      // disagrees.
      const imageBase64 = await fileToBase64(compressedFile);
      const decision: ModerationDecision = await invokeImageModeration(insertedRow.id, imageBase64);

      setModerationResult(decision);

      if (decision.status === 'approved') {
        toast({
          title: (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-500" />
              {wasReplacing ? 'Image Replaced Successfully' : 'Image Uploaded Successfully'}
            </span>
          ),
          description: wasReplacing
            ? "Your image has been replaced and is now visible to others."
            : "Your image has been approved and is now visible to others.",
          variant: "default"
        });
        // Friendly, non-blocking nudge - slot 1 is the one place we ask for
        // a clear face photo, but a missing one never blocks the upload.
        if (imageOrder === 1 && decision.hasFace === false) {
          toast({
            title: "Tip",
            description: "Photos with your face tend to get more matches - consider making your first photo a clear face photo.",
            variant: "default"
          });
        }
      } else if (decision.status === 'pending') {
        toast({
          title: (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" /> Photo Queued for Review
            </span>
          ),
          description: decision.message,
          variant: "default"
        });
      } else {
        toast({
          title: (
            <span className="inline-flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-red-500" /> Image Removed
            </span>
          ),
          description: decision.message,
          variant: "destructive"
        });
      }

      // Refresh the image list
      await fetchUserImages();
      onProfileUpdate?.();
    } catch (error) {
      console.error('Error uploading image:', error);

      // Provide more specific error messages
      let errorMessage = "Failed to upload image.";
      if (error instanceof Error) {
        if (error.message.includes('duplicate key')) {
          errorMessage = "Upload failed due to a database conflict. Please try again.";
        } else if (error.message.includes('constraint')) {
          errorMessage = "Upload failed due to database constraints. Please try again.";
        } else if (error.message.includes('network')) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else {
          errorMessage = `Upload failed: ${error.message}`;
        }
      }

      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      setModerating(false);
      setModerationResult(null);
      setReplacingImageUrl(null); // Always clear replace state
      event.target.value = '';
    }
  };

  const handleSaveLabelCaption = async (imageUrl: string, label: string | null, caption: string | null) => {
    const image = userImages.find((img) => img.image_url === imageUrl);
    if (!image) return;

    setSavingLabelCaption(true);
    try {
      const { error } = await supabase
        .from('user_images')
        .update({ label, caption })
        .eq('id', image.id);

      if (error) throw error;

      setUserImages((prev) => prev.map((img) =>
        img.id === image.id ? { ...img, label, caption } : img
      ));
      setLabelPopupUrl(null);
      // Refreshes ProfilePage's own separate user_images fetch (which feeds the
      // Profile Preview's captions) so the change shows immediately there too,
      // instead of only in this component's local state until a page reload.
      onProfileUpdate?.();
    } catch (error) {
      console.error('Error saving photo label/caption:', error);
      const message = error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message)
        : "Something went wrong saving the photo description. Try again.";
      toast({
        title: "Couldn't save",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSavingLabelCaption(false);
    }
  };

  const handleDeleteImage = async (imageUrl: string) => {
    // Check if only 2 images remain - prevent deletion
    if (userImages.length <= 2) {
      toast({ 
        title: "Cannot delete image", 
        description: "You must have at least 2 images. Use 'Replace' to change this image.", 
        variant: "destructive" 
      });
      return;
    }

    setDeleting(true);

    try {
      // Delete from database first
      const { error: dbError } = await supabase
        .from('user_images')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('image_url', imageUrl);

      if (dbError) throw dbError;

      // Then delete from storage
      const urlParts = imageUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part === 'user-photos');
      if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        const filePath = urlParts.slice(bucketIndex + 1).join('/');
        const { error: storageError } = await supabase.storage
          .from('user-photos')
          .remove([filePath]);
        
        if (storageError) {
          // Don't throw here as database deletion succeeded
        }
      }

      await fetchUserImages();
      onProfileUpdate?.();
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({ title: "Error", description: "Failed to delete image. Please try again.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleReplaceImage = (imageUrl: string) => {
    setReplacingImageUrl(imageUrl);
    
    // Show a toast notification
    toast({ 
      title: "Replace Mode", 
      description: "Select a new image from your files to replace the current one.",
      variant: "default"
    });
    
    // Trigger file input click
    const fileInput = document.getElementById('image_upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-3 text-white/80 text-sm">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-pink-500" />
          <span>{userImages.length}/7</span>
        </div>
        {!showFaceVerification && (
          <Button
            size="sm"
            onClick={() => {
              if (isVerified) {
                toast({ title: 'Already verified', description: 'You have been verified already.' });
                return;
              }
              setShowFaceVerification(true);
            }}
            style={{ height: 20, minHeight: 20, padding: '0 10px' }}
            className={`text-[11px] gap-1 rounded-full text-white ${
              isVerified
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }`}
          >
            {isVerified ? (
              <CheckCircle size={11} style={{ width: 11, height: 11 }} />
            ) : (
              <Camera size={11} style={{ width: 11, height: 11 }} />
            )}
            {isVerified ? 'Verified' : 'Verify'}
          </Button>
        )}
      </div>

        {/* Face Verification Camera View */}
        {showFaceVerification && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-purple-300 text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Face Verification
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFaceVerification(false)}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
            <FaceVerification 
              onVerified={handleFaceVerified}
              disabled={isVerifying}
            />
          </div>
        )}

        {/* Always mounted (just hidden) so both "+" (add) and "Replace" can
            reliably trigger it via getElementById - it used to live inside
            the `userImages.length < 5` block below, which meant Replace
            silently did nothing once you had 5+ photos, since the input it
            needs to click didn't exist in the DOM at all. */}
        <div className="mb-3">
          <Input
            type="file"
            id="image_upload"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={uploading || moderating}
            className="hidden"
          />
          {moderating && (
            <div className="text-sm text-purple-600 mt-2 flex items-center">
              <Shield className="animate-pulse w-4 h-4 mr-2" />
              Checking image content...
            </div>
          )}
          {uploading && (
            <div className="text-sm text-white/60 mt-2 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-pink-600 mr-2"></div>
              Uploading...
            </div>
          )}
          {moderationResult && !uploading && (
            <div className={`text-sm mt-2 flex items-center ${
              moderationResult.status === 'approved'
                ? 'text-green-600'
                : moderationResult.status === 'pending'
                  ? 'text-amber-500'
                  : 'text-red-500'
            }`}>
              {moderationResult.status === 'approved' ? (
                <CheckCircle className="w-4 h-4 mr-2" />
              ) : moderationResult.status === 'pending' ? (
                <Clock className="w-4 h-4 mr-2" />
              ) : (
                <Shield className="w-4 h-4 mr-2" />
              )}
              {moderationResult.message}
            </div>
          )}
        </div>

        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={userImages.map((img) => img.image_url)} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {userImages.map((userImage, index) => (
                <SortablePhotoThumb
                  key={userImage.image_url}
                  userImage={userImage}
                  index={index}
                  isBroken={brokenImageUrls.has(userImage.image_url)}
                  pending={pendingCrops[userImage.image_url]}
                  savingCropUrl={savingCropUrl}
                  isEditing={isEditing}
                  onImageError={(url) => setBrokenImageUrls((prev) => new Set(prev).add(url))}
                  onOpenPreview={setActiveImageUrl}
                  onDiscardWarning={setDiscardWarningUrl}
                  onSaveCrop={handleSavePendingCrop}
                />
              ))}

              {userImages.length < 5 && (
                <button
                  type="button"
                  onClick={() => {
                    // Adding a new photo is never a replace, even if a
                    // previous Replace attempt was left dangling (e.g. the
                    // file picker was cancelled without choosing a file).
                    setReplacingImageUrl(null);
                    (document.getElementById('image_upload') as HTMLInputElement)?.click();
                  }}
                  disabled={uploading || moderating}
                  aria-label={t('profile.uploadImage')}
                  className="shrink-0 w-16 h-24 sm:w-20 sm:h-28 rounded-xl border-2 border-dashed border-pink-500/40 flex items-center justify-center text-pink-400 hover:bg-pink-500/10 disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-7 h-7" />
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>

        {userImages.length === 0 && (
          <div className="text-center py-8 text-white/60">
            <Upload className="w-12 h-12 mx-auto mb-4 text-white/50" />
            <p>No photos uploaded yet</p>
            <p className="text-sm">Upload your first photo to get started!</p>
          </div>
        )}

      {/* Full-size photo preview - tap a thumbnail to open it big, with the
          crop/replace/delete actions available right below it. */}
      {activeImageUrl && (() => {
        const previewUrl = activeImageUrl;
        return (
          <div
            className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center p-4 overflow-hidden"
            onClick={() => { setActiveImageUrl(null); setLabelPopupUrl(null); }}
          >
            <button
              type="button"
              onClick={() => { setActiveImageUrl(null); setLabelPopupUrl(null); }}
              className="absolute top-4 right-4 text-white/80 hover:text-white"
              aria-label="Close"
            >
              <X size={28} />
            </button>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <CachedImage
                src={getDetailImageUrl(previewUrl)}
                alt="Photo preview"
                // dvh (not vh) so mobile browser chrome collapsing/expanding
                // can't make this taller than what's actually visible - vh is
                // computed against the largest possible viewport, dvh against
                // the current one. Plain max-w/max-h (no forced w-full/h-full)
                // is what makes a replaced element like <img> scale down
                // proportionally to fit BOTH bounds on its own - a tall
                // portrait photo hits the height cap and shrinks in width to
                // match, a wide one hits the width cap and shrinks in height,
                // so nothing ever overflows or gets cut off either axis.
                // object-contain is redundant with that (kept as a no-op
                // safety net) since w-auto/h-auto means there's no fixed box
                // for it to actually have to fit content into.
                className="max-w-[92vw] max-h-[65dvh] w-auto h-auto object-contain rounded-xl block border-2 border-pink-500/60"
              />

              {/* Optional per-photo description - mirrors the crop/replace/delete
                  cluster on the right, but on the left since it's a separate,
                  optional concern rather than another destructive/edit action. */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <Button
                  onClick={() => {
                    const img = userImages.find((u) => u.image_url === previewUrl);
                    setLabelDraft(img?.label || '');
                    setCaptionDraft(img?.caption || '');
                    setLabelPopupUrl(previewUrl);
                  }}
                  style={{ width: 34, height: 34, minWidth: 34, minHeight: 34, padding: 0 }}
                  className={`shrink-0 backdrop-blur-sm border rounded-full shadow-sm transition-colors ${
                    userImages.find((u) => u.image_url === previewUrl)?.caption
                      ? 'bg-pink-500/80 hover:bg-pink-500 border-pink-300/40 text-white'
                      : 'bg-black/60 hover:bg-black/80 border-white/15 text-white'
                  }`}
                  title="Add description"
                >
                  <Tag size={15} style={{ width: 15, height: 15 }} />
                </Button>
              </div>

              {labelPopupUrl === previewUrl && (() => {
                const img = userImages.find((u) => u.image_url === previewUrl);
                return (
                  <div
                    className="absolute top-11 left-3 z-10 w-64 max-w-[80vw] rounded-2xl bg-black/95 border border-pink-500/30 shadow-lg px-2.5 pb-2 space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-0.5">
                      <label className="text-[11px] font-medium text-white/60">What's this photo?</label>
                      <Select value={labelDraft || undefined} onValueChange={setLabelDraft}>
                        <SelectTrigger className="h-7 py-0 bg-white/5 border-white/15 text-white text-sm">
                          <SelectValue placeholder="Pick a vibe (optional)" />
                        </SelectTrigger>
                        <SelectContent className="bg-black border-pink-500/30 text-white">
                          {PHOTO_LABEL_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option} className="text-sm">
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-0.5">
                      <label className="text-[11px] font-medium text-white/60">Caption (optional)</label>
                      {/* Textarea, not Input - a single-line input just scrolls
                          horizontally past its own width instead of wrapping,
                          which hides the end of anything past a few words. */}
                      <Textarea
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value.slice(0, 50))}
                        placeholder="Say something short..."
                        maxLength={50}
                        rows={2}
                        className="resize-none bg-white/5 border-white/15 text-white text-sm placeholder:text-white/40 min-h-0 py-1.5"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {(img?.label || img?.caption) ? (
                        <button
                          type="button"
                          onClick={() => handleSaveLabelCaption(previewUrl, null, null)}
                          disabled={savingLabelCaption}
                          className="text-[11px] text-white/50 hover:text-white/80 transition-colors"
                        >
                          Clear
                        </button>
                      ) : <span />}
                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          onClick={() => handleSaveLabelCaption(previewUrl, labelDraft || null, captionDraft.trim() || null)}
                          disabled={savingLabelCaption}
                          style={{ width: 34, height: 34, minWidth: 34, minHeight: 34, padding: 0 }}
                          className="shrink-0 bg-emerald-600/90 hover:bg-emerald-600 backdrop-blur-sm border border-white/15 rounded-full shadow-sm text-white"
                          title="Save"
                        >
                          <Check size={15} style={{ width: 15, height: 15 }} />
                        </Button>
                        <Button
                          onClick={() => setLabelPopupUrl(null)}
                          style={{ width: 34, height: 34, minWidth: 34, minHeight: 34, padding: 0 }}
                          className="shrink-0 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/15 rounded-full shadow-sm text-white"
                          title="Cancel"
                        >
                          <X size={15} style={{ width: 15, height: 15 }} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="absolute top-3 right-3 flex items-center gap-2">
                <Button
                  onClick={() => { setCroppingImageUrl(previewUrl); setActiveImageUrl(null); }}
                  style={{ width: 34, height: 34, minWidth: 34, minHeight: 34, padding: 0 }}
                  className="shrink-0 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/15 rounded-full shadow-sm text-white"
                  title="Crop photo"
                >
                  <Pencil size={15} style={{ width: 15, height: 15 }} />
                </Button>

                {userImages.length <= 2 ? (
                  <Button
                    onClick={() => { handleReplaceImage(previewUrl); setActiveImageUrl(null); }}
                    style={{ width: 34, height: 34, minWidth: 34, minHeight: 34, padding: 0 }}
                    className="shrink-0 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/15 rounded-full shadow-sm text-white"
                    title="Replace image"
                  >
                    <RefreshCw size={15} style={{ width: 15, height: 15 }} />
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => { handleReplaceImage(previewUrl); setActiveImageUrl(null); }}
                      style={{ width: 34, height: 34, minWidth: 34, minHeight: 34, padding: 0 }}
                      className="shrink-0 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/15 rounded-full shadow-sm text-white"
                      title="Replace image"
                    >
                      <RefreshCw size={15} style={{ width: 15, height: 15 }} />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          style={{ width: 34, height: 34, minWidth: 34, minHeight: 34, padding: 0 }}
                          className="shrink-0 bg-black/60 hover:bg-red-600/90 backdrop-blur-sm border border-white/15 rounded-full shadow-sm text-red-400 hover:text-white"
                          title="Delete image"
                        >
                          <Trash2 size={15} style={{ width: 15, height: 15 }} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="sm:max-w-md bg-black border border-pink-500/30 text-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">Delete Image</AlertDialogTitle>
                          <AlertDialogDescription className="text-white/80">Are you sure you want to delete this image? This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-black border-pink-500/30 text-white hover:bg-neutral-800 hover:text-white">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={deleting}
                            onClick={() => { handleDeleteImage(previewUrl); setActiveImageUrl(null); }}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {deleting ? 'Deleting...' : 'Delete'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {croppingImageUrl && currentUser?.id && (
        <PhotoCropModal
          imageUrl={croppingImageUrl}
          userId={currentUser.id}
          onClose={() => setCroppingImageUrl(null)}
          onApply={(result) => {
            setPendingCrops((prev) => {
              const existing = prev[result.originalUrl];
              if (existing) URL.revokeObjectURL(existing.previewUrl);
              return { ...prev, [result.originalUrl]: { blob: result.blob, previewUrl: result.previewUrl } };
            });
            setCroppingImageUrl(null);
          }}
        />
      )}

      {discardWarningUrl && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-6"
          onClick={() => setDiscardWarningUrl(null)}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-pink-500/30 bg-black p-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-white mb-1 font-semibold">Discard your crop?</p>
            <p className="text-xs text-white/80 mb-4">Your cropped photo hasn't been saved yet.</p>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDiscardWarningUrl(null)}
                className="h-8 px-3 text-xs bg-white border-pink-500/30 text-black hover:bg-neutral-200 hover:text-black"
              >
                Keep editing
              </Button>
              <Button
                size="sm"
                onClick={() => handleDiscardPendingCrop(discardWarningUrl)}
                className="h-8 px-3 text-xs bg-red-600 hover:bg-red-700 text-white"
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ImageManagement;

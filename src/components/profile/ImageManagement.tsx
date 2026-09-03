
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Upload, Trash2, Shield, CheckCircle, RefreshCw, Camera, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/utils/imageCompression';
import FaceVerification from '@/components/FaceVerification';
import { fileToBase64 } from '@/utils/faceVerificationUtils';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import PhotoCropModal, { uploadCroppedPhoto } from './PhotoCropModal';

interface ImageManagementProps {
  currentUser: {
    id: string;
    email?: string;
  } | null;
  profile?: {
    face_descriptor?: string | null;
  } | null;
  onProfileUpdate?: () => void;
}

interface UserImage {
  image_url: string;
  is_approved?: boolean;
  moderation_status?: string;
}

interface ModerationDecision {
  status: 'approved' | 'rejected';
  message: string;
  hasFace?: boolean | null;
}

const ImageManagement = ({ currentUser, profile, onProfileUpdate }: ImageManagementProps) => {
  const { t } = useTranslation();
  const [userImages, setUserImages] = useState<UserImage[]>([]);
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
  const { toast } = useToast();

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
        .select('image_url, is_approved, moderation_status')
        .eq('user_id', currentUser.id)
        .neq('image_order', -1)
        .order('image_order', { ascending: true });

      if (error) throw error;

      setUserImages((images || []).map(img => ({
        image_url: img.image_url,
        is_approved: img.is_approved ?? true,
        moderation_status: img.moderation_status ?? 'approved'
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
      let decision: ModerationDecision;
      try {
        const imageBase64 = await fileToBase64(compressedFile);
        const { data: modData, error: modError } = await supabase.functions.invoke('moderate-image', {
          body: { imageId: insertedRow.id, imageBase64 },
        });

        if (modError || !modData?.success) {
          throw modError || new Error(modData?.error || 'Moderation check failed');
        }

        decision = { status: modData.status, message: modData.message, hasFace: modData.hasFace };
      } catch (modErr) {
        console.error('Moderation error:', modErr);
        // Fail open, not closed: the photo is already live (inserted above)
        // and only confirmed explicit content should ever pull it back down.
        decision = {
          status: 'approved',
          message: "This photo is live. Our automated check couldn't complete, so it's been queued for a quick manual glance.",
        };
      }

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
    <Card className="bg-black border-pink-500/30">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-white">
          <span className="flex items-center gap-2">
            {t('profile.photos')} ({userImages.length}/7)
            {isVerified && (
              <img
                loading="lazy"
                src="/images/verified.svg"
                alt="Verified"
                className="w-5 h-5"
              />
            )}
          </span>
          <Upload className="w-5 h-5 text-pink-600" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Face Verification Section - Only show if NOT verified */}
        {!isVerified && !showFaceVerification && (
          <div
            id="verify-identity-card"
            className="mb-4 bg-black border border-purple-500/30 rounded-lg p-3 flex flex-col items-center gap-2 text-center"
          >
            <p className="font-medium text-purple-300 text-sm">Verify Identity</p>
            <Button
              onClick={() => setShowFaceVerification(true)}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs h-7 px-4 rounded-full"
            >
              <Camera className="w-3 h-3 mr-1" />
              Verify
            </Button>
          </div>
        )}

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

        {/* Verified Badge Display */}
        {isVerified && (
          <div className="mb-4 bg-black border border-green-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-medium text-green-400 text-sm">Identity Verified</span>
            </div>
          </div>
        )}
        {userImages.length < 5 && (
          <div className="mb-6">
            <Label htmlFor="image_upload" className="block mb-2 text-gray-200">{t('profile.uploadImage')}</Label>

            {replacingImageUrl && (
              <div className="mb-2 p-2 bg-black border border-blue-500/30 rounded text-sm text-blue-300 flex items-center justify-between">
                <span>🔄 Replace mode active - Click to cancel and upload new image instead</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplacingImageUrl(null);
                    toast({
                      title: "Replace cancelled",
                      description: "You can now upload a new image normally.",
                      variant: "default"
                    });
                  }}
                  className="h-6 px-2 text-xs text-blue-300 hover:bg-blue-500/10"
                >
                  Cancel Replace
                </Button>
              </div>
            )}

            <Input
              type="file"
              id="image_upload"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading || moderating}
              className="w-full bg-black/40 border-pink-500/30 text-white file:text-white"
              onClick={() => {
                // Clear replace mode when user clicks the upload button directly
                if (replacingImageUrl) {
                  setReplacingImageUrl(null);
                }
              }}
            />
            {moderating && (
              <div className="text-sm text-purple-600 mt-2 flex items-center">
                <Shield className="animate-pulse w-4 h-4 mr-2" />
                Checking image content...
              </div>
            )}
            {uploading && (
              <div className="text-sm text-gray-400 mt-2 flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-pink-600 mr-2"></div>
                Uploading...
              </div>
            )}
            {moderationResult && !uploading && (
              <div className={`text-sm mt-2 flex items-center ${
                moderationResult.status === 'approved' ? 'text-green-600' : 'text-red-500'
              }`}>
                {moderationResult.status === 'approved' ? (
                  <CheckCircle className="w-4 h-4 mr-2" />
                ) : (
                  <Shield className="w-4 h-4 mr-2" />
                )}
                {moderationResult.message}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {userImages.map((userImage, index) => {
            const pending = pendingCrops[userImage.image_url];
            return (
            <div key={userImage.image_url} className="relative group">
              <img
                loading="lazy"
                decoding="async"
                src={pending ? pending.previewUrl : optimizeImageUrl(userImage.image_url, { width: 500, quality: 60 })}
                alt={`User Image ${index + 1}`}
                className="w-full h-28 sm:h-36 object-cover rounded-lg shadow-sm"
              />

              {/* Pending approval indicator */}
              {userImage.is_approved === false && !pending && (
                <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Reviewing...
                </div>
              )}

              {/* Unsaved crop - review, then explicitly Save or Cancel; nothing
                  else on this photo is actionable while a crop is pending. */}
              {pending ? (
                <>
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full">
                    Unsaved crop
                  </div>
                  <div className="absolute bottom-2 inset-x-2 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDiscardWarningUrl(userImage.image_url)}
                      disabled={savingCropUrl === userImage.image_url}
                      className="flex-1 h-7 px-2 text-xs bg-white border-pink-500/30 text-black hover:bg-gray-100 hover:text-black"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSavePendingCrop(userImage.image_url)}
                      disabled={savingCropUrl === userImage.image_url}
                      className="flex-1 h-7 px-2 text-xs bg-pink-600 hover:bg-pink-700 text-white"
                    >
                      {savingCropUrl === userImage.image_url ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </>
              ) : (
              <div className="absolute top-2 right-2 flex gap-1">
                {/* Crop - always available, on any photo */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCroppingImageUrl(userImage.image_url)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 bg-pink-600 hover:bg-pink-700 rounded-full shadow-md"
                  title="Crop photo"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                {/* Show Replace button if only 2 images remain, otherwise show Delete */}
                {userImages.length <= 2 ? (
                  <Button 
                    variant="default"
                    size="sm" 
                    onClick={() => handleReplaceImage(userImage.image_url)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 bg-blue-600 hover:bg-blue-700 rounded-full shadow-md"
                    title="Replace image"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                ) : (
                  <>
                    {/* Replace button - always available */}
                    <Button 
                      variant="default"
                      size="sm" 
                      onClick={() => handleReplaceImage(userImage.image_url)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 bg-blue-600 hover:bg-blue-700 rounded-full shadow-md"
                      title="Replace image"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                    
                    {/* Delete button - only when more than 2 images */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 rounded-full shadow-md"
                          title="Delete image"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="sm:max-w-md bg-black border border-pink-500/30 text-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">Delete Image</AlertDialogTitle>
                          <AlertDialogDescription className="text-gray-300">Are you sure you want to delete this image? This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-black border-pink-500/30 text-gray-200 hover:bg-neutral-800 hover:text-white">Cancel</AlertDialogCancel>
                          <AlertDialogAction disabled={deleting} onClick={() => handleDeleteImage(userImage.image_url)} className="bg-red-600 hover:bg-red-700">
                            {deleting ? 'Deleting...' : 'Delete'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
              )}
            </div>
            );
          })}
        </div>

        {userImages.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p>No photos uploaded yet</p>
            <p className="text-sm">Upload your first photo to get started!</p>
          </div>
        )}
      </CardContent>

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
            <p className="text-xs text-gray-300 mb-4">Your cropped photo hasn't been saved yet.</p>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDiscardWarningUrl(null)}
                className="h-8 px-3 text-xs bg-white border-pink-500/30 text-black hover:bg-gray-100 hover:text-black"
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
    </Card>
  );
};

export default ImageManagement;


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
import { Upload, Trash2, Shield, AlertTriangle, CheckCircle, RefreshCw, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { moderateImage, saveModerationResult, ModerationResult } from '@/utils/photoModeration';
import { compressImage } from '@/utils/imageCompression';
import FaceVerification from '@/components/FaceVerification';
import { detectHumanFace, verifyUploadedImage } from '@/utils/faceVerificationUtils';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

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

const ImageManagement = ({ currentUser, profile, onProfileUpdate }: ImageManagementProps) => {
  const { t } = useTranslation();
  const [userImages, setUserImages] = useState<UserImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [moderationResult, setModerationResult] = useState<ModerationResult | null>(null);
  const [replacingImageUrl, setReplacingImageUrl] = useState<string | null>(null);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [referenceFaceData, setReferenceFaceData] = useState<string | null>(null);
  const { toast } = useToast();

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
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            face_descriptor: data.faceId || 'verified',
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUser?.id);

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
      // Try to fetch with moderation columns first
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url, is_approved, moderation_status')
        .eq('user_id', currentUser.id)
        .order('image_order', { ascending: true });

      if (error && error.message.includes('does not exist')) {
        // Fallback to basic fetch if moderation columns don't exist yet
        const { data: basicImages, error: basicError } = await supabase
          .from('user_images')
          .select('image_url, image_order')
          .eq('user_id', currentUser.id)
          .order('image_order', { ascending: true });
        
        if (basicError) throw basicError;
        setUserImages(basicImages?.map(img => ({ 
          image_url: img.image_url,
          is_approved: img.image_order === -1 ? false : true, // -1 means pending
          moderation_status: img.image_order === -1 ? 'pending' : 'approved'
        })) || []);
      } else if (error) {
        throw error;
      } else if (images) {
        // Type assertion for the successful case - convert via unknown first
        const typedImages = images as unknown as Array<{
          image_url: string;
          is_approved?: boolean;
          moderation_status?: string;
        }>;
        
        setUserImages(typedImages.map(img => ({
          image_url: img.image_url,
          is_approved: img.is_approved ?? true,
          moderation_status: img.moderation_status ?? 'approved'
        })));
        
        // Load reference face from first approved image for face verification
        if (isVerified && typedImages.length > 0) {
          const firstImage = typedImages[0];
          if ((firstImage.is_approved ?? true) && firstImage.image_url) {
            try {
              const response = await fetch(firstImage.image_url);
              const blob = await response.blob();
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).replace(/^data:image\/\w+;base64,/, '');
                setReferenceFaceData(base64);
              };
              reader.readAsDataURL(blob);
            } catch (err) {
              console.error('Failed to load reference face:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user images:', error);
    }
  }, [currentUser?.id, isVerified]);

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

    let moderationResult: ModerationResult | null = null;
    
    // Determine if this image requires face verification
    // Face verification is required for:
    // 1. Replacing images at positions 1 or 2 (imageOrder 1 or 2)
    // 2. Adding new images when total count is < 2
    let targetImageOrder = 0;
    let requiresFaceVerification = false;
    
    if (replacingImageUrl) {
      // Find the order of the image being replaced
      const existingImage = userImages.findIndex(img => img.image_url === replacingImageUrl);
      targetImageOrder = existingImage + 1; // Convert to 1-indexed
      requiresFaceVerification = targetImageOrder <= 2;
    } else {
      // New image - check if we're adding to first 2 positions
      targetImageOrder = userImages.length + 1;
      requiresFaceVerification = targetImageOrder <= 2;
    }

    try {
      moderationResult = await moderateImage(compressedFile);
      
      // For first 2 image positions, verify face matches the user's verified face
      if (requiresFaceVerification && moderationResult.isApproved) {
        if (isVerified && referenceFaceData) {
          // User is verified - compare with their verified face
          const faceResult = await verifyUploadedImage(
            compressedFile,
            referenceFaceData,
            targetImageOrder - 1, // Convert to 0-indexed
            true // User is verified
          );
          
          if (faceResult.requiresReview) {
            // Face doesn't match or no face detected - send to review
            moderationResult.details = {
              ...moderationResult.details,
              requiresReview: true,
              faceVerificationFailed: true,
              faceVerificationReason: faceResult.reason || 'Face does not match your verified face'
            };
            toast({ 
              title: "Image needs review", 
              description: "First 2 photos must show your verified face. This image will be reviewed by our team.", 
              variant: "default" 
            });
          }
        } else if (isVerified && !referenceFaceData) {
          // User is verified but we couldn't load reference face - fallback to face detection
          const faceDetection = await detectHumanFace(compressedFile);
          if (!faceDetection.hasFace) {
            moderationResult.details = {
              ...moderationResult.details,
              requiresReview: true,
              faceVerificationFailed: true,
              faceVerificationReason: 'First 2 photos must show your face clearly'
            };
            toast({ 
              title: "Image needs review", 
              description: "Your first 2 photos must show your face. This image will be reviewed by our team.", 
              variant: "default" 
            });
          }
        } else {
          // User is not verified - shouldn't happen but handle gracefully
          const faceDetection = await detectHumanFace(compressedFile);
          if (!faceDetection.hasFace) {
            moderationResult.details = {
              ...moderationResult.details,
              requiresReview: true,
              faceVerificationFailed: true,
              faceVerificationReason: 'Face verification required'
            };
            toast({ 
              title: "Image needs review", 
              description: "Please complete face verification first.", 
              variant: "default" 
            });
          }
        }
      }
      
      // For images at position 3+, check if it's a human figure
      if (!requiresFaceVerification && moderationResult.isApproved) {
        const faceDetection = await detectHumanFace(compressedFile);
        if (!faceDetection.hasFace) {
          // No human figure detected - send to review
          moderationResult.details = {
            ...moderationResult.details,
            requiresReview: true,
            noHumanDetected: true
          };
          toast({ 
            title: "Image uploaded", 
            description: "No human figure detected. This image will be reviewed by our team.", 
            variant: "default" 
          });
        }
      }
      
      setModerationResult(moderationResult);
      
      // Only block if image is completely rejected (not approved)
      if (!moderationResult.isApproved) {
        toast({ 
          title: "Image rejected", 
          description: moderationResult.message || "This image cannot be uploaded.", 
          variant: "destructive" 
        });
        setModerating(false);
        event.target.value = '';
        return;
      }
      
      // Show info toast if image requires review (and we haven't already shown a toast)
      if (moderationResult.details?.requiresReview && 
          !moderationResult.details?.faceVerificationFailed &&
          !moderationResult.details?.noHumanDetected) {
        toast({ 
          title: "Image uploaded", 
          description: "Your image has been uploaded but requires admin approval before being visible to others.", 
          variant: "default" 
        });
      }

    } catch (error) {
      console.error('Moderation error:', error);
      // STRICT: If moderation fails, require manual review
      moderationResult = {
        isApproved: false, // Changed to false - no auto-approval on error
        confidence: 0,
        flags: ['MODERATION_FAILED'],
        details: { requiresReview: true },
        message: "Moderation check failed - image requires admin review before approval"
      };
    }

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

        const imageOrder = existingImage?.image_order || 1;

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

        // Determine if image needs review
        const requiresReview = moderationResult?.details?.requiresReview || false;
        
        // Insert new image with the same order
        const insertData = {
          user_id: currentUser.id, 
          image_url: publicUrl, 
          image_order: imageOrder,
          is_approved: !requiresReview,
          moderation_status: requiresReview ? 'pending' : 'approved',
          moderation_notes: requiresReview 
            ? `AI flagged: ${moderationResult?.message || 'Requires manual review'}`
            : `Auto-approved: ${moderationResult?.message || 'Passed content guidelines'}`,
          flagged_content: moderationResult?.flags || [],
          confidence_score: Math.round(moderationResult?.confidence || 50)
        };

        const { error: dbError } = await supabase
          .from('user_images')
          .insert(insertData);

        if (dbError) throw dbError;

        // Clear replacing state
        setReplacingImageUrl(null);

        toast({ 
          title: "✅ Image replaced successfully", 
          description: requiresReview 
            ? "Your new image requires admin review before being visible to others."
            : "Your image has been replaced and is now visible to others.",
          variant: "default"
        });
      } else {
        // Normal upload flow (not replacing)
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

        // Determine if image needs review
        const requiresReview = moderationResult?.details?.requiresReview || false;
        
        // Prepare insert data
        const insertData = {
          user_id: currentUser.id, 
          image_url: publicUrl, 
          image_order: nextImageOrder,
          is_approved: !requiresReview,
          moderation_status: requiresReview ? 'pending' : 'approved',
          moderation_notes: requiresReview 
            ? `AI flagged: ${moderationResult?.message || 'Requires manual review'}`
            : `Auto-approved: ${moderationResult?.message || 'Passed content guidelines'}`,
          flagged_content: moderationResult?.flags || [],
          confidence_score: Math.round(moderationResult?.confidence || 50)
        };

        // Insert to database
        const { error: dbError } = await supabase
          .from('user_images')
          .insert(insertData);

        if (dbError) {
          console.error('Error inserting image:', dbError);
          throw dbError;
        }
          
        // Show appropriate success message AFTER successful upload
        if (requiresReview) {
          toast({ 
            title: "🔒 Image uploaded - Pending approval", 
            description: "Your image requires admin review before others can see it.",
            variant: "default"
          });
        } else {
          toast({ 
            title: "✅ Image uploaded successfully", 
            description: "Your image has been approved and is now visible to others.",
            variant: "default"
          });
        }
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
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
          <div className="mb-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-purple-800 text-sm">Get Verified</p>
                <p className="text-xs text-purple-600">Verified profiles get more matches!</p>
              </div>
              <Button
                onClick={() => setShowFaceVerification(true)}
                size="sm"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs px-3"
              >
                <Shield className="w-3 h-3 mr-1" />
                Verify
              </Button>
            </div>
          </div>
        )}

        {/* Face Verification Camera View */}
        {showFaceVerification && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-purple-800 text-sm flex items-center gap-2">
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
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-800 text-sm">Identity Verified</span>
            </div>
          </div>
        )}
        {userImages.length < 5 && (
          <div className="mb-6">
            <Label htmlFor="image_upload" className="block mb-2">{t('profile.uploadImage')}</Label>
            
            {replacingImageUrl && (
              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 flex items-center justify-between">
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
                  className="h-6 px-2 text-xs hover:bg-blue-100"
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
              className="w-full"
              onClick={() => {
                // Clear replace mode when user clicks the upload button directly
                if (replacingImageUrl) {
                  setReplacingImageUrl(null);
                }
              }}
            />
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
              <Shield className="w-3 h-3" />
              Pending images will be reviewed and approved within 24 hours or less for security.
            </p>
            {moderating && (
              <div className="text-sm text-purple-600 mt-2 flex items-center">
                <Shield className="animate-pulse w-4 h-4 mr-2" />
                Checking image content...
              </div>
            )}
            {uploading && (
              <div className="text-sm text-gray-500 mt-2 flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-pink-600 mr-2"></div>
                Uploading...
              </div>
            )}
            {moderationResult && !uploading && (
              <div className={`text-sm mt-2 flex items-center ${
                moderationResult.isApproved ? 'text-green-600' : 'text-red-600'
              }`}>
                {moderationResult.isApproved ? (
                  <CheckCircle className="w-4 h-4 mr-2" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                {moderationResult.message}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {userImages.map((userImage, index) => (
            <div key={userImage.image_url} className="relative group">
              <img loading="lazy" decoding="async" src={optimizeImageUrl(userImage.image_url, { width: 500, quality: 60 })} alt={`User Image ${index + 1}`} className="w-full h-28 sm:h-36 object-cover rounded-lg shadow-sm" />
              
              {/* Pending approval indicator */}
              {userImage.is_approved === false && (
                <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
                  🔒 Reviewing...
                </div>
              )}
              
              {/* Action buttons - top right corner */}
              <div className="absolute top-2 right-2 flex gap-1">
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
                      <AlertDialogContent className="sm:max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Image</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete this image? This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction disabled={deleting} onClick={() => handleDeleteImage(userImage.image_url)} className="bg-red-600 hover:bg-red-700">
                            {deleting ? 'Deleting...' : 'Delete'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {userImages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No photos uploaded yet</p>
            <p className="text-sm">Upload your first photo to get started!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImageManagement;

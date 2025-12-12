
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
import { Upload, Trash2, Shield, AlertTriangle, CheckCircle, RefreshCw, BadgeCheck, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { moderateImage, saveModerationResult, ModerationResult } from '@/utils/photoModeration';
import { compressImage } from '@/utils/imageCompression';
import FaceVerification from '@/components/FaceVerification';

interface ImageManagementProps {
  currentUser: {
    id: string;
    email?: string;
  } | null;
}

interface UserImage {
  image_url: string;
  is_approved?: boolean;
  moderation_status?: string;
}

interface ProfileData {
  first_name: string;
  last_name: string;
  face_descriptor: string | null;
}

const ImageManagement = ({ currentUser }: ImageManagementProps) => {
  const { t } = useTranslation();
  const [userImages, setUserImages] = useState<UserImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [moderationResult, setModerationResult] = useState<ModerationResult | null>(null);
  const [replacingImageUrl, setReplacingImageUrl] = useState<string | null>(null);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const { toast } = useToast();

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
      }
    } catch (error) {
  // ...removed log...
    }
  }, [currentUser?.id]);

  // Fetch profile data (including face verification status)
  const fetchProfileData = useCallback(async () => {
    if (!currentUser?.id) return;
    
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, face_descriptor')
        .eq('id', currentUser.id)
        .single();
      
      if (error) throw error;
      
      setProfileData(profile);
      setFaceVerified(!!profile?.face_descriptor);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchUserImages();
    fetchProfileData();
  }, [fetchUserImages, fetchProfileData, currentUser?.id]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Allow upload if replacing OR if under 7 images
    if (!replacingImageUrl && userImages.length >= 7) {
      toast({ title: "Maximum images reached", description: "You can upload a maximum of 7 images.", variant: "destructive" });
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

    // Step 1: Compress and convert to WebP first
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

    try {
      moderationResult = await moderateImage(compressedFile);
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
      
      // Show info toast if image requires review
      if (moderationResult.details?.requiresReview) {
        toast({ 
          title: "Image uploaded", 
          description: "Your image has been uploaded but requires admin approval before being visible to others.", 
          variant: "default" 
        });
      }

    } catch (error) {
  // ...removed log...
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(fileName, compressedFile, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from('user-photos')
        .getPublicUrl(fileName);

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
    // ...removed log...
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
    // ...removed log...
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
  // ...removed log...
      
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
      toast({ title: "Image deleted", description: "Your image has been deleted successfully." });
    } catch (error) {
  // ...removed log...
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

  // Handle face verification completion
  const handleFaceVerified = async (faceImage: string) => {
    if (!currentUser?.id || !profileData) return;
    
    try {
      // Index the face with user's name
      const { data, error } = await supabase.functions.invoke('face-verify', {
        body: {
          action: 'index_face',
          front: faceImage,
          userId: currentUser.id,
          userName: `${profileData.first_name} ${profileData.last_name}`
        }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        // Save the face descriptor indicator to profile
        await supabase
          .from('profiles')
          .update({ face_descriptor: data.faceId || 'verified' })
          .eq('id', currentUser.id);
        
        setFaceVerified(true);
        setShowFaceVerification(false);
        
        toast({
          title: "Face Verified!",
          description: "Your identity has been verified successfully.",
        });
        
        // Refresh profile data
        fetchProfileData();
      } else {
        throw new Error(data?.error || 'Verification failed');
      }
    } catch (error: any) {
      console.error('Face verification error:', error);
      toast({
        title: "Verification Failed",
        description: error.message || "Could not verify your face. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <span>Photos ({userImages.length}/7)</span>
            {faceVerified && (
              <span className="flex items-center gap-1 text-[10px] bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 px-2 py-1 rounded-full border border-green-200 shadow-sm">
                <BadgeCheck className="w-3 h-3 text-green-600" />
                <span className="font-medium">Verified ✨</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <div className="relative group">
              <Shield className="w-4 h-4 text-purple-600" />
              <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                {t('profile.aiContentModeration')}
              </div>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Face Verification Section */}
        {!faceVerified && (
          <div className="mb-4 p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100">
            {showFaceVerification ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-800 text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-600" />
                    Face Verification
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFaceVerification(false)}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                </div>
                <FaceVerification
                  onVerified={handleFaceVerified}
                />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-800 text-sm flex items-center gap-2">
                    <Camera className="w-4 h-4 text-purple-600" />
                    Verify Your Identity
                  </h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Show others you're real
                  </p>
                </div>
                <Button
                  onClick={() => setShowFaceVerification(true)}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs h-8 px-3"
                  size="sm"
                >
                  Verify
                </Button>
              </div>
            )}
          </div>
        )}

        {userImages.length < 7 && (
          <div className="mb-4">
            {replacingImageUrl && (
              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center justify-between">
                <span>🔄 Replace mode - Select new image</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setReplacingImageUrl(null);
                    toast({ 
                      title: "Replace cancelled", 
                      description: "You can now upload normally.",
                      variant: "default"
                    });
                  }}
                  className="h-6 px-2 text-xs hover:bg-blue-100"
                >
                  Cancel
                </Button>
              </div>
            )}
         
            <Input 
              type="file" 
              id="image_upload" 
              accept="image/*" 
              onChange={handleImageUpload} 
              disabled={uploading || moderating} 
              className="w-full text-sm"
              onClick={() => {
                if (replacingImageUrl) {
                  setReplacingImageUrl(null);
                }
              }}
            />
            {moderating && (
              <div className="text-xs text-purple-600 mt-2 flex items-center">
                <Shield className="animate-pulse w-3 h-3 mr-1.5" />
                Checking...
              </div>
            )}
            {uploading && (
              <div className="text-xs text-gray-500 mt-2 flex items-center">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-pink-600 mr-1.5"></div>
                Uploading...
              </div>
            )}
            {moderationResult && !uploading && (
              <div className={`text-xs mt-2 flex items-center ${
                moderationResult.isApproved ? 'text-green-600' : 'text-red-600'
              }`}>
                {moderationResult.isApproved ? (
                  <CheckCircle className="w-3 h-3 mr-1.5" />
                ) : (
                  <AlertTriangle className="w-3 h-3 mr-1.5" />
                )}
                {moderationResult.message}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {userImages.map((userImage, index) => (
            <div key={userImage.image_url} className="relative group">
              <img 
                src={userImage.image_url} 
                alt={`Photo ${index + 1}`} 
                className="w-full h-28 sm:h-36 object-cover rounded-lg shadow-sm bg-gray-200"
                loading="lazy"
                onLoad={(e) => {
                  // Successfully loaded - ensure visible
                  const target = e.target as HTMLImageElement;
                  target.style.opacity = '1';
                }}
                onError={(e) => {
                  // Retry loading the image with cache-busting
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.retried) {
                    target.dataset.retried = 'true';
                    const separator = userImage.image_url.includes('?') ? '&' : '?';
                    target.src = `${userImage.image_url}${separator}t=${Date.now()}`;
                  } else if (!target.dataset.retried2) {
                    // Second retry with longer delay
                    target.dataset.retried2 = 'true';
                    setTimeout(() => {
                      const sep = userImage.image_url.includes('?') ? '&' : '?';
                      target.src = `${userImage.image_url}${sep}t=${Date.now()}&retry=2`;
                    }, 1000);
                  } else {
                    // Show placeholder on final failure
                    target.style.display = 'none';
                    target.insertAdjacentHTML('afterend', 
                      '<div class="w-full h-28 sm:h-36 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs">Loading...</div>'
                    );
                  }
                }}
              />
              
              {/* Pending approval indicator */}
              {userImage.is_approved === false && (
                <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                  <div className="bg-orange-500/90 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                    <Shield className="w-3 h-3" />
                    <span>Reviewing</span>
                  </div>
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

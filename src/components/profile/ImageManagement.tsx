
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Upload, Trash2, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { moderateImage, saveModerationResult, ModerationResult } from '@/utils/photoModeration';
import { compressImage } from '@/utils/imageCompression';
import { bulkApproveExistingImages } from '@/utils/bulkApproveImages';

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

const ImageManagement = ({ currentUser }: ImageManagementProps) => {
  const [userImages, setUserImages] = useState<UserImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [moderationResult, setModerationResult] = useState<ModerationResult | null>(null);
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
      console.error('Error fetching user images:', error);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchUserImages();
    
    // Run bulk approval fix once when component mounts (only if needed)
    const hasRunBulkApproval = localStorage.getItem('bulk_approval_completed');
    if (!hasRunBulkApproval && currentUser?.id) {
      bulkApproveExistingImages().then(() => {
        localStorage.setItem('bulk_approval_completed', 'true');
        // Refresh images after bulk approval
        setTimeout(fetchUserImages, 1500);
      }).catch(error => {
        console.error('Bulk approval failed:', error);
        // Don't set completion flag if it failed
      });
    }
  }, [fetchUserImages, currentUser?.id]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (userImages.length >= 7) {
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

    // Step 1: Compress and convert to WebP before moderation
    setModerating(true);
    setModerationResult(null);

    // Compress image
    const compressedFile = await compressImage(file);

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
      console.error('❌ Moderation error:', error);
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
      
      // Get the next available image order
      const { data: existingImages, error: orderError } = await supabase
        .from('user_images')
        .select('image_order')
        .eq('user_id', currentUser.id)
        .order('image_order', { ascending: true });

      if (orderError) {
        console.error('Error fetching existing image orders:', orderError);
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
        console.error('❌ Database error:', dbError);
        throw dbError;
      }
        
      // Refresh the image list
      await fetchUserImages();
      
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
    } catch (error) {
      console.error('Image upload error:', error);
      
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
      event.target.value = '';
    }
  };

  const handleDeleteImage = async (imageUrl: string) => {
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
          console.warn('Storage deletion warning:', storageError);
          // Don't throw here as database deletion succeeded
        }
      }

      await fetchUserImages();
      toast({ title: "Image deleted", description: "Your image has been deleted successfully." });
    } catch (error) {
      console.error('Image deletion error:', error);
      toast({ title: "Error", description: "Failed to delete image. Please try again.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Your Photos ({userImages.length}/7)</span>
          <div className="flex items-center space-x-2">
            <div className="relative group">
              <Shield className="w-4 h-4 text-purple-600" />
              <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                AI Content Moderation Active
              </div>
            </div>
            <Upload className="w-5 h-5 text-pink-600" />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {userImages.length < 7 && (
          <div className="mb-6">
            <Label htmlFor="image_upload" className="block mb-2">Upload Image</Label>
         
            <Input 
              type="file" 
              id="image_upload" 
              accept="image/*" 
              onChange={handleImageUpload} 
              disabled={uploading || moderating} 
              className="w-full" 
            />
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
              <img src={userImage.image_url} alt={`User Image ${index + 1}`} className="w-full h-32 sm:h-40 object-cover rounded-lg shadow-sm" />
              
              {/* Pending approval indicator */}
              {userImage.is_approved === false && (
                <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
                  🔒 Pending Review, Max 24hrs
                </div>
              )}
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-8 w-8">
                    <Trash2 className="w-4 h-4" />
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

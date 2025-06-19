
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Upload, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ImageManagementProps {
  currentUser: any;
}

const ImageManagement = ({ currentUser }: ImageManagementProps) => {
  const [userImages, setUserImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserImages();
  }, [currentUser]);

  const fetchUserImages = async () => {
    if (!currentUser?.id) return;

    try {
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', currentUser.id)
        .order('image_order', { ascending: true });

      if (error) throw error;
      setUserImages(images?.map(img => img.image_url) || []);
    } catch (error) {
      console.error('Error fetching user images:', error);
    }
  };

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

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from('user-photos')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) throw new Error("Failed to generate public image URL");

      const publicUrl = urlData.publicUrl;
      const nextImageOrder = userImages.length + 1;

      const { error: dbError } = await supabase
        .from('user_images')
        .insert({ user_id: currentUser.id, image_url: publicUrl, image_order: nextImageOrder });

      if (dbError) throw dbError;

      await fetchUserImages();
      toast({ title: "Image uploaded", description: "Your image has been uploaded successfully." });
    } catch (error: any) {
      console.error('Image upload error:', error);
      toast({ title: "Upload failed", description: error.message || "Failed to upload image.", variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteImage = async (imageUrl: string) => {
    setDeleting(true);

    try {
      const urlParts = imageUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part === 'user-photos');
      if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        const filePath = urlParts.slice(bucketIndex + 1).join('/');
        await supabase.storage.from('user-photos').remove([filePath]);
      }

      await supabase
        .from('user_images')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('image_url', imageUrl);

      await fetchUserImages();
      toast({ title: "Image deleted", description: "Your image has been deleted successfully." });
    } catch (error: any) {
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
          <Upload className="w-5 h-5 text-pink-600" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {userImages.length < 7 && (
          <div className="mb-6">
            <Label htmlFor="image_upload" className="block mb-2">Upload Image</Label>
            <Input type="file" id="image_upload" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="w-full" />
            {uploading && <p className="text-sm text-gray-500 mt-2 flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-pink-600 mr-2"></div>Uploading...</p>}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {userImages.map((imageUrl, index) => (
            <div key={imageUrl} className="relative group">
              <img src={imageUrl} alt={`User Image ${index + 1}`} className="w-full h-32 sm:h-40 object-cover rounded-lg shadow-sm" />
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
                    <AlertDialogAction disabled={deleting} onClick={() => handleDeleteImage(imageUrl)} className="bg-red-600 hover:bg-red-700">
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

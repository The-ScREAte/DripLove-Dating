
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Upload, Camera, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProfilePageProps {
  currentUser: any;
  profile: any;
  onProfileUpdate: () => void;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate }: ProfilePageProps) => {
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<any[]>([]);
  const { toast } = useToast();

  const uploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data } = supabase.storage
        .from('user-images')
        .getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase
        .from('user_images')
        .insert({
          user_id: currentUser.id,
          image_url: data.publicUrl,
          image_order: images.length + 1
        });

      if (dbError) throw dbError;

      toast({
        title: "Success!",
        description: "Image uploaded successfully",
      });
      
      // Refresh images
      fetchImages();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const fetchImages = async () => {
    try {
      const { data, error } = await supabase
        .from('user_images')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('image_order');
      
      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error('Error fetching images:', error);
    }
  };

  React.useEffect(() => {
    if (currentUser?.id) {
      fetchImages();
    }
  }, [currentUser]);

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="w-6 h-6 text-pink-600" />
            <span>Profile</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
              <div className="space-y-3">
                <div>
                  <span className="font-medium">Name:</span> {profile.first_name} {profile.last_name}
                </div>
                <div>
                  <span className="font-medium">Email:</span> {profile.email}
                </div>
                <div>
                  <span className="font-medium">Location:</span> {profile.city}, {profile.country}
                </div>
                <div>
                  <span className="font-medium">Looking for:</span> {profile.preference}
                </div>
                {profile.bio && (
                  <div>
                    <span className="font-medium">Bio:</span> {profile.bio}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Interests</h3>
              <div className="flex flex-wrap gap-2">
                {profile.interests?.map((interest: string, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Camera className="w-6 h-6 text-pink-600" />
            <span>Photos ({images.length}/7)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {images.map((image, index) => (
              <div key={image.id} className="relative group">
                <img
                  src={image.image_url}
                  alt={`Profile ${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg"
                />
              </div>
            ))}
            
            {images.length < 7 && (
              <div className="relative">
                <input
                  type="file"
                  id="image-upload"
                  accept="image/*"
                  onChange={uploadImage}
                  disabled={uploading}
                  className="hidden"
                />
                <label
                  htmlFor="image-upload"
                  className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-pink-400 transition-colors"
                >
                  <div className="text-center">
                    {uploading ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <span className="text-sm text-gray-600">Add Photo</span>
                      </>
                    )}
                  </div>
                </label>
              </div>
            )}
          </div>
          
          <p className="text-sm text-gray-600">
            Add up to 7 photos to make your profile more attractive to potential matches.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;

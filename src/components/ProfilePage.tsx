
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Upload, Camera, X, Edit, Trash2, Settings, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProfilePageProps {
  currentUser: any;
  profile: any;
  onProfileUpdate: () => void;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate }: ProfilePageProps) => {
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    bio: '',
    city: '',
    country: '',
    distance_preference: 25,
    gender: '',
    relationship_intent: '',
    smoking: '',
    drinking: '',
    exercise_level: '',
    sleeping_schedule: '',
    occupation: '',
    industry: '',
    education_level: '',
    zip_code: '',
    introvert_extrovert: 3,
    spontaneous_planner: 3,
    messy_organized: 3,
    fun_fact: '',
    perfect_first_date: '',
    last_googled: ''
  });
  const { toast } = useToast();

  React.useEffect(() => {
    if (currentUser?.id) {
      fetchImages();
    }
    if (profile) {
      setEditData({
        bio: profile.bio || '',
        city: profile.city || '',
        country: profile.country || '',
        distance_preference: profile.distance_preference || 25,
        gender: profile.gender || '',
        relationship_intent: profile.relationship_intent || '',
        smoking: profile.smoking || '',
        drinking: profile.drinking || '',
        exercise_level: profile.exercise_level || '',
        sleeping_schedule: profile.sleeping_schedule || '',
        occupation: profile.occupation || '',
        industry: profile.industry || '',
        education_level: profile.education_level || '',
        zip_code: profile.zip_code || '',
        introvert_extrovert: profile.introvert_extrovert || 3,
        spontaneous_planner: profile.spontaneous_planner || 3,
        messy_organized: profile.messy_organized || 3,
        fun_fact: profile.fun_fact || '',
        perfect_first_date: profile.perfect_first_date || '',
        last_googled: profile.last_googled || ''
      });
    }
  }, [currentUser, profile]);

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

      const { data } = supabase.storage
        .from('user-images')
        .getPublicUrl(fileName);

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

  const deleteImage = async (imageId: string, imageUrl: string) => {
    try {
      // Extract the file path from the URL
      const urlParts = imageUrl.split('/');
      const fileName = urlParts.slice(-2).join('/'); // Get "userId/filename.ext"

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('user-images')
        .remove([fileName]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('user_images')
        .delete()
        .eq('id', imageId);

      if (dbError) throw dbError;

      toast({
        title: "Success!",
        description: "Image deleted successfully",
      });
      
      fetchImages();
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: "Error",
        description: "Failed to delete image",
        variant: "destructive",
      });
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

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update(editData)
        .eq('id', currentUser.id);

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Profile updated successfully",
      });
      
      setIsEditing(false);
      onProfileUpdate();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const { error } = await supabase.auth.admin.deleteUser(currentUser.id);
      
      if (error) throw error;

      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted",
      });
    } catch (error) {
      console.error('Error deleting account:', error);
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    }
  };

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
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <User className="w-6 h-6 text-pink-600" />
              <span>Profile</span>
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={() => setIsEditing(!isEditing)}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Edit className="w-4 h-4" />
                <span>{isEditing ? 'Cancel' : 'Edit'}</span>
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="flex items-center space-x-2">
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:block">Delete Account</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your account
                      and remove your data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700">
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
              <div className="space-y-3">
                <div>
                  <span className="font-medium">Name:</span> {profile.first_name} {profile.last_name}
                </div>
                <div>
                  <span className="font-medium">Email:</span> {profile.email}
                </div>
                <div>
                  <span className="font-medium">Age:</span> {new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear()} years old
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="edit-gender">Gender:</Label>
                      <Select value={editData.gender} onValueChange={(value) => setEditData({...editData, gender: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="man">Man</SelectItem>
                          <SelectItem value="woman">Woman</SelectItem>
                          <SelectItem value="non-binary">Non-binary</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="edit-city">City:</Label>
                      <Input
                        id="edit-city"
                        value={editData.city}
                        onChange={(e) => setEditData({...editData, city: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-country">Country:</Label>
                      <Input
                        id="edit-country"
                        value={editData.country}
                        onChange={(e) => setEditData({...editData, country: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-zip">Zip Code:</Label>
                      <Input
                        id="edit-zip"
                        value={editData.zip_code}
                        onChange={(e) => setEditData({...editData, zip_code: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {profile.gender && (
                      <div>
                        <span className="font-medium">Gender:</span> {profile.gender}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Location:</span> {profile.city}, {profile.country}
                    </div>
                    {profile.zip_code && (
                      <div>
                        <span className="font-medium">Zip Code:</span> {profile.zip_code}
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <span className="font-medium">Looking for:</span> {profile.preference}
                </div>
                
                {isEditing ? (
                  <div>
                    <Label htmlFor="edit-bio">Bio:</Label>
                    <textarea
                      id="edit-bio"
                      value={editData.bio}
                      onChange={(e) => setEditData({...editData, bio: e.target.value})}
                      className="mt-1 w-full p-2 border border-gray-300 rounded-md resize-none"
                      rows={3}
                    />
                  </div>
                ) : (
                  profile.bio && (
                    <div>
                      <span className="font-medium">Bio:</span> {profile.bio}
                    </div>
                  )
                )}
              </div>
            </div>
            
            {/* Lifestyle & Preferences */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Lifestyle & Preferences</h3>
              
              {isEditing && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <MapPin className="w-5 h-5 text-pink-600" />
                    <Label htmlFor="distance" className="font-medium">Discovery Distance</Label>
                  </div>
                  <div className="space-y-2">
                    <Input
                      id="distance"
                      type="range"
                      min="1"
                      max="100"
                      value={editData.distance_preference}
                      onChange={(e) => setEditData({...editData, distance_preference: parseInt(e.target.value)})}
                      className="w-full"
                    />
                    <div className="text-sm text-gray-600 text-center">
                      {editData.distance_preference} km radius
                    </div>
                  </div>
                </div>
              )}
              
              {!isEditing && (
                <div className="mb-4">
                  <span className="font-medium">Discovery Distance:</span> {profile.distance_preference || 25} km
                </div>
              )}

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <Label>Relationship Intent:</Label>
                    <Select value={editData.relationship_intent} onValueChange={(value) => setEditData({...editData, relationship_intent: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="What are you looking for?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="long-term">Long-term relationship</SelectItem>
                        <SelectItem value="friendship">Friendship</SelectItem>
                        <SelectItem value="casual">Casual dating</SelectItem>
                        <SelectItem value="marriage">Marriage</SelectItem>
                        <SelectItem value="exploring">Still exploring</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Smoking:</Label>
                    <Select value={editData.smoking} onValueChange={(value) => setEditData({...editData, smoking: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Do you smoke?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="occasionally">Occasionally</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Drinking:</Label>
                    <Select value={editData.drinking} onValueChange={(value) => setEditData({...editData, drinking: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Do you drink?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="socially">Socially</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Exercise Level:</Label>
                    <Select value={editData.exercise_level} onValueChange={(value) => setEditData({...editData, exercise_level: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="How often do you exercise?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Very active</SelectItem>
                        <SelectItem value="sometimes">Sometimes</SelectItem>
                        <SelectItem value="rarely">Rarely</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Sleep Schedule:</Label>
                    <Select value={editData.sleeping_schedule} onValueChange={(value) => setEditData({...editData, sleeping_schedule: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Are you a morning or night person?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="early-riser">Early riser</SelectItem>
                        <SelectItem value="night-owl">Night owl</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {profile.relationship_intent && (
                    <div>
                      <span className="font-medium">Looking for:</span> {profile.relationship_intent.replace('-', ' ')}
                    </div>
                  )}
                  {profile.smoking && (
                    <div>
                      <span className="font-medium">Smoking:</span> {profile.smoking}
                    </div>
                  )}
                  {profile.drinking && (
                    <div>
                      <span className="font-medium">Drinking:</span> {profile.drinking}
                    </div>
                  )}
                  {profile.exercise_level && (
                    <div>
                      <span className="font-medium">Exercise:</span> {profile.exercise_level}
                    </div>
                  )}
                  {profile.sleeping_schedule && (
                    <div>
                      <span className="font-medium">Sleep schedule:</span> {profile.sleeping_schedule.replace('-', ' ')}
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 mt-4">
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

          {/* Professional Information */}
          {isEditing && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Professional</h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="edit-occupation">Occupation:</Label>
                    <Input
                      id="edit-occupation"
                      value={editData.occupation}
                      onChange={(e) => setEditData({...editData, occupation: e.target.value})}
                      placeholder="Your job title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-industry">Industry:</Label>
                    <Input
                      id="edit-industry"
                      value={editData.industry}
                      onChange={(e) => setEditData({...editData, industry: e.target.value})}
                      placeholder="What industry do you work in?"
                    />
                  </div>
                  <div>
                    <Label>Education Level:</Label>
                    <Select value={editData.education_level} onValueChange={(value) => setEditData({...editData, education_level: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Your education level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high-school">High School</SelectItem>
                        <SelectItem value="some-college">Some College</SelectItem>
                        <SelectItem value="bachelors">Bachelor's Degree</SelectItem>
                        <SelectItem value="masters">Master's Degree</SelectItem>
                        <SelectItem value="phd">PhD</SelectItem>
                        <SelectItem value="trade-school">Trade School</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Conversation Starters</h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="edit-fun-fact">Fun Fact:</Label>
                    <textarea
                      id="edit-fun-fact"
                      value={editData.fun_fact}
                      onChange={(e) => setEditData({...editData, fun_fact: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md resize-none"
                      rows={2}
                      placeholder="Share something interesting about yourself"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-first-date">Perfect First Date:</Label>
                    <textarea
                      id="edit-first-date"
                      value={editData.perfect_first_date}
                      onChange={(e) => setEditData({...editData, perfect_first_date: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md resize-none"
                      rows={2}
                      placeholder="Describe your ideal first date"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-last-googled">Last Thing Googled:</Label>
                    <Input
                      id="edit-last-googled"
                      value={editData.last_googled}
                      onChange={(e) => setEditData({...editData, last_googled: e.target.value})}
                      placeholder="What did you search for recently?"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Display professional and conversation info when not editing */}
          {!isEditing && (profile.occupation || profile.industry || profile.education_level || profile.fun_fact || profile.perfect_first_date || profile.last_googled) && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(profile.occupation || profile.industry || profile.education_level) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Professional</h3>
                  <div className="space-y-2">
                    {profile.occupation && (
                      <div>
                        <span className="font-medium">Occupation:</span> {profile.occupation}
                      </div>
                    )}
                    {profile.industry && (
                      <div>
                        <span className="font-medium">Industry:</span> {profile.industry}
                      </div>
                    )}
                    {profile.education_level && (
                      <div>
                        <span className="font-medium">Education:</span> {profile.education_level.replace('-', ' ')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(profile.fun_fact || profile.perfect_first_date || profile.last_googled) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">About Me</h3>
                  <div className="space-y-2">
                    {profile.fun_fact && (
                      <div>
                        <span className="font-medium">Fun Fact:</span> {profile.fun_fact}
                      </div>
                    )}
                    {profile.perfect_first_date && (
                      <div>
                        <span className="font-medium">Perfect First Date:</span> {profile.perfect_first_date}
                      </div>
                    )}
                    {profile.last_googled && (
                      <div>
                        <span className="font-medium">Last Googled:</span> {profile.last_googled}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {isEditing && (
            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} className="bg-gradient-to-r from-pink-500 to-purple-600">
                Save Changes
              </Button>
            </div>
          )}
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
                <button
                  onClick={() => deleteImage(image.id, image.image_url)}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
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

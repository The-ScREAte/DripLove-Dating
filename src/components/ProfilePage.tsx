import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { User, Edit, Save, X, Upload, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import InterestsEditor from './InterestsEditor';

interface ProfilePageProps {
  currentUser: any;
  profile: any;
  onProfileUpdate: () => void;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate }: ProfilePageProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState({
    first_name: '',
    last_name: '',
    bio: '',
    city: '',
    country: '',
    distance_preference: 50,
    gender: '',
    preference: '',
    relationship_intent: '',
    smoking: '',
    drinking: '',
    exercise_level: '',
    sleeping_schedule: '',
    occupation: '',
    industry: '',
    education_level: '',
    zip_code: '',
    introvert_extrovert: 50,
    spontaneous_planner: 50,
    messy_organized: 50,
    fun_fact: '',
    perfect_first_date: '',
    last_googled: '',
    interests: [] as string[],
  });
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (profile) {
      setEditedProfile({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        bio: profile.bio || '',
        city: profile.city || '',
        country: profile.country || '',
        distance_preference: profile.distance_preference || 50,
        gender: profile.gender || '',
        preference: profile.preference || '',
        relationship_intent: profile.relationship_intent || '',
        smoking: profile.smoking || '',
        drinking: profile.drinking || '',
        exercise_level: profile.exercise_level || '',
        sleeping_schedule: profile.sleeping_schedule || '',
        occupation: profile.occupation || '',
        industry: profile.industry || '',
        education_level: profile.education_level || '',
        zip_code: profile.zip_code || '',
        introvert_extrovert: profile.introvert_extrovert || 50,
        spontaneous_planner: profile.spontaneous_planner || 50,
        messy_organized: profile.messy_organized || 50,
        fun_fact: profile.fun_fact || '',
        perfect_first_date: profile.perfect_first_date || '',
        last_googled: profile.last_googled || '',
        interests: profile.interests || [],
      });
    }
  }, [profile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSliderChange = (name: string, value: number[]) => {
    setEditedProfile(prev => ({ ...prev, [name]: value[0] }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      // Generate a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
      const filePath = `user-images/${fileName}`;

      // Upload the image to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('loveconnect')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL of the uploaded image
      const { data: { publicUrl } } = supabase.storage
        .from('loveconnect')
        .getPublicUrl(filePath);

      // Determine the order for the new image
      const { data: existingImages, error: imageFetchError } = await supabase
        .from('user_images')
        .select('image_order')
        .eq('user_id', currentUser.id)
        .order('image_order', { ascending: false })
        .limit(1);

      if (imageFetchError) {
        throw imageFetchError;
      }

      const nextImageOrder = (existingImages?.[0]?.image_order || 0) + 1;

      // Save the image URL and order in the database
      const { error: dbError } = await supabase
        .from('user_images')
        .insert({
          user_id: currentUser.id,
          image_url: publicUrl,
          image_order: nextImageOrder
        });

      if (dbError) {
        throw dbError;
      }

      toast({
        title: "Image uploaded",
        description: "Your image has been uploaded successfully.",
      });
    } catch (error: any) {
      console.error('Image upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      event.target.value = ''; // Reset the input
    }
  };

  const handleDeleteImage = async (imageUrl: string) => {
    setDeleting(true);

    try {
      // Extract the path from the URL
      const filePath = imageUrl.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/loveconnect/`, '');

      // Delete the image from Supabase storage
      const { error: storageError } = await supabase.storage
        .from('loveconnect')
        .remove([filePath]);

      if (storageError) {
        throw storageError;
      }

      // Delete the image record from the database
      const { error: dbError } = await supabase
        .from('user_images')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('image_url', imageUrl);

      if (dbError) {
        throw dbError;
      }

      toast({
        title: "Image deleted",
        description: "Your image has been deleted successfully.",
      });
    } catch (error: any) {
      console.error('Image deletion error:', error);
      toast({
        title: "Error",
        description: "Failed to delete image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: editedProfile.first_name,
          last_name: editedProfile.last_name,
          bio: editedProfile.bio,
          city: editedProfile.city,
          country: editedProfile.country,
          distance_preference: editedProfile.distance_preference,
          gender: editedProfile.gender,
          preference: editedProfile.preference,
          relationship_intent: editedProfile.relationship_intent,
          smoking: editedProfile.smoking,
          drinking: editedProfile.drinking,
          exercise_level: editedProfile.exercise_level,
          sleeping_schedule: editedProfile.sleeping_schedule,
          occupation: editedProfile.occupation,
          industry: editedProfile.industry,
          education_level: editedProfile.education_level,
          zip_code: editedProfile.zip_code,
          introvert_extrovert: editedProfile.introvert_extrovert,
          spontaneous_planner: editedProfile.spontaneous_planner,
          messy_organized: editedProfile.messy_organized,
          fun_fact: editedProfile.fun_fact,
          perfect_first_date: editedProfile.perfect_first_date,
          last_googled: editedProfile.last_googled,
          interests: editedProfile.interests,
        })
        .eq('id', currentUser.id);

      if (error) throw error;

      setIsEditing(false);
      onProfileUpdate();
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    }
  };

  const renderBasicInfo = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first_name">First Name</Label>
          <Input
            type="text"
            id="first_name"
            name="first_name"
            value={editedProfile.first_name}
            onChange={handleInputChange}
            disabled={!isEditing}
          />
        </div>
        <div>
          <Label htmlFor="last_name">Last Name</Label>
          <Input
            type="text"
            id="last_name"
            name="last_name"
            value={editedProfile.last_name}
            onChange={handleInputChange}
            disabled={!isEditing}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          value={editedProfile.bio}
          onChange={handleInputChange}
          disabled={!isEditing}
        />
      </div>
    </div>
  );

  const renderLocationInfo = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            type="text"
            id="city"
            name="city"
            value={editedProfile.city}
            onChange={handleInputChange}
            disabled={!isEditing}
          />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input
            type="text"
            id="country"
            name="country"
            value={editedProfile.country}
            onChange={handleInputChange}
            disabled={!isEditing}
          />
        </div>
      </div>
    </div>
  );

  const renderPreferences = () => (
    <div className="space-y-2">
      <div>
        <Label htmlFor="distance_preference">Distance Preference (km)</Label>
        <Slider
          id="distance_preference"
          name="distance_preference"
          defaultValue={[editedProfile.distance_preference]}
          onValueChange={(value) => handleSliderChange('distance_preference', value)}
          max={200}
          step={1}
          disabled={!isEditing}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gender">Gender</Label>
          <Select disabled={!isEditing} onValueChange={(value) => handleSelectChange('gender', value)}>
            <SelectTrigger id="gender">
              <SelectValue placeholder="Select" defaultValue={editedProfile.gender} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="preference">Preference</Label>
          <Select disabled={!isEditing} onValueChange={(value) => handleSelectChange('preference', value)}>
            <SelectTrigger id="preference">
              <SelectValue placeholder="Select" defaultValue={editedProfile.preference} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderLifestyleInfo = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="relationship_intent">Relationship Intent</Label>
          <Select disabled={!isEditing} onValueChange={(value) => handleSelectChange('relationship_intent', value)}>
            <SelectTrigger id="relationship_intent">
              <SelectValue placeholder="Select" defaultValue={editedProfile.relationship_intent} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="serious">Serious</SelectItem>
              <SelectItem value="open_to_anything">Open to Anything</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="smoking">Smoking</Label>
          <Select disabled={!isEditing} onValueChange={(value) => handleSelectChange('smoking', value)}>
            <SelectTrigger id="smoking">
              <SelectValue placeholder="Select" defaultValue={editedProfile.smoking} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="socially">Socially</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="drinking">Drinking</Label>
          <Select disabled={!isEditing} onValueChange={(value) => handleSelectChange('drinking', value)}>
            <SelectTrigger id="drinking">
              <SelectValue placeholder="Select" defaultValue={editedProfile.drinking} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="socially">Socially</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="exercise_level">Exercise Level</Label>
          <Select disabled={!isEditing} onValueChange={(value) => handleSelectChange('exercise_level', value)}>
            <SelectTrigger id="exercise_level">
              <SelectValue placeholder="Select" defaultValue={editedProfile.exercise_level} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="sleeping_schedule">Sleeping Schedule</Label>
        <Select disabled={!isEditing} onValueChange={(value) => handleSelectChange('sleeping_schedule', value)}>
          <SelectTrigger id="sleeping_schedule">
            <SelectValue placeholder="Select" defaultValue={editedProfile.sleeping_schedule} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="early_bird">Early Bird</SelectItem>
            <SelectItem value="night_owl">Night Owl</SelectItem>
            <SelectItem value="flexible">Flexible</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderWorkEducationInfo = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="occupation">Occupation</Label>
          <Input
            type="text"
            id="occupation"
            name="occupation"
            value={editedProfile.occupation}
            onChange={handleInputChange}
            disabled={!isEditing}
          />
        </div>
        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input
            type="text"
            id="industry"
            name="industry"
            value={editedProfile.industry}
            onChange={handleInputChange}
            disabled={!isEditing}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="education_level">Education Level</Label>
        <Input
          type="text"
          id="education_level"
          name="education_level"
          value={editedProfile.education_level}
          onChange={handleInputChange}
          disabled={!isEditing}
        />
      </div>
      <div>
        <Label htmlFor="zip_code">Zip Code</Label>
        <Input
          type="text"
          id="zip_code"
          name="zip_code"
          value={editedProfile.zip_code}
          onChange={handleInputChange}
          disabled={!isEditing}
        />
      </div>
    </div>
  );

  const renderPersonalityInfo = () => (
    <div className="space-y-2">
      <div>
        <Label htmlFor="introvert_extrovert">Introvert vs Extrovert</Label>
        <Slider
          id="introvert_extrovert"
          name="introvert_extrovert"
          defaultValue={[editedProfile.introvert_extrovert]}
          onValueChange={(value) => handleSliderChange('introvert_extrovert', value)}
          disabled={!isEditing}
        />
      </div>
      <div>
        <Label htmlFor="spontaneous_planner">Spontaneous vs Planner</Label>
        <Slider
          id="spontaneous_planner"
          name="spontaneous_planner"
          defaultValue={[editedProfile.spontaneous_planner]}
          onValueChange={(value) => handleSliderChange('spontaneous_planner', value)}
          disabled={!isEditing}
        />
      </div>
      <div>
        <Label htmlFor="messy_organized">Messy vs Organized</Label>
        <Slider
          id="messy_organized"
          name="messy_organized"
          defaultValue={[editedProfile.messy_organized]}
          onValueChange={(value) => handleSliderChange('messy_organized', value)}
          disabled={!isEditing}
        />
      </div>
    </div>
  );

  const renderFunQuestions = () => (
    <div className="space-y-2">
      <div>
        <Label htmlFor="fun_fact">Fun Fact</Label>
        <Input
          type="text"
          id="fun_fact"
          name="fun_fact"
          value={editedProfile.fun_fact}
          onChange={handleInputChange}
          disabled={!isEditing}
        />
      </div>
      <div>
        <Label htmlFor="perfect_first_date">Perfect First Date</Label>
        <Input
          type="text"
          id="perfect_first_date"
          name="perfect_first_date"
          value={editedProfile.perfect_first_date}
          onChange={handleInputChange}
          disabled={!isEditing}
        />
      </div>
      <div>
        <Label htmlFor="last_googled">Last Googled</Label>
        <Input
          type="text"
          id="last_googled"
          name="last_googled"
          value={editedProfile.last_googled}
          onChange={handleInputChange}
          disabled={!isEditing}
        />
      </div>
    </div>
  );

  const renderInterests = () => (
    <div className="space-y-2">
      <Label htmlFor="interests">Interests</Label>
      <InterestsEditor
        interests={isEditing ? editedProfile.interests || [] : profile?.interests || []}
        onInterestsChange={(interests) => {
          if (isEditing) {
            setEditedProfile(prev => ({ ...prev, interests }));
          }
        }}
        disabled={!isEditing}
      />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-6 h-6 text-pink-600" />
              <span>Your Profile</span>
            </CardTitle>
          </CardHeader>
        </Card>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)}><Edit className="w-4 h-4 mr-2" /> Edit Profile</Button>
        ) : (
          <div className="flex space-x-2">
            <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save</Button>
            <Button variant="outline" onClick={() => setIsEditing(false)}><X className="w-4 h-4 mr-2" /> Cancel</Button>
          </div>
        )}
      </div>

      {/* Basic Information Section */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          {renderBasicInfo()}
        </CardContent>
      </Card>

      {/* Location Information Section */}
      <Card>
        <CardHeader>
          <CardTitle>Location Information</CardTitle>
        </CardHeader>
        <CardContent>
          {renderLocationInfo()}
        </CardContent>
      </Card>

      {/* Preferences Section */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          {renderPreferences()}
        </CardContent>
      </Card>

      {/* Lifestyle Information Section */}
      <Card>
        <CardHeader>
          <CardTitle>Lifestyle</CardTitle>
        </CardHeader>
        <CardContent>
          {renderLifestyleInfo()}
        </CardContent>
      </Card>

      {/* Work & Education Information Section */}
      <Card>
        <CardHeader>
          <CardTitle>Work & Education</CardTitle>
        </CardHeader>
        <CardContent>
          {renderWorkEducationInfo()}
        </CardContent>
      </Card>

      {/* Personality Section */}
      <Card>
        <CardHeader>
          <CardTitle>Personality</CardTitle>
        </CardHeader>
        <CardContent>
          {renderPersonalityInfo()}
        </CardContent>
      </Card>

      {/* Fun Questions Section */}
      <Card>
        <CardHeader>
          <CardTitle>Fun Questions</CardTitle>
        </CardHeader>
        <CardContent>
          {renderFunQuestions()}
        </CardContent>
      </Card>

      {/* Interests Section */}
      <Card>
        <CardHeader>
          <CardTitle>Interests</CardTitle>
        </CardHeader>
        <CardContent>
          {renderInterests()}
        </CardContent>
      </Card>

      {/* Images Section */}
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="image_upload">Upload Image</Label>
            <Input
              type="file"
              id="image_upload"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
            />
            {uploading && <p className="text-sm text-gray-500">Uploading...</p>}
          </div>

          {/* Display User Images */}
          <div className="grid grid-cols-3 gap-4">
            {profile?.images?.map((imageUrl: string) => (
              <div key={imageUrl} className="relative">
                <img src={imageUrl} alt="User Image" className="w-full h-32 object-cover rounded-md" />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 hover:bg-gray-200">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the image from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction disabled={deleting} onClick={() => handleDeleteImage(imageUrl)}>
                        {deleting ? (
                          <>
                            Deleting...
                          </>
                        ) : (
                          <>
                            Delete
                          </>
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;

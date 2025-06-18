
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Edit, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BasicInfoSection from './profile/BasicInfoSection';
import LocationSection from './profile/LocationSection';
import PreferencesSection from './profile/PreferencesSection';
import LifestyleSection from './profile/LifestyleSection';
import WorkEducationSection from './profile/WorkEducationSection';
import PersonalitySection from './profile/PersonalitySection';
import FunQuestionsSection from './profile/FunQuestionsSection';
import InterestsSection from './profile/InterestsSection';
import ImageManagement from './profile/ImageManagement';
import AccountActions from './profile/AccountActions';
import ProfileSummaryCard from './ProfileSummaryCard';

interface ProfilePageProps {
  currentUser: any;
  profile: any;
  onProfileUpdate: () => void;
  onLogout: () => void;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate, onLogout }: ProfilePageProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

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

  useEffect(() => {
    if (profile) {
      console.log('Setting edited profile from:', profile);
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
    console.log('Input change:', name, value);
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSliderChange = (name: string, value: number[]) => {
    console.log('Slider change:', name, value[0]);
    setEditedProfile(prev => ({ ...prev, [name]: value[0] }));
  };

  const handleSelectChange = (name: string, value: string) => {
    console.log('Select change:', name, value);
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleInterestsChange = (interests: string[]) => {
    if (isEditing) {
      console.log('Interests change:', interests);
      setEditedProfile(prev => ({ ...prev, interests }));
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    
    try {
      console.log('Saving profile with data:', editedProfile);
      console.log('Current user ID:', currentUser.id);
      
      // Prepare the update data with proper validation
      const updateData = {
        first_name: editedProfile.first_name?.trim() || null,
        last_name: editedProfile.last_name?.trim() || null,
        bio: editedProfile.bio?.trim() || null,
        city: editedProfile.city?.trim() || null,
        country: editedProfile.country?.trim() || null,
        distance_preference: editedProfile.distance_preference || 25,
        gender: editedProfile.gender || null,
        preference: editedProfile.preference || null,
        relationship_intent: editedProfile.relationship_intent || null,
        smoking: editedProfile.smoking || null,
        drinking: editedProfile.drinking || null,
        exercise_level: editedProfile.exercise_level || null,
        sleeping_schedule: editedProfile.sleeping_schedule || null,
        occupation: editedProfile.occupation?.trim() || null,
        industry: editedProfile.industry?.trim() || null,
        education_level: editedProfile.education_level || null,
        zip_code: editedProfile.zip_code?.trim() || null,
        introvert_extrovert: editedProfile.introvert_extrovert || 50,
        spontaneous_planner: editedProfile.spontaneous_planner || 50,
        messy_organized: editedProfile.messy_organized || 50,
        fun_fact: editedProfile.fun_fact?.trim() || null,
        perfect_first_date: editedProfile.perfect_first_date?.trim() || null,
        last_googled: editedProfile.last_googled?.trim() || null,
        interests: Array.isArray(editedProfile.interests) ? editedProfile.interests : [],
        updated_at: new Date().toISOString(),
      };

      console.log('Update data being sent:', updateData);

      // Check if profile exists first
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      let result;
      if (existingProfile) {
        // Update existing profile
        result = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', currentUser.id)
          .select()
          .single();
      } else {
        // Insert new profile
        result = await supabase
          .from('profiles')
          .insert({
            id: currentUser.id,
            email: currentUser.email,
            ...updateData
          })
          .select()
          .single();
      }

      if (result.error) {
        console.error('Save error details:', result.error);
        throw result.error;
      }

      console.log('Profile saved successfully:', result.data);

      setIsEditing(false);
      onProfileUpdate();
      toast({
        title: "Profile updated",
        description: "Your AfroVibe profile has been saved successfully.",
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original profile data
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
    setIsEditing(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Card className="w-full sm:w-auto">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <User className="w-6 h-6 text-pink-600" />
              <span>Your AfroVibe Profile</span>
            </CardTitle>
          </CardHeader>
        </Card>
        {!isEditing ? (
          <Button 
            onClick={() => setIsEditing(true)}
            className="w-full sm:w-auto"
          >
            <Edit className="w-4 h-4 mr-2" /> 
            Edit Profile
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              <Save className="w-4 h-4 mr-2" /> 
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleCancel}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              <X className="w-4 h-4 mr-2" /> 
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Profile Summary */}
      <ProfileSummaryCard currentUser={currentUser} />

      {/* Image Management */}
      <ImageManagement currentUser={currentUser} />

      {/* Profile Sections */}
      <BasicInfoSection 
        editedProfile={editedProfile}
        isEditing={isEditing}
        onInputChange={handleInputChange}
      />

      <LocationSection 
        editedProfile={editedProfile}
        isEditing={isEditing}
        onInputChange={handleInputChange}
      />

      <PreferencesSection 
        editedProfile={editedProfile}
        isEditing={isEditing}
        onSliderChange={handleSliderChange}
        onSelectChange={handleSelectChange}
      />

      <LifestyleSection 
        editedProfile={editedProfile}
        isEditing={isEditing}
        onSelectChange={handleSelectChange}
      />

      <WorkEducationSection 
        editedProfile={editedProfile}
        isEditing={isEditing}
        onInputChange={handleInputChange}
      />

      <PersonalitySection 
        editedProfile={editedProfile}
        isEditing={isEditing}
        onSliderChange={handleSliderChange}
      />

      <FunQuestionsSection 
        editedProfile={editedProfile}
        isEditing={isEditing}
        onInputChange={handleInputChange}
      />

      <InterestsSection 
        editedProfile={editedProfile}
        profile={profile}
        isEditing={isEditing}
        onInterestsChange={handleInterestsChange}
      />

      {/* Account Actions */}
      <AccountActions 
        currentUser={currentUser}
        onLogout={onLogout}
      />
    </div>
  );
};

export default ProfilePage;

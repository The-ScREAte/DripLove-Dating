
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

interface ProfilePageProps {
  currentUser: any;
  profile: any;
  onProfileUpdate: () => void;
  onLogout: () => void;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate, onLogout }: ProfilePageProps) => {
  const [isEditing, setIsEditing] = useState(false);
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

  const handleInterestsChange = (interests: string[]) => {
    if (isEditing) {
      setEditedProfile(prev => ({ ...prev, interests }));
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

  // Show loading state while profile is being fetched
  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Card className="w-full sm:w-auto">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <User className="w-6 h-6 text-pink-600" />
              <span>Your Profile</span>
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
              className="w-full sm:w-auto"
            >
              <Save className="w-4 h-4 mr-2" /> 
              Save
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setIsEditing(false)}
              className="w-full sm:w-auto"
            >
              <X className="w-4 h-4 mr-2" /> 
              Cancel
            </Button>
          </div>
        )}
      </div>

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

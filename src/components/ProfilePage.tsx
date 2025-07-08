import React, { useState, useEffect, useRef } from 'react';
// Utility to calculate profile completion percentage
// Improved: Profile completion logic matches visible/required fields, and progress bar is more accurate
import { UserProfile } from '../types';

function getProfileCompletion(profile: UserProfile, imagesCount: number = 0) {
  // Only count fields that are actually visible/editable in the profile UI
  const fields = [
    profile.first_name,
    profile.last_name,
    profile.bio && profile.bio.length > 10,
    profile.city,
    profile.country,
    profile.gender && profile.gender !== 'not_specified',
    profile.preference && profile.preference !== 'not_specified',
    profile.relationship_intent && profile.relationship_intent !== 'open_to_anything',
    profile.occupation,
    profile.education_level,
    Array.isArray(profile.interests) && profile.interests.length > 0,
    imagesCount > 0,
  ];
  // Count true values
  const filled = fields.filter(Boolean).length;
  const total = fields.length;
  const percent = Math.min(100, Math.round((filled / total) * 100));
  return percent;
}
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Edit, Save, X, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
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
import PremiumUpgrade from './PremiumUpgrade';

interface ProfilePageProps {
  currentUser: UserProfile | null;
  profile: UserProfile;
  onProfileUpdate: () => void;
  onLogout: () => void;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate, onLogout }: ProfilePageProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const { toast } = useToast();
  const { subscription, loading: subscriptionLoading, isPremium } = useSubscription(currentUser?.id);

  const [editedProfile, setEditedProfile] = useState(() => ({
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
  }));
  const [imagesCount, setImagesCount] = useState(0);
  const [showProfileToast, setShowProfileToast] = useState(false);
  const profileToastShown = useRef(false);
  // Listen for image uploads (assume ImageManagement can call this via prop or event)
  // For now, we will just check profile?.images if available, else leave as 0
  useEffect(() => {
    if (profile && Array.isArray(profile.images)) {
      setImagesCount(profile.images.length);
    }
  }, [profile]);
  // Calculate completion
  const completion = getProfileCompletion(editedProfile, imagesCount);
  // Show a toast notification once per session if profile is incomplete
  useEffect(() => {
    if (completion < 100 && !profileToastShown.current) {
      setShowProfileToast(true);
      toast({
        title: 'Complete your profile',
        description: 'Finish your profile for better matches and more visibility!',
        variant: 'default',
        duration: 6000,
      });
      profileToastShown.current = true;
    }
  }, [completion, toast]);

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
    if (isSaving) return;
    setIsSaving(true);

    try {
      const updateData = {
        first_name: editedProfile.first_name?.trim() || null,
        last_name: editedProfile.last_name?.trim() || null,
        bio: editedProfile.bio?.trim() || null,
        city: editedProfile.city?.trim() || null,
        country: editedProfile.country?.trim() || null,
        date_of_birth: profile?.date_of_birth || currentUser?.user_metadata?.date_of_birth || '1990-01-01',
        email: currentUser.email,
        distance_preference: editedProfile.distance_preference || 25,
        gender: editedProfile.gender || 'not_specified',
        preference: editedProfile.preference || 'not_specified',
        relationship_intent: editedProfile.relationship_intent || 'open_to_anything',
        smoking: editedProfile.smoking || 'not_specified',
        drinking: editedProfile.drinking || 'not_specified',
        exercise_level: editedProfile.exercise_level || 'not_specified',
        sleeping_schedule: editedProfile.sleeping_schedule || 'not_specified',
        occupation: editedProfile.occupation?.trim() || null,
        industry: editedProfile.industry?.trim() || null,
        education_level: editedProfile.education_level || null,
        zip_code: editedProfile.zip_code?.trim() || null,
        introvert_extrovert:
          typeof editedProfile.introvert_extrovert === 'number' &&
          editedProfile.introvert_extrovert >= 0 &&
          editedProfile.introvert_extrovert <= 100
            ? editedProfile.introvert_extrovert
            : 50,
        spontaneous_planner:
          typeof editedProfile.spontaneous_planner === 'number' &&
          editedProfile.spontaneous_planner >= 0 &&
          editedProfile.spontaneous_planner <= 100
            ? editedProfile.spontaneous_planner
            : 50,
        messy_organized:
          typeof editedProfile.messy_organized === 'number' &&
          editedProfile.messy_organized >= 0 &&
          editedProfile.messy_organized <= 100
            ? editedProfile.messy_organized
            : 50,
        fun_fact: editedProfile.fun_fact?.trim() || null,
        perfect_first_date: editedProfile.perfect_first_date?.trim() || null,
        last_googled: editedProfile.last_googled?.trim() || null,
        interests: Array.isArray(editedProfile.interests) ? editedProfile.interests : [],
        updated_at: new Date().toISOString(),
      };

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .single();

      const profileExists = !!existingProfile;
      let result;

      if (profileExists) {
        const { data, error } = await supabase
          .from('profiles')
          .upsert({ id: currentUser.id, ...updateData })
          .select();
        if (error) throw new Error('Update failed: ' + error.message);
        result = data;
      } else {
        const { data, error } = await supabase
          .from('profiles')
          .insert({ id: currentUser.id, ...updateData })
          .select();
        if (error) throw new Error('Insert failed: ' + error.message);
        result = data;
      }

      setIsEditing(false);
      onProfileUpdate();
      toast({ title: 'Profile updated', description: 'Your AfroVibe profile has been saved successfully.' });
    } catch (error: unknown) {
      console.error('🚨 Save failed:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update profile.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
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

  if (showPremiumUpgrade) {
    return <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Profile Completion Progress Bar */}
      {completion < 100 && (
        <div className="w-full bg-yellow-100 border-b border-yellow-300 py-2 px-4 flex flex-col items-center animate-fade-in">
          <div className="w-full max-w-xl flex flex-col items-center">
            <div className="w-full bg-yellow-200 rounded-full h-3 mb-1 overflow-hidden">
              <div
                className="bg-gradient-to-r from-pink-400 to-yellow-400 h-3 rounded-full transition-all duration-500"
                style={{ width: `${completion}%` }}
              />
            </div>
            <div className="text-sm font-semibold text-yellow-700">
              Profile {completion}% complete
            </div>
            <div className="text-xs text-yellow-600 mt-1">Complete your profile for better, more accurate matches!</div>
          </div>
        </div>
      )}
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-2">
            <User className="w-6 h-6 text-pink-600" />
            <h1 className="text-2xl font-bold text-gray-800">Your AfroVibe Profile</h1>
          </div>
          <div className="flex flex-col gap-2 w-full">
          {!subscriptionLoading && !isPremium() && (
              <Button 
                onClick={() => setShowPremiumUpgrade(true)}
                className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold w-full sm:w-auto"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Premium
              </Button>
            )}
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} className="w-full sm:w-auto">
                <Edit className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
            ) : (
<div className="flex flex-col gap-2 w-full">
<Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                  <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={isSaving} className="w-full sm:w-auto">
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="max-w-4xl mx-auto space-y-6">
          <ProfileSummaryCard currentUser={currentUser} />
          <ImageManagement currentUser={currentUser} />
          <BasicInfoSection editedProfile={editedProfile} isEditing={isEditing} onInputChange={handleInputChange} />
          <LocationSection editedProfile={editedProfile} isEditing={isEditing} onInputChange={handleInputChange} />
          <PreferencesSection editedProfile={editedProfile} isEditing={isEditing} onSliderChange={handleSliderChange} onSelectChange={handleSelectChange} />
          <LifestyleSection editedProfile={editedProfile} isEditing={isEditing} onSelectChange={handleSelectChange} />
          <WorkEducationSection editedProfile={editedProfile} isEditing={isEditing} onInputChange={handleInputChange} />
          <PersonalitySection editedProfile={editedProfile} isEditing={isEditing} onSliderChange={handleSliderChange} />
          <FunQuestionsSection editedProfile={editedProfile} isEditing={isEditing} onInputChange={handleInputChange} />
          <InterestsSection editedProfile={editedProfile} profile={profile} isEditing={isEditing} onInterestsChange={handleInterestsChange} />
          <AccountActions currentUser={currentUser} onLogout={onLogout} />
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

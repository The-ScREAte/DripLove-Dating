import React, { useState, useEffect } from 'react';
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
  currentUser: any;
  profile: any;
  onProfileUpdate: () => void;
  onLogout: () => void;
  onShowTerms?: () => void;
  onShowPrivacy?: () => void;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate, onLogout, onShowTerms, onShowPrivacy }: ProfilePageProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const { toast } = useToast();
  const { subscription, loading: subscriptionLoading, isPremium } = useSubscription(currentUser?.id);

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
    } catch (error: any) {
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
    // Match LikedMePage: pass preselectedPlan="premium" for correct upgrade modal
    return (
      <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} preselectedPlan="premium" />
    );
  }

  // --- BEGIN: Improved Profile Progress Bar and Actionable Feedback ---
  // Calculate profile completion
  const requiredFields = [
    'first_name', 'last_name', 'bio', 'city', 'country', 'gender', 'preference',
    'relationship_intent', 'occupation', 'education_level', 'interests', 'images'
  ];
  const profileImages = profile?.images || [];
  const missingFields = requiredFields.filter(field => {
    if (field === 'interests') return !profile?.interests || profile.interests.length === 0;
    if (field === 'images') return !profileImages || profileImages.length === 0;
    return !profile?.[field] || (typeof profile[field] === 'string' && profile[field].trim() === '');
  });
  const completion = Math.round(((requiredFields.length - missingFields.length) / requiredFields.length) * 100);

  // --- END: Improved Profile Progress Bar and Actionable Feedback ---

  const [hideProfileCompletion, setHideProfileCompletion] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-2">
            <User className="w-6 h-6 text-pink-600" />
            <h1 className="text-2xl font-bold text-gray-800">Your AfroVibe Profile</h1>
          </div>
          <div className="flex flex-row gap-2 w-full">
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
              <div className="flex flex-row gap-2 w-full">
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
        {/* Profile Completion Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-3 bg-pink-500 transition-all duration-500"
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 min-w-[40px] text-right">{completion}%</span>
          </div>
          {missingFields.length > 0 && !hideProfileCompletion && (
            <div className="mt-2 text-xs text-yellow-700 bg-yellow-100 rounded px-3 py-2 relative">
              <button
                className="absolute top-2 right-2 text-yellow-700 hover:text-yellow-900 text-lg font-bold focus:outline-none"
                aria-label="Dismiss profile completion"
                onClick={() => setHideProfileCompletion(true)}
              >
                ×
              </button>
              <span className="font-semibold">Complete your profile:</span>
              <ul className="list-disc ml-5 mt-1">
                {missingFields.map(field => (
                  <li key={field}>{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>
                ))}
              </ul>
            </div>
          )}
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
          <AccountActions 
            currentUser={currentUser} 
            onLogout={onLogout} 
            onShowTerms={onShowTerms}
            onShowPrivacy={onShowPrivacy}
          />
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

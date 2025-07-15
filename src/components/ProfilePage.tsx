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
  const [hideProfileCompletion, setHideProfileCompletion] = useState(false);
  const { toast } = useToast();
  const { subscription, loading: subscriptionLoading, isPremium } = useSubscription(currentUser?.id);

  const [editedProfile, setEditedProfile] = useState({
    first_name: '',
    last_name: '',
    bio: '',
    city: '',
    country: '',
    country_code: '',
    max_distance: 50,
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
    latitude: null as number | null,
    longitude: null as number | null,
    is_custom_city: false,
    introvert_extrovert: 50,
    spontaneous_planner: 50,
    messy_organized: 50,
    fun_fact: '',
    perfect_first_date: '',
    last_googled: '',
    interests: [] as string[],
  });

  // Initialize userImages state
  const [userImages, setUserImages] = useState<any[]>([]);

  useEffect(() => {
    if (profile) {
      setEditedProfile({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        bio: profile.bio || '',
        city: profile.city || '',
        country: profile.country || '',
        country_code: profile.country_code || '',
        max_distance: profile.max_distance || profile.distance_preference || 50,
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
        latitude: profile.latitude || null,
        longitude: profile.longitude || null,
        is_custom_city: profile.is_custom_city || false,
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

  const handleLocationChange = (location: {
    country: string;
    countryCode: string;
    city: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
    isCustomCity?: boolean;
  }) => {
    setEditedProfile(prev => ({
      ...prev,
      country: location.country,
      country_code: location.countryCode,
      city: location.city,
      zip_code: location.zipCode,
      latitude: location.latitude,
      longitude: location.longitude,
      is_custom_city: location.isCustomCity || false,
    }));
  };

  const handleDistanceChange = (distance: number[]) => {
    setEditedProfile(prev => ({ ...prev, max_distance: distance[0] }));
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
        country_code: editedProfile.country_code?.trim() || null,
        date_of_birth: profile?.date_of_birth || currentUser?.user_metadata?.date_of_birth || '1990-01-01',
        email: currentUser.email,
        max_distance: editedProfile.max_distance || 50,
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
        latitude: editedProfile.latitude || null,
        longitude: editedProfile.longitude || null,
        is_custom_city: editedProfile.is_custom_city || false,
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
        country_code: profile.country_code || '',
        max_distance: profile.max_distance || profile.distance_preference || 50,
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
        latitude: profile.latitude || null,
        longitude: profile.longitude || null,
        is_custom_city: profile.is_custom_city || false,
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

  // --- BEGIN: Comprehensive Profile Progress Bar ---
  // Calculate profile completion based on specific criteria
  const calculateProfileCompletion = () => {
    if (!profile) return { completion: 0, missingFields: [], showVerifiedBadge: false };

    const completionCriteria = {
      // Your Photos (3 approved images)
      photos: {
        weight: 15,
        completed: false,
        description: "Upload 3 approved photos"
      },
      // Basic Information 
      basicInfo: {
        weight: 15,
        completed: false,
        description: "Complete basic information"
      },
      // Location & Matching Preferences
      location: {
        weight: 10,
        completed: false,
        description: "Set location and distance preferences"
      },
      // Preferences
      preferences: {
        weight: 10,
        completed: false,
        description: "Set gender preferences"
      },
      // Lifestyle
      lifestyle: {
        weight: 10,
        completed: false,
        description: "Complete lifestyle preferences"
      },
      // Work & Education
      workEducation: {
        weight: 10,
        completed: false,
        description: "Add work and education details"
      },
      // Personality
      personality: {
        weight: 10,
        completed: false,
        description: "Complete personality sliders"
      },
      // Fun Questions
      funQuestions: {
        weight: 10,
        completed: false,
        description: "Answer fun questions"
      },
      // Interests (at least 3)
      interests: {
        weight: 10,
        completed: false,
        description: "Select at least 3 interests"
      }
    };

    // Check Photos (3 approved images) - now safely check userImages
    const approvedImages = userImages?.filter(img => img.is_approved !== false) || [];
    completionCriteria.photos.completed = approvedImages.length >= 3;

    // Check Basic Information (first_name, last_name, bio, date_of_birth)
    completionCriteria.basicInfo.completed = !!(
      profile.first_name?.trim() &&
      profile.last_name?.trim() &&
      profile.bio?.trim() &&
      profile.date_of_birth
    );

    // Check Location & Matching Preferences (city, country, max_distance)
    completionCriteria.location.completed = !!(
      profile.city?.trim() &&
      profile.country?.trim() &&
      (profile.max_distance || profile.distance_preference)
    );

    // Check Preferences (gender, preference)
    completionCriteria.preferences.completed = !!(
      profile.gender &&
      profile.preference
    );

    // Check Lifestyle (smoking, drinking, exercise_level, sleeping_schedule)
    completionCriteria.lifestyle.completed = !!(
      profile.smoking &&
      profile.drinking &&
      profile.exercise_level &&
      profile.sleeping_schedule
    );

    // Check Work & Education (occupation, education_level)
    completionCriteria.workEducation.completed = !!(
      profile.occupation?.trim() &&
      profile.education_level
    );

    // Check Personality (personality sliders completed)
    completionCriteria.personality.completed = !!(
      typeof profile.introvert_extrovert === 'number' &&
      typeof profile.spontaneous_planner === 'number' &&
      typeof profile.messy_organized === 'number'
    );

    // Check Fun Questions (at least one question answered)
    completionCriteria.funQuestions.completed = !!(
      profile.fun_fact?.trim() ||
      profile.perfect_first_date?.trim() ||
      profile.last_googled?.trim()
    );

    // Check Interests (at least 3 selected)
    const userInterests = profile.interests || [];
    completionCriteria.interests.completed = userInterests.length >= 3;

    // Calculate total completion percentage
    let totalWeight = 0;
    let completedWeight = 0;
    const missingFields = [];

    Object.entries(completionCriteria).forEach(([key, criteria]) => {
      totalWeight += criteria.weight;
      if (criteria.completed) {
        completedWeight += criteria.weight;
      } else {
        missingFields.push(criteria.description);
      }
    });

    const completion = Math.round((completedWeight / totalWeight) * 100);

    // Show verified badge at 90% if photos and basic info are complete
    const showVerifiedBadge = completion >= 90 && 
                             completionCriteria.photos.completed && 
                             completionCriteria.basicInfo.completed;

    return { completion, missingFields, showVerifiedBadge };
  };

  const { completion, missingFields, showVerifiedBadge } = calculateProfileCompletion();

  // Fetch user images for photo completion calculation
  useEffect(() => {
    const fetchUserImages = async () => {
      if (!currentUser?.id) return;

      try {
        const { data: images, error } = await supabase
          .from('user_images')
          .select('image_url, is_approved, moderation_status')
          .eq('user_id', currentUser.id);

        if (error && !error.message.includes('does not exist')) {
          throw error;
        }

        setUserImages(images || []);
      } catch (error) {
        console.error('Error fetching user images for progress:', error);
        setUserImages([]);
      }
    };

    fetchUserImages();
  }, [currentUser?.id, profile]);

  // --- END: Comprehensive Profile Progress Bar ---

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         
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
        {/* Profile Completion Progress Bar - Always show */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-3 transition-all duration-500 ${
                  completion >= 90 ? 'bg-green-500' : 'bg-pink-500'
                }`}
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 min-w-[40px] text-right">{completion}%</span>
            {showVerifiedBadge && (
              <div className="flex items-center bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full ml-2">
                <span className="mr-1">✓</span>
                Verified
              </div>
            )}
          </div>
          {/* Only show completion notice when profile is not complete */}
          {completion < 100 && missingFields.length > 0 && !hideProfileCompletion && (
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
                {missingFields.map((field, index) => (
                  <li key={index}>{field}</li>
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
          <LocationSection 
            editedProfile={editedProfile} 
            isEditing={isEditing} 
            onInputChange={handleInputChange}
            onLocationChange={handleLocationChange}
            onDistanceChange={handleDistanceChange}
          />
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

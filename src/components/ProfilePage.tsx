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
    min_age: 18,
    max_age: 99,
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
      try {
        setEditedProfile({
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          bio: profile.bio || '',
          city: profile.city || '',
          country: profile.country || '',
          country_code: profile.country_code || '',
          max_distance: profile.max_distance || profile.distance_preference || 50,
          min_age: profile.min_age || 18,
          max_age: profile.max_age || 99,
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
          interests: Array.isArray(profile.interests) ? profile.interests : [],
        });
      } catch (error) {
        console.error('Error initializing profile data:', error);
        // Set default values if profile data is corrupted
        setEditedProfile({
          first_name: '',
          last_name: '',
          bio: '',
          city: '',
          country: '',
          country_code: '',
          max_distance: 50,
          min_age: 18,
          max_age: 99,
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
          latitude: null,
          longitude: null,
          is_custom_city: false,
          introvert_extrovert: 50,
          spontaneous_planner: 50,
          messy_organized: 50,
          fun_fact: '',
          perfect_first_date: '',
          last_googled: '',
          interests: [],
        });
      }
    }
  }, [profile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSliderChange = (name: string, value: number[]) => {
    setEditedProfile(prev => ({ ...prev, [name]: value[0] }));
  };

  const handleAgeRangeChange = (range: number[]) => {
    setEditedProfile(prev => ({ ...prev, min_age: range[0], max_age: range[1] }));
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
        min_age: editedProfile.min_age || 18,
        max_age: editedProfile.max_age || 99,
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
      toast({ title: 'Profile updated', description: 'Your DripLove profile has been saved successfully.' });
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
        min_age: profile.min_age || 18,
        max_age: profile.max_age || 99,
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

    try {
      // Check Photos (3 approved images) - now safely check userImages
      const approvedImages = userImages?.filter(img => img?.is_approved !== false) || [];
      completionCriteria.photos.completed = approvedImages.length >= 3;

      // Check Basic Information (first_name, last_name, bio, date_of_birth)
      completionCriteria.basicInfo.completed = !!(
        profile?.first_name?.trim() &&
        profile?.last_name?.trim() &&
        profile?.bio?.trim() &&
        profile?.date_of_birth
      );

      // Check Location & Matching Preferences (city, country, max_distance)
      completionCriteria.location.completed = !!(
        profile?.city?.trim() &&
        profile?.country?.trim() &&
        (profile?.max_distance || profile?.distance_preference)
      );

      // Check Preferences (gender, preference)
      completionCriteria.preferences.completed = !!(
        profile?.gender &&
        profile?.preference
      );

      // Check Lifestyle (smoking, drinking, exercise_level, sleeping_schedule)
      completionCriteria.lifestyle.completed = !!(
        profile?.smoking &&
        profile?.drinking &&
        profile?.exercise_level &&
        profile?.sleeping_schedule
      );

      // Check Work & Education (occupation, education_level)
      completionCriteria.workEducation.completed = !!(
        profile?.occupation?.trim() &&
        profile?.education_level
      );

      // Check Personality (personality sliders completed)
      completionCriteria.personality.completed = !!(
        typeof profile?.introvert_extrovert === 'number' &&
        typeof profile?.spontaneous_planner === 'number' &&
        typeof profile?.messy_organized === 'number'
      );

      // Check Fun Questions (at least one question answered)
      completionCriteria.funQuestions.completed = !!(
        profile?.fun_fact?.trim() ||
        profile?.perfect_first_date?.trim() ||
        profile?.last_googled?.trim()
      );

      // Check Interests (at least 3 selected)
      const userInterests = profile?.interests || [];
      completionCriteria.interests.completed = Array.isArray(userInterests) && userInterests.length >= 3;
    } catch (error) {
      console.error('Error calculating profile completion:', error);
    }

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
      if (!currentUser?.id) {
        setUserImages([]);
        return;
      }

      try {
        const { data: images, error } = await supabase
          .from('user_images')
          .select('image_url, is_approved, moderation_status')
          .eq('user_id', currentUser.id);

        if (error) {
          // Only log non-table existence errors
          if (!error.message.includes('does not exist') && !error.message.includes('relation') && !error.message.includes('table')) {
            console.error('Error fetching user images for progress:', error);
          }
          setUserImages([]);
          return;
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

  if (showPremiumUpgrade) {
    // Match LikedMePage: pass preselectedPlan="premium" for correct upgrade modal
    return (
      <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} preselectedPlan="premium" />
    );
  }

  // Safety check for required data
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50"> 
      {/* Sticky Header with Progress Bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex flex-row gap-3 w-full">
              {!isPremium() && (
                <Button
                  onClick={() => setShowPremiumUpgrade(true)}
                  className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-white font-semibold w-full sm:w-auto shadow-md hover:shadow-lg transition-all duration-200"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Premium
                </Button>
              )}
              {!isEditing ? (
                <Button 
                  onClick={() => setIsEditing(true)} 
                  className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white font-medium"
                >
                  <Edit className="w-4 h-4 mr-2" /> 
                  Edit Profile
                </Button>
              ) : (
                <div className="flex flex-row gap-3 w-full">
                  <Button 
                    onClick={handleSave} 
                    disabled={isSaving} 
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 mr-2" /> 
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleCancel} 
                    disabled={isSaving} 
                    className="w-full sm:w-auto border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X className="w-4 h-4 mr-2" /> 
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          {/* Profile Completion Progress Bar */}
          <div className="mt-6">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-2 transition-all duration-500 rounded-full ${
                    completion >= 90 ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-700 min-w-[45px] text-right">
                {completion}%
              </span>
              {showVerifiedBadge && (
                <div className="flex items-center bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full">
                  <span className="mr-1">✓</span>
                  Verified
                </div>
              )}
            </div>
            
            {/* Profile completion notice */}
            {completion < 100 && missingFields.length > 0 && !hideProfileCompletion && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 relative">
                <button
                  className="absolute top-2 right-3 text-blue-700 hover:text-blue-900 text-lg font-bold focus:outline-none"
                  aria-label="Dismiss profile completion"
                  onClick={() => setHideProfileCompletion(true)}
                >
                  ×
                </button>
                <div className="pr-8">
                  <h4 className="font-semibold text-blue-900 mb-2">Complete your profile to get better matches:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {missingFields.slice(0, 3).map((field, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {field}
                      </li>
                    ))}
                    {missingFields.length > 3 && (
                      <li className="text-blue-600 font-medium">
                        +{missingFields.length - 3} more items
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="max-w-4xl mx-auto p-6 pt-8 pb-12 space-y-8">
          <ProfileSummaryCard currentUser={currentUser} />
          <ImageManagement currentUser={currentUser} />
          <BasicInfoSection 
            editedProfile={editedProfile} 
            isEditing={isEditing} 
            onInputChange={handleInputChange} 
          />
          <LocationSection 
            editedProfile={editedProfile} 
            isEditing={isEditing} 
            onInputChange={handleInputChange}
            onLocationChange={handleLocationChange}
            onDistanceChange={handleDistanceChange}
          />
          <PreferencesSection 
            editedProfile={editedProfile} 
            isEditing={isEditing} 
            onSliderChange={handleSliderChange} 
            onSelectChange={handleSelectChange} 
            onAgeRangeChange={handleAgeRangeChange} 
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
          <AccountActions 
            currentUser={currentUser} 
            onLogout={onLogout} 
            onShowTerms={onShowTerms}
            onShowPrivacy={onShowPrivacy}
          />
        </div>
    </div>
  );
};

export default ProfilePage;

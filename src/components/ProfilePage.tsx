import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
// import { PushNotifications } from '@capacitor/push-notifications'; // Uncomment if you use PushNotifications
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
import AdinkraSection from './profile/AdinkraSection';
import ImageManagement from './profile/ImageManagement';
import AccountActions from './profile/AccountActions';
import ProfileSummaryCard from './ProfileSummaryCard';
import ReportButton from './ReportButton';
import LanguageSelector from './LanguageSelector';

import { calculateProfileCompletion } from '@/utils/profileCompletion';
import PremiumUpgrade from './PremiumUpgrade';
import CollapsibleSection from './ui/CollapsibleSection';
import { getLanguageForCountry } from '@/i18n/config';

interface ProfilePageProps {
  currentUser: any;
  profile: any;
  onProfileUpdate: () => void;
  onLogout: () => void;
  onShowTerms?: () => void;
  onShowPrivacy?: () => void;
  isPremium?: boolean;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate, onLogout, onShowTerms, onShowPrivacy, isPremium }: ProfilePageProps) => {
  const { t, i18n } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [hideProfileCompletion, setHideProfileCompletion] = useState(false);
  
  // State for collapsible sections
  const [showLocationSection, setShowLocationSection] = useState(false);
  const [showPreferencesSection, setShowPreferencesSection] = useState(false);
  const [showLifestyleSection, setShowLifestyleSection] = useState(false);
  const [showWorkEducationSection, setShowWorkEducationSection] = useState(false);
  const [showPersonalitySection, setShowPersonalitySection] = useState(false);
  const [showFunQuestionsSection, setShowFunQuestionsSection] = useState(false);
  const [showInterestsSection, setShowInterestsSection] = useState(false);
  const [showAdinkraSection, setShowAdinkraSection] = useState(false);
  const [showAccountActionsSection, setShowAccountActionsSection] = useState(false);
  const [showPhotoSection, setShowPhotoSection] = useState(false);
  
  const { toast } = useToast();
  const { subscription, loading: subscriptionLoading } = useSubscription(currentUser?.id);

  const [editedProfile, setEditedProfile] = useState({
    first_name: '',
    last_name: '',
    bio: '',
    city: '',
    country: '',
    country_code: '',
    max_distance: 250,
    min_age: 18,
    max_age: 40,
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
    adinkra_symbols: [] as string[],
    preferred_language: 'en',
  });

  // Initialize userImages state
  const [userImages, setUserImages] = useState<any[]>([]);

  useEffect(() => {
    if (profile) {
      try {
        // Auto-detect language based on country if not set
        const detectedLanguage = profile.preferred_language || getLanguageForCountry(profile.country) || 'en';
        
        // Update i18n language
        i18n.changeLanguage(detectedLanguage);
        
        setEditedProfile({
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          bio: profile.bio || '',
          city: profile.city || '',
          country: profile.country || '',
          country_code: profile.country_code || '',
          max_distance: profile.max_distance || profile.distance_preference || 250,
          min_age: profile.min_age || 18,
          max_age: profile.max_age || 40,
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
          adinkra_symbols: Array.isArray(profile.adinkra_symbols) ? profile.adinkra_symbols : [],
          preferred_language: detectedLanguage,
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
          max_distance: 250,
          min_age: 18,
          max_age: 40,
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
          adinkra_symbols: [],
          preferred_language: 'en',
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

  const handleAdinkraChange = (adinkra_symbols: string[]) => {
    if (isEditing) {
      setEditedProfile(prev => ({ ...prev, adinkra_symbols }));
    }
  };

  const handleLanguageChange = async (language: string) => {
    setEditedProfile(prev => ({ ...prev, preferred_language: language }));
    // Immediately change the app language when user selects
    i18n.changeLanguage(language);
    
    // Save to database immediately (no need to wait for "Save" button)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: language })
        .eq('id', currentUser.id);
      
      if (error) {
        console.error('Error saving language:', error);
        toast({
          title: "Error",
          description: "Failed to save language preference",
          variant: "destructive",
        });
      } else {
        console.log('Language saved successfully:', language);
        toast({
          title: "Language Updated! 🌍",
          description: "Your language preference has been saved.",
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('Error saving language:', error);
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
        max_distance: editedProfile.max_distance || 250,
        min_age: editedProfile.min_age || 18,
        max_age: editedProfile.max_age || 40,
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
        adinkra_symbols: Array.isArray(editedProfile.adinkra_symbols) ? editedProfile.adinkra_symbols : [],
        preferred_language: editedProfile.preferred_language || 'en',
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
  
  // Clear discover cache to force refresh with new settings
  if (typeof window !== 'undefined' && (window as any).discoverCache && currentUser?.id) {
    console.log('🔄 Clearing discover cache due to profile update');
    (window as any).discoverCache.delete(currentUser.id);
    
    // Show toast notification
    toast({
      title: "Profile Updated! 🎉",
      description: "Your changes have been saved. Visit DripCheck to see matches based on your new preferences!",
      duration: 5000,
    });
  }
  
  onProfileUpdate();
    } catch (error: any) {
      console.error('🚨 Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      const detectedLanguage = profile.preferred_language || getLanguageForCountry(profile.country) || 'en';
      setEditedProfile({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        bio: profile.bio || '',
        city: profile.city || '',
        country: profile.country || '',
        country_code: profile.country_code || '',
        max_distance: profile.max_distance || profile.distance_preference || 250,
        min_age: profile.min_age || 18,
        max_age: profile.max_age || 40,
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
        adinkra_symbols: profile.adinkra_symbols || [],
        preferred_language: detectedLanguage,
      });
    }
    setIsEditing(false);
  };

  // --- BEGIN: Comprehensive Profile Progress Bar ---
  // Calculate profile completion based on specific criteria
  const getProfileCompletion = () => {
    return calculateProfileCompletion(profile, userImages);
  };

  const { completion, missingFields, showVerifiedBadge } = getProfileCompletion();

  // Fetch user images for photo completion calculation
  useEffect(() => {
    const fetchUserImages = async () => {
      if (!currentUser?.id) {
        setUserImages([]);
        return;
      }

      try {
        // Only run PushNotifications code on native platforms
        if (Capacitor.getPlatform() !== 'web') {
          // Uncomment and use if you need to register for push notifications
          // await PushNotifications.register();
        }

        // This code always runs on all platforms
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
      <div className="h-full w-full bg-gray-50 flex items-center justify-center" style={{ minHeight: '100%' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
      <div className="h-full w-full bg-gray-50 overflow-x-hidden"
         style={{ 
           touchAction: 'pan-y', // allow horizontal gestures (e.g. slider drags) to be handled by child controls
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none',
           minHeight: '100%',
           position: 'relative'
         }}> 
      {/* Fixed Header with Progress Bar - completely fixed below main header */}
      <div
        className="fixed left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm"
        style={{
          // Start from where main header ends - pushed up higher
          top: 'clamp(56px, calc(env(safe-area-inset-top, 10px) + 36px), 86px)',
          paddingTop: '4px',
          width: '100%',
        }}
      >
  <div className="p-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex flex-row gap-3 w-full">
              {!isPremium && (
                <Button
                  onClick={() => setShowPremiumUpgrade(true)}
                  className="bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-white font-semibold w-full sm:w-auto shadow-md hover:shadow-lg transition-all duration-200"
                >
                  {t('premium.upgradeToPremium')}
                </Button>
              )}
              {/* Single toggle button - Edit becomes Cancel */}
              <Button 
                onClick={isEditing ? handleCancel : () => setIsEditing(true)}
                disabled={isSaving}
                className={`w-full sm:w-auto font-medium transition-all duration-200 ${
                  isEditing 
                    ? 'border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 bg-white border' 
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
                variant={isEditing ? 'outline' : 'default'}
              >
                {isEditing ? (
                  <>
                    <X className="w-4 h-4 mr-2" /> 
                    {t('common.cancel')}
                  </>
                ) : (
                  <>
                    <Edit className="w-4 h-4 mr-2" /> 
                    {t('common.edit')}
                  </>
                )}
              </Button>
              {/* Save button only shows when editing */}
              {isEditing && (
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving} 
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" /> 
                  {isSaving ? t('common.saving') : t('common.save')}
                </Button>
              )}
            </div>
          </div>
          
          {/* Profile Completion Progress Bar with Verified Badge */}
          <div className="mt-8">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-2 transition-all duration-500 rounded-full ${
                    completion >= 90 ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-700 min-w-[45px] text-right flex items-center justify-end gap-2">
                <span>{completion}%</span>
                {showVerifiedBadge && (
                  <img
                    src="/images/verified.svg"
                    alt="Verified profile"
                    title="Verified profile"
                    className="w-6 h-6"
                    aria-hidden="false"
                  />
                )}
              </span>
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
                  <h4 className="font-semibold text-blue-900 mb-2">{t('profile.completeProfilePrompt')}</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {missingFields.slice(0, 3).map((field, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {t(field)}
                      </li>
                    ))}
                    {missingFields.length > 3 && (
                      <li className="text-blue-600 font-medium">
                        +{missingFields.length - 3} {t('profile.moreItems')}
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content - with padding to account for fixed header */}
      <div 
        className="max-w-4xl mx-auto p-4 space-y-8 overflow-x-hidden w-full" 
        style={{ 
          paddingTop: '160px', 
          paddingBottom: Capacitor.getPlatform() === 'web'
            ? '120px'
            : 'clamp(120px, calc(env(safe-area-inset-bottom, 0px) + 120px), 150px)'
        }}
      >
        <div className="w-full max-w-full overflow-hidden">
          <div className="flex flex-col items-center gap-2 mb-2">
            <ProfileSummaryCard currentUser={currentUser} />
            {/* Show report button for other users' profiles only */}
            {currentUser?.id && profile?.id && currentUser.id !== profile.id && (
              <ReportButton
                reporterId={currentUser.id}
                reportedUserId={profile.id}
                contentType="profile"
                contentId={profile.id}
                className="mt-2"
              />
            )}
          </div>
          <BasicInfoSection 
            editedProfile={editedProfile} 
            isEditing={isEditing} 
            onInputChange={handleInputChange} 
          />
          <CollapsibleSection
            title={t('profile.photos')}
            isOpen={showPhotoSection}
            onToggle={() => setShowPhotoSection(!showPhotoSection)}
            className="mt-3"
          >
            <ImageManagement currentUser={currentUser} />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.location')}
            isOpen={showLocationSection}
            onToggle={() => setShowLocationSection(!showLocationSection)}
            className="mt-3"
          >
            <LocationSection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onInputChange={handleInputChange}
              onLocationChange={handleLocationChange}
              onDistanceChange={handleDistanceChange}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.preferences')}
            isOpen={showPreferencesSection}
            onToggle={() => setShowPreferencesSection(!showPreferencesSection)}
            className="mt-3"
          >
            <PreferencesSection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onSliderChange={handleSliderChange} 
              onSelectChange={handleSelectChange} 
              onAgeRangeChange={handleAgeRangeChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.lifestyle')}
            isOpen={showLifestyleSection}
            onToggle={() => setShowLifestyleSection(!showLifestyleSection)}
            className="mt-3"
          >
            <LifestyleSection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onSelectChange={handleSelectChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.workEducation')}
            isOpen={showWorkEducationSection}
            onToggle={() => setShowWorkEducationSection(!showWorkEducationSection)}
            className="mt-3"
          >
            <WorkEducationSection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onInputChange={handleInputChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.personality')}
            isOpen={showPersonalitySection}
            onToggle={() => setShowPersonalitySection(!showPersonalitySection)}
            className="mt-3"
          >
            <PersonalitySection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onSliderChange={handleSliderChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.funQuestions')}
            isOpen={showFunQuestionsSection}
            onToggle={() => setShowFunQuestionsSection(!showFunQuestionsSection)}
            className="mt-3"
          >
            <FunQuestionsSection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onInputChange={handleInputChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.interests')}
            isOpen={showInterestsSection}
            onToggle={() => setShowInterestsSection(!showInterestsSection)}
            className="mt-3"
          >
            <InterestsSection 
              editedProfile={editedProfile} 
              profile={profile} 
              isEditing={isEditing} 
              onInterestsChange={handleInterestsChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.adinkra')}
            isOpen={showAdinkraSection}
            onToggle={() => setShowAdinkraSection(!showAdinkraSection)}
            className="mt-3"
          >
            <AdinkraSection 
              editedProfile={editedProfile} 
              profile={profile} 
              isEditing={isEditing} 
              onAdinkraChange={handleAdinkraChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.accountActions')}
            isOpen={showAccountActionsSection}
            onToggle={() => setShowAccountActionsSection(!showAccountActionsSection)}
            className="mt-3"
          >
            {/* Only show the rest of the account actions here, not logout/terms/privacy */}
            <AccountActions 
              currentUser={currentUser} 
              hideLogoutTermsPrivacy={true} // Pass a prop to hide these actions
              onLogout={onLogout}
              preferredLanguage={editedProfile.preferred_language}
              onLanguageChange={handleLanguageChange}
            />
          </CollapsibleSection>
        </div>
        {/* Move Logout to the bottom of the page */}
        <div className="mt-2 flex flex-col items-center gap-4 w-full">
          <div className="flex justify-center w-full">
            <Button
              onClick={onLogout}
              className="w-full max-w-xs bg-gray-900 hover:bg-gray-800 text-white font-medium"
            >
              Log Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

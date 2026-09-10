import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
// import { PushNotifications } from '@capacitor/push-notifications'; // Uncomment if you use PushNotifications
import { Button } from '@/components/ui/button';
import { Crown, MessageCircle, ChevronDown, ChevronRight, Trash2, Gamepad2 } from 'lucide-react';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import CachedImage from '@/components/common/CachedImage';
import { PotentialMatch } from '@/types';
import ProfilePreviewModal from './profile/ProfilePreviewModal';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useAllowScreenshots } from '@/hooks/useAllowScreenshots';
import BasicInfoSection from './profile/BasicInfoSection';
import ProfileBasicsChips from './profile/ProfileBasicsChips';
import LocationSection from './profile/LocationSection';

import LifestyleSection from './profile/LifestyleSection';
import WorkEducationSection from './profile/WorkEducationSection';
import PersonalitySection from './profile/PersonalitySection';
import FunQuestionsSection from './profile/FunQuestionsSection';
import InterestsSection from './profile/InterestsSection';
import FavoritesSection from './profile/FavoritesSection';
import AdinkraSection from './profile/AdinkraSection';
import LanguagesSection from './profile/LanguagesSection';
import PetsSection from './profile/PetsSection';
import SocialMediaSection from './profile/SocialMediaSection';
import ImageManagement from './profile/ImageManagement';
import AdvertisementSection from './profile/AdvertisementSection';

import AccountActions from './profile/AccountActions';
import ProfileSummaryCard from './ProfileSummaryCard';
import ReportButton from './ReportButton';

import { calculateProfileCompletion } from '@/utils/profileCompletion';
import PremiumUpgrade from './PremiumUpgrade';
import CollapsibleSection from './ui/CollapsibleSection';
import { getLanguageForCountry } from '@/i18n/config';
import { occupationOptions, industryOptions, educationLevelOptions } from '@/constants/professionOptions';
import { FavoriteEntry, parseFavorites } from '@/constants/favorites';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type UserImageRow = {
  image_url: string | null
  is_approved: boolean | null
  moderation_status: string | null
}

// Default preference age range used whenever a profile is missing min_age/
// max_age (a brand-new profile, or one from before these fields existed) -
// was independently re-typed as "18"/"40" in five separate places.
const DEFAULT_PREFERENCE_MIN_AGE = 18;
const DEFAULT_PREFERENCE_MAX_AGE = 40;

type DiscoverCacheWindow = Window & {
  discoverCache?: {
    delete: (userId: string) => void
  },
  discoverForceRefresh?: () => void
}

type ProfileBroadcastMessage = {
  recipient_id: string;
  campaign_id: string;
  title: string;
  message: string;
  created_at: string;
  sent_at: string | null;
  profile_read_at: string | null;
};

interface ProfilePageProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentUser: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
  onProfileUpdate: () => void;
  onLogout: () => void;
  onShowTerms?: () => void;
  onShowPrivacy?: () => void;
  isPremium?: boolean;
  // Whether the Profile tab is the one currently visible in the bottom nav. Used to
  // reset the preview screen when the user navigates away, so switching back to this
  // tab always lands on the real profile instead of leaving the preview stuck open.
  isActiveTab?: boolean;
  // Bumped by MainApp every time the Profile nav icon is tapped, even if Profile was
  // already the active tab - covers the case of tapping it again while the preview
  // is open (isActiveTab alone wouldn't change in that case).
  profileTabSignal?: number;
  // Bumped by MainApp when the user taps "Advertise" on an ad card elsewhere in the
  // app - jumps straight to the Advertisement section with its create form open.
  advertiseSignal?: number;
  // Bumped by MainApp when the swipe-triggered "Verify Your Identity" prompt is
  // accepted - jumps straight to the Photos section, which shows the Verify card.
  verifySignal?: number;
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate, onLogout, onShowTerms, onShowPrivacy, isPremium, isActiveTab = true, profileTabSignal = 0, advertiseSignal = 0, verifySignal = 0 }: ProfilePageProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // Screenshots are blocked app-wide by default - Profile is one of the two
  // exemptions (the other is the mini-games), so protection is off for as
  // long as this tab is the one actually showing.
  useAllowScreenshots(isActiveTab);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [hideProfileCompletion, setHideProfileCompletion] = useState(false);
  
  // State for collapsible sections - accordion style (only one open at a time)
  const [openSection, setOpenSection] = useState<string | null>(null);
  
  // Helper function to toggle sections (accordion behavior)
  const toggleSection = (sectionName: string) => {
    setOpenSection(prevSection => prevSection === sectionName ? null : sectionName);
  };

  // Scrolls the newly-opened section into view - whether it was opened via its
  // own header or via a ProfileBasicsChips tap further up the page, so the
  // user can actually see what just expanded instead of it opening off-screen.
  useEffect(() => {
    if (!openSection) return;
    const id = setTimeout(() => {
      document.getElementById(`section-${openSection}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(id);
  }, [openSection]);
  
  // Computed section states
  const showBasicInfoSection = openSection === 'basicInfo';
  const showLocationSection = openSection === 'location';
  const showLifestyleSection = openSection === 'lifestyle';
  const showWorkEducationSection = openSection === 'workEducation';
  const showPersonalitySection = openSection === 'personality';
  const showFunQuestionsSection = openSection === 'funQuestions';
  const showInterestsSection = openSection === 'interests';
  const showFavoritesSection = openSection === 'favorites';
  const showAdinkraSection = openSection === 'adinkra';
  const showLanguagesSection = openSection === 'languages';
  const showPetsSection = openSection === 'pets';
  const showSocialMediaSection = openSection === 'socialMedia';

  const showAccountActionsSection = openSection === 'accountActions';
  const showAdvertisementSection = openSection === 'advertisement';

  // Jump straight to the Advertisement section (with its create form open)
  // whenever "Advertise" is tapped on an ad card elsewhere in the app.
  const [advertiseFormSignal, setAdvertiseFormSignal] = useState(0);
  useEffect(() => {
    if (advertiseSignal > 0) {
      setOpenSection('advertisement');
      setAdvertiseFormSignal(prev => prev + 1);
    }
  }, [advertiseSignal]);

  // Jump straight to the Photos section (revealing the "Verify Identity" card)
  // whenever the swipe-triggered verify prompt is accepted elsewhere in the app.
  useEffect(() => {
    if (verifySignal > 0) {
      setOpenSection('photos');
      requestAnimationFrame(() => {
        document.getElementById('verify-identity-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [verifySignal]);

  const { toast } = useToast();
  // Premium status for this page's own UI comes from the `isPremium` prop
  // (set by MainApp) - this call is kept purely for its side effect of
  // refreshing the device's cached premium status (writeCachedPremiumStatus
  // inside useSubscription) whenever Profile is visited, so the cache stays
  // warm for other screens (e.g. Discover) even if the user never opens them
  // this session.
  useSubscription(currentUser?.id);

  const isOwnProfile = !!currentUser?.id && !!profile?.id && currentUser.id === profile.id;
  const [broadcastUnreadCount, setBroadcastUnreadCount] = useState(0);
  const [broadcastMessages, setBroadcastMessages] = useState<ProfileBroadcastMessage[]>([]);
  const [isLoadingBroadcastMessages, setIsLoadingBroadcastMessages] = useState(false);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());
  const [isProfileMessagesOpen, setIsProfileMessagesOpen] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  // Set by ProfilePreviewModal - it has an unsaved crop applied ("OK" but not
  // yet "Save"), which is about to be silently lost below since leaving
  // always unmounts it. There's no button here to intercept and block (the
  // tab has already switched by the time isActiveTab flips), so this is a
  // heads-up after the fact, not a confirm-before-you-leave gate.
  const hasPendingCropRef = useRef(false);

  // Navigating away from the Profile tab, or tapping the Profile nav icon again
  // while already on it, always drops back to the real profile - the preview
  // (and the premium-upgrade screen, if it was open) never gets left open in
  // the background, so coming back to this tab never lands on a stale screen.
  useEffect(() => {
    if (!isActiveTab) {
      if (showProfilePreview && hasPendingCropRef.current) {
        toast({
          title: 'Unsaved crop discarded',
          description: "You left the preview before saving your cropped photo, so it wasn't kept.",
        });
      }
      hasPendingCropRef.current = false;
      setShowProfilePreview(false);
      setShowPremiumUpgrade(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveTab]);
  useEffect(() => {
    if (showProfilePreview && hasPendingCropRef.current) {
      toast({
        title: 'Unsaved crop discarded',
        description: "You left the preview before saving your cropped photo, so it wasn't kept.",
      });
    }
    hasPendingCropRef.current = false;
    setShowProfilePreview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTabSignal]);

  const refreshBroadcastUnreadCount = async () => {
    if (!isOwnProfile) return;
    try {
      const { data, error } = await supabase.rpc('get_my_profile_broadcast_unread_count');
      if (error) throw error;
      setBroadcastUnreadCount(typeof data === 'number' ? data : Number(data) || 0);
    } catch (err) {
      console.error('[ProfilePage] Failed to fetch broadcast unread count:', err);
    }
  };

  const loadBroadcastMessages = async () => {
    if (!isOwnProfile) return;
    setIsLoadingBroadcastMessages(true);
    try {
      const { data, error } = await supabase.rpc('get_my_profile_broadcast_messages', {
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      setBroadcastMessages(((data as any) || []) as ProfileBroadcastMessage[]);
    } catch (err) {
      console.error('[ProfilePage] Failed to load broadcast messages:', err);
    } finally {
      setIsLoadingBroadcastMessages(false);
    }
  };

  const openProfileMessages = useCallback(() => {
    if (!isOwnProfile) return;
    // Open immediately for responsiveness
    setIsProfileMessagesOpen(true);
    // Don't mark as read here - badge drops only when user expands each message
  }, [isOwnProfile]);

  const deleteBroadcastMessage = async (recipientId: string) => {
    if (!isOwnProfile) return;
    try {
      const { data, error } = await supabase.rpc('delete_my_profile_broadcast_message', {
        p_recipient_id: recipientId,
      });
      if (error) throw error;
      if (data !== true) {
        throw new Error('Delete failed');
      }
      await loadBroadcastMessages();
      await refreshBroadcastUnreadCount();
      toast({
        title: 'Message deleted',
        description: 'The message has been removed',
      });
    } catch (err) {
      console.error('[ProfilePage] Failed to delete broadcast message:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete message',
        variant: 'destructive',
      });
    }
  };

  const toggleMessageExpanded = async (recipientId: string) => {
    const isCurrentlyExpanded = expandedMessageIds.has(recipientId);
    
    if (isCurrentlyExpanded) {
      // Collapse
      setExpandedMessageIds(new Set());
    } else {
      // Expand only this one (close others)
      setExpandedMessageIds(new Set([recipientId]));
      
      // Mark this specific message as read
      const message = broadcastMessages.find(m => m.recipient_id === recipientId);
      if (message && !message.profile_read_at) {
        const nowIso = new Date().toISOString();
        // Optimistic UI: mark read instantly + drop badge
        setBroadcastMessages(prev =>
          prev.map(m =>
            m.recipient_id === recipientId
              ? { ...m, profile_read_at: nowIso }
              : m
          )
        );
        setBroadcastUnreadCount(prev => Math.max(0, (Number(prev) || 0) - 1));

        try {
          // Prefer a single-message RPC (handles RLS safely) and fall back to direct update.
          let persisted = false;

          const { data: rpcData, error: rpcError } = await supabase.rpc(
            'mark_my_profile_broadcast_message_read',
            { p_recipient_id: recipientId }
          );

          if (!rpcError && rpcData === true) {
            persisted = true;
          } else {
            // Direct update fallback: request returned rows so we can detect 0-row "no-op" updates.
            const { data: updatedRows, error: updateError } = await supabase
              .from('broadcast_recipients')
              .update({ profile_read_at: nowIso })
              .eq('id', recipientId)
              .is('profile_read_at', null)
              .select('id');

            if (updateError) throw updateError;
            persisted = Array.isArray(updatedRows) && updatedRows.length > 0;
          }

          // If we couldn't persist, re-sync from server (badge may come back).
          if (!persisted) {
            await loadBroadcastMessages();
          }

          await refreshBroadcastUnreadCount();
        } catch (err) {
          console.error('[ProfilePage] Failed to mark message as read:', err);
          // Re-sync from server (optimistic UI already updated)
          await refreshBroadcastUnreadCount();
          await loadBroadcastMessages();
        }
      }
    }
  };

  const [editedProfile, setEditedProfile] = useState({
    first_name: '',
    last_name: '',
    bio: '',
    city: '',
    country: '',
    country_code: '',
    date_of_birth: '',
    height_cm: null as number | null,
    max_distance: 250,
    min_age: DEFAULT_PREFERENCE_MIN_AGE,
    max_age: DEFAULT_PREFERENCE_MAX_AGE,
    gender: '',
    preference: '',
    relationship_intent: '',
    smoking: '',
    drinking: '',
    exercise_level: '',
    sleeping_schedule: '',
    occupation: '',
    occupationCustom: '',
    industry: '',
    industryCustom: '',
    education_level: '',
    education_level_custom: '',
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
    favorites: [] as FavoriteEntry[],
    adinkra_symbols: [] as string[],
    preferred_language: 'en',
    unlocked_countries: [] as string[],
    languages: [] as string[],
    family_plans: '',
    communication_style: [] as string[],
    love_style: [] as string[],
    pets: [] as string[],
    social_media: '',
  });

  // Initialize userImages state
  const [userImages, setUserImages] = useState<UserImageRow[]>([]);

  useEffect(() => {
    void refreshBroadcastUnreadCount();
  }, [isOwnProfile]);

  useEffect(() => {
    if (!isOwnProfile) return;
    if (!isProfileMessagesOpen) return;
    (async () => {
      // Load messages when dialog opens
      await loadBroadcastMessages();
    })();
  }, [isOwnProfile, isProfileMessagesOpen]);

  // Real-time subscription for broadcast messages
  useEffect(() => {
    if (!isOwnProfile || !currentUser?.id) return;

    const channel = supabase
      .channel(`profile-broadcasts-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'broadcast_recipients',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          void refreshBroadcastUnreadCount();
          if (isProfileMessagesOpen) {
            void loadBroadcastMessages();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isOwnProfile, currentUser?.id, isProfileMessagesOpen]);

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
          date_of_birth: profile.date_of_birth || '',
          height_cm: profile.height_cm ?? null,
          max_distance: profile.max_distance || profile.distance_preference || 250,
          min_age: profile.min_age || DEFAULT_PREFERENCE_MIN_AGE,
          max_age: profile.max_age || DEFAULT_PREFERENCE_MAX_AGE,
          gender: profile.gender || '',
          preference: profile.preference || '',
          relationship_intent: profile.relationship_intent || '',
          smoking: profile.smoking || '',
          drinking: profile.drinking || '',
          exercise_level: profile.exercise_level || '',
          sleeping_schedule: profile.sleeping_schedule || '',
          occupation: profile.occupation && !occupationOptions.includes(profile.occupation) ? 'Other' : (profile.occupation || ''),
          occupationCustom: profile.occupation && !occupationOptions.includes(profile.occupation) ? profile.occupation : '',
          industry: profile.industry && !industryOptions.includes(profile.industry) ? 'Other' : (profile.industry || ''),
          industryCustom: profile.industry && !industryOptions.includes(profile.industry) ? profile.industry : '',
          education_level: profile.education_level && !educationLevelOptions.includes(profile.education_level) ? 'Other' : (profile.education_level || ''),
          education_level_custom: profile.education_level && !educationLevelOptions.includes(profile.education_level) ? profile.education_level : '',
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
          favorites: parseFavorites(profile.favorites),
          adinkra_symbols: Array.isArray(profile.adinkra_symbols) ? profile.adinkra_symbols : [],
          preferred_language: detectedLanguage,
          unlocked_countries: Array.isArray(profile.unlocked_countries) ? profile.unlocked_countries : [],
          languages: Array.isArray(profile.languages) ? profile.languages : [],
          family_plans: profile.family_plans || '',
          communication_style: Array.isArray(profile.communication_style) ? profile.communication_style : [],
          love_style: Array.isArray(profile.love_style) ? profile.love_style : [],
          pets: Array.isArray(profile.pets) ? profile.pets : [],
          social_media: profile.social_media || '',
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
          date_of_birth: '',
          height_cm: null,
          max_distance: 250,
          min_age: DEFAULT_PREFERENCE_MIN_AGE,
          max_age: DEFAULT_PREFERENCE_MAX_AGE,
          gender: '',
          preference: '',
          relationship_intent: '',
          smoking: '',
          drinking: '',
          exercise_level: '',
          sleeping_schedule: '',
          occupation: '',
          occupationCustom: '',
          industry: '',
          industryCustom: '',
          education_level: '',
          education_level_custom: '',
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
          favorites: [],
          adinkra_symbols: [],
          preferred_language: 'en',
          unlocked_countries: [],
          languages: [],
          family_plans: '',
          communication_style: [],
          love_style: [],
          pets: [],
          social_media: '',
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

  // Toggles a single-select field: tapping the already-selected option clears it.
  const handleSingleToggleChange = (name: string, value: string) => {
    setEditedProfile(prev => ({ ...prev, [name]: (prev as any)[name] === value ? '' : value }));
  };

  // Toggles a value in/out of an array field (multi-select chips).
  const handleArrayToggleChange = (name: string, value: string) => {
    setEditedProfile(prev => {
      const current: string[] = Array.isArray((prev as any)[name]) ? (prev as any)[name] : [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [name]: next };
    });
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

  const handleFavoritesChange = (favorites: FavoriteEntry[]) => {
    if (isEditing) {
      setEditedProfile(prev => ({ ...prev, favorites }));
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
          title: "Couldn't update language",
          description: "Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Language updated",
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
        height_cm: editedProfile.height_cm || null,
        email: currentUser.email,
        max_distance: editedProfile.max_distance || 250,
        min_age: editedProfile.min_age || DEFAULT_PREFERENCE_MIN_AGE,
        max_age: editedProfile.max_age || DEFAULT_PREFERENCE_MAX_AGE,
        gender: editedProfile.gender || 'not_specified',
        preference: editedProfile.preference || 'not_specified',
        relationship_intent: editedProfile.relationship_intent || 'open_to_anything',
        smoking: editedProfile.smoking || 'not_specified',
        drinking: editedProfile.drinking || 'not_specified',
        exercise_level: editedProfile.exercise_level || 'not_specified',
        sleeping_schedule: editedProfile.sleeping_schedule || 'not_specified',
        occupation: (editedProfile.occupation === 'Other'
          ? editedProfile.occupationCustom?.trim()
          : editedProfile.occupation?.trim()) || null,
        industry: (editedProfile.industry === 'Other'
          ? editedProfile.industryCustom?.trim()
          : editedProfile.industry?.trim()) || null,
        education_level: (editedProfile.education_level === 'Other'
          ? editedProfile.education_level_custom?.trim()
          : editedProfile.education_level) || null,
        zip_code: editedProfile.zip_code?.trim() || null,
        latitude: editedProfile.latitude || null,
        longitude: editedProfile.longitude || null,
        is_custom_city: editedProfile.is_custom_city || false,
        unlocked_countries: Array.isArray(editedProfile.unlocked_countries) ? editedProfile.unlocked_countries : [],
        languages: Array.isArray(editedProfile.languages) ? editedProfile.languages : [],
        family_plans: editedProfile.family_plans || null,
        communication_style: Array.isArray(editedProfile.communication_style) ? editedProfile.communication_style : [],
        love_style: Array.isArray(editedProfile.love_style) ? editedProfile.love_style : [],
        pets: Array.isArray(editedProfile.pets) ? editedProfile.pets : [],
        social_media: editedProfile.social_media || null,
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
        favorites: parseFavorites(editedProfile.favorites),
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

      const profilePayload = { id: currentUser.id, ...updateData } as unknown as Database['public']['Tables']['profiles']['Insert'];

      if (profileExists) {
        const { error } = await supabase
          .from('profiles')
          .upsert(profilePayload)
          .select();
        if (error) throw new Error('Update failed: ' + error.message);
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert(profilePayload)
          .select();
        if (error) throw new Error('Insert failed: ' + error.message);
      }

  setIsEditing(false);
  
  // Detect if preference-related fields changed
  const preferencesChanged = (
    profile.gender !== updateData.gender ||
    profile.preference !== updateData.preference ||
    profile.min_age !== updateData.min_age ||
    profile.max_age !== updateData.max_age ||
    profile.max_distance !== updateData.max_distance ||
    profile.country !== updateData.country ||
    profile.country_code !== updateData.country_code ||
    JSON.stringify(profile.unlocked_countries || []) !== JSON.stringify(updateData.unlocked_countries || [])
  );
  
  // Clear discover cache and trigger refresh if needed
  const win = window as unknown as DiscoverCacheWindow
  if (typeof window !== 'undefined' && currentUser?.id) {
    if (preferencesChanged) {
      // Hard refresh for preference changes
      if (win.discoverCache) {
        win.discoverCache.delete(currentUser.id);
      }
      // Trigger discover page force refresh
      if (win.discoverForceRefresh) {
        win.discoverForceRefresh();
      }
      toast({
        title: "Preferences updated",
        duration: 5000,
      });
    } else {
      // Soft update for other profile changes
      if (win.discoverCache) {
        win.discoverCache.delete(currentUser.id);
      }
      toast({
        title: "Profile updated",
        duration: 3000,
      });
    }
  }
  
  onProfileUpdate();
    } catch (error: unknown) {
      console.error('🚨 Save failed:', error);
      toast({
        title: "Couldn't save changes",
        description: "Please check your connection and try again.",
        variant: 'destructive',
      });
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
        date_of_birth: profile.date_of_birth || '',
        height_cm: profile.height_cm ?? null,
        max_distance: profile.max_distance || profile.distance_preference || 250,
        min_age: profile.min_age || DEFAULT_PREFERENCE_MIN_AGE,
        max_age: profile.max_age || DEFAULT_PREFERENCE_MAX_AGE,
        gender: profile.gender || '',
        preference: profile.preference || '',
        relationship_intent: profile.relationship_intent || '',
        smoking: profile.smoking || '',
        drinking: profile.drinking || '',
        exercise_level: profile.exercise_level || '',
        sleeping_schedule: profile.sleeping_schedule || '',
        occupation: profile.occupation && !occupationOptions.includes(profile.occupation) ? 'Other' : (profile.occupation || ''),
        occupationCustom: profile.occupation && !occupationOptions.includes(profile.occupation) ? profile.occupation : '',
        industry: profile.industry && !industryOptions.includes(profile.industry) ? 'Other' : (profile.industry || ''),
        industryCustom: profile.industry && !industryOptions.includes(profile.industry) ? profile.industry : '',
        education_level: profile.education_level && !educationLevelOptions.includes(profile.education_level) ? 'Other' : (profile.education_level || ''),
        education_level_custom: profile.education_level && !educationLevelOptions.includes(profile.education_level) ? profile.education_level : '',
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
        favorites: parseFavorites(profile.favorites),
        adinkra_symbols: profile.adinkra_symbols || [],
        preferred_language: detectedLanguage,
        unlocked_countries: Array.isArray(profile.unlocked_countries) ? profile.unlocked_countries : [],
        languages: Array.isArray(profile.languages) ? profile.languages : [],
        family_plans: profile.family_plans || '',
        communication_style: Array.isArray(profile.communication_style) ? profile.communication_style : [],
        love_style: Array.isArray(profile.love_style) ? profile.love_style : [],
        pets: Array.isArray(profile.pets) ? profile.pets : [],
        social_media: profile.social_media || '',
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
        // image_order = -1 marks a rejected/superseded row kept only for the
        // admin audit trail - it no longer occupies a visible profile slot,
        // so it must be excluded here exactly like ImageManagement.tsx does,
        // or a stale "approved but unslotted" row would show up in the
        // preview/completion count without appearing in the real Photos tab.
        const { data: images, error } = await supabase
          .from('user_images')
          .select('image_url, is_approved, moderation_status')
          .eq('user_id', currentUser.id)
          .neq('image_order', -1)
          .order('image_order', { ascending: true });

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

  // Maps this user's own profile + approved photos into the same shape
  // Discover/LikedMePage render other users with, so the "preview" modal is an
  // honest rendering of the real card component rather than a hand-built
  // lookalike that could drift from what matches actually see.
  const previewImages = useMemo(
    () => userImages.filter(img => img.is_approved && img.image_url).map(img => img.image_url as string),
    [userImages]
  );
  const previewMatch = useMemo<(PotentialMatch & { preferred_language?: string }) | null>(() => {
    if (!profile) return null;
    return {
      id: profile.id,
      preferred_language: profile.preferred_language,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      bio: profile.bio || '',
      city: profile.city || '',
      country: profile.country || '',
      country_code: profile.country_code || '',
      occupation: profile.occupation || '',
      education_level: profile.education_level || '',
      date_of_birth: profile.date_of_birth || '',
      interests: profile.interests || [],
      favorites: parseFavorites(profile.favorites),
      images: previewImages,
      is_verified: profile.is_verified,
      gender: profile.gender || '',
      preference: profile.preference || undefined,
      max_distance: profile.max_distance ?? undefined,
      distance_preference: profile.distance_preference ?? undefined,
      fun_fact: profile.fun_fact,
      perfect_first_date: profile.perfect_first_date,
      last_googled: profile.last_googled,
      relationship_intent: profile.relationship_intent,
      smoking: profile.smoking,
      drinking: profile.drinking,
      exercise_level: profile.exercise_level,
      sleeping_schedule: profile.sleeping_schedule,
      introvert_extrovert: profile.introvert_extrovert,
      spontaneous_planner: profile.spontaneous_planner,
      messy_organized: profile.messy_organized,
      adinkra_symbols: profile.adinkra_symbols || [],
      height_cm: profile.height_cm ?? undefined,
      languages: Array.isArray(profile.languages) ? profile.languages : [],
      family_plans: profile.family_plans || undefined,
      communication_style: Array.isArray(profile.communication_style) ? profile.communication_style : [],
      love_style: Array.isArray(profile.love_style) ? profile.love_style : [],
      pets: Array.isArray(profile.pets) ? profile.pets : [],
      social_media: profile.social_media || undefined,
    };
  }, [profile, previewImages]);

  if (showPremiumUpgrade) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} preselectedPlan="premium" />
      </div>
    );
  }

  // Renders inline (same as the premium-upgrade screen above) rather than as a
  // full-screen overlay, so it stays inside MainApp's normal header/bottom-nav
  // shell and scrolls the same way every other tab does, instead of covering
  // the whole viewport in its own isolated modal.
  if (showProfilePreview && previewMatch) {
    return (
      <ProfilePreviewModal
        profile={previewMatch}
        images={previewImages}
        onClose={() => setShowProfilePreview(false)}
        onPhotoUpdated={onProfileUpdate}
        onPendingCropChange={(hasPending) => { hasPendingCropRef.current = hasPending; }}
      />
    );
  }

  // Safety check for required data
  if (!currentUser) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center" style={{ minHeight: '100%' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-white/60">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
      <div className="h-full w-full bg-black overflow-x-hidden"
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
        className="sticky top-0 z-40 bg-black/95 border-b border-pink-500/30 shadow-sm backdrop-blur-sm"
        style={{
          // Sticky (not fixed) so it is positioned by the browser relative to the
          // real content area that starts right below MainApp's header, which is a
          // normal flex child of variable height. The old fixed + clamp() offset was
          // a guess at that header's height and fell under it on devices whose
          // header rendered taller (e.g. Samsung tablets).
          paddingTop: '2px',
          width: '100%',
        }}
      
      >
  <div className="px-3 py-1.5">
          <div className="flex items-center justify-between gap-3 w-full">
            {/* Avatar + name + preview link */}
            <div className="flex items-center gap-2.5 min-w-0">
              {previewImages[0] ? (
                <div
                  style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, position: 'relative', borderRadius: 9999, overflow: 'hidden', backgroundColor: '#171717' }}
                  className="shrink-0 border-2 border-pink-500/60"
                >
                  <CachedImage
                    loading="lazy"
                    decoding="async"
                    src={optimizeImageUrl(previewImages[0], { width: 88, height: 88, quality: 70 })}
                    alt={profile?.first_name || 'Profile photo'}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
              ) : (
                <div style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }} className="rounded-full bg-neutral-800 border border-pink-500/30 shrink-0" />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }} className="min-w-0">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1 }}>
                  <h2 style={{ margin: 0, lineHeight: 1 }} className="text-lg font-bold text-white truncate">{profile?.first_name || ''}</h2>
                  {showVerifiedBadge && (
                    <img loading="lazy" decoding="async" src="/images/verified.svg" alt="Verified" className="w-4 h-4 shrink-0" />
                  )}
                </div>
                {isOwnProfile && (
                  <div
                    role="button"
                    tabIndex={previewMatch ? 0 : -1}
                    aria-disabled={!previewMatch}
                    onClick={() => { if (previewMatch) setShowProfilePreview(true); }}
                    onKeyDown={(e) => {
                      if (previewMatch && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setShowProfilePreview(true);
                      }
                    }}
                    style={{ height: 22, minHeight: 22, padding: '0 8px' }}
                    className={`flex items-center gap-1 rounded-full bg-neutral-900 border border-pink-500/50 text-white text-[11px] leading-none whitespace-nowrap hover:bg-neutral-800 transition-colors shrink-0 cursor-pointer ${
                      previewMatch ? '' : 'opacity-50 pointer-events-none cursor-default'
                    }`}
                    aria-label="Preview my profile"
                  >
                    Preview <ChevronRight className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>

            {/* Circular icon actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Only render the upsell once premium is positively known to be
                  false - `undefined` means "still resolving", and showing the
                  crown then made subscribers briefly think they weren't. */}
              {isPremium === false && (
                <Button
                  onClick={() => setShowPremiumUpgrade(true)}
                  style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, padding: 0 }}
                  className="rounded-full bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-white shadow-sm"
                  aria-label={t('Upgrade')}
                >
                  <Crown className="w-4 h-4" />
                </Button>
              )}
              {/* Message button (own profile only) */}
              {isOwnProfile && (
                <div className="relative">
                  <Button
                    onClick={openProfileMessages}
                    style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, padding: 0 }}
                    className="rounded-full bg-neutral-900 border border-pink-500/30 text-white hover:bg-neutral-800"
                    aria-label="Open profile messages"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                  {broadcastUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-pink-600 text-white text-[9px] flex items-center justify-center">
                      {broadcastUnreadCount}
                    </span>
                  )}
                </div>
              )}

              {/* Games button (own profile only) */}
              {isOwnProfile && (
                <Button
                  onClick={() => navigate('/games')}
                  style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, padding: 0 }}
                  className="rounded-full bg-neutral-900 border border-pink-500/30 text-purple-300 hover:bg-neutral-800"
                  aria-label="Play games"
                >
                  <Gamepad2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Profile Completion Progress Bar with Verified Badge */}
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-1 transition-all duration-500 rounded-full ${
                    completion >= 90 ? 'bg-pink-800' : 'bg-pink-600'
                  }`}
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-white min-w-[32px] text-right flex items-center justify-end gap-2">
                <span>{completion}%</span>
              </span>
            </div>

            {/* Profile completion notice */}
            {completion < 100 && missingFields.length > 0 && !hideProfileCompletion && (
              <div className="mt-4 bg-blue-950/40 border border-blue-700/50 rounded-lg px-4 py-3 relative">
                <button
                  className="absolute top-2 right-3 text-blue-300 hover:text-blue-100 text-lg font-bold focus:outline-none"
                  aria-label="Dismiss profile completion"
                  onClick={() => setHideProfileCompletion(true)}
                >
                  ×
                </button>
                <div className="pr-8">
                  <h4 className="font-semibold text-blue-200 mb-2">{t('profile.completeProfilePrompt')}</h4>
                  <ul className="text-sm text-blue-300 space-y-1">
                    {missingFields.slice(0, 3).map((field, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-400 mr-2">•</span>
                        {t(field)}
                      </li>
                    ))}
                    {missingFields.length > 3 && (
                      <li className="text-blue-300 font-medium">
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

      {/* Scrollable Content - the toolbar above is sticky (in flow), so no
          manual top offset is needed any more on any device. */}
      <div
        className="max-w-4xl mx-auto p-4 pt-4 space-y-8 overflow-x-hidden w-full"
        style={{
          // Clears the two stacked fixed headers above (MainApp's + this page's own),
          // both of which grow with env(safe-area-inset-top) - this needs to grow with
          // it too instead of a single flat guess, or content sits under the headers
          // on devices with a bigger inset (Dynamic Island, etc). The md: bump lives in
          // the .top-pad-clear-headers class (index.css) to match the toolbar's own
          // md: top offset above, so content never sits under the toolbar on tablets.
          //
          // Bottom padding is a flat 10px on every platform - MainApp's bottom nav
          // is already a real flex sibling of this scrollable content box (not an
          // overlay), so the box structurally can't extend past the nav's top edge
          // in the first place. The old platform branch (a much larger clamp() on
          // native vs 30px on web) was clearing space that was already reserved by
          // that layout, and relied on Capacitor.getPlatform() - which only reports
          // 'ios'/'android' inside the actual native app shell, not a mobile browser
          // on those devices, so testing via Safari/Chrome silently got the "web"
          // value regardless of the real platform.
          paddingBottom: '10px',
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

          {isOwnProfile && (
            <Dialog open={isProfileMessagesOpen} onOpenChange={setIsProfileMessagesOpen}>
              <DialogContent className="sm:max-w-[550px] max-h-[85vh] p-0 gap-0 overflow-hidden bg-black border-pink-500/30">
                <DialogHeader className="px-6 py-4 border-b border-pink-500/20 bg-gradient-to-r from-pink-950/40 to-purple-950/40">
                  <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-pink-400" />
                    {t('profile.updatesTitle', 'Profile Updates')}
                  </DialogTitle>
                </DialogHeader>

                <div className="px-6 py-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
                  {isLoadingBroadcastMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500 mx-auto mb-3"></div>
                        <p className="text-sm text-white/60">{t('profile.loadingUpdates', 'Loading updates...')}</p>
                      </div>
                    </div>
                  ) : broadcastMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="w-20 h-20 bg-gradient-to-br from-green-900/40 to-emerald-900/40 rounded-full flex items-center justify-center mb-4">
                        <span className="text-4xl">😊</span>
                      </div>
                      <p className="text-xl font-semibold text-white mb-2">{t('profile.allCaughtUp', 'All caught up')}</p>
                      <p className="text-sm text-white/60">{t('profile.noNewUpdates', 'No new updates right now.')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {broadcastMessages.map((msg) => {
                        const isExpanded = expandedMessageIds.has(msg.recipient_id);
                        const isUnread = !msg.profile_read_at;
                        
                        return (
                          <div 
                            key={msg.recipient_id} 
                            className={`border-2 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md ${
                              isUnread
                                ? 'border-pink-400/70 bg-gradient-to-br from-pink-950/40 to-purple-950/40'
                                : 'border-pink-500/20 bg-black hover:border-pink-500/40'
                            }`}
                          >
                            {/* Message Header - Clickable */}
                            <div
                              className="flex items-start justify-between p-4 cursor-pointer"
                              onClick={() => toggleMessageExpanded(msg.recipient_id)}
                            >
                              <div className="flex-1 min-w-0 pr-3">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <h3 className={`text-base truncate ${isUnread ? 'font-bold text-white' : 'font-semibold text-white/80'}`}>
                                    {msg.title}
                                  </h3>
                                  {isUnread && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm">
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${isUnread ? 'font-semibold text-pink-300' : 'text-white/60'}`}>
                                  {new Date(msg.sent_at || msg.created_at).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              <ChevronDown
                                className={`w-5 h-5 flex-shrink-0 transition-all duration-300 ${
                                  isUnread ? 'text-pink-400' : 'text-white/40'
                                } ${isExpanded ? 'transform rotate-180' : ''}`}
                              />
                            </div>

                            {/* Expanded Message Body */}
                            {isExpanded && (
                              <div className="px-4 pb-4 border-t border-pink-500/20">
                                <div className="mt-4 text-sm text-white whitespace-pre-wrap leading-relaxed bg-black/60 rounded-lg p-4 border border-pink-500/20">
                                  {msg.message}
                                </div>
                                <div className="mt-4 flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 font-medium transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteBroadcastMessage(msg.recipient_id);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Message
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}

          <ProfileBasicsChips editedProfile={editedProfile} onOpenSection={toggleSection} />

          <CollapsibleSection
            title={t('profile.photos')}
            isOpen
            onToggle={() => {}}
            className="mt-3 border-pink-500/30"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <ImageManagement
              currentUser={currentUser}
              profile={profile}
              onProfileUpdate={onProfileUpdate}
              isEditing={isEditing}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title={t('profile.basicInfo')}
            isOpen={showBasicInfoSection}
            onToggle={() => toggleSection('basicInfo')}
            id="section-basicInfo"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <BasicInfoSection
              editedProfile={editedProfile}
              isEditing={isEditing}
              onInputChange={handleInputChange}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title="Advertisement"
            isOpen={showAdvertisementSection}
            onToggle={() => toggleSection('advertisement')}
            id="section-advertisement"
            className="mt-3"
          >
            <AdvertisementSection
              currentUser={currentUser}
              startWithForm={advertiseFormSignal > 0}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.preferences')}
            isOpen={showLocationSection}
            onToggle={() => toggleSection('location')}
            id="section-location"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <LocationSection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onInputChange={handleInputChange}
              onLocationChange={handleLocationChange}
              onDistanceChange={handleDistanceChange}
              onSelectChange={handleSelectChange}
              onAgeRangeChange={handleAgeRangeChange}
              isPremium={isPremium}
              userId={currentUser?.id}
              onUnlockedCountriesChange={(countries) => {
                setEditedProfile(prev => ({ ...prev, unlocked_countries: countries }));
                onProfileUpdate();
              }}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.lifestyle')}
            isOpen={showLifestyleSection}
            onToggle={() => toggleSection('lifestyle')}
            id="section-lifestyle"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <LifestyleSection
              editedProfile={editedProfile}
              isEditing={isEditing}
              onSelectChange={handleSelectChange}
              onFamilyPlansToggle={(value) => handleSingleToggleChange('family_plans', value)}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.workEducation')}
            isOpen={showWorkEducationSection}
            onToggle={() => toggleSection('workEducation')}
            id="section-workEducation"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
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
            onToggle={() => toggleSection('personality')}
            id="section-personality"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <PersonalitySection
              editedProfile={editedProfile}
              isEditing={isEditing}
              onSliderChange={handleSliderChange}
              onCommunicationStyleToggle={(value) => handleArrayToggleChange('communication_style', value)}
              onLoveStyleToggle={(value) => handleArrayToggleChange('love_style', value)}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Languages"
            isOpen={showLanguagesSection}
            onToggle={() => toggleSection('languages')}
            id="section-languages"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <LanguagesSection
              editedProfile={editedProfile}
              isEditing={isEditing}
              onToggleLanguage={(value) => handleArrayToggleChange('languages', value)}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Pets"
            isOpen={showPetsSection}
            onToggle={() => toggleSection('pets')}
            id="section-pets"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <PetsSection
              editedProfile={editedProfile}
              isEditing={isEditing}
              onTogglePet={(value) => handleArrayToggleChange('pets', value)}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Social Media"
            isOpen={showSocialMediaSection}
            onToggle={() => toggleSection('socialMedia')}
            id="section-socialMedia"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <SocialMediaSection
              editedProfile={editedProfile}
              isEditing={isEditing}
              onToggleSocialMedia={(value) => handleSingleToggleChange('social_media', value)}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.funQuestions')}
            isOpen={showFunQuestionsSection}
            onToggle={() => toggleSection('funQuestions')}
            id="section-funQuestions"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
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
            onToggle={() => toggleSection('interests')}
            id="section-interests"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <InterestsSection
              editedProfile={editedProfile}
              profile={profile}
              isEditing={isEditing}
              onInterestsChange={handleInterestsChange}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.favorites')}
            isOpen={showFavoritesSection}
            onToggle={() => toggleSection('favorites')}
            id="section-favorites"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
          >
            <FavoritesSection
              editedProfile={editedProfile}
              profile={profile}
              isEditing={isEditing}
              onFavoritesChange={handleFavoritesChange}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.adinkra')}
            isOpen={showAdinkraSection}
            onToggle={() => toggleSection('adinkra')}
            id="section-adinkra"
            className="mt-3"
            showEditButton
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
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
            onToggle={() => toggleSection('accountActions')}
            id="section-accountActions"
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
              className="w-full max-w-xs bg-neutral-900 hover:bg-neutral-800 text-white font-medium"
            >
              Log Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProfilePage);

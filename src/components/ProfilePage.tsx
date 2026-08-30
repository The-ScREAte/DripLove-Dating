import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
// import { PushNotifications } from '@capacitor/push-notifications'; // Uncomment if you use PushNotifications
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Edit, Save, X, Crown, MessageCircle, ChevronDown, Trash2, Gamepad2, Eye } from 'lucide-react';
import { PotentialMatch } from '@/types';
import ProfilePreviewModal from './profile/ProfilePreviewModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useAllowScreenshots } from '@/hooks/useAllowScreenshots';
import BasicInfoSection from './profile/BasicInfoSection';
import LocationSection from './profile/LocationSection';

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
import { occupationOptions, industryOptions, educationLevelOptions } from '@/constants/professionOptions';
import { Badge } from '@/components/ui/badge';
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
}

const ProfilePage = ({ currentUser, profile, onProfileUpdate, onLogout, onShowTerms, onShowPrivacy, isPremium, isActiveTab = true, profileTabSignal = 0 }: ProfilePageProps) => {
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
  
  // Computed section states
  const showBasicInfoSection = openSection === 'basicInfo';
  const showPhotoSection = openSection === 'photos';
  const showLocationSection = openSection === 'location';
  const showLifestyleSection = openSection === 'lifestyle';
  const showWorkEducationSection = openSection === 'workEducation';
  const showPersonalitySection = openSection === 'personality';
  const showFunQuestionsSection = openSection === 'funQuestions';
  const showInterestsSection = openSection === 'interests';
  const showAdinkraSection = openSection === 'adinkra';
  
  const showAccountActionsSection = openSection === 'accountActions';
  
  const { toast } = useToast();
  const { subscription, loading: subscriptionLoading } = useSubscription(currentUser?.id);

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

  const markBroadcastMessagesRead = async () => {
    if (!isOwnProfile) return;
    try {
      await supabase.rpc('mark_my_profile_broadcasts_read');
    } catch (err) {
      console.error('[ProfilePage] Failed to mark broadcasts read:', err);
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
    adinkra_symbols: [] as string[],
    preferred_language: 'en',
    unlocked_countries: [] as string[],
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
          adinkra_symbols: Array.isArray(profile.adinkra_symbols) ? profile.adinkra_symbols : [],
          preferred_language: detectedLanguage,
          unlocked_countries: Array.isArray(profile.unlocked_countries) ? profile.unlocked_countries : [],
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
          adinkra_symbols: [],
          preferred_language: 'en',
          unlocked_countries: [],
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
        adinkra_symbols: profile.adinkra_symbols || [],
        preferred_language: detectedLanguage,
        unlocked_countries: Array.isArray(profile.unlocked_countries) ? profile.unlocked_countries : [],
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
      images: previewImages,
      is_verified: profile.is_verified,
      gender: profile.gender || '',
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
          <p className="text-gray-400">{t('common.loading')}</p>
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
        className="fixed left-0 right-0 z-40 bg-black/95 border-b border-pink-500/30 shadow-sm backdrop-blur-sm"
        style={{
          // Start from where main header ends; slightly lowered for cleaner breathing room.
          // env(safe-area-inset-top) is now reliable on Android too (see
          // @capacitor-community/safe-area setup in src/main.tsx), and MainApp's own
          // header padding is no longer platform-branched either, so one clamp now
          // covers both platforms instead of two separately-tuned ranges.
          top: 'clamp(62px, calc(env(safe-area-inset-top, 10px) + 42px), 92px)',
          paddingTop: '2px',
          width: '100%',
        }}
      >
  <div className="px-3 py-1.5">
          <div className="flex justify-center">
            <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
              {!isPremium && (
                <Button
                  onClick={() => setShowPremiumUpgrade(true)}
                  size="sm"
                  className="h-9 w-9 px-0 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-200 border-2 border-pink-600"
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
                    className="h-9 px-3.5 border-pink-500/40 text-white hover:bg-pink-900/30 disabled:opacity-50 bg-black border"
                    variant="outline"
                    aria-label="Open profile messages"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                  {broadcastUnreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-600 text-white text-[10px] flex items-center justify-center">
                      {broadcastUnreadCount}
                    </span>
                  )}
                </div>
              )}

              {/* Preview button (own profile only) - shows this profile the
                  exact way Discover/LikedMePage render it to other users. */}
              {isOwnProfile && (
                <Button
                  onClick={() => setShowProfilePreview(true)}
                  disabled={!previewMatch}
                  className="h-9 px-3.5 border-pink-500/40 text-white hover:bg-pink-900/30 disabled:opacity-50 bg-black border"
                  variant="outline"
                  aria-label="Preview my profile"
                >
                  <Eye className="w-4 h-4" />
                </Button>
              )}

              {/* Games button (own profile only) */}
              {isOwnProfile && (
                <Button
                  onClick={() => navigate('/games')}
                  className="h-9 px-3.5 border-pink-500/40 text-purple-300 hover:bg-purple-900/30 bg-black border"
                  variant="outline"
                  size="sm"
                  aria-label="Play games"
                >
                  <Gamepad2 className="w-4 h-4" />
                </Button>
              )}

              {/* Single toggle button - Edit becomes Cancel - icon-only */}
              <Button
                onClick={isEditing ? handleCancel : () => setIsEditing(true)}
                disabled={isSaving}
                size="sm"
                className={`h-9 w-9 px-0 font-medium transition-all duration-200 ${
                  isEditing
                    ? 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white border border-pink-300/60'
                }`}
                variant={isEditing ? 'default' : 'default'}
                aria-label={isEditing ? t('common.cancel') : t('common.edit')}
              >
                {isEditing ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Edit className="w-4 h-4" />
                )}
              </Button>
              {/* Save button only shows when editing - icon-only */}
              {isEditing && (
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-9 w-9 px-0 bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
                  aria-label={isSaving ? t('common.saving') : t('common.save')}
                >
                  <Save className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          
          {/* Profile Completion Progress Bar with Verified Badge */}
          <div className="mt-8">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-2 transition-all duration-500 rounded-full ${
                    completion >= 90 ? 'bg-emerald-500' : 'bg-blue-400'
                  }`}
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-white min-w-[45px] text-right flex items-center justify-end gap-2">
                <span>{completion}%</span>
                {showVerifiedBadge && (
                  <img loading="lazy" decoding="async"
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

      {/* Scrollable Content - with padding to account for fixed header */}
      <div 
        className="max-w-4xl mx-auto p-4 space-y-8 overflow-x-hidden w-full" 
        style={{
          // Clears the two stacked fixed headers above (MainApp's + this page's own),
          // both of which grow with env(safe-area-inset-top) - this needs to grow with
          // it too instead of a single flat guess, or content sits under the headers
          // on devices with a bigger inset (Dynamic Island, etc).
          paddingTop: 'clamp(140px, calc(env(safe-area-inset-top, 10px) + 120px), 190px)',
          paddingBottom: Capacitor.getPlatform() === 'web'
            ? '30px'
            : 'clamp(100px, calc(env(safe-area-inset-bottom, 0px) + 90px), 150px)'
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
                        <p className="text-sm text-gray-400">{t('profile.loadingUpdates', 'Loading updates...')}</p>
                      </div>
                    </div>
                  ) : broadcastMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="w-20 h-20 bg-gradient-to-br from-green-900/40 to-emerald-900/40 rounded-full flex items-center justify-center mb-4">
                        <span className="text-4xl">😊</span>
                      </div>
                      <p className="text-xl font-semibold text-white mb-2">{t('profile.allCaughtUp', 'All caught up')}</p>
                      <p className="text-sm text-gray-400">{t('profile.noNewUpdates', 'No new updates right now.')}</p>
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
                                  <h3 className={`text-base truncate ${isUnread ? 'font-bold text-white' : 'font-semibold text-gray-300'}`}>
                                    {msg.title}
                                  </h3>
                                  {isUnread && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm">
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${isUnread ? 'font-semibold text-pink-300' : 'text-gray-400'}`}>
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
                                  isUnread ? 'text-pink-400' : 'text-gray-500'
                                } ${isExpanded ? 'transform rotate-180' : ''}`}
                              />
                            </div>

                            {/* Expanded Message Body */}
                            {isExpanded && (
                              <div className="px-4 pb-4 border-t border-pink-500/20">
                                <div className="mt-4 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed bg-black/60 rounded-lg p-4 border border-pink-500/20">
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

          <CollapsibleSection
            title={t('profile.basicInfo')}
            isOpen={showBasicInfoSection}
            onToggle={() => toggleSection('basicInfo')}
            className="mt-3"
          >
            <BasicInfoSection 
              editedProfile={editedProfile} 
              isEditing={isEditing} 
              onInputChange={handleInputChange} 
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.photos')}
            isOpen={showPhotoSection}
            onToggle={() => toggleSection('photos')}
            className="mt-3"
          >
            <ImageManagement 
              currentUser={currentUser} 
              profile={profile}
              onProfileUpdate={onProfileUpdate}
            />
          </CollapsibleSection>
          <CollapsibleSection
            title={t('profile.preferences')}
            isOpen={showLocationSection}
            onToggle={() => toggleSection('location')}
            className="mt-3"
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
            onToggle={() => toggleSection('workEducation')}
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
            onToggle={() => toggleSection('personality')}
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
            onToggle={() => toggleSection('funQuestions')}
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
            onToggle={() => toggleSection('interests')}
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
            onToggle={() => toggleSection('adinkra')}
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
            onToggle={() => toggleSection('accountActions')}
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

export default React.memo(ProfilePage);

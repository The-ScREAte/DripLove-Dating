import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import LocationSection from '@/components/profile/LocationSection';
import ProfileBasicsChips from '@/components/profile/ProfileBasicsChips';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CurrentUser } from '@/types';

interface DiscoverFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CurrentUser;
  isPremium: boolean;
  onUpgradeClick?: () => void;
  onNavigateToProfileSection?: (section: string) => void;
}

// Same "who you see" preferences as Profile > Preferences (LocationSection
// itself - same component, same fields), opened from Discover's filter icon
// instead of navigating away to Profile. Saves straight to `profiles`, same
// columns ProfilePage's own preferences save touches. For now this only
// persists the change for next time Discover loads - it doesn't re-filter
// the deck already in front of the viewer (see the TODO below); that's the
// "add more to it" follow-up.
const DiscoverFiltersModal: React.FC<DiscoverFiltersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isPremium,
  onUpgradeClick,
  onNavigateToProfileSection,
}) => {
  const { toast } = useToast();
  const [editedProfile, setEditedProfile] = useState<CurrentUser>(currentUser);
  const [isSaving, setIsSaving] = useState(false);

  // Re-seed from the latest currentUser every time the sheet opens, so it
  // never shows a stale edit left over from a previous open/close.
  useEffect(() => {
    if (isOpen) setEditedProfile(currentUser);
  }, [isOpen, currentUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (location: {
    country: string;
    countryCode: string;
    city: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
  }) => {
    setEditedProfile(prev => ({
      ...prev,
      country: location.country,
      country_code: location.countryCode,
      city: location.city,
      zip_code: location.zipCode,
      latitude: location.latitude ?? prev.latitude,
      longitude: location.longitude ?? prev.longitude,
    }));
  };

  const handleDistanceChange = (distance: number[]) => {
    setEditedProfile(prev => ({ ...prev, max_distance: distance[0] }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleAgeRangeChange = (range: number[]) => {
    setEditedProfile(prev => ({ ...prev, min_age: range[0], max_age: range[1] }));
  };

  const handleUnlockedCountriesChange = (countries: string[]) => {
    setEditedProfile(prev => ({ ...prev, unlocked_countries: countries }));
  };

  const handleSave = async () => {
    if (!currentUser.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          gender: editedProfile.gender,
          preference: editedProfile.preference,
          min_age: editedProfile.min_age,
          max_age: editedProfile.max_age,
          max_distance: editedProfile.max_distance,
          country: editedProfile.country,
          country_code: editedProfile.country_code,
          city: editedProfile.city,
          zip_code: editedProfile.zip_code,
          latitude: editedProfile.latitude,
          longitude: editedProfile.longitude,
          unlocked_countries: editedProfile.unlocked_countries,
        })
        .eq('id', currentUser.id);

      if (error) throw error;

      toast({ title: 'Preferences saved' });
      onClose();
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        className="discover-filters-compact bg-black border-pink-500/30 text-white overflow-y-auto rounded-t-2xl p-4"
        // A plain vh percentage doesn't account for the status bar/notch, so
        // on some devices the sheet could still stretch right up under it.
        // This instead always leaves a fixed gap below the safe area, the
        // same margin on every device regardless of screen height or notch.
        style={{ maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - 56px)' }}
      >
        <SheetHeader className="text-left mb-1.5">
          <SheetTitle className="text-white text-base">Discover Filters</SheetTitle>
        </SheetHeader>

        {/* Quick-glance profile summary - tapping any chip jumps straight to
            Profile with that field's section open and scrolled into view, so
            you can fix it without hunting through Profile yourself. */}
        <ProfileBasicsChips
          editedProfile={editedProfile}
          onOpenSection={(section) => {
            onClose();
            onNavigateToProfileSection?.(section);
          }}
        />

        <LocationSection
          editedProfile={editedProfile}
          isEditing={true}
          onInputChange={handleInputChange}
          onLocationChange={handleLocationChange}
          onDistanceChange={handleDistanceChange}
          onSelectChange={handleSelectChange}
          onAgeRangeChange={handleAgeRangeChange}
          isPremium={isPremium}
          userId={currentUser.id}
          onUnlockedCountriesChange={handleUnlockedCountriesChange}
          onUpgradeClick={() => {
            onClose();
            onUpgradeClick?.();
          }}
        />

        <Button
          onClick={handleSave}
          disabled={isSaving}
          size="sm"
          className="w-full h-9 min-h-0 mt-4 mb-1 bg-pink-500 hover:bg-pink-600 text-white"
        >
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </SheetContent>
    </Sheet>
  );
};

export default DiscoverFiltersModal;

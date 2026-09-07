import React from 'react';
import ChipSelect from './ChipSelect';
import { SOCIAL_MEDIA_OPTIONS } from '@/constants/profileTraits';

interface SocialMediaSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onToggleSocialMedia: (value: string) => void;
}

const SocialMediaSection = ({ editedProfile, isEditing, onToggleSocialMedia }: SocialMediaSectionProps) => {
  const selected = editedProfile.social_media ? [editedProfile.social_media] : [];
  return (
    <ChipSelect
      options={SOCIAL_MEDIA_OPTIONS}
      selected={selected}
      onToggle={onToggleSocialMedia}
      disabled={!isEditing}
      accent="purple"
    />
  );
};

export default SocialMediaSection;

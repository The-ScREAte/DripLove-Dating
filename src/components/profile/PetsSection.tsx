import React from 'react';
import ChipSelect from './ChipSelect';
import { PETS_OPTIONS } from '@/constants/profileTraits';

interface PetsSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onTogglePet: (value: string) => void;
}

const PetsSection = ({ editedProfile, isEditing, onTogglePet }: PetsSectionProps) => {
  const selected: string[] = Array.isArray(editedProfile.pets) ? editedProfile.pets : [];
  return (
    <ChipSelect
      options={PETS_OPTIONS}
      selected={selected}
      onToggle={onTogglePet}
      disabled={!isEditing}
      accent="amber"
    />
  );
};

export default PetsSection;

import React from 'react';
import { Home, Ruler, Briefcase, GraduationCap, User, Heart, Compass, Wine, Plus, Languages, Baby, MessageCircle, Gift, PawPrint, Share2, Sparkles, Star, Lightbulb, FileText } from 'lucide-react';
import { FAMILY_PLANS_OPTIONS, COMMUNICATION_STYLE_OPTIONS, LOVE_STYLE_OPTIONS, PETS_OPTIONS, SOCIAL_MEDIA_OPTIONS } from '@/constants/profileTraits';

interface ProfileBasicsChipsProps {
  editedProfile: any;
  onOpenSection: (section: string) => void;
}

const formatHeight = (cm: number) => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
};

const labelFor = (options: { value: string; label: string }[], value: string) =>
  options.find((opt) => opt.value === value)?.label || value;

const ProfileBasicsChips = ({ editedProfile, onOpenSection }: ProfileBasicsChipsProps) => {
  const lifestyle = editedProfile.drinking || editedProfile.smoking || '';
  const languages: string[] = Array.isArray(editedProfile.languages) ? editedProfile.languages : [];
  const communicationStyle: string[] = Array.isArray(editedProfile.communication_style) ? editedProfile.communication_style : [];
  const loveStyle: string[] = Array.isArray(editedProfile.love_style) ? editedProfile.love_style : [];
  const pets: string[] = Array.isArray(editedProfile.pets) ? editedProfile.pets : [];
  const interests: string[] = Array.isArray(editedProfile.interests) ? editedProfile.interests : [];
  const favorites: unknown[] = Array.isArray(editedProfile.favorites) ? editedProfile.favorites : [];
  const hasFunQuestion = !!(editedProfile.fun_fact || editedProfile.perfect_first_date || editedProfile.last_googled);

  // label is '' when nothing's set yet - the chip then renders icon + a bare "+"
  // (an add-it prompt) instead of a placeholder word, keeping it tiny.
  const chips: { key: string; icon: React.ReactNode; label: string; section: string; border: string }[] = [
    // Bio is the one Basic Info field not already collected at signup (name/DOB
    // are), and it's the whole 15pts or nothing - most profiles that are stuck
    // below 100% are missing just this, so it gets its own chip to flag that.
    {
      key: 'bio',
      icon: <FileText className="w-3 h-3" />,
      label: editedProfile.bio?.trim() ? '✓' : '',
      section: 'basicInfo',
      border: 'border-green-500/50',
    },
    {
      key: 'location',
      icon: <Home className="w-3 h-3" />,
      label: editedProfile.city || '',
      section: 'location',
      border: 'border-blue-500/50',
    },
    {
      key: 'height',
      icon: <Ruler className="w-3 h-3" />,
      label: editedProfile.height_cm ? formatHeight(editedProfile.height_cm) : '',
      section: 'basicInfo',
      border: 'border-purple-500/50',
    },
    {
      key: 'job',
      icon: <Briefcase className="w-3 h-3" />,
      label: (editedProfile.occupation === 'Other' ? editedProfile.occupationCustom : editedProfile.occupation) || '',
      section: 'workEducation',
      border: 'border-amber-500/50',
    },
    {
      key: 'education',
      icon: <GraduationCap className="w-3 h-3" />,
      label: (editedProfile.education_level === 'Other' ? editedProfile.education_level_custom : editedProfile.education_level) || '',
      section: 'workEducation',
      border: 'border-indigo-500/50',
    },
    {
      key: 'gender',
      icon: <User className="w-3 h-3" />,
      label: editedProfile.gender || '',
      section: 'location',
      border: 'border-pink-500/50',
    },
    {
      key: 'lookingFor',
      icon: <Heart className="w-3 h-3" />,
      label: editedProfile.preference || '',
      section: 'location',
      border: 'border-rose-500/50',
    },
    {
      key: 'intent',
      icon: <Compass className="w-3 h-3" />,
      label: editedProfile.relationship_intent || '',
      section: 'lifestyle',
      border: 'border-cyan-500/50',
    },
    {
      key: 'lifestyle',
      icon: <Wine className="w-3 h-3" />,
      label: lifestyle,
      section: 'lifestyle',
      border: 'border-emerald-500/50',
    },
    {
      key: 'languages',
      icon: <Languages className="w-3 h-3" />,
      label: languages.length > 0 ? String(languages.length) : '',
      section: 'languages',
      border: 'border-teal-500/50',
    },
    {
      key: 'familyPlans',
      icon: <Baby className="w-3 h-3" />,
      label: editedProfile.family_plans ? labelFor(FAMILY_PLANS_OPTIONS, editedProfile.family_plans) : '',
      section: 'lifestyle',
      border: 'border-fuchsia-500/50',
    },
    {
      key: 'communicationStyle',
      icon: <MessageCircle className="w-3 h-3" />,
      label: communicationStyle.length > 0 ? String(communicationStyle.length) : '',
      section: 'personality',
      border: 'border-sky-500/50',
    },
    {
      key: 'loveStyle',
      icon: <Gift className="w-3 h-3" />,
      label: loveStyle.length > 0 ? String(loveStyle.length) : '',
      section: 'personality',
      border: 'border-red-500/50',
    },
    {
      key: 'pets',
      icon: <PawPrint className="w-3 h-3" />,
      label: pets.length > 0 ? String(pets.length) : '',
      section: 'pets',
      border: 'border-orange-500/50',
    },
    {
      key: 'socialMedia',
      icon: <Share2 className="w-3 h-3" />,
      label: editedProfile.social_media ? labelFor(SOCIAL_MEDIA_OPTIONS, editedProfile.social_media) : '',
      section: 'socialMedia',
      border: 'border-violet-500/50',
    },
    // Completion needs 3+ interests, not just 1 - "2" alone reads as done when
    // it isn't, so this shows "2/3" until the threshold is actually met.
    {
      key: 'interests',
      icon: <Sparkles className="w-3 h-3" />,
      label: interests.length === 0 ? '' : interests.length < 3 ? `${interests.length}/3` : String(interests.length),
      section: 'interests',
      border: 'border-lime-500/50',
    },
    {
      key: 'favorites',
      icon: <Star className="w-3 h-3" />,
      label: favorites.length > 0 ? String(favorites.length) : '',
      section: 'favorites',
      border: 'border-yellow-500/50',
    },
    {
      key: 'funQuestions',
      icon: <Lightbulb className="w-3 h-3" />,
      label: hasFunQuestion ? '✓' : '',
      section: 'funQuestions',
      border: 'border-pink-400/50',
    },
  ];

  // Two rows, filled column-first (item 0 -> row 1, item 1 -> row 2, item 2 -> row 1, ...)
  // so related traits (e.g. Job/Education) land in the same visual column.
  const row1 = chips.filter((_, i) => i % 2 === 0);
  const row2 = chips.filter((_, i) => i % 2 === 1);

  const renderChip = (chip: (typeof chips)[number]) => (
    <button
      key={chip.key}
      type="button"
      onClick={() => onOpenSection(chip.section)}
      style={{ height: 22, minHeight: 22, padding: '0 8px' }}
      className={`flex items-center gap-1 rounded-full bg-neutral-900 border ${chip.border} text-white text-[11px] leading-none whitespace-nowrap hover:bg-neutral-800 transition-colors capitalize shrink-0`}
    >
      {chip.icon}
      {chip.label ? <span>{chip.label}</span> : <Plus className="w-2.5 h-2.5 opacity-70" />}
    </button>
  );

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      <div className="flex flex-col gap-1.5 w-max mx-auto">
        <div className="flex gap-1.5">{row1.map(renderChip)}</div>
        <div className="flex gap-1.5">{row2.map(renderChip)}</div>
      </div>
    </div>
  );
};

export default ProfileBasicsChips;

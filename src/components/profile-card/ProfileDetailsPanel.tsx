import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Baby,
  Briefcase,
  Building2,
  GraduationCap,
  Gift,
  Heart,
  Languages,
  MapPin,
  MessageCircle,
  PawPrint,
  Ruler,
  Share2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { displayFavorites, favoriteEmoji, formatFavoriteLabel } from '@/constants/favorites';
import {
  COMMUNICATION_STYLE_OPTIONS,
  FAMILY_PLANS_OPTIONS,
  LOVE_STYLE_OPTIONS,
  PETS_OPTIONS,
  SOCIAL_MEDIA_OPTIONS,
} from '@/constants/profileTraits';
import { formatHeightLabel } from '@/utils/profileFormat';
import MusicLinkBadge from '../discover/MusicLinkBadge';
import { CaptionPhotoCard } from './CaptionPhotoCard';
import { SharedWithYou, VibeProfileSections } from './VibeSections';
import { FactRow, LabelValueRow, PersonalityBar, ProfileSection, TraitChips } from './ProfileSection';
import { asList, displayValue, formatLocationLabel, isLongText, isSpecified, relationshipIntentLabel, traitText } from './profileCardUtils';
import type { CaptionedPhoto, PhotoAnchor, ProfileCardData } from './types';
import IcebreakerInline from '../icebreaker/IcebreakerInline';
import type { IcebreakerTarget } from '../icebreaker/store';

interface ProfileDetailsPanelProps {
  profile: ProfileCardData;
  captionedPhotos?: CaptionedPhoto[];
  secondPhotoAnchor?: PhotoAnchor | null;
  /** The profile's app-language name (pre-fetched by the parent), if known. */
  preferredLanguageName?: string;
  /** Also list the profile's fun-question answers (used by the full profile dialog). */
  showFunQuestions?: boolean;
  /** When given, the "Break the ice" button sits at the top of the expanded details. */
  iceTarget?: IcebreakerTarget | null;
  className?: string;
}

/** Bio with a "Read more" toggle - long bios are never clipped, just folded. */
const BioText: React.FC<{ text: string }> = ({ text }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = isLongText(text);
  return (
    <>
      <p
        dir="auto"
        className={cn(
          'whitespace-pre-line break-words text-[15px] leading-relaxed text-white/90',
          long && !open && 'line-clamp-4'
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mb-2 -mt-1 inline-flex min-h-touch items-center text-sm font-semibold text-brand-ink underline-offset-4 hover:underline dl-focus"
        >
          {open ? t('discover.matchCard.showLess', 'Show less') : t('discover.matchCard.readMore', 'Read more')}
        </button>
      )}
    </>
  );
};

/**
 * The expanded profile details, shared by Discover, Liked Me, the profile
 * preview and Circle so every screen shows the same sections, in the same
 * order, with the same spacing. Renders content only - the parent owns the
 * scroll container and its height.
 */
export const ProfileDetailsPanel: React.FC<ProfileDetailsPanelProps> = ({
  profile,
  captionedPhotos = [],
  secondPhotoAnchor = null,
  preferredLanguageName,
  showFunQuestions = false,
  iceTarget,
  className,
}) => {
  const { t } = useTranslation();
  const label = (key: string, fallback: string) => t(`discover.matchCard.${key}`, fallback);

  const bio = profile.bio?.trim();
  const intent = relationshipIntentLabel(profile.relationship_intent, t as never);
  const hasHeight = typeof profile.height_cm === 'number' && profile.height_cm > 0;
  const locationLabel = formatLocationLabel(profile.city, profile.country);
  const hasGlance =
    !!locationLabel || !!intent || hasHeight || isSpecified(profile.family_plans) || !!profile.occupation?.trim() || !!profile.industry?.trim() || !!profile.education_level?.trim();

  const lifestyleRows = [
    { emoji: '🚬', label: label('smoking', 'Smoking'), value: profile.smoking },
    { emoji: '🍸', label: label('drinking', 'Drinking'), value: profile.drinking },
    { emoji: '🏋️', label: label('exercise', 'Exercise'), value: profile.exercise_level },
    { emoji: '😴', label: label('sleep', 'Sleep'), value: profile.sleeping_schedule },
  ].filter((row) => isSpecified(row.value));

  const personalityRows = [
    { value: profile.introvert_extrovert, left: label('introvert', 'Introvert'), right: label('extrovert', 'Extrovert') },
    { value: profile.spontaneous_planner, left: label('spontaneous', 'Spontaneous'), right: label('planner', 'Planner') },
    { value: profile.messy_organized, left: label('messy', 'Messy'), right: label('organized', 'Organized') },
  ].filter((row): row is { value: number; left: string; right: string } => typeof row.value === 'number');

  const communication = asList(profile.communication_style);
  const love = asList(profile.love_style);
  const interests = asList(profile.interests);
  const favorites = displayFavorites(asList(profile.favorites));
  const pets = asList(profile.pets);
  const languages = asList(profile.languages);

  const funQuestions = showFunQuestions
    ? [
        { key: 'funFact', fallback: 'Fun fact', value: profile.fun_fact },
        { key: 'perfectDate', fallback: 'Perfect first date', value: profile.perfect_first_date },
        { key: 'lastGoogled', fallback: 'Last thing I googled', value: profile.last_googled },
      ].filter((q) => !!q.value?.trim())
    : [];

  const photoAfter = (anchor: PhotoAnchor) =>
    secondPhotoAnchor === anchor && captionedPhotos[1] ? <CaptionPhotoCard photo={captionedPhotos[1]} /> : null;

  return (
    <div className={cn('mx-auto w-full max-w-2xl space-y-3 px-4 pb-6 pt-3 text-white', className)}>
      {iceTarget ? (
        <div className="flex justify-start">
          <IcebreakerInline target={iceTarget} className="!mt-0" />
        </div>
      ) : null}

      <SharedWithYou profile={profile} />

      {bio && (
        <ProfileSection title={label('about', 'About')}>
          <BioText key={profile.id ?? bio} text={bio} />
        </ProfileSection>
      )}

      {captionedPhotos[0] && <CaptionPhotoCard photo={captionedPhotos[0]} />}

      {hasGlance && (
        <ProfileSection title={label('atAGlance', 'At a glance')}>
          <div className="space-y-2.5">
            {locationLabel && <FactRow icon={<MapPin />}>{locationLabel}</FactRow>}
            {intent && <FactRow icon={<Heart />}>{intent}</FactRow>}
            {hasHeight && <FactRow icon={<Ruler />}>{formatHeightLabel(profile.height_cm as number)}</FactRow>}
            {isSpecified(profile.family_plans) && (
              <FactRow icon={<Baby />}>{traitText(FAMILY_PLANS_OPTIONS, profile.family_plans)}</FactRow>
            )}
            {profile.occupation?.trim() && <FactRow icon={<Briefcase />}>{profile.occupation}</FactRow>}
            {profile.industry?.trim() && <FactRow icon={<Building2 />}>{profile.industry}</FactRow>}
            {profile.education_level?.trim() && <FactRow icon={<GraduationCap />}>{profile.education_level}</FactRow>}
          </div>
        </ProfileSection>
      )}

      {photoAfter('workEducation')}

      {lifestyleRows.length > 0 && (
        <ProfileSection title={label('lifestyle', 'Lifestyle')}>
          <div className="space-y-2.5">
            {lifestyleRows.map((row) => (
              <LabelValueRow key={row.label} emoji={row.emoji} label={row.label} value={displayValue(row.value as string)} />
            ))}
          </div>
        </ProfileSection>
      )}

      {photoAfter('lifestyle')}

      {personalityRows.length > 0 && (
        <ProfileSection title={label('personality', 'Personality')}>
          <div className="space-y-4">
            {personalityRows.map((row) => (
              <PersonalityBar key={row.left} value={row.value} leftLabel={row.left} rightLabel={row.right} />
            ))}
          </div>
        </ProfileSection>
      )}

      {photoAfter('personality')}

      {funQuestions.length > 0 && (
        <ProfileSection title={label('funQuestions', 'Fun questions')}>
          <div className="space-y-3">
            {funQuestions.map((q) => (
              <div key={q.key}>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/55">{label(q.key, q.fallback)}</p>
                <p dir="auto" className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug text-white/90">{q.value}</p>
              </div>
            ))}
          </div>
        </ProfileSection>
      )}

      {communication.length > 0 && (
        <ProfileSection title={label('communicationStyle', 'Communication Style')} icon={<MessageCircle />}>
          <TraitChips items={communication.map((v) => traitText(COMMUNICATION_STYLE_OPTIONS, v))} />
        </ProfileSection>
      )}

      {photoAfter('communicationStyle')}

      {love.length > 0 && (
        <ProfileSection title={label('loveStyle', 'Love Style')} icon={<Gift />}>
          <TraitChips items={love.map((v) => traitText(LOVE_STYLE_OPTIONS, v))} />
        </ProfileSection>
      )}

      {interests.length > 0 && (
        <ProfileSection title={label('interests', 'Interests')} icon={<Sparkles />}>
          <TraitChips items={interests} />
        </ProfileSection>
      )}

      <VibeProfileSections profile={profile} />

      {favorites.length > 0 && (
        <ProfileSection title={label('favorites', 'Favorites')}>
          <TraitChips
            items={favorites.map((favorite) => (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">{favoriteEmoji(favorite.category)}</span>
                <span>{formatFavoriteLabel(favorite)}</span>
                {favorite.link && (
                  <MusicLinkBadge link={favorite.link} label={formatFavoriteLabel(favorite)} variant="inline" />
                )}
              </span>
            ))}
          />
        </ProfileSection>
      )}

      {pets.length > 0 && (
        <ProfileSection title={label('pets', 'Pets')} icon={<PawPrint />}>
          <TraitChips items={pets.map((v) => traitText(PETS_OPTIONS, v))} />
        </ProfileSection>
      )}

      {(languages.length > 0 || preferredLanguageName) && (
        <ProfileSection title={label('languagesSpoken', 'Languages')} icon={<Languages />}>
          {languages.length > 0 && <TraitChips items={languages} />}
          {preferredLanguageName && (
            <div className={cn(languages.length > 0 && 'mt-3')}>
              <FactRow icon={<Languages />}>
                {label('language', 'Language')}: {preferredLanguageName}
              </FactRow>
            </div>
          )}
        </ProfileSection>
      )}

      {profile.social_media && (
        <ProfileSection title={label('socialMedia', 'Social Media')}>
          <FactRow icon={<Share2 />}>{traitText(SOCIAL_MEDIA_OPTIONS, profile.social_media)}</FactRow>
        </ProfileSection>
      )}
    </div>
  );
};

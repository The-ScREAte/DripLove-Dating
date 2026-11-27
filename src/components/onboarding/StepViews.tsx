import React, { Suspense, lazy, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, Link as LinkIcon, Music2, Clock, Eye, EyeOff, Gift, Lock, Mail, Pencil, Plus, ShieldCheck, Upload, User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/ui/chip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FaceVerification from '@/components/FaceVerification';
import LocationInput from '@/components/forms/LocationInput';
import AdinkraSymbolSelector from '@/components/forms/AdinkraSymbolSelector';
import PromoCodeInput from '@/components/forms/PromoCodeInput';
import { formError, formInput, formSelectContent, formSelectTrigger } from '@/components/forms/formTheme';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import { getPhotoAcceptAttribute } from '@/utils/imageNormalizer';
import { getLatestAllowedDateOfBirth } from '@/utils/formValidation';
import { ChipGroup, ChoiceGroup, Field, MultiChips, PasswordMeter } from './OnboardingChrome';
import { DriftingHearts, FaceDemo } from './Illustrations';
import { PREDEFINED_INTERESTS } from '@/components/InterestsEditor';
import { LANGUAGE_OPTIONS } from '@/constants/languages';
import { COMMUNICATION_STYLE_OPTIONS, FAMILY_PLANS_OPTIONS, LOVE_STYLE_OPTIONS, PETS_OPTIONS, SOCIAL_MEDIA_OPTIONS } from '@/constants/profileTraits';
import { formatHeightLabel } from '@/utils/profileFormat';
import { useBackClose } from '@/utils/backStack';
import { sanitizeBio } from '@/utils/inputSanitization';
import PhotoTipsSheet from './PhotoTipsSheet';
import { BubbleCluster, SelectedPill } from './Bubbles';
import {
  GENRE_OPTIONS,
  MAX_ARTIST_LENGTH,
  MAX_GENRES,
  MAX_VALUES,
  SUGGESTED_MIN_GENRES,
  SUGGESTED_MIN_INTERESTS,
  SUGGESTED_MIN_VALUES,
  VALUE_OPTIONS,
  vibeLabel,
} from '@/constants/vibe';
import { MAX_INTERESTS_PICKED, MAX_LANGUAGES_PICKED } from './steps';
import type { ImageUpload, OnboardingFormData, OnboardingMode, StepErrors } from './types';
import type { useOnboardingFace } from './useOnboardingFace';
import type { useOnboardingPhotos } from './useOnboardingPhotos';

const PhotoCropModal = lazy(() => import('@/components/profile/PhotoCropModal'));

export interface LocationValue {
  country: string;
  countryCode: string;
  city: string;
  zipCode: string;
  latitude?: number;
  longitude?: number;
  isCustomCity?: boolean;
}

export interface StepViewProps {
  mode: OnboardingMode;
  formData: OnboardingFormData;
  errors: StepErrors;
  onInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setField: (field: string, value: string) => void;
  setFormData: React.Dispatch<React.SetStateAction<OnboardingFormData>>;
  onLocationChange: (location: LocationValue) => void;
  face: ReturnType<typeof useOnboardingFace>;
  photos: ReturnType<typeof useOnboardingPhotos>;
  maxPhotos: number;
  photoCount: number;
  promoEnabled: boolean;
  userId: string | null;
}

/* ------------------------------ account ------------------------------ */
export const AccountView = ({ formData, errors, onInput }: StepViewProps) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const toggle = (shown: boolean, set: (v: boolean) => void) => (
    <IconButton
      size="sm"
      onClick={() => set(!shown)}
      aria-label={shown ? t('onboarding.hidePassword') : t('onboarding.showPassword')}
    >
      {shown ? <EyeOff /> : <Eye />}
    </IconButton>
  );
  return (
    <div className="space-y-5">
      <Field
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        label={t('auth.email')}
        icon={<Mail />}
        placeholder="name@domain.com"
        value={formData.email}
        onChange={onInput}
        error={errors.email}
        required
      />
      <Field
        id="password"
        name="password"
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        label={t('auth.password')}
        icon={<Lock />}
        value={formData.password}
        onChange={onInput}
        error={errors.password}
        trailing={toggle(show, setShow)}
        required
      >
        <PasswordMeter password={formData.password} />
      </Field>
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type={showConfirm ? 'text' : 'password'}
        autoComplete="new-password"
        label={t('auth.confirmPassword')}
        icon={<Lock />}
        value={formData.confirmPassword}
        onChange={onInput}
        error={errors.confirmPassword}
        trailing={toggle(showConfirm, setShowConfirm)}
        required
      />
    </div>
  );
};

/* -------------------- you: name + birthday + gender -------------------- */
export const YouView = ({ formData, errors, onInput, setField }: StepViewProps) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 min-[380px]:grid-cols-2 min-[380px]:gap-3">
        <Field
          id="firstName"
          name="firstName"
          type="text"
          autoComplete="given-name"
          autoCapitalize="words"
          label={t('registration.firstName')}
          icon={<User />}
          value={formData.firstName}
          onChange={onInput}
          error={errors.firstName}
          required
        />
        <Field
          id="lastName"
          name="lastName"
          type="text"
          autoComplete="family-name"
          autoCapitalize="words"
          label={t('registration.lastName')}
          icon={<User />}
          value={formData.lastName}
          onChange={onInput}
          error={errors.lastName}
          required
        />
      </div>
      <Field
        id="dateOfBirth"
        name="dateOfBirth"
        type="date"
        autoComplete="bday"
        max={getLatestAllowedDateOfBirth()}
        label={t('registration.dateOfBirth')}
        value={formData.dateOfBirth}
        onChange={onInput}
        error={errors.dateOfBirth}
        className="[&_input]:[color-scheme:dark]"
        // Dim the "mm/dd/yyyy" mask until a date is picked so an empty field
        // doesn't read as already filled in.
        style={formData.dateOfBirth ? undefined : { color: 'rgba(255,255,255,0.4)' }}
        required
      />
      <ChoiceGroup
        name="gender"
        layout="row"
        label={t('registration.iAm')}
        value={formData.gender}
        onChange={(v) => setField('gender', v)}
        error={errors.gender}
        required
        options={[
          { value: 'male', label: t('registration.male') },
          { value: 'female', label: t('registration.female') },
          { value: 'other', label: t('registration.other') },
        ]}
      />
    </div>
  );
};

/* ------------------ looking for (+ relationship intent) ------------------ */
export const LookingView = ({ mode, formData, errors, setField }: StepViewProps) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-7">
      <ChoiceGroup
        name="preference"
        layout="row"
        label={t('registration.lookingFor')}
        value={formData.preference}
        onChange={(v) => setField('preference', v)}
        error={errors.preference}
        required
        options={[
          { value: 'male', label: t('registration.male') },
          { value: 'female', label: t('registration.female') },
          { value: 'everyone', label: t('registration.everyone') },
        ]}
      />
      <ChoiceGroup
        name="relationshipIntent"
        label={t('registration.relationshipIntent')}
        value={formData.relationshipIntent}
        onChange={(v) => setField('relationshipIntent', v)}
        error={errors.relationshipIntent}
        required={mode === 'complete'}
        optional={mode !== 'complete'}
        options={[
          { value: 'casual', label: t('registration.casual') },
          { value: 'serious', label: t('registration.serious') },
          { value: 'open_to_anything', label: t('registration.openToAnything') },
        ]}
      />
    </div>
  );
};

/* ------------- "You're in!" - the buttons live in the wizard footer ------------- */
export const CelebrateView = () => <DriftingHearts />;

/* ------------------------------ location ----------------------------- */
export const LocationView = ({ formData, errors, onLocationChange }: StepViewProps) => (
  <LocationInput
    country={formData.country}
    city={formData.city}
    zipCode={formData.zipCode}
    onLocationChange={onLocationChange}
    errors={{ country: errors.country, city: errors.city, zipCode: errors.zipCode }}
    required={false}
    autoDetect={true}
    tone="dark"
  />
);

/* -------------------------------- work ------------------------------- */
export const WorkView = ({ mode, formData, errors, setField }: StepViewProps) => {
  const { t } = useTranslation();
  const required = mode === 'complete';
  const labelFor = (text: string) => (
    <label className="ob-label">
      {text}
      {required && <span className="ob-required"> *</span>}
    </label>
  );
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        {labelFor(t('profile.occupation'))}
        <Select value={formData.occupation} onValueChange={(v) => setField('occupation', v)}>
          <SelectTrigger className={`${formSelectTrigger(!!errors.occupation)} h-[52px]`} aria-label={t('profile.occupation')}>
            <SelectValue placeholder={t('onboarding.select')} />
          </SelectTrigger>
          <SelectContent className={formSelectContent}>
            {occupationOptions.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.occupation && <p role="alert" className="ob-error">{errors.occupation}</p>}
      </div>
      <div className="space-y-1.5">
        {labelFor(t('profile.industry'))}
        <Select value={formData.industry} onValueChange={(v) => setField('industry', v)}>
          <SelectTrigger className={`${formSelectTrigger(!!errors.industry)} h-[52px]`} aria-label={t('profile.industry')}>
            <SelectValue placeholder={t('onboarding.select')} />
          </SelectTrigger>
          <SelectContent className={formSelectContent}>
            {industryOptions.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.industry && <p role="alert" className="ob-error">{errors.industry}</p>}
      </div>
      <ChipGroup
        name="educationLevel"
        label={t('registration.educationLevel')}
        value={formData.educationLevel}
        onChange={(v) => setField('educationLevel', v)}
        error={errors.educationLevel}
        required={required}
        options={[
          { value: 'High School', label: t('registration.highSchool') },
          { value: 'Some College', label: t('registration.someCollege') },
          { value: 'Associate Degree', label: t('registration.associateDegree') },
          { value: "Bachelor's Degree", label: t('registration.bachelorsDegree') },
          { value: "Master's Degree", label: t('registration.mastersDegree') },
          { value: 'Doctorate', label: t('registration.doctorate') },
          { value: 'Other', label: t('registration.other') },
        ]}
      />
    </div>
  );
};

/* ------------------------------- signs ------------------------------- */
export const SignsView = ({ formData, errors, setFormData }: StepViewProps) => (
  <div className="space-y-4">
    {/* the selector shows its own "n / max" counter */}
    <AdinkraSymbolSelector
      selectedSymbols={formData.adinkraSymbols}
      onChange={(symbols) => setFormData((prev) => ({ ...prev, adinkraSymbols: symbols }))}
      userCountry={formData.country}
    />
    {errors.adinkraSymbols && <p role="alert" className={formError}>{errors.adinkraSymbols}</p>}
  </div>
);

/* -------------------------------- face ------------------------------- */
export const FaceView = ({ errors, face }: StepViewProps) => {
  const { t } = useTranslation();
  if (face.faceVerified) {
    return (
      <div className="ob-card-success" role="status">
        <CheckCircle className="h-6 w-6 shrink-0" aria-hidden="true" />
        <p>{t('onboarding.face.done')}</p>
      </div>
    );
  }
  // Just the animated "face in the oval" picture above the real camera widget -
  // the one short line under the title says the rest.
  return (
    <div className="space-y-4">
      <FaceDemo />
      <div className={`rounded-2xl border p-3 ${errors.faceVerification ? 'border-red-400/70' : 'border-white/10'}`}>
        <FaceVerification onVerified={face.handleFaceVerified} disabled={face.isVerifying} />
      </div>
      {errors.faceVerification && <p role="alert" className={formError}>{errors.faceVerification}</p>}
    </div>
  );
};

/* ------------------------------- photos ------------------------------ */
const PhotoStatus = ({ image }: { image: ImageUpload }) => {
  const { t } = useTranslation();
  switch (image.status) {
    case 'moderating':
      return (
        <div className="ob-photo-overlay">
          <ShieldCheck className="h-6 w-6 animate-pulse" aria-hidden="true" />
          {t('profileCompletion.moderating')}
        </div>
      );
    case 'approved':
      return (
        <span className="ob-photo-status" style={{ background: '#16a34a' }}>
          <CheckCircle className="h-4 w-4" aria-label={t('onboarding.photos.approved')} />
        </span>
      );
    case 'pending':
      return (
        <span className="ob-photo-status" style={{ background: '#ea580c' }} title={t('profileCompletion.pending')}>
          <Clock className="h-4 w-4" aria-label={t('profileCompletion.pending')} />
        </span>
      );
    case 'rejected':
      return (
        <div className="ob-photo-overlay" data-tone="bad">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          {t('profileCompletion.rejected')}
        </div>
      );
    default:
      return null;
  }
};

const TIPS_SEEN_KEY = 'dl_photo_tips_seen';

export const PhotosView = ({ formData, errors, setFormData, photos, maxPhotos, promoEnabled, userId }: StepViewProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(!!formData.promoCode);
  const { images, croppingImage, setCroppingImage } = photos;

  // Android hardware back closes the tips sheet / crop editor before it steps back.
  useBackClose(tipsOpen, () => setTipsOpen(false), { escape: false });
  useBackClose(!!croppingImage, () => setCroppingImage(null), { escape: false });

  const openPicker = () => inputRef.current?.click();
  const onAddClick = () => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(TIPS_SEEN_KEY) === '1';
    } catch {
      /* storage unavailable - just show the tips */
    }
    if (seen) return openPicker();
    try {
      sessionStorage.setItem(TIPS_SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setTipsOpen(true);
  };

  const atMax = images.length >= maxPhotos;

  return (
    <div className="space-y-5">
      <input
        ref={inputRef}
        id="photos"
        type="file"
        accept={getPhotoAcceptAttribute(Capacitor.isNativePlatform())}
        multiple
        onChange={photos.handleImageUpload}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {!atMax && (
        <div>
          <button type="button" className="ob-drop" onClick={onAddClick}>
            <span className="ob-drop-icon">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-[15px] font-semibold">{t('onboarding.photos.add')}</span>
          </button>
          {/* the do / don't examples live in a sheet - shown once before the first upload, reopen any time */}
          <div className="mt-1 flex justify-center">
            <Button variant="link" onClick={() => setTipsOpen(true)} className="h-11 px-5">
              {t('onboarding.photos.tipsLink')}
            </Button>
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="ob-photo-grid">
          {images.map((image, index) => (
            <div key={image.preview} className="ob-photo">
              <img src={image.preview} alt={t('onboarding.photos.alt', { n: index + 1 })} width={400} height={500} decoding="async" />
              <div className="ob-photo-actions">
                <IconButton
                  variant="overlay"
                  size="sm"
                  onClick={() => setCroppingImage({ preview: image.preview })}
                  aria-label={t('onboarding.photos.crop')}
                >
                  <Pencil />
                </IconButton>
                <IconButton
                  variant="overlay"
                  size="sm"
                  onClick={() => photos.removeImage(image.preview)}
                  aria-label={t('onboarding.photos.remove')}
                >
                  <X />
                </IconButton>
              </div>
              <PhotoStatus image={image} />
              {index === 0 && image.status !== 'rejected' && image.status !== 'moderating' && (
                <span className="ob-photo-badge">{t('onboarding.photos.main')}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {errors.images && <p role="alert" className="ob-error">{errors.images}</p>}

      {promoEnabled && (
        <div className="ob-card">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left text-[15px] font-medium"
            aria-expanded={promoOpen}
            onClick={() => setPromoOpen((o) => !o)}
          >
            <span className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-pink-300" aria-hidden="true" />
              {t('onboarding.promo.toggle')}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${promoOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {promoOpen && (
            <div className="mt-4">
              <PromoCodeInput
                value={formData.promoCode}
                onChange={(value, promoCodeId) =>
                  setFormData((prev) => ({ ...prev, promoCode: value, promoCodeId }))
                }
              />
            </div>
          )}
        </div>
      )}

      <PhotoTipsSheet open={tipsOpen} onOpenChange={setTipsOpen} onContinue={openPicker} maxPhotos={maxPhotos} />

      {croppingImage && (
        <Suspense fallback={null}>
          <PhotoCropModal
            imageUrl={croppingImage.preview}
            userId={userId || ''}
            onClose={() => setCroppingImage(null)}
            onApply={photos.handleCroppedImage}
          />
        </Suspense>
      )}
    </div>
  );
};

/* ---------------------- optional: about me (bio) ---------------------- */
const BIO_STARTERS = ['starter1', 'starter2', 'starter3', 'starter4'] as const;

export const BioView = ({ formData, setFormData }: StepViewProps) => {
  const { t } = useTranslation();
  const addStarter = (text: string) =>
    setFormData((prev) => ({ ...prev, bio: sanitizeBio(prev.bio.trim() ? `${prev.bio.trim()} ${text} ` : `${text} `) }));
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="bio" className="sr-only">
          {t('profile.bio')}
        </label>
        <Textarea
          tone="dark"
          id="bio"
          name="bio"
          className="ob-bio-box mt-1.5"
          value={formData.bio}
          onChange={(e) => setFormData((prev) => ({ ...prev, bio: sanitizeBio(e.target.value) }))}
          placeholder={t('onboarding.bio.placeholder')}
          maxLength={500}
        />
        <p className="ob-help" aria-live="polite">{formData.bio.length} / 500</p>
      </div>
      {/* tap a starter to begin - no extra instructions */}
      <div className="ob-chips">
        {BIO_STARTERS.map((k) => (
          <Chip key={k} onClick={() => addStarter(t(`onboarding.bio.${k}`))}>
            {t(`onboarding.bio.${k}`)}
          </Chip>
        ))}
      </div>
    </div>
  );
};

/* ------------------- optional: height + languages ------------------- */
const HEIGHTS_CM = Array.from({ length: 213 - 137 + 1 }, (_, i) => 137 + i);
const POPULAR_LANGUAGES = ['English', 'French', 'Spanish', 'Portuguese', 'Arabic', 'Swahili', 'Twi', 'Yoruba', 'Igbo', 'Hausa', 'Zulu', 'Amharic', 'Akan', 'Wolof'];

const toggleIn = (list: string[], value: string, max?: number) =>
  list.includes(value) ? list.filter((v) => v !== value) : max !== undefined && list.length >= max ? list : [...list, value];

export const DetailsView = ({ formData, setFormData }: StepViewProps) => {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  const popular = POPULAR_LANGUAGES.filter((l) => LANGUAGE_OPTIONS.includes(l));
  const visible = more ? LANGUAGE_OPTIONS : popular;
  // keep anything already picked visible even when the list is collapsed
  const shown = [...new Set([...visible, ...formData.languages])];
  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <label className="ob-label">
          {t('profile.height')}
        </label>
        <Select
          value={formData.heightCm ? String(formData.heightCm) : undefined}
          onValueChange={(v) => setFormData((prev) => ({ ...prev, heightCm: Number(v) }))}
        >
          <SelectTrigger className={`${formSelectTrigger(false)} h-[52px]`} aria-label={t('profile.height')}>
            <SelectValue placeholder={t('profile.selectHeight')} />
          </SelectTrigger>
          <SelectContent className={`${formSelectContent} max-h-72`}>
            {HEIGHTS_CM.map((cm) => (
              <SelectItem key={cm} value={String(cm)}>
                {formatHeightLabel(cm)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <MultiChips
          label={t('onboarding.details.languages', { max: MAX_LANGUAGES_PICKED })}
          options={shown.map((l) => ({ value: l, label: l }))}
          selected={formData.languages}
          max={MAX_LANGUAGES_PICKED}
          onToggle={(v) => setFormData((prev) => ({ ...prev, languages: toggleIn(prev.languages, v, MAX_LANGUAGES_PICKED) }))}
        />
        <Button variant="link" className="ob-more" onClick={() => setMore((m) => !m)}>
          {more ? t('onboarding.showFewer') : t('onboarding.showMore')}
        </Button>
      </div>
    </div>
  );
};

/* ------------------------ optional: lifestyle ------------------------ */
export const LifestyleView = ({ formData, setFormData }: StepViewProps) => {
  const { t } = useTranslation();
  const yns = [
    { value: 'yes', label: t('common.yes') },
    { value: 'no', label: t('common.no') },
    { value: 'socially', label: t('profile.socially') },
  ];
  const pick = (key: 'drinking' | 'smoking' | 'exerciseLevel' | 'sleepingSchedule' | 'socialMedia') => (v: string) =>
    setFormData((prev) => ({ ...prev, [key]: prev[key] === v ? '' : v }));
  return (
    <div className="space-y-7">
      <ChipGroup name="drinking" label={t('profile.drinking')} value={formData.drinking} options={yns} onChange={pick('drinking')} />
      <ChipGroup name="smoking" label={t('profile.smoking')} value={formData.smoking} options={yns} onChange={pick('smoking')} />
      <ChipGroup
        name="exercise"
        label={t('profile.exercise')}
        value={formData.exerciseLevel}
        onChange={pick('exerciseLevel')}
        options={[
          { value: 'active', label: t('profile.exerciseOptions.active') },
          { value: 'moderate', label: t('profile.exerciseOptions.moderate') },
          { value: 'inactive', label: t('profile.exerciseOptions.inactive') },
        ]}
      />
      <ChipGroup
        name="sleep"
        label={t('profile.sleepingSchedule')}
        value={formData.sleepingSchedule}
        onChange={pick('sleepingSchedule')}
        options={[
          { value: 'early_bird', label: t('profile.sleepOptions.earlyBird') },
          { value: 'night_owl', label: t('profile.sleepOptions.nightOwl') },
          { value: 'flexible', label: t('profile.sleepOptions.flexible') },
        ]}
      />
      <MultiChips
        label={t('onboarding.lifestyle.pets')}
        options={PETS_OPTIONS}
        selected={formData.pets}
        onToggle={(v) => setFormData((prev) => ({ ...prev, pets: toggleIn(prev.pets, v) }))}
      />
      <ChipGroup
        name="social"
        label={t('onboarding.lifestyle.social')}
        value={formData.socialMedia}
        onChange={pick('socialMedia')}
        options={SOCIAL_MEDIA_OPTIONS}
      />
    </div>
  );
};

/* ------------------------ optional: interests ------------------------ */
const POPULAR_INTERESTS = ['Travel', 'Music', 'Movies', 'Fitness', 'Cooking', 'Photography', 'Dancing', 'Foodie', 'Reading', 'Gaming', 'Hiking', 'Art', 'Coffee', 'Fashion', 'Yoga', 'Football', 'Basketball', 'Concerts', 'Nature', 'Netflix', 'Wellness', 'Technology', 'Spirituality', 'Beach Life', 'Brunch', 'Podcasts', 'Volunteering', 'Gardening', 'Languages', 'Comedy'];

export const InterestsView = ({ formData, setFormData }: StepViewProps) => {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  const base = more ? PREDEFINED_INTERESTS : POPULAR_INTERESTS.filter((i) => PREDEFINED_INTERESTS.includes(i)).slice(0, 24);
  const shown = [...new Set([...base, ...formData.interests])];
  return (
    <div className="ob-vibe-stack">
      <SelectedPill count={formData.interests.length} min={SUGGESTED_MIN_INTERESTS} max={MAX_INTERESTS_PICKED} text={t('onboarding.vibe.selected', 'selected')} />
      <BubbleCluster
        label={t('onboarding.steps.interests.title')}
        options={shown.map((i) => ({ value: i, label: i }))}
        selected={formData.interests}
        max={MAX_INTERESTS_PICKED}
        onToggle={(v) => setFormData((prev) => ({ ...prev, interests: toggleIn(prev.interests, v, MAX_INTERESTS_PICKED) }))}
      />
      <Button variant="link" className="ob-more" onClick={() => setMore((m) => !m)}>
        {more ? t('onboarding.showFewer') : t('onboarding.showMore')}
      </Button>
    </div>
  );
};

/* --------------- optional: what matters most in a relationship --------------- */
export const ValuesView = ({ formData, setFormData }: StepViewProps) => {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => t(key, fallback);
  return (
    <div className="ob-vibe-stack">
      <SelectedPill count={formData.values.length} min={SUGGESTED_MIN_VALUES} max={MAX_VALUES} text={t('onboarding.vibe.selected', 'selected')} />
      <BubbleCluster
        label={t('onboarding.steps.values.title')}
        options={VALUE_OPTIONS.map((o) => ({ value: o.id, label: vibeLabel('values', o.id, tr), emoji: o.emoji }))}
        selected={formData.values}
        max={MAX_VALUES}
        onToggle={(v) => setFormData((prev) => ({ ...prev, values: toggleIn(prev.values, v, MAX_VALUES) }))}
      />
    </div>
  );
};

/* ------------------------------ optional: music ------------------------------ */
export const MusicView = ({ formData, setFormData, errors }: StepViewProps) => {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => t(key, fallback);
  const setArtist = (index: number, value: string) =>
    setFormData((prev) => {
      const next = [...prev.musicArtists];
      while (next.length <= index) next.push('');
      next[index] = value.slice(0, MAX_ARTIST_LENGTH);
      return { ...prev, musicArtists: next };
    });
  return (
    <div className="ob-vibe-stack">
      <SelectedPill count={formData.musicGenres.length} min={SUGGESTED_MIN_GENRES} max={MAX_GENRES} text={t('onboarding.vibe.selected', 'selected')} />
      <BubbleCluster
        label={t('onboarding.steps.music.title')}
        options={GENRE_OPTIONS.map((o) => ({ value: o.id, label: vibeLabel('genres', o.id, tr), emoji: o.emoji }))}
        selected={formData.musicGenres}
        max={MAX_GENRES}
        onToggle={(v) => setFormData((prev) => ({ ...prev, musicGenres: toggleIn(prev.musicGenres, v, MAX_GENRES) }))}
      />
      <div className="w-full space-y-4 pt-2">
        {[0, 1, 2].map((i) => (
          <Field
            key={i}
            id={`musicArtist${i}`}
            name={`musicArtist${i}`}
            label={i === 0 ? t('onboarding.music.artists', 'Favorite artists') : t('onboarding.music.artistN', { n: i + 1, defaultValue: 'Artist {{n}}' })}
            optional={i === 0}
            icon={<Music2 />}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={MAX_ARTIST_LENGTH}
            placeholder={t('onboarding.music.artistPlaceholder', 'e.g. Burna Boy')}
            value={formData.musicArtists[i] ?? ''}
            onChange={(e) => setArtist(i, e.target.value)}
          />
        ))}
        <Field
          id="musicLink"
          name="musicLink"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          label={t('onboarding.music.link', 'Share a song or playlist')}
          optional
          icon={<LinkIcon />}
          placeholder="Spotify, Apple Music, YouTube or SoundCloud"
          help={t('onboarding.music.linkHelp', 'It plays right on your profile.')}
          value={formData.musicLink}
          onChange={(e) => setFormData((prev) => ({ ...prev, musicLink: e.target.value.slice(0, 300) }))}
          error={errors.musicLink}
        />
      </div>
    </div>
  );
};

/* -------------------- optional: love & relationship -------------------- */
export const LoveView = ({ formData, setFormData }: StepViewProps) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-7">
      <MultiChips
        label={t('onboarding.love.loveStyle')}
        options={LOVE_STYLE_OPTIONS}
        selected={formData.loveStyle}
        onToggle={(v) => setFormData((prev) => ({ ...prev, loveStyle: toggleIn(prev.loveStyle, v) }))}
      />
      <MultiChips
        label={t('onboarding.love.communication')}
        options={COMMUNICATION_STYLE_OPTIONS}
        selected={formData.communicationStyle}
        onToggle={(v) => setFormData((prev) => ({ ...prev, communicationStyle: toggleIn(prev.communicationStyle, v) }))}
      />
      <ChipGroup
        name="familyPlans"
        label={t('onboarding.love.family')}
        value={formData.familyPlans}
        options={FAMILY_PLANS_OPTIONS}
        onChange={(v) => setFormData((prev) => ({ ...prev, familyPlans: prev.familyPlans === v ? '' : v }))}
      />
    </div>
  );
};

export const STEP_VIEWS = {
  account: AccountView,
  you: YouView,
  looking: LookingView,
  location: LocationView,
  work: WorkView,
  signs: SignsView,
  face: FaceView,
  photos: PhotosView,
  celebrate: CelebrateView,
  bio: BioView,
  details: DetailsView,
  lifestyle: LifestyleView,
  interests: InterestsView,
  values: ValuesView,
  music: MusicView,
  love: LoveView,
} as const;

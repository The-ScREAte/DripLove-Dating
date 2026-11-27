import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseFavorites } from '@/constants/favorites';
import { getVibe, MAX_ARTISTS } from '@/constants/vibe';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { fetchMyProfile } from '@/utils/myProfile';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePromoCodeEnabled } from '@/hooks/usePromoCodeEnabled';
import { getLanguageForCountry } from '@/i18n/config';
import { getDateOfBirthError } from '@/utils/formValidation';
import { useBackClose } from '@/utils/backStack';
import { initialFormData } from '@/constants/formData';
import OnboardingTransition from '@/components/forms/OnboardingTransition';
import { FORM_PAGE_BG } from '@/components/forms/formTheme';
import HoppingLogo from '@/components/HoppingLogo';
import { HeartsBurst, StepHero, type HeroKind } from './Illustrations';
import { ProgressHeader } from './OnboardingChrome';
import { STEP_VIEWS, type LocationValue, type StepViewProps } from './StepViews';
import {
  MAX_INTERESTS_PICKED,
  MAX_PHOTOS,
  cheerKey,
  countSelectablePhotos,
  firstInvalidStep,
  getPrimaryHint,
  getSteps,
  isBonusStep,
  isRequired,
  knownStepIds,
  phaseGroup,
  phaseOf,
  progressFraction,
  splitFlows,
  validateStep,
  type StepContext,
} from './steps';
import { checkEmailAccount, type EmailAccountKind } from '@/utils/emailAccountCheck';
import { getPasswordResetRedirectUri } from '@/config/oauth';
import { submitCompletion } from './completeSubmit';
import { submitRegistration } from './registerSubmit';
import { useOnboardingFace } from './useOnboardingFace';
import { useOnboardingPhotos } from './useOnboardingPhotos';
import type { OnboardingFormData, OnboardingMode, StepErrors, StepId } from './types';
import './onboarding.css';

export interface OnboardingWizardProps {
  mode: OnboardingMode;
  /** complete mode: the already-signed-in user (e.g. after Google/Apple sign-in) */
  user?: User | null;
  /** register mode */
  onBackToLogin?: () => void;
  /** Called with true the moment the account is created (signUp succeeds), and
   *  false right before onSubmit fires, so the parent's global auth routing
   *  defers to this flow instead of racing it away mid-save. */
  onRegistrationInProgressChange?: (inProgress: boolean) => void;
  /** register mode: everything saved - hand over to terms */
  onSubmit?: (data: unknown) => void;
  /** complete mode: profile saved - hand over to terms */
  onComplete?: () => void;
  /** complete mode: user backed out (signs them out) */
  onCancel?: () => void;
}

type Dir = 'fwd' | 'back' | 'none';

const draftKey = (mode: OnboardingMode) => `dl_onboarding_draft_v2_${mode}`;
// Passwords and promo state are never written to storage.
const SENSITIVE: (keyof OnboardingFormData)[] = ['password', 'confirmPassword', 'promoCode', 'promoCodeId'];

// Passwords are never written to storage, but a remount of the form (a hot reload, the OS reclaiming the
// page) must not silently drop what was typed - so they live in memory for this page's lifetime only.
const memoryPasswords: Partial<Record<OnboardingMode, { password: string; confirmPassword: string }>> = {};

function readDraft(mode: OnboardingMode): { stepId?: StepId; formData?: Partial<OnboardingFormData> } | null {
  try {
    const raw = sessionStorage.getItem(draftKey(mode));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft(mode: OnboardingMode) {
  try {
    sessionStorage.removeItem(draftKey(mode));
  } catch {
    /* ignore */
  }
}

const OnboardingWizard = ({
  mode,
  user = null,
  onBackToLogin,
  onRegistrationInProgressChange,
  onSubmit,
  onComplete,
  onCancel,
}: OnboardingWizardProps) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { isEnabled: promoEnabled } = usePromoCodeEnabled();
  const maxPhotos = MAX_PHOTOS[mode];

  // ---- form state (draft restored once; never includes passwords) ----
  const [formData, setFormData] = useState<OnboardingFormData>(() => {
    const draft = readDraft(mode)?.formData;
    const safe = { ...(draft || {}) } as Partial<OnboardingFormData>;
    SENSITIVE.forEach((k) => delete safe[k]);
    return { ...initialFormData, ...safe, ...(memoryPasswords[mode] ?? {}) };
  });
  const [errors, setErrors] = useState<StepErrors>({});
  const formRef = useRef(formData);
  formRef.current = formData;
  memoryPasswords[mode] = { password: formData.password, confirmPassword: formData.confirmPassword };

  // ---- account (sign-up creates it only at the very end; a resumed one exists) ----
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const profileSavedRef = useRef(false);
  const ownerId = mode === 'complete' ? user?.id ?? null : accountUserId;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  // Is the typed email already registered? (checked when leaving the field / tapping Continue)
  const [emailCheck, setEmailCheck] = useState<{ email: string; kind: EmailAccountKind } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckInflight = useRef<{ email: string; promise: Promise<EmailAccountKind> } | null>(null);
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const photos = useOnboardingPhotos({ userId: ownerId, maxPhotos });
  const face = useOnboardingFace(mode, ownerId);
  const { images, setImages } = photos;
  const photoCount = countSelectablePhotos(images);

  // ---- steps: required screens -> "You're in!" -> bonus screens ----
  // (complete-profile skips what's already known: OAuth name, an existing profile...)
  const [skipped, setSkipped] = useState<StepId[]>([]);
  const steps = useMemo(
    () => getSteps(mode, mode === 'register' && !!accountUserId).filter((s) => !skipped.includes(s)),
    [mode, accountUserId, skipped],
  );
  const [stepId, setStepId] = useState<StepId>(() => {
    const saved = readDraft(mode)?.stepId;
    const initial = getSteps(mode, false);
    return saved && initial.includes(saved) ? saved : initial[0];
  });
  const [dir, setDir] = useState<Dir>('none');
  const stepIndex = Math.max(0, steps.indexOf(stepId));
  const activeStep = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;
  const phase = phaseOf(steps, activeStep);
  const fraction = progressFraction(steps, activeStep);

  // Complete-profile: hold the form back for a beat until we know what's already
  // on file (prefill + saved photos + face), then drop those steps - so the
  // person lands on the first thing that's actually missing, with no flash.
  const [prefilled, setPrefilled] = useState(mode === 'register');
  const [skipDone, setSkipDone] = useState(mode === 'register');
  useEffect(() => {
    if (skipDone || !prefilled || !face.faceChecked) return;
    const known = knownStepIds(mode, formRef.current, face.faceVerified, photoCount);
    const remaining = getSteps(mode, false).filter((s) => !known.includes(s));
    setSkipped(known);
    setStepId((prev) => (remaining.includes(prev) ? prev : remaining[0]));
    setSkipDone(true);
  }, [skipDone, prefilled, face.faceChecked, face.faceVerified, photoCount, mode]);

  const ctx: StepContext = { mode, formData, faceVerified: face.faceVerified, photoCount, t };

  const go = useCallback((next: StepId, direction: Dir) => {
    setDir(direction);
    setStepId(next);
  }, []);

  // ---- draft autosave (non-sensitive fields only) ----
  useEffect(() => {
    try {
      const safe: Partial<OnboardingFormData> = { ...formData };
      SENSITIVE.forEach((k) => delete safe[k]);
      sessionStorage.setItem(draftKey(mode), JSON.stringify({ stepId: activeStep, formData: safe }));
    } catch {
      /* storage unavailable - nothing to resume, nothing lost */
    }
  }, [formData, activeStep, mode]);

  // ---- resume: sign-up that already created an account (e.g. app closed mid-way) ----
  useEffect(() => {
    if (mode !== 'register') return;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled || !session?.user?.id) return;
      const sessionUser = session.user;
      setAccountUserId(sessionUser.id);

      const meta = (sessionUser.user_metadata || {}) as Record<string, string | undefined>;
      const current = formRef.current;
      const merged: OnboardingFormData = {
        ...current,
        email: sessionUser.email || current.email,
        firstName: current.firstName || meta.first_name || '',
        lastName: current.lastName || meta.last_name || '',
        dateOfBirth: current.dateOfBirth || meta.date_of_birth || '',
        gender: current.gender || meta.gender || '',
        preference: current.preference || meta.preference || '',
        relationshipIntent: current.relationshipIntent || meta.relationship_intent || '',
        city: current.city || meta.city || '',
        country: current.country || meta.country || '',
      };
      setFormData(merged);
      await photos.restoreFromDatabase(sessionUser.id);
      if (cancelled) return;

      // Land on the first required screen that still needs something (the account
      // step is done). Face + photos are checked live on their own screens.
      const resumeSteps = getSteps('register', true);
      const bad = firstInvalidStep(resumeSteps, { mode: 'register', formData: merged, faceVerified: true, photoCount: 99, t }, 'signs');
      setDir('none');
      setStepId(bad ? bad.step : 'face');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ---- complete mode: prefill from the signed-in user/profile + restore saved photos ----
  useEffect(() => {
    if (mode !== 'complete' || !user) return;
    let cancelled = false;
    (async () => {
      // Own full row via get_my_profile (zip_code is not publicly readable).
      const { data: profile } = await fetchMyProfile(user.id);

      // Name from OAuth metadata (Google and Apple).
      const fullName = (user.user_metadata?.full_name || user.user_metadata?.name || '') as string;
      const firstName = user.user_metadata?.first_name || user.user_metadata?.given_name || fullName.split(' ')[0] || '';
      const lastName = user.user_metadata?.last_name || user.user_metadata?.family_name || fullName.split(' ').slice(1).join(' ') || '';

      if (cancelled) return;
      // Only real answers count as "known" - the table has placeholder defaults
      // (e.g. 'all') that must never make a step look finished.
      const pick = (value: unknown, allowed: string[]) => (typeof value === 'string' && allowed.includes(value) ? value : '');
      const text = (value: unknown) => (typeof value === 'string' && value !== 'all' ? value : '');
      const saved = profile
        ? {
            dateOfBirth: text(profile.date_of_birth),
            gender: pick(profile.gender, ['male', 'female', 'other']),
            preference: pick(profile.preference, ['male', 'female', 'everyone']),
            relationshipIntent: pick(profile.relationship_intent, ['casual', 'serious', 'open_to_anything']),
            city: text(profile.city),
            country: text(profile.country),
            countryCode: text(profile.country_code),
            zipCode: text(profile.zip_code),
            latitude: typeof profile.latitude === 'number' ? profile.latitude : undefined,
            longitude: typeof profile.longitude === 'number' ? profile.longitude : undefined,
            isCustomCity: !!profile.is_custom_city,
            occupation: text(profile.occupation),
            industry: text(profile.industry),
            educationLevel: text(profile.education_level),
            adinkraSymbols: Array.isArray(profile.adinkra_symbols) ? profile.adinkra_symbols : [],
            bio: text(profile.bio),
            interests: Array.isArray(profile.interests) ? profile.interests : [],
            // Existing favorites (carried through untouched) + anything already chosen for vibe.
            favorites: parseFavorites(profile.favorites),
            values: getVibe(profile.favorites).values,
            musicGenres: getVibe(profile.favorites).genres,
            musicArtists: getVibe(profile.favorites).artists.slice(0, MAX_ARTISTS),
            musicLink: parseFavorites(profile.favorites).find((f) => f.category === 'Music' && f.link)?.link ?? '',
          }
        : null;

      setFormData((prev) => {
        // NB: the provider email (Apple may give a private relay address) is never shown.
        const next = { ...prev, email: user.email || '' };
        next.firstName = prev.firstName || profile?.first_name || firstName;
        next.lastName = prev.lastName || profile?.last_name || lastName;
        // what's already saved fills gaps but never overwrites what's been typed
        if (saved) {
          (Object.keys(saved) as (keyof typeof saved)[]).forEach((k) => {
            const cur = prev[k as keyof OnboardingFormData];
            const empty = cur === '' || cur === undefined || (Array.isArray(cur) && cur.length === 0);
            if (empty && saved[k] !== undefined && saved[k] !== '') (next as Record<string, unknown>)[k] = saved[k];
          });
        }
        return next;
      });
      await photos.restoreFromDatabase(user.id);
      if (!cancelled) setPrefilled(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user?.id]);

  // ---- field handlers (same behaviour as the two original forms) ----
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Date of birth is checked the moment it's picked, so an under-18 date is
    // flagged right away instead of only after tapping Continue.
    if (name === 'dateOfBirth') {
      setErrors((prev) => ({ ...prev, dateOfBirth: getDateOfBirthError(value) }));
      return;
    }
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const setField = (field: string, value: string) => {
    setFormData((prev) => {
      const updates: Record<string, string> = { [field]: value };
      // Auto-select the opposite gender for preference, but allow manual override.
      if (field === 'gender' && !prev.preference) {
        if (value === 'male') updates.preference = 'female';
        else if (value === 'female') updates.preference = 'male';
      }
      return { ...prev, ...updates };
    });
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const onLocationChange = (location: LocationValue) => {
    setFormData((prev) => ({
      ...prev,
      country: location.country,
      countryCode: location.countryCode,
      city: location.city,
      zipCode: location.zipCode,
      latitude: location.latitude,
      longitude: location.longitude,
      isCustomCity: location.isCustomCity || false,
    }));

    // Complete-profile has always switched the app language to the user's country.
    if (mode === 'complete') {
      const detectedLanguage = getLanguageForCountry(location.country);
      if (detectedLanguage) i18n.changeLanguage(detectedLanguage);
    }

    if (errors.country || errors.city || errors.zipCode) {
      setErrors((prev) => ({ ...prev, country: '', city: '', zipCode: '' }));
    }
  };

  // Quiet validation: nothing is flagged on an untouched form. A field is checked
  // once the person leaves it (blur) - one calm message under that field only.
  const onBodyBlur = (e: React.FocusEvent<HTMLElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (!name || activeStep === 'celebrate') return;
    if (mode === 'register' && activeStep === 'account' && name === 'email' && !validateStep('account', ctx).email) void verifyEmail();
    const found = validateStep(activeStep, ctx)[name];
    setErrors((prev) => {
      if ((prev[name] || '') === (found || '')) return prev;
      return { ...prev, [name]: found || '' };
    });
  };

  // ---- final submit ----
  const busy = isSubmitting || creatingAccount || isFinishing;

  const finish = async () => {
    // Safety net: every step must still be valid (jumps back to what's fixable).
    const bad = firstInvalidStep(steps, ctx);
    if (bad) {
      setErrors(bad.errors);
      go(bad.step, 'back');
      if (bad.step === 'account' && !formData.password) {
        toast({
          title: 'Re-enter your password',
          description: "For your security we don't save passwords. Add it again, then tap Continue - the rest is saved.",
        });
      }
      return;
    }

    if (images.some((img) => img.status === 'moderating')) {
      toast({
        title: 'Still checking your photos',
        description: 'Give it just a moment - photos are quick to check.',
        variant: 'default',
      });
      return;
    }
    if (images.some((img) => img.status === 'rejected')) {
      setErrors({ images: 'Please remove rejected images before continuing' });
      go('photos', 'back');
      return;
    }

    // Close the keyboard before the full-screen progress state appears.
    (document.activeElement as HTMLElement | null)?.blur();

    if (mode === 'register') {
      const ok = await submitRegistration({
        formData,
        images,
        setImages,
        accountUserId,
        setAccountUserId,
        profileSavedRef,
        setCreatingAccount,
        setIsSubmitting,
        setIsFinishing,
        toast,
        t,
        faceStorageKey: face.storageKey,
        onRegistrationInProgressChange,
        onSubmit: (data) => onSubmit?.(data),
        onAccountProblem: (field, message) => {
          if (field === 'email' && /already has an account/i.test(message)) setEmailCheck({ email: formData.email.trim().toLowerCase(), kind: 'email' });
          setErrors({ [field]: message });
          setShake(true);
          go('account', 'back');
        },
        onNeedsEmailConfirmation: () => setNeedsConfirm(true),
      });
      if (ok) {
        clearDraft(mode);
        delete memoryPasswords[mode];
      }
      return;
    }

    // complete mode
    const ready = images.filter((img) => (img.status === 'approved' || img.status === 'pending') && (img.imageId || img.file));
    if (ready.length < 2) {
      setErrors({ images: t('profileCompletion.errors.reuploadPhotos') });
      setImages((prev) => prev.filter((img) => img.imageId || img.file));
      go('photos', 'back');
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    const ok = await submitCompletion({
      user,
      formData,
      images,
      toast,
      currentLanguage: i18n.language,
      faceStorageKey: face.storageKey,
    });
    setIsSubmitting(false);
    if (ok) {
      clearDraft(mode);
      onComplete?.();
    }
  };

  // A single subtle shake of the button when Continue is tapped on an incomplete step.
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (!shake) return undefined;
    const id = window.setTimeout(() => setShake(false), 420);
    return () => window.clearTimeout(id);
  }, [shake]);

  const emailTaken = emailCheck && emailCheck.email === formData.email.trim().toLowerCase() && ['email', 'google', 'apple'].includes(emailCheck.kind)
    ? (emailCheck.kind as 'email' | 'google' | 'apple')
    : null;

  /** Asks the server about this email (once per distinct address). Returns true when it's taken. */
  const verifyEmail = async (): Promise<boolean> => {
    const email = formData.email.trim().toLowerCase();
    if (!email) return false;
    if (emailCheck && emailCheck.email === email) return ['email', 'google', 'apple'].includes(emailCheck.kind);
    // a tap on Continue right after leaving the field shares the check already running
    if (!emailCheckInflight.current || emailCheckInflight.current.email !== email) {
      setCheckingEmail(true);
      emailCheckInflight.current = { email, promise: checkEmailAccount(email) };
    }
    const { promise } = emailCheckInflight.current;
    const kind = await promise;
    emailCheckInflight.current = null;
    setCheckingEmail(false);
    setEmailCheck({ email, kind });
    setResetState('idle');
    return ['email', 'google', 'apple'].includes(kind);
  };

  const sendReset = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email || resetState === 'sending') return;
    setResetState('sending');
    try {
      const redirectUri = getPasswordResetRedirectUri();
      const redirectTo =
        window.location.hostname === 'localhost' && !redirectUri.includes('localhost')
          ? `${window.location.origin}/reset-password`
          : redirectUri;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      setResetState(error ? 'error' : 'sent');
    } catch {
      setResetState('error');
    }
  };

  const onPrimary = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    (document.activeElement as HTMLElement | null)?.blur();

    if (activeStep === 'face' && !face.faceVerified) {
      setErrors({});
      face.setCapturing(true);
      return;
    }
    const stepErrors = validateStep(activeStep, ctx);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      setShake(true);
      return;
    }
    setErrors({});

    // Sign-up, first screen: find out NOW whether this email already has an account.
    if (mode === 'register' && activeStep === 'account') {
      if (await verifyEmail()) {
        setShake(true);
        return;
      }
    }

    if (!isLast) {
      go(steps[stepIndex + 1], 'fwd');
      return;
    }
    await finish();
  };

  const onBack = useCallback(() => {
    if (busy) return;
    setErrors({});
    if (stepIndex > 0) go(steps[stepIndex - 1], 'back');
    else if (mode === 'register') onBackToLogin?.();
  }, [busy, stepIndex, steps, go, mode, onBackToLogin]);

  // Android hardware back: one step back (sheets register their own handler and
  // close first). On the first step the default behaviour applies.
  useBackClose(!busy && stepIndex > 0, onBack, { escape: false });

  // leaving the face step (Back) returns it to the intro
  useEffect(() => {
    if (activeStep !== 'face') face.setCapturing(false);
  }, [activeStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSkip = () => {
    if (busy) return;
    setErrors({});
    go(steps[stepIndex + 1], 'fwd');
  };

  // ---- focus + scroll to the new step's heading; hearts burst when a phase ends ----
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const prevGroup = useRef(phaseGroup(activeStep));
  const [burstKey, setBurstKey] = useState(0);

  // Short, warm encouragement as you move FORWARD through the required screens:
  // escalates with progress, only the first time a screen is reached (never when
  // going back), fades out on its own and never blocks the form or the button.
  const seen = useRef<Set<StepId>>(new Set([activeStep]));
  const [cheer, setCheer] = useState<{ key: number; text: string } | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (!cheer) return undefined;
    const id = window.setTimeout(() => setCheer(null), 1800);
    return () => window.clearTimeout(id);
  }, [cheer]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    const group = phaseGroup(activeStep);
    if (firstRender.current) {
      firstRender.current = false;
      prevGroup.current = group;
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
    if (group > prevGroup.current && dir === 'fwd') setBurstKey((k) => k + 1);
    prevGroup.current = group;

    const firstVisit = !seen.current.has(activeStep);
    seen.current.add(activeStep);
    if (firstVisit && dir === 'fwd' && phaseOf(steps, activeStep) === 'main') {
      const required = splitFlows(steps).required;
      const key = cheerKey(required.indexOf(activeStep), required.length);
      if (key) {
        setCheer({ key: Date.now(), text: t(`onboarding.cheer.${key}`) });
        setPulseKey((k) => k + 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, dir]);

  // ---- progress / transition screens (same copy as before) ----
  const progressScreen = busy
    ? mode === 'register'
      ? creatingAccount
        ? { title: t('onboarding.wait.creating', 'Getting everything ready'), subtitle: t('onboarding.wait.creatingSub', 'A warm welcome is on its way.') }
        : isSubmitting
          ? { title: t('onboarding.wait.photos', 'Adding your photos'), subtitle: t('onboarding.wait.photosSub', 'Every great story starts with a first look.') }
          : { title: t('onboarding.wait.done', 'Welcome to DripLove'), subtitle: t('onboarding.wait.doneSub', 'Your people are waiting.') }
      : { title: t('onboarding.wait.saving', 'Making your profile shine'), subtitle: t('onboarding.wait.savingSub', "Love is closer than you think.") }
    : null;

  // ---- copy for this step: one short title + at most one helper line ----
  const knownName = formData.firstName.trim();
  const titleKey = `onboarding.steps.${activeStep}.title`;
  const hintKey =
    activeStep === 'work'
      ? 'onboarding.steps.work.hintRequired'
      : activeStep === 'signs'
        ? 'onboarding.steps.signs.hint'
        : `onboarding.steps.${activeStep}.hint`;
  // A Google/Apple user lands on their first missing step with a warm one-liner.
  const welcomeBack = mode === 'complete' && isFirst && phase === 'main' && knownName;
  const hintText = welcomeBack
    ? t('onboarding.welcomeBack', { name: knownName })
    : activeStep === 'celebrate' && splitFlows(steps).bonus.some((st) => isRequired(st, mode))
      ? t('onboarding.steps.celebrate.hintRequired', 'A few last touches, then real connections are waiting for you.')
      : t(hintKey, { max: activeStep === 'interests' ? MAX_INTERESTS_PICKED : maxPhotos, min: 1 });

  const primaryHint = getPrimaryHint(activeStep, ctx, images);
  const footerNote = primaryHint
    ? activeStep !== 'photos'
      ? primaryHint
      : primaryHint === 'Checking your photos…'
        ? t('onboarding.checkingPhotos')
        : t('onboarding.addMorePhotos', { count: 2 - photoCount })
    : '';
  const primaryDisabled = busy || (['photos', 'interests', 'values'].includes(activeStep) && !!primaryHint);

  const onCelebrate = activeStep === 'celebrate';
  const requiredLeft = splitFlows(steps).bonus.some((st) => isRequired(st, mode));
  const faceCapturing = activeStep === 'face' && face.capturing && !face.faceVerified;
  const faceIntro = activeStep === 'face' && !face.faceVerified && !face.capturing;
  const bonus = isBonusStep(steps, activeStep);
  const primaryLabel = onCelebrate
    ? requiredLeft || mode === 'complete'
      ? t('onboarding.continue')
      : t('onboarding.celebrate.add')
    : faceIntro
      ? t('onboarding.face.verify', 'Verify')
      : isLast
      ? mode === 'register'
        ? t('registration.createAccount')
        : t('profileCompletion.completeProfile')
      : t('onboarding.continue');
  // One quiet link per screen: skip a bonus question, or skip the whole bonus flow.
  // Required screens left in the second half: no "skip everything" shortcut then.
  // complete-profile never offers "skip everything": the member is already signed in and finishing their profile.
  const secondary = onCelebrate
    ? requiredLeft || mode === 'complete'
      ? null
      : { label: t('onboarding.celebrate.skip'), run: () => void finish() }
    : bonus && !isLast && !isRequired(activeStep, mode)
      ? { label: t('onboarding.skip'), run: onSkip }
      : null;

  const showLogo = (isFirst && phase === 'main') || onCelebrate;
  // (the celebration is already covered by showLogo)
  const heroKind = !showLogo && activeStep !== 'face' ? (activeStep as HeroKind) : null;
  const group = phaseGroup(activeStep);
  const heroPhase = (group <= 3 ? group : 5) as 1 | 2 | 3 | 5;

  const View = STEP_VIEWS[activeStep];
  const viewProps: StepViewProps = {
    mode,
    formData,
    errors,
    onInput,
    setField,
    setFormData,
    onLocationChange,
    face,
    photos,
    maxPhotos,
    photoCount,
    promoEnabled,
    userId: ownerId,
    emailTaken,
    checkingEmail,
    resetState,
    onSignIn: () => onBackToLogin?.(),
    onReset: sendReset,
  };

  if (!skipDone) return <OnboardingTransition />;

  if (needsConfirm) {
    return (
      <div className="ob-root ob-shell dl-form" style={{ background: FORM_PAGE_BG }}>
        <div className="ob-body">
          <div className="ob-container" style={{ justifyContent: 'center', textAlign: 'center', gap: 14 }}>
            <div className="ob-logo"><HoppingLogo size={60} /></div>
            <h1 className="ob-title">{t('onboarding.confirmEmail.title', 'Check your email')}</h1>
            <p className="ob-hint">
              {t('onboarding.confirmEmail.body', 'We sent a link to {{email}}. Tap it to confirm your account, then sign in to finish.', { email: formData.email.trim() })}
            </p>
          </div>
        </div>
        <footer className="ob-footer">
          <div className="ob-footer-inner">
            <Button type="button" variant="primary" size="lg" className="w-full" onClick={onBackToLogin}>
              {t('auth.signIn')}
            </Button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <>
      {progressScreen && <OnboardingTransition title={progressScreen.title} subtitle={progressScreen.subtitle} />}
      <div className="ob-root ob-shell dl-form keyboard-safe-form input-scroll-container" style={{ background: FORM_PAGE_BG }}>
        <ProgressHeader
          fraction={fraction}
          phase={phase}
          burstKey={burstKey}
          cheer={heroKind || showLogo ? cheer : null}
          pulseKey={pulseKey}
          backLabel={t('onboarding.back')}
          onBack={stepIndex > 0 || mode === 'register' ? onBack : undefined}
          disabled={busy}
          action={
            mode === 'complete' && onCancel ? (
              <Button variant="link" onClick={onCancel} disabled={busy} className="whitespace-nowrap px-1 text-white/70">
                {t('profileCompletion.cancel')}
              </Button>
            ) : mode === 'register' && activeStep === 'account' && onBackToLogin ? (
              <Button variant="link" onClick={onBackToLogin} disabled={busy} className="whitespace-nowrap px-1 text-white/70">
                {t('auth.signIn')}
              </Button>
            ) : undefined
          }
        />

        {/* noValidate: our own inline errors handle validation - the browser's
            native "Please fill out this field" bubbles only got in the way. */}
        <form onSubmit={onPrimary} noValidate className="contents">
          <div ref={bodyRef} className="ob-body" onBlur={onBodyBlur}>
            <div className="ob-container">
              <section
                key={activeStep}
                className={`ob-step${onCelebrate ? ' ob-celebrate' : ''}${activeStep === 'face' ? ' ob-face' : ''}${faceCapturing ? ' ob-face-live' : ''}`}
                data-dir={dir}
                aria-labelledby="ob-title"
              >
                {showLogo ? (
                  <div className="ob-logo">
                    {onCelebrate && <HeartsBurst size="lg" />}
                    <HoppingLogo size={onCelebrate ? 72 : 60} />
                  </div>
                ) : heroKind ? (
                  <StepHero kind={heroKind} phase={heroPhase} />
                ) : null}
                {!faceCapturing && (
                <div className={isFirst && phase === 'main' ? 'ob-welcome' : undefined}>
                  <h1 id="ob-title" ref={titleRef} tabIndex={-1} className="ob-title">
                    {t(titleKey)}
                  </h1>
                  <p className="ob-hint">{hintText}</p>
                </div>
                )}
                <div className="ob-step-body">
                  <View {...viewProps} />
                </div>
              </section>
            </div>
          </div>

          {!faceCapturing && (
          <footer className="ob-footer">
            <div className="ob-footer-inner">
              <p className="ob-cta-note" aria-live="polite">
                {footerNote}
              </p>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={primaryDisabled}
                loading={busy}
                data-shake={shake ? 'true' : undefined}
              >
                {busy ? t('registration.creatingAccount') : primaryLabel}
              </Button>
              <div className="ob-footer-row">
                {secondary && (
                  <Button variant="link" onClick={secondary.run} disabled={busy} className="h-11 px-6 text-white/70">
                    {secondary.label}
                  </Button>
                )}
              </div>
            </div>
          </footer>
          )}
        </form>
      </div>
    </>
  );
};

export default OnboardingWizard;

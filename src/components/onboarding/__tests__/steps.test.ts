import { describe, expect, it } from 'vitest';
import { initialFormData } from '@/constants/formData';
import {
  MAX_PHOTOS,
  cheerKey,
  countSelectablePhotos,
  firstInvalidStep,
  getPrimaryHint,
  getSteps,
  isBonusStep,
  isRequired,
  knownStepIds,
  passwordStrength,
  phaseGroup,
  phaseOf,
  progressFraction,
  splitFlows,
  validateStep,
  type StepContext,
} from '../steps';
import type { ImageUpload, OnboardingFormData } from '../types';

const adultDob = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 30);
  return d.toISOString().slice(0, 10);
};

const filled = (over: Partial<OnboardingFormData> = {}): OnboardingFormData => ({
  ...initialFormData,
  email: 'a@b.co',
  password: 'secret1',
  confirmPassword: 'secret1',
  firstName: 'Ama',
  lastName: 'Mensah',
  dateOfBirth: adultDob(),
  gender: 'female',
  preference: 'male',
  relationshipIntent: 'serious',
  city: 'Accra',
  occupation: 'Engineer',
  industry: 'Tech',
  educationLevel: 'Doctorate',
  adinkraSymbols: ['sankofa'],
  ...over,
});

const ctx = (over: Partial<StepContext> = {}): StepContext => ({
  mode: 'register',
  formData: filled(),
  faceVerified: true,
  photoCount: 2,
  ...over,
});

const img = (status: ImageUpload['status'], extra: Partial<ImageUpload> = {}): ImageUpload => ({
  file: null,
  preview: `p-${Math.random()}`,
  status,
  ...extra,
});

describe('getSteps: required flow -> celebrate -> bonus flow', () => {
  it('sign-up: 7 required screens, then the celebration, then the bonus screens', () => {
    expect(getSteps('register', false)).toEqual([
      'account', 'you', 'looking', 'location', 'signs', 'face', 'photos',
      'celebrate',
      'interests', 'values', 'music', 'work', 'bio', 'details', 'lifestyle', 'love',
    ]);
  });
  it('complete-profile: 6 required screens (no account), signs becomes a bonus', () => {
    expect(getSteps('complete', false)).toEqual([
      'you', 'looking', 'location', 'work', 'face', 'photos',
      'celebrate',
      'interests', 'values', 'music', 'signs', 'bio', 'details', 'lifestyle', 'love',
    ]);
  });
  it('a resumed sign-up (account exists) drops the account step', () => {
    expect(getSteps('register', true)).not.toContain('account');
  });
  it('required data is the same as before, just on fewer screens', () => {
    const { required } = splitFlows(getSteps('register', false));
    expect(required.length).toBeLessThanOrEqual(7);
    expect(splitFlows(getSteps('complete', false)).required.length).toBeLessThanOrEqual(7);
  });
});

describe('progress counts REQUIRED screens only', () => {
  const steps = getSteps('register', false);
  it('starts with a head start, never reaches 100% before the celebration', () => {
    const f = steps.slice(0, 7).map((s) => progressFraction(steps, s));
    expect(f[0]).toBeGreaterThan(0);
    expect(f.every((v, i) => i === 0 || v > f[i - 1])).toBe(true);
    expect(Math.max(...f)).toBeLessThan(1);
    expect(progressFraction(steps, 'celebrate')).toBe(1);
  });
  it('optional screens never inflate the main bar - the bonus flow has its own', () => {
    expect(phaseOf(steps, 'photos')).toBe('main');
    expect(phaseOf(steps, 'celebrate')).toBe('celebrate');
    expect(phaseOf(steps, 'bio')).toBe('bonus');
    expect(isBonusStep(steps, 'work')).toBe(true); // work is a bonus in sign-up
    const bonus = splitFlows(steps).bonus;
    expect(progressFraction(steps, bonus[0])).toBeCloseTo(1 / bonus.length);
    expect(progressFraction(steps, bonus[bonus.length - 1])).toBe(1);
  });
  it('groups screens into 3 phases + celebration + bonus for the hearts burst', () => {
    expect(['account', 'you', 'looking'].map(phaseGroup)).toEqual([1, 1, 1]);
    expect(['location', 'work', 'signs'].map(phaseGroup)).toEqual([2, 2, 2]);
    expect(['face', 'photos'].map(phaseGroup)).toEqual([3, 3]);
    expect(phaseGroup('celebrate')).toBe(4);
    expect(phaseGroup('bio')).toBe(5);
  });
});

describe('cheerKey: short encouragement that escalates and otherwise stays quiet', () => {
  it('sign-up (7 required screens): start -> great -> almost -> last', () => {
    const keys = Array.from({ length: 7 }, (_, i) => cheerKey(i, 7));
    expect(keys).toEqual([null, 'start', null, 'great', null, 'almost', 'last']);
  });
  it('complete-profile (6) and an OAuth user with fewer screens (5, 4, 3)', () => {
    expect(Array.from({ length: 6 }, (_, i) => cheerKey(i, 6))).toEqual([null, 'start', null, 'great', 'almost', 'last']);
    expect(Array.from({ length: 5 }, (_, i) => cheerKey(i, 5))).toEqual([null, 'start', 'great', 'almost', 'last']);
    expect(Array.from({ length: 4 }, (_, i) => cheerKey(i, 4))).toEqual([null, 'start', 'almost', 'last']);
    expect(Array.from({ length: 3 }, (_, i) => cheerKey(i, 3))).toEqual([null, 'start', 'last']);
  });
  it('never cheers on the first screen, for a one/two-screen flow, or out of range', () => {
    expect(cheerKey(0, 7)).toBeNull();
    expect(cheerKey(1, 2)).toBeNull();
    expect(cheerKey(7, 7)).toBeNull();
    expect(cheerKey(-1, 7)).toBeNull();
  });
});

describe('required rules per flow (kept exactly as the two original forms had them)', () => {
  it('work is required only when completing a profile', () => {
    expect(isRequired('work', 'complete')).toBe(true);
    expect(isRequired('work', 'register')).toBe(false);
  });
  it('cultural signs are required only in sign-up', () => {
    expect(isRequired('signs', 'register')).toBe(true);
    expect(isRequired('signs', 'complete')).toBe(false);
  });
  it('the core screens are always required; the extras never are', () => {
    for (const s of ['account', 'you', 'looking', 'location', 'face', 'photos'] as const) {
      expect(isRequired(s, 'register')).toBe(true);
      expect(isRequired(s, 'complete')).toBe(true);
    }
    for (const s of ['celebrate', 'bio', 'details', 'lifestyle', 'interests', 'values', 'music', 'love'] as const) {
      expect(isRequired(s, 'register')).toBe(false);
      expect(validateStep(s, ctx({ formData: initialFormData }))).toEqual({});
    }
  });
  it('photo caps are 5 for sign-up and 7 for complete-profile', () => {
    expect(MAX_PHOTOS).toEqual({ register: 5, complete: 7 });
  });
});

describe('validateStep (original messages)', () => {
  it('account: email, short password and mismatch', () => {
    const e = validateStep('account', ctx({ formData: filled({ email: 'nope', password: '123', confirmPassword: '124' }) }));
    expect(e.email).toBe('Please enter a valid email address (e.g., name@domain.com)');
    expect(e.password).toBe('Password must be at least 6 characters long');
    expect(e.confirmPassword).toBe("Passwords don't match");
  });
  it('account: empty fields are required', () => {
    const e = validateStep('account', ctx({ formData: filled({ email: '', password: '', confirmPassword: '' }) }));
    expect(e).toMatchObject({ email: 'Email is required', password: 'Password is required', confirmPassword: 'Please confirm your password' });
  });
  it('account: valid input passes', () => {
    expect(validateStep('account', ctx())).toEqual({});
  });

  it('you: names, birthday (18+) and gender on one screen', () => {
    const young = new Date();
    young.setFullYear(young.getFullYear() - 16);
    const e = validateStep('you', ctx({ formData: filled({ firstName: ' ', lastName: '', gender: '', dateOfBirth: young.toISOString().slice(0, 10) }) }));
    expect(e.firstName).toBe('First name is required');
    expect(e.lastName).toBe('Last name is required');
    expect(e.dateOfBirth).toBe('You must be at least 18 years old');
    expect(e.gender).toBe('Gender is required');
    expect(validateStep('you', ctx({ formData: filled({ dateOfBirth: '' }) })).dateOfBirth).toBe('Date of birth is required');
    expect(validateStep('you', ctx())).toEqual({});
  });

  it('looking: preference always; relationship intent only when completing', () => {
    const blank = filled({ preference: '', relationshipIntent: '' });
    expect(validateStep('looking', ctx({ formData: blank }))).toEqual({ preference: 'Preference is required' });
    expect(validateStep('looking', ctx({ mode: 'complete', formData: blank }))).toEqual({
      preference: 'Preference is required',
      relationshipIntent: 'Relationship intent is required',
    });
  });

  it('location: city required, country optional', () => {
    expect(validateStep('location', ctx({ formData: filled({ city: '  ' }) }))).toEqual({ city: 'City is required' });
    expect(validateStep('location', ctx({ formData: filled({ country: '' }) }))).toEqual({});
  });

  it('work: only enforced when completing, using the localised messages', () => {
    const blank = filled({ occupation: '', industry: '', educationLevel: '' });
    expect(validateStep('work', ctx({ formData: blank }))).toEqual({});
    const t = (k: string) => `T:${k}`;
    expect(validateStep('work', ctx({ mode: 'complete', formData: blank, t }))).toEqual({
      occupation: 'T:profileCompletion.errors.occupationRequired',
      industry: 'T:profileCompletion.errors.industryRequired',
      educationLevel: 'T:profileCompletion.errors.educationRequired',
    });
    expect(validateStep('work', ctx({ mode: 'complete', formData: blank, t: (k) => k })).occupation).toBe('Occupation is required');
  });

  it('signs: sign-up needs one; complete-profile does not', () => {
    const none = filled({ adinkraSymbols: [] });
    expect(validateStep('signs', ctx({ formData: none })).adinkraSymbols).toBe('Please select at least one cultural sign');
    expect(validateStep('signs', ctx({ mode: 'complete', formData: none }))).toEqual({});
  });

  it('face + photos', () => {
    expect(validateStep('face', ctx({ faceVerified: false })).faceVerification).toBe('Face verification is required to continue');
    expect(validateStep('face', ctx())).toEqual({});
    expect(validateStep('photos', ctx({ photoCount: 1 })).images).toBeTruthy();
    expect(validateStep('photos', ctx({ photoCount: 2 }))).toEqual({});
  });
});

describe('firstInvalidStep', () => {
  it('returns null when every step is valid', () => {
    expect(firstInvalidStep(getSteps('register', false), ctx())).toBeNull();
  });
  it('returns the earliest failing step so a final-submit error can jump back to it', () => {
    const bad = firstInvalidStep(getSteps('register', false), ctx({ formData: filled({ city: '', adinkraSymbols: [] }), photoCount: 0 }));
    expect(bad?.step).toBe('location');
  });
  it('can stop early (resume lands on the first incomplete screen before face/photos)', () => {
    const bad = firstInvalidStep(getSteps('register', true), ctx({ formData: filled({ preference: '' }), faceVerified: false, photoCount: 0 }), 'signs');
    expect(bad?.step).toBe('looking');
  });
});

describe('knownStepIds (complete-profile skips what is already on file)', () => {
  it('sign-up never skips anything', () => {
    expect(knownStepIds('register', filled(), true, 5)).toEqual([]);
  });
  it('a Google/Apple user with only a name still sees everything else', () => {
    expect(knownStepIds('complete', { ...initialFormData, firstName: 'Ama', lastName: 'Mensah' }, false, 0)).toEqual([]);
  });
  it('skips each screen whose required data is complete', () => {
    expect(knownStepIds('complete', filled(), true, 2)).toEqual(['you', 'looking', 'location', 'work', 'signs', 'face', 'photos']);
  });
  it('does not treat placeholder or partial answers as known', () => {
    const f = filled({ dateOfBirth: '', relationshipIntent: '', educationLevel: '', adinkraSymbols: [] });
    expect(knownStepIds('complete', f, false, 1)).toEqual(['location']);
  });
});

describe('photos helpers', () => {
  it('counts approved/pending photos that exist (uploaded or with a file)', () => {
    const file = new File(['x'], 'a.jpg');
    const list = [
      img('approved', { imageId: '1' }),
      img('pending', { file }),
      img('moderating', { file }),
      img('rejected', { imageId: '2' }),
      img('approved'), // no file and no id - can't be saved
    ];
    expect(countSelectablePhotos(list)).toBe(2);
  });
  it('explains why the photo CTA is disabled', () => {
    const c = ctx({ photoCount: 1 });
    expect(getPrimaryHint('photos', c, [img('approved', { imageId: '1' })])).toBe('Add 1 more photo');
    expect(getPrimaryHint('photos', ctx({ photoCount: 0 }), [])).toBe('Add 2 more photos');
    expect(getPrimaryHint('photos', c, [img('moderating')])).toBe('Checking your photos…');
    expect(getPrimaryHint('photos', ctx({ photoCount: 2 }), [])).toBeNull();
    expect(getPrimaryHint('you', c, [])).toBeNull();
  });
});

describe('passwordStrength', () => {
  it('is a hint only: empty, too short, then rising', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abc').score).toBe(1);
    expect(passwordStrength('abcdef').score).toBe(2);
    expect(passwordStrength('abcdefgh1').score).toBe(3);
    expect(passwordStrength('Abcdefgh1234!').score).toBe(4);
  });
});

describe('vibe screens (interests / values / music)', () => {
  it('come first among the optional screens and are never required', () => {
    for (const mode of ['register', 'complete'] as const) {
      const { bonus } = splitFlows(getSteps(mode, false));
      expect(bonus.slice(0, 3)).toEqual(['interests', 'values', 'music']);
      for (const s of ['interests', 'values', 'music'] as const) expect(isRequired(s, mode)).toBe(false);
    }
  });
  it('a music share link must be playable (https Spotify/Apple Music/YouTube/SoundCloud) - otherwise one calm error, skip still works', () => {
    const bad = validateStep('music', ctx({ formData: { ...initialFormData, musicLink: 'http://example.com/x' } }));
    expect(Object.keys(bad)).toEqual(['musicLink']);
    const ok = validateStep('music', ctx({ formData: { ...initialFormData, musicLink: 'https://open.spotify.com/track/abc123' } }));
    expect(ok).toEqual({});
    expect(validateStep('music', ctx({ formData: initialFormData }))).toEqual({});
  });
});

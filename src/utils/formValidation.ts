
export const validateRegistrationForm = (formData: any) => {
  const newErrors: Record<string, string> = {};

  // Required field validation
  if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
  if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
  if (!formData.email.trim()) newErrors.email = 'Email is required';
  if (!formData.password) newErrors.password = 'Password is required';
  if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
  if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
  // Country is now optional per Apple's App Store guidelines
  if (!formData.gender) newErrors.gender = 'Gender is required';
  if (!formData.preference) newErrors.preference = 'Preference is required';
  // At least one cultural sign is required - users can select as many as
  // they like (up to the existing cap of 10 in AdinkraSymbolSelector), but
  // zero isn't allowed since Sign Match and the info-area sign chips both
  // depend on every profile having at least one.
  if (!Array.isArray(formData.adinkraSymbols) || formData.adinkraSymbols.length === 0) {
    newErrors.adinkraSymbols = 'Please select at least one cultural sign';
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (formData.email && !emailRegex.test(formData.email)) {
    newErrors.email = 'Please enter a valid email address';
  }

  // Password validation
  if (formData.password && formData.password.length < 6) {
    newErrors.password = 'Password must be at least 6 characters long';
  }

  // Password confirmation
  if (formData.password !== formData.confirmPassword) {
    newErrors.confirmPassword = "Passwords don't match";
  }

  // Age validation (must be 18+)
  if (formData.dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(formData.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    if (age < 18) {
      newErrors.dateOfBirth = 'You must be at least 18 years old';
    }
  }

  return newErrors;
};

export const transformFormDataForSubmission = (formData: any) => {
  return {
    first_name: formData.firstName,
    last_name: formData.lastName,
    email: formData.email,
    date_of_birth: formData.dateOfBirth,
    country: formData.country,
    city: formData.city,
    zip_code: formData.zipCode,
    bio: formData.bio,
    preference: formData.preference,
    interests: formData.interests,
    gender: formData.gender,
    relationship_intent: formData.relationshipIntent,
    smoking: formData.smoking,
    drinking: formData.drinking,
    exercise_level: formData.exerciseLevel,
    sleeping_schedule: formData.sleepingSchedule,
    occupation: formData.occupation,
    industry: formData.industry,
    education_level: formData.educationLevel,
    introvert_extrovert: formData.introvertExtrovert[0],
    spontaneous_planner: formData.spontaneousPlanner[0],
    messy_organized: formData.messyOrganized[0],
    fun_fact: formData.funFact,
    perfect_first_date: formData.perfectFirstDate,
    last_googled: formData.lastGoogled
  };
};

export const MINIMUM_AGE = 18;

/** Latest date of birth that still makes someone MINIMUM_AGE today, as the
 *  YYYY-MM-DD string a date input's `max` expects. */
export const getLatestAllowedDateOfBirth = (): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MINIMUM_AGE);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Error to show for a picked date of birth, or '' if it's fine. Used to
 *  flag an under-age date the moment it's picked, not only on submit. */
export const getDateOfBirthError = (dateOfBirth: string): string => {
  if (!dateOfBirth) return '';
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return 'Please enter a valid date';
  const today = new Date();
  if (birthDate > today) return 'Date of birth can\'t be in the future';
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age < MINIMUM_AGE ? `You must be at least ${MINIMUM_AGE} years old` : '';
};

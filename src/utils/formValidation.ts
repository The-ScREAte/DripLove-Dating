
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
  if (!formData.adinkraSymbols || formData.adinkraSymbols.length === 0) newErrors.adinkraSymbols = 'Please select at least 1 Adinkra symbol';

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
    newErrors.confirmPassword = 'Passwords do not match';
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

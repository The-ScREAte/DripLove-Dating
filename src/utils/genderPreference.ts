/**
 * Genders a viewer wants to see for their stored `preference` value:
 * 'male' and 'female' narrow the pool; anything else ('everyone', 'both',
 * missing) shows everyone.
 */
export const getGenderFilter = (userPreference: string): string[] => {
  if (userPreference === 'male') return ['male'];
  if (userPreference === 'female') return ['female'];
  return ['male', 'female', 'other'];
};

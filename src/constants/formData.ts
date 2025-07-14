
export const interests = [
  'Travel', 'Music', 'Movies', 'Sports', 'Reading', 'Cooking', 'Photography',
  'Dancing', 'Gaming', 'Art', 'Fitness', 'Nature', 'Technology', 'Fashion',
  'Food', 'Animals', 'Adventure', 'Comedy', 'Beach', 'Mountains'
];

export const countries = [
  'United States', 'Canada', 'United Kingdom', 'Australia', 'Germany',
  'France', 'Spain', 'Italy', 'Netherlands', 'Sweden', 'Norway', 'Denmark',
  'Japan', 'South Korea', 'Singapore', 'Brazil', 'Mexico', 'Argentina'
];

export const initialFormData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  dateOfBirth: '',
  country: '',
  countryCode: '',
  city: '',
  zipCode: '',
  latitude: undefined as number | undefined,
  longitude: undefined as number | undefined,
  isCustomCity: false,
  maxDistance: 50, // Default 50km radius for matching
  bio: '',
  preference: '',
  interests: [] as string[],
  gender: '',
  relationshipIntent: '',
  smoking: '',
  drinking: '',
  exerciseLevel: '',
  sleepingSchedule: '',
  occupation: '',
  occupationCustom: '',
  industry: '',
  industryCustom: '',
  educationLevel: '',
  introvertExtrovert: [50],
  spontaneousPlanner: [50],
  messyOrganized: [50],
  funFact: '',
  perfectFirstDate: '',
  lastGoogled: ''
};

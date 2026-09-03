import { supabase } from '@/integrations/supabase/client';

// Define completion criteria and weights for profile
export interface CompletionCriteria {
  photos: { weight: number; completed: boolean; description: string };
  basicInfo: { weight: number; completed: boolean; description: string };
  location: { weight: number; completed: boolean; description: string };
  preferences: { weight: number; completed: boolean; description: string };
  lifestyle: { weight: number; completed: boolean; description: string };
  workEducation: { weight: number; completed: boolean; description: string };
  personality: { weight: number; completed: boolean; description: string };
  funQuestions: { weight: number; completed: boolean; description: string };
  interests: { weight: number; completed: boolean; description: string };
}

export interface ProfileCompletionResult {
  completion: number;
  missingFields: string[];
  showVerifiedBadge: boolean;
  completionCriteria: CompletionCriteria;
}

export const calculateProfileCompletion = (
  profile: any,
  userImages: any[]
): ProfileCompletionResult => {
  if (!profile) {
    return {
      completion: 0,
      missingFields: [],
      showVerifiedBadge: false,
      completionCriteria: {} as CompletionCriteria
    };
  }

  const completionCriteria: CompletionCriteria = {
    photos: {
      weight: 15,
      completed: false,
      description: "profile.completionCriteria.photos"
    },
    basicInfo: {
      weight: 15,
      completed: false,
      description: "profile.completionCriteria.basicInfo"
    },
    location: {
      weight: 10,
      completed: false,
      description: "profile.completionCriteria.location"
    },
    preferences: {
      weight: 10,
      completed: false,
      description: "profile.completionCriteria.preferences"
    },
    lifestyle: {
      weight: 10,
      completed: false,
      description: "profile.completionCriteria.lifestyle"
    },
    workEducation: {
      weight: 10,
      completed: false,
      description: "profile.completionCriteria.workEducation"
    },
    personality: {
      weight: 10,
      completed: false,
      description: "profile.completionCriteria.personality"
    },
    funQuestions: {
      weight: 10,
      completed: false,
      description: "profile.completionCriteria.funQuestions"
    },
    interests: {
      weight: 10,
      completed: false,
      description: "profile.completionCriteria.interests"
    }
  };

  try {
    // Check Photos (3 approved images)
    const approvedImages = userImages?.filter(img => img?.is_approved !== false) || [];
    completionCriteria.photos.completed = approvedImages.length >= 3;

    // Check Basic Information (first_name, last_name, bio, date_of_birth)
    completionCriteria.basicInfo.completed = !!(
      profile?.first_name?.trim() &&
      profile?.last_name?.trim() &&
      profile?.bio?.trim() &&
      profile?.date_of_birth
    );

    // Check Location & Matching Preferences (city, country, max_distance)
    completionCriteria.location.completed = !!(
      profile?.city?.trim() &&
      profile?.country?.trim() &&
      (profile?.max_distance || profile?.distance_preference)
    );

    // Check Preferences (gender, preference)
    completionCriteria.preferences.completed = !!(
      profile?.gender &&
      profile?.preference
    );

    // Check Lifestyle (smoking, drinking, exercise_level, sleeping_schedule)
    completionCriteria.lifestyle.completed = !!(
      profile?.smoking &&
      profile?.drinking &&
      profile?.exercise_level &&
      profile?.sleeping_schedule
    );

    // Check Work & Education (occupation, education_level)
    completionCriteria.workEducation.completed = !!(
      profile?.occupation?.trim() &&
      profile?.education_level
    );

    // Check Personality (personality sliders completed)
    completionCriteria.personality.completed = !!(
      typeof profile?.introvert_extrovert === 'number' &&
      typeof profile?.spontaneous_planner === 'number' &&
      typeof profile?.messy_organized === 'number'
    );

    // Check Fun Questions (at least one question answered)
    completionCriteria.funQuestions.completed = !!(
      profile?.fun_fact?.trim() ||
      profile?.perfect_first_date?.trim() ||
      profile?.last_googled?.trim()
    );

    // Check Interests (at least 3 selected)
    const userInterests = profile?.interests || [];
    completionCriteria.interests.completed = Array.isArray(userInterests) && userInterests.length >= 3;
  } catch (error) {
    // Removed for production: console.error('Error calculating profile completion:', error);
  }

  // Calculate total completion percentage
  let totalWeight = 0;
  let completedWeight = 0;
  const missingFields: string[] = [];

  Object.values(completionCriteria).forEach((criteria) => {
    totalWeight += criteria.weight;
    if (criteria.completed) {
      completedWeight += criteria.weight;
    } else {
      missingFields.push(criteria.description);
    }
  });

  const completion = Math.round((completedWeight / totalWeight) * 100);

  // Show verified badge at or above 85% completion
  // NOTE: requirement changed: any user who reaches >=85% gets the verified badge
  const showVerifiedBadge = completion >= 85;

  return { completion, missingFields, showVerifiedBadge, completionCriteria };
};


// Get current user's swipe count for today
export const getTodaySwipeCount = async (userId: string): Promise<number> => {
  if (!userId) return 0;

  try {
    const { data, error } = await supabase
      .from('user_usage')
      .select('swipes_used')
      .eq('user_id', userId)
      .eq('date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // Removed for production: console.error('Error fetching swipe count:', error);
      return 0;
    }

    return data?.swipes_used || 0;
  } catch (error) {
    // Removed for production: console.error('Error fetching swipe count:', error);
    return 0;
  }
};

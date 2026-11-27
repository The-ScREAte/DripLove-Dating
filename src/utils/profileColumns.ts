/**
 * Column lists for public.profiles reads.
 *
 * Why: any signed-in user used to be able to read EVERY column of every profile
 * (email, zip_code, face_descriptor, ...). The staged migration
 * supabase/migrations_staged/20261201000000_profiles_column_privacy.sql revokes
 * table-wide SELECT and grants SELECT only on PUBLIC_PROFILE_COLUMNS. After that,
 * `select('*')` on profiles (and any query naming a non-public column) fails with
 * "permission denied for table profiles".
 *
 * Rules for client code:
 *   - Reading OTHER users (or a list of users): use PUBLIC_PROFILE_COLUMNS (or a subset).
 *   - Reading YOUR OWN full row: fetchMyProfile() in utils/myProfile.ts (RPC get_my_profile).
 *   - Admin screens needing email / face_descriptor / etc.: adminGetProfiles() in utils/adminProfiles.ts.
 *   - Never `.insert()/.upsert()/.update()` with a trailing `.select()` that returns '*'.
 *
 * KEEP IN SYNC with the GRANT SELECT (...) list in the staged migration
 * (a vitest test compares the two files).
 */

/** Columns every signed-in user may read for any profile. */
export const PUBLIC_PROFILE_COLUMN_LIST = [
  // identity / display
  'id',
  'first_name',
  'last_name',
  'date_of_birth', // age is computed client-side
  'gender',
  'preference',
  'bio',
  'interests',
  'relationship_intent',
  'created_at',
  'updated_at',
  // location (client-side distance, country filters)
  'country',
  'country_code',
  'city',
  'is_custom_city',
  'latitude',
  'longitude',
  // lifestyle / profile-card fields
  'smoking',
  'drinking',
  'exercise_level',
  'sleeping_schedule',
  'occupation',
  'industry',
  'education_level',
  'introvert_extrovert',
  'spontaneous_planner',
  'messy_organized',
  'fun_fact',
  'perfect_first_date',
  'last_googled',
  'adinkra_symbols',
  'favorites',
  'height_cm',
  'languages',
  'family_plans',
  'communication_style',
  'love_style',
  'pets',
  'social_media',
  'free_tonight',
  // status / activity shown on cards and used for feed weighting
  'account_status',
  'is_admin', // also referenced by RLS policies on other tables
  'is_archived',
  'is_verified',
  'last_login_at',
  'current_streak',
  'profile_completion',
  // match preferences (reciprocal distance/age checks, own settings screens)
  'min_age',
  'max_age',
  'max_distance',
  'distance_preference',
  'unlocked_countries',
  'preferred_language',
  // low-sensitivity flags the client reads for the signed-in user's own row
  'terms_accepted',
  'has_rated_app',
  'like_me_cooldown_until',
] as const;

export type PublicProfileColumn = (typeof PUBLIC_PROFILE_COLUMN_LIST)[number];

/** Comma-separated string for supabase `.select(...)`. */
export const PUBLIC_PROFILE_COLUMNS: string = PUBLIC_PROFILE_COLUMN_LIST.join(', ');

/**
 * Columns that are NOT readable by other users after the lockdown. Listed so a
 * test can assert (public + internal) === every profiles column.
 */
export const INTERNAL_PROFILE_COLUMN_LIST = [
  'email',
  'zip_code',
  'face_descriptor',
  'terms_accepted_at',
  'promo_code_used',
  'login_count',
  'active_session_count',
  'timezone',
  'notification_permission',
  'notification_permission_updated_at',
  'badge_count',
  'last_reengagement_sent_at',
  'longest_streak',
  'last_streak_date',
  'last_streak_reminder_sent_date',
  'last_recommendation_sent_date',
  'recommendation_sends_today',
  'last_recommendation_sent_at',
  'last_recommended_profile_id',
  'last_similar_sent_date',
  'last_game_notification_sent_week',
  'last_app_open_at',
  'total_swipe_count',
  'rated_app_at',
  'visibility_boost_until',
  'visibility_boost_multiplier',
  'feed_random_weight',
] as const;

/** Error shape check: "function does not exist yet" (RPC not deployed) vs a real failure. */
export const isMissingRpcError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; status?: number };
  if (e.code === 'PGRST202' || e.code === '42883') return true;
  const msg = (e.message || '').toLowerCase();
  return msg.includes('could not find the function') || (msg.includes('function') && msg.includes('does not exist'));
};

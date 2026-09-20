// UserProfile type for use in components
import { Database } from '@/integrations/supabase/types';
import type { FavoriteEntry } from '@/constants/favorites';

export type UserProfile = Database['public']['Tables']['profiles']['Row'];

// Enhanced types for better type safety
export type CurrentUser = UserProfile;

export interface PotentialMatch {
  id: string;
  first_name: string;
  last_name: string;
  bio: string;
  city: string;
  country: string;
  country_code: string;
  occupation: string;
  education_level: string;
  date_of_birth: string;
  interests: string[];
  favorites?: FavoriteEntry[];
  images: string[];
  is_verified?: boolean;
  gender: string;
  preference?: string;
  max_distance?: number;
  distance_preference?: number;
  latitude?: number;
  longitude?: number;
  min_age?: number;
  max_age?: number;
  fun_fact?: string;
  perfect_first_date?: string;
  last_googled?: string;
  relationship_intent?: string;
  smoking?: string;
  drinking?: string;
  exercise_level?: string;
  sleeping_schedule?: string;
  introvert_extrovert?: number;
  spontaneous_planner?: number;
  messy_organized?: number;
  adinkra_symbols?: string[];
  height_cm?: number | null;
  languages?: string[];
  family_plans?: string;
  communication_style?: string[];
  love_style?: string[];
  pets?: string[];
  social_media?: string;
  distance?: number; // Precomputed distance in km
  last_login_at?: string | null; // Used for the liked-you activity gate (DiscoverPage.tsx)
  // Set only on profiles mixed in from the archived (inactive 30+ days) pool.
  // No UI currently reads this to show anything different - it's tracked
  // purely so the mix-in logic (DiscoverPage.tsx) can keep archived
  // candidates out of Tier 2 compatibility scoring.
  is_archived?: boolean;
  // Set only on a profile that was surfaced via one of the "liked you"
  // injection mechanisms (see DiscoverPage.tsx) - client-side only, used to
  // attribute a swipe outcome back to the mechanism that surfaced it for
  // telemetry. Never sent to the server as part of the profile itself.
  likedYouMechanism?: 'A' | 'B';
  // Optional per-photo label/caption (see ImageManagement.tsx), keyed by the
  // photo's own image_url. Populated separately from the rest of this object
  // (see DiscoverPage.tsx's imageCaptions state) since it comes from
  // user_images columns not otherwise fetched alongside a profile's core
  // fields.
  imageCaptions?: Record<string, { label?: string | null; caption?: string | null }>;
}

export interface ChatMatch {
  id: string;
  first_name: string;
  last_name: string;
  last_login_at?: string | null;
  profile_photo?: string;
  unread_messages?: number;
  last_message?: string;
  last_message_time?: string;
  created_at: string; // When the match was created
  user1_id: string;
  user2_id: string;
  partner?: {
    id: string;
    first_name: string;
    last_name: string;
    is_admin: boolean;
  };
  unreadCount?: number;
  last_message_obj?: {
    id: string;
    message: string;
    created_at: string;
    sender_id: string;
  };
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id?: string;
  message: string;
  sent_at?: string;
  created_at?: string;
  is_read: boolean;
  match_id?: string;
  deleted_for?: string[]; // Array of user IDs who deleted this message
  reply_to?: string | null; // ID of the message this is replying to
  sender?: {
    first_name: string;
    last_name: string;
  };
}

export interface AdminStats {
  total_users: number;
  total_users_ever: number;
  active_users_30_days: number;
  archived_users: number;
  total_matches: number;
  total_likes: number;
  total_blocks: number;
  total_messages: number;
  active_now: number;
  active_users_today: number;
  new_users_this_week: number;
  matches_this_week: number;
  blocked_users: number;
  users_on_hold: number;
  total_admins: number;
  premium_users: number;
  all_time_premium_users: number;
}

export interface AdminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_status: string;
  gender: string;
  city: string;
  country: string;
  created_at: string;
  last_login_at: string | null;
  is_premium: boolean;
  is_admin: boolean;
  is_archived?: boolean;
}

export interface PendingImage {
  id: string;
  user_id: string;
  image_url: string;
  uploaded_at: string;
  user?: {
    first_name: string;
    last_name: string;
  };
}
  
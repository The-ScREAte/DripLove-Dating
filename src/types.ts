// UserProfile type for use in components
import { Database } from '@/integrations/supabase/types';

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
  images: string[];
  gender: string;
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
  distance?: number; // Precomputed distance in km
}

export interface ChatMatch {
  id: string;
  first_name: string;
  last_name: string;
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
  total_matches: number;
  total_likes: number;
  total_blocks: number;
  total_messages: number;
  active_users_today: number;
  new_users_this_week: number;
  matches_this_week: number;
  blocked_users: number;
  users_on_hold: number;
  total_admins: number;
  premium_users: number;
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
  
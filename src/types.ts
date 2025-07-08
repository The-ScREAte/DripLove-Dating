// UserProfile type for use in components
import { Database } from '../integrations/supabase/types';

export type UserProfile = Database['public']['Tables']['profiles']['Row'];
  
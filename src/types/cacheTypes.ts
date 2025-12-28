export type AppUser = {
  id: string;
  [key: string]: unknown;
};

export type LikerProfile = {
  id: string;
  updated_at?: string | null;
  date_of_birth?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  country?: string | null;
  occupation?: string | null;
  interests?: string[] | null;
  adinkra_symbols?: string[] | null;
  preferred_language?: string | null;
  education_level?: string | null;
  industry?: string | null;
  drinking?: string | null;
  smoking?: string | null;
  exercise_level?: string | null;
  sleeping_schedule?: string | null;
  relationship_intent?: string | null;
  bio?: string | null;
  fun_fact?: string | null;
  perfect_first_date?: string | null;
  last_googled?: string | null;
  [key: string]: unknown;
};

export type LikedMeCacheValue = {
  likers: LikerProfile[];
  userImages: Record<string, string[]>;
  timestamp: number;
  fullyLoaded?: boolean;
};

export type ChatMatchesCacheValue = {
  matches: unknown[];
  timestamp: number;
};

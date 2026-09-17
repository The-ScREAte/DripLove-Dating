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
  // jsonb on the DB side (FavoriteEntry[] shape) - arrives untyped here since
  // this covers loosely-typed `.select('*')` results; run it through
  // parseFavorites() from '@/constants/favorites' before rendering.
  favorites?: unknown;
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
  family_plans?: string | null;
  social_media?: string | null;
  communication_style?: string[] | null;
  love_style?: string[] | null;
  pets?: string[] | null;
  languages?: string[] | null;
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

export type CircleCacheValue = {
  // CircleProfile[] from '@/utils/circlePoolFetch' - kept loose here (like
  // ChatMatchesCacheValue.matches above) since this file has no dependency
  // on component-level types; cast at the read site instead.
  pool: unknown[];
  timestamp: number;
};

// The resolved Recommended/Similar row contents (CircleProfile[] each, kept
// loose for the same reason as CircleCacheValue.pool above). Separate from
// CircleCacheValue because these are a different, more expensive thing to
// rebuild (a stored-batch fetch + exclusion reconciliation, not just a pool
// query) - caching them means reopening Circle doesn't redo that work or
// show a loading state every single time.
export type CircleRowsCacheValue = {
  recommended: unknown[];
  similar: unknown[];
  timestamp: number;
};

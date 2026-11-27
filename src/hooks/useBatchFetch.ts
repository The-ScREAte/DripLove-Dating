import { supabase } from '@/integrations/supabase/client';
import { adminGetProfiles, type AdminProfileFilters } from '@/utils/adminProfiles';

/**
 * Which of these users are premium. user_subscriptions is RLS-limited to the
 * owner, so an admin's direct select sees nobody else's rows - this goes
 * through the admin RPC (admin-only, security definer) instead.
 */
export async function fetchPremiumUserIds(userIds: string[]): Promise<Set<string>> {
  const premium = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('admin_get_premium_status_for_users', {
      target_user_ids: userIds.slice(i, i + CHUNK),
    });
    if (error) throw error;
    (Array.isArray(data) ? data : []).forEach((row: { user_id?: string; is_premium?: boolean }) => {
      if (row?.user_id && row.is_premium) premium.add(row.user_id);
    });
  }
  return premium;
}

/**
 * Batch fetch all rows from a table to bypass 1000 row limit
 * This mirrors the logic from UserPoolDebugger for consistent data fetching
 */
export async function fetchAllRows<T extends Record<string, unknown>>(
  tableName: 'profiles' | 'likes' | 'blocks' | 'passes' | 'user_images' | 'user_subscriptions' | 'push_tokens',
  selectFields: string,
  filters?: { column: string; op: string; value: string | boolean | number }[]
): Promise<T[]> {
  const batchSize = 1000;
  let allRows: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const baseQuery = supabase.from(tableName).select(selectFields);
    let query = baseQuery.range(offset, offset + batchSize - 1);

    // Apply filters
    if (filters) {
      for (const filter of filters) {
        if (filter.column && filter.op === 'neq') {
          query = (query as any).neq(filter.column, filter.value);
        } else if (filter.column && filter.op === 'eq') {
          query = (query as any).eq(filter.column, filter.value);
        } else if (filter.column && filter.op === 'gte') {
          query = (query as any).gte(filter.column, filter.value);
        } else if (filter.column && filter.op === 'in') {
          query = (query as any).in(filter.column, filter.value);
        } else if (filter.op === 'or') {
          query = (query as any).or(filter.value);
        }
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching batch from ${tableName}:`, error);
      break;
    }

    if (data && data.length > 0) {
      allRows = [...allRows, ...(data as unknown as T[])];
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Filter profiles based on debug filter criteria
 * This applies the same logic as UserPoolDebugger Health tab
 */
export interface FilteredResult {
  filteredProfiles: any[];
  usersWithImages: Set<string>;
  seenUsers: Set<string>;
  premiumUserIds: Set<string>;
}

export async function applyDebugFilter(
  profiles: any[],
  debugFilter: string
): Promise<FilteredResult> {
  const userIds = profiles.map(p => p.id);
  let filteredProfiles = [...profiles];
  const usersWithImages = new Set<string>();
  const seenUsers = new Set<string>();
  const premiumUserIds = new Set<string>();

  if (debugFilter === 'no_photo' || debugFilter === 'no_images') {
    // Fetch ALL user images using batch fetch
    const allImages = await fetchAllRows<{ user_id: string }>('user_images', 'user_id');
    allImages.forEach(img => {
      if (img.user_id) usersWithImages.add(img.user_id);
    });
    // Keep only users WITHOUT images
    filteredProfiles = profiles.filter(p => !usersWithImages.has(p.id));
    console.log(`[DebugFilter] no_photo: ${usersWithImages.size} users have images, ${filteredProfiles.length} users without images`);
  } else if (debugFilter === 'never_seen') {
    // Fetch ALL likes and passes using batch fetch
    const [allLikes, allPasses] = await Promise.all([
      fetchAllRows<{ liked_id: string }>('likes', 'liked_id'),
      fetchAllRows<{ passed_id: string }>('passes', 'passed_id'),
    ]);
    allLikes.forEach(like => {
      if (like.liked_id) seenUsers.add(like.liked_id);
    });
    allPasses.forEach(pass => {
      if (pass.passed_id) seenUsers.add(pass.passed_id);
    });
    // Keep only users who have NEVER been seen
    filteredProfiles = profiles.filter(p => !seenUsers.has(p.id));
    console.log(`[DebugFilter] never_seen: ${seenUsers.size} users have been seen, ${filteredProfiles.length} never seen`);
  } else if (debugFilter === 'incomplete' || debugFilter === 'incomplete_profile') {
    // Keep only users with incomplete profiles
    filteredProfiles = profiles.filter(p => {
      const gender = (p.gender || '').trim();
      const preference = (p.preference || '').trim();
      const bio = (p.bio || '').trim();
      const city = (p.city || '').trim();
      return !(gender && preference && bio && city);
    });
    console.log(`[DebugFilter] incomplete: ${filteredProfiles.length} incomplete profiles`);
  } else if (debugFilter === 'active' || debugFilter === 'active_accounts') {
    // Keep only active accounts
    filteredProfiles = profiles.filter(p => p.account_status === 'active');
    console.log(`[DebugFilter] active: ${filteredProfiles.length} active accounts`);
  } else if (debugFilter === 'premium' || debugFilter === 'premium_users') {
    (await fetchPremiumUserIds(userIds)).forEach(id => premiumUserIds.add(id));
    // Keep only premium users
    filteredProfiles = profiles.filter(p => premiumUserIds.has(p.id));
    console.log(`[DebugFilter] premium: ${premiumUserIds.size} premium users found, ${filteredProfiles.length} in list`);
  }

  return { filteredProfiles, usersWithImages, seenUsers, premiumUserIds };
}

/**
 * Fetch all profiles with pagination
 */
export async function fetchAllProfiles(
  countryArray: string[],
  filters?: {
    genderFilter?: string;
    preferenceFilter?: string;
    intentFilter?: string;
    statusFilter?: string;
    archiveFilter?: string;
    isAdmin?: boolean;
  }
): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const profiles: any[] = [];
  
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;

    const f: AdminProfileFilters = {
      countries: countryArray,
      is_admin: filters?.isAdmin ?? false,
      // Safety: exclude deleted/suspended users
      exclude_statuses: ['deleted', 'suspended'],
    };
    if (filters?.genderFilter && filters.genderFilter !== 'all') f.gender = filters.genderFilter;
    if (filters?.preferenceFilter && filters.preferenceFilter !== 'all') f.preference = filters.preferenceFilter;
    if (filters?.intentFilter && filters.intentFilter !== 'all') f.relationship_intent = filters.intentFilter;
    f.account_status = filters?.statusFilter && filters.statusFilter !== 'all' ? filters.statusFilter : 'active';
    if (filters?.archiveFilter === 'not_archived') f.archive = 'not_archived';
    else if (filters?.archiveFilter === 'archived_only') f.archive = 'archived_only';

    // Admin-only RPC (needs email); falls back to a direct query until the lockdown migration exists.
    const { data: pageRows, error } = await adminGetProfiles<any>({
      filters: f,
      limit: PAGE_SIZE,
      offset: from,
      fallbackColumns: 'id, first_name, last_name, email, country, city, account_status, gender, preference, relationship_intent, is_archived, bio',
    });

    if (error) throw error;
    if (!pageRows || pageRows.length === 0) break;

    profiles.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) break;
  }

  return profiles;
}

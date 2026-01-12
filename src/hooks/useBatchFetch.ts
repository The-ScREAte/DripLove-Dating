import { supabase } from '@/integrations/supabase/client';

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
    // Fetch ALL active subscriptions using batch fetch
    const allSubs = await fetchAllRows<{ user_id: string; status: string }>('user_subscriptions', 'user_id, status', [
      { column: 'status', op: 'eq', value: 'active' }
    ]);
    allSubs.forEach(sub => {
      if (sub.user_id) premiumUserIds.add(sub.user_id);
    });
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
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('profiles')
      .select('id, first_name, last_name, email, country, city, account_status, gender, preference, relationship_intent, is_archived, bio')
      .in('country', countryArray)
      .eq('is_admin', filters?.isAdmin ?? false);

    // Apply gender filter
    if (filters?.genderFilter && filters.genderFilter !== 'all') {
      query = query.eq('gender', filters.genderFilter);
    }

    // Apply preference filter
    if (filters?.preferenceFilter && filters.preferenceFilter !== 'all') {
      query = query.eq('preference', filters.preferenceFilter);
    }

    // Apply intent filter
    if (filters?.intentFilter && filters.intentFilter !== 'all') {
      query = query.eq('relationship_intent', filters.intentFilter);
    }

    // Apply status filter
    if (filters?.statusFilter && filters.statusFilter !== 'all') {
      query = query.eq('account_status', filters.statusFilter);
    } else {
      query = query.eq('account_status', 'active');
    }

    // Apply archive filter
    if (filters?.archiveFilter === 'not_archived') {
      query = query.or('is_archived.is.null,is_archived.eq.false');
    } else if (filters?.archiveFilter === 'archived_only') {
      query = query.eq('is_archived', true);
    }

    // Safety: exclude deleted/suspended users
    query = query.neq('account_status', 'deleted')
                 .neq('account_status', 'suspended');

    const { data: pageRows, error } = await query.order('id').range(from, to);

    if (error) throw error;
    if (!pageRows || pageRows.length === 0) break;

    profiles.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) break;
  }

  return profiles;
}

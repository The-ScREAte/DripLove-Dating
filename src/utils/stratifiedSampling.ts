/**
 * Stratified Sampling for Fair Profile Distribution
 * 
 * Ensures new users get visibility (30%) while established users stay visible (70%)
 * Tinder-balanced approach: reduced new-user dominance for better fairness
 * 
 * Distribution per batch of 15 (optimized for 16 free swipes):
 * - Bucket A (Very New, ≤7 days): 2 profiles (13%)
 * - Bucket B (New, 8-30 days): 3 profiles (20%)
 * - Bucket C (Regular, 1-6 months): 5 profiles (33%)
 * - Bucket D (Veteran, >6 months): 5 profiles (34%)
 */

export interface ProfileBuckets<T> {
  veryNew: T[];    // Bucket A: created ≤7 days ago
  new: T[];        // Bucket B: created 8-30 days ago
  regular: T[];    // Bucket C: created 1-6 months ago
  veteran: T[];    // Bucket D: created >6 months ago
}

export interface BucketQuotas {
  veryNew: number;
  new: number;
  regular: number;
  veteran: number;
}

// Tinder-balanced quotas: new users still get visibility but don't dominate
// OLD: 47% new users (veryNew 3 + new 4 = 7/15)
// NEW: 33% new users (veryNew 2 + new 3 = 5/15) - fairer for established users
const DEFAULT_QUOTAS: BucketQuotas = {
  veryNew: 2,  // 13% (was 20%)
  new: 3,      // 20% (was 27%)
  regular: 5,  // 33% (was 27%)
  veteran: 5   // 34% (was 26%)
};

/**
 * Categorize a single profile into its appropriate bucket based on created_at
 */
export function getBucketForProfile(createdAt: string | Date): keyof ProfileBuckets<any> {
  const now = new Date();
  const created = new Date(createdAt);
  const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceCreated <= 7) {
    return 'veryNew';
  } else if (daysSinceCreated <= 30) {
    return 'new';
  } else if (daysSinceCreated <= 180) { // 6 months
    return 'regular';
  } else {
    return 'veteran';
  }
}

/**
 * Categorize profiles into buckets based on account age
 */
export function categorizeProfilesIntoBuckets<T extends { created_at?: string | null }>(
  profiles: T[]
): ProfileBuckets<T> {
  const buckets: ProfileBuckets<T> = {
    veryNew: [],
    new: [],
    regular: [],
    veteran: []
  };
  
  for (const profile of profiles) {
    if (!profile.created_at) {
      // Default to veteran if no created_at
      buckets.veteran.push(profile);
      continue;
    }
    
    const bucket = getBucketForProfile(profile.created_at);
    buckets[bucket].push(profile);
  }
  
  return buckets;
}

/**
 * Shuffle profiles from multiple countries together fairly
 * Ensures profiles from all countries are interleaved rather than grouped
 * Uses deterministic round-robin with small batches per country
 */
export function shuffleCountriesTogether<T extends { country_code?: string | null; id: string }>(
  profiles: T[],
  seed: string = ''
): T[] {
  if (profiles.length === 0) return [];
  
  // Group profiles by country
  const byCountry: Map<string, T[]> = new Map();
  for (const profile of profiles) {
    const country = profile.country_code || 'unknown';
    if (!byCountry.has(country)) {
      byCountry.set(country, []);
    }
    byCountry.get(country)!.push(profile);
  }
  
  // If only one country, just return shuffled
  if (byCountry.size <= 1) {
    const random = seededRandom(hashString(seed + '_single'));
    return sampleFromArray(profiles, profiles.length, random);
  }
  
  // Shuffle each country's profiles internally for randomness
  const random = seededRandom(hashString(seed + '_countries'));
  const shuffledByCountry: Map<string, T[]> = new Map();
  for (const [country, countryProfiles] of byCountry) {
    shuffledByCountry.set(country, sampleFromArray(countryProfiles, countryProfiles.length, random));
  }
  
  // Deterministic round-robin: take 2 from each country in rotation
  const result: T[] = [];
  const countries = Array.from(shuffledByCountry.keys());
  // Shuffle country order once for variety
  for (let i = countries.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [countries[i], countries[j]] = [countries[j], countries[i]];
  }
  
  const indices: Map<string, number> = new Map(countries.map(c => [c, 0]));
  const batchSize = 2; // Take 2 profiles per country per round
  
  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    for (const country of countries) {
      const countryProfiles = shuffledByCountry.get(country)!;
      const startIdx = indices.get(country)!;
      
      // Take up to batchSize profiles from this country
      for (let i = 0; i < batchSize; i++) {
        const idx = startIdx + i;
        if (idx < countryProfiles.length) {
          result.push(countryProfiles[idx]);
        }
      }
      
      const newIdx = startIdx + batchSize;
      indices.set(country, newIdx);
      if (newIdx < countryProfiles.length) {
        hasMore = true;
      }
    }
  }
  
  return result;
}

/**
 * Seeded random number generator for deterministic sampling
 */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

/**
 * Hash a string to a number for seeding
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Randomly sample n items from an array using a seeded RNG
 */
function sampleFromArray<T>(array: T[], count: number, random: () => number): T[] {
  if (array.length <= count) return [...array];
  
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, count);
}

/**
 * Redistribute unfilled quota proportionally to other buckets
 */
function redistributeQuotas(
  buckets: ProfileBuckets<any>,
  initialQuotas: BucketQuotas
): BucketQuotas {
  const finalQuotas = { ...initialQuotas };
  let totalUnfilled = 0;
  const bucketKeys: (keyof ProfileBuckets<any>)[] = ['veryNew', 'new', 'regular', 'veteran'];
  
  // Calculate unfilled quota
  for (const key of bucketKeys) {
    const available = buckets[key].length;
    const quota = finalQuotas[key];
    if (available < quota) {
      totalUnfilled += quota - available;
      finalQuotas[key] = available;
    }
  }
  
  // Redistribute to buckets with excess
  if (totalUnfilled > 0) {
    const bucketsWithExcess = bucketKeys.filter(
      key => buckets[key].length > finalQuotas[key]
    );
    
    if (bucketsWithExcess.length > 0) {
      const extraPerBucket = Math.floor(totalUnfilled / bucketsWithExcess.length);
      let remainder = totalUnfilled % bucketsWithExcess.length;
      
      for (const key of bucketsWithExcess) {
        const maxAvailable = buckets[key].length;
        const currentQuota = finalQuotas[key];
        const extraToAdd = extraPerBucket + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        
        finalQuotas[key] = Math.min(currentQuota + extraToAdd, maxAvailable);
      }
    }
  }
  
  return finalQuotas;
}

/**
 * Main stratified sampling function
 * 
 * @param profiles - All filtered profiles to sample from
 * @param batchSize - Target batch size (default 15)
 * @param seed - Seed for deterministic sampling (e.g., `${userId}_${date}`)
 * @returns Shuffled array of profiles with fair distribution
 */
export function stratifiedSample<T extends { created_at?: string | null }>(
  profiles: T[],
  batchSize: number = 15,
  seed: string = ''
): T[] {
  if (profiles.length === 0) return [];
  if (profiles.length <= batchSize) {
    // If we have fewer profiles than batch size, just shuffle and return all
    const random = seededRandom(hashString(seed));
    return sampleFromArray(profiles, profiles.length, random);
  }
  
  // Step 1: Categorize profiles into buckets
  const buckets = categorizeProfilesIntoBuckets(profiles);
  
  // Step 2: Calculate initial quotas (scaled to batch size)
  const scale = batchSize / 15;
  const initialQuotas: BucketQuotas = {
    veryNew: Math.round(DEFAULT_QUOTAS.veryNew * scale),
    new: Math.round(DEFAULT_QUOTAS.new * scale),
    regular: Math.round(DEFAULT_QUOTAS.regular * scale),
    veteran: Math.round(DEFAULT_QUOTAS.veteran * scale)
  };
  
  // Ensure total matches batch size
  const totalQuota = initialQuotas.veryNew + initialQuotas.new + initialQuotas.regular + initialQuotas.veteran;
  if (totalQuota < batchSize) {
    initialQuotas.veteran += batchSize - totalQuota;
  } else if (totalQuota > batchSize) {
    initialQuotas.veteran = Math.max(0, initialQuotas.veteran - (totalQuota - batchSize));
  }
  
  // Step 3: Redistribute quotas for empty/underfilled buckets
  const adjustedQuotas = redistributeQuotas(buckets, initialQuotas);
  
  // Step 4: Sample from each bucket
  const random = seededRandom(hashString(seed));
  const sampled: T[] = [
    ...sampleFromArray(buckets.veryNew, adjustedQuotas.veryNew, random),
    ...sampleFromArray(buckets.new, adjustedQuotas.new, random),
    ...sampleFromArray(buckets.regular, adjustedQuotas.regular, random),
    ...sampleFromArray(buckets.veteran, adjustedQuotas.veteran, random)
  ];
  
  // Step 5: Shuffle the combined result so users don't notice the pattern
  const finalShuffle = seededRandom(hashString(seed + '_final'));
  for (let i = sampled.length - 1; i > 0; i--) {
    const j = Math.floor(finalShuffle() * (i + 1));
    [sampled[i], sampled[j]] = [sampled[j], sampled[i]];
  }
  
  return sampled;
}

/**
 * Get multiple stratified batches from a large pool of profiles
 * Each batch will have fair distribution from the remaining pool
 * Also interleaves profiles from different countries for fair exposure
 */
export function getStratifiedBatches<T extends { created_at?: string | null; id: string; country_code?: string | null }>(
  profiles: T[],
  batchSize: number = 15,
  numBatches: number = 4,
  seed: string = ''
): T[] {
  if (profiles.length === 0) return [];
  
  // First, interleave profiles from different countries
  const countryInterleaved = shuffleCountriesTogether(profiles, seed + '_country');
  
  const result: T[] = [];
  let remainingProfiles = [...countryInterleaved];
  const usedIds = new Set<string>();
  
  for (let i = 0; i < numBatches && remainingProfiles.length > 0; i++) {
    const batchSeed = `${seed}_batch${i}`;
    const batch = stratifiedSample(remainingProfiles, batchSize, batchSeed);
    
    // Add batch to result and remove from remaining
    for (const profile of batch) {
      if (!usedIds.has(profile.id)) {
        result.push(profile);
        usedIds.add(profile.id);
      }
    }
    
    // Update remaining profiles
    remainingProfiles = remainingProfiles.filter(p => !usedIds.has(p.id));
  }
  
  // Final country interleave to ensure countries are mixed throughout
  return shuffleCountriesTogether(result, seed + '_final_mix');
}

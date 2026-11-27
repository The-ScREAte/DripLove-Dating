import { PotentialMatch } from '@/types';

interface AdData {
  id: string;
  image_url: string;
  name: string;
  about: string;
  link: string | null;
  link_as: string | null;
  isAd: true;
}

type MatchOrAd = PotentialMatch | AdData;

// Global cache for discover page data - persists across component mounts
const discoverCache = new Map<string, { 
  potentialMatches: MatchOrAd[], 
  userImages: { [key: string]: string[] },
  userDistances: { [key: string]: number },
  currentIndex: number,
  timestamp: number 
}>();

const DISCOVER_CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours
// Make cache globally accessible for preloading
if (typeof window !== 'undefined') {
  (window as any).discoverCache = discoverCache;
}

// Deterministic shuffle function to ensure consistent profile order
export const createDeterministicShuffle = <T>(array: T[], seed: string): T[] => {
  const arr = [...array];
  
  // Simple hash function to convert seed string to number
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use seeded random for Fisher-Yates shuffle
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  for (let i = arr.length - 1; i > 0; i--) {
    hash = (hash * 9301 + 49297) % 233280; // Linear congruential generator
    const j = Math.floor(seededRandom(hash) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr;
};

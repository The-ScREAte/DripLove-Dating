import type { ChatMatchesCacheValue, CircleCacheValue, CircleRowsCacheValue, LikedMeCacheValue } from './cacheTypes';

declare global {
  interface Window {
    likedMeCache?: Map<string, LikedMeCacheValue>;
    chatMatchesCache?: Map<string, ChatMatchesCacheValue>;
    circleCache?: Map<string, CircleCacheValue>;
    circleRowsCache?: Map<string, CircleRowsCacheValue>;
  }
}

export {};

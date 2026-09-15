import type { ChatMatchesCacheValue, CircleCacheValue, LikedMeCacheValue } from './cacheTypes';

declare global {
  interface Window {
    likedMeCache?: Map<string, LikedMeCacheValue>;
    chatMatchesCache?: Map<string, ChatMatchesCacheValue>;
    circleCache?: Map<string, CircleCacheValue>;
  }
}

export {};

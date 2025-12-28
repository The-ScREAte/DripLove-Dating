import type { ChatMatchesCacheValue, LikedMeCacheValue } from './cacheTypes';

declare global {
  interface Window {
    likedMeCache?: Map<string, LikedMeCacheValue>;
    chatMatchesCache?: Map<string, ChatMatchesCacheValue>;
  }
}

export {};

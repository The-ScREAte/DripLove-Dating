/**
 * Global persistent chat cache - survives route changes and component unmounts
 * Similar to Tinder/Instagram/Telegram architecture for instant chat list rendering
 */

export interface CachedChat {
  id: string;
  participants?: string[];
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
  unread_messages?: number;
  other_user?: any;
  updated_at?: string;
  first_name: string;
  last_name: string;
  created_at: string;
  user1_id: string;
  user2_id: string;
  [key: string]: any;
}

export const chatCache = {
  ownerUserId: '' as string,
  timestamp: 0,
  chats: [] as CachedChat[],
  avatars: {} as Record<string, string>, // blob URLs for user avatars
  userNames: {} as Record<string, string>, // cached user names for instant render
};

/**
 * Check if cache is still valid (30 seconds freshness)
 */
export const isCacheValid = (): boolean => {
  const CACHE_DURATION = 30000; // 30 seconds
  return chatCache.chats.length > 0 && Date.now() - chatCache.timestamp < CACHE_DURATION;
};

/**
 * Check if cache is valid for a specific signed-in user
 */
export const isCacheValidForUser = (userId?: string): boolean => {
  if (!userId) return false;
  if (chatCache.ownerUserId !== userId) return false;
  return isCacheValid();
};

/**
 * Update cache with new chat list
 */
export const updateChatCache = (chats: CachedChat[]): void => {
  chatCache.chats = chats;
  chatCache.timestamp = Date.now();
};

/**
 * Update cache and bind ownership to current signed-in user
 */
export const updateChatCacheForUser = (userId: string, chats: CachedChat[]): void => {
  chatCache.ownerUserId = userId;
  chatCache.chats = chats;
  chatCache.timestamp = Date.now();
};

/**
 * Update a single chat in cache (for real-time updates)
 */
export const updateSingleChat = (chatId: string, updates: Partial<CachedChat>): void => {
  const index = chatCache.chats.findIndex(chat => chat.id === chatId);
  if (index !== -1) {
    chatCache.chats[index] = { ...chatCache.chats[index], ...updates };
  }
};

/**
 * Add or update avatar blob URL in cache
 */
export const cacheAvatar = (userId: string, blobUrl: string): void => {
  chatCache.avatars[userId] = blobUrl;
};

/**
 * Get cached avatar blob URL
 */
export const getCachedAvatar = (userId: string): string | undefined => {
  return chatCache.avatars[userId];
};

/**
 * Cache user name for instant render
 */
export const cacheUserName = (userId: string, firstName: string, lastName: string): void => {
  chatCache.userNames[userId] = `${firstName} ${lastName}`;
};

/**
 * Get cached user name
 */
export const getCachedUserName = (userId: string): string | undefined => {
  return chatCache.userNames[userId];
};

/**
 * Clear all cache (logout scenario)
 */
export const clearChatCache = (): void => {
  chatCache.ownerUserId = '';
  chatCache.chats = [];
  chatCache.avatars = {};
  chatCache.userNames = {};
  chatCache.timestamp = 0;
};

// Make cache globally accessible for debugging
if (typeof window !== 'undefined') {
  (window as any).chatCache = chatCache;
}

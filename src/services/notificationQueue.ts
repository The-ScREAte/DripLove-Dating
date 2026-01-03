/**
 * Notification Queue Service
 * Implements best-practice notification batching, cooldowns, and suppression
 * 
 * Rules:
 * - Messages: Always instant (unless in-chat or foreground)
 * - Matches: Always instant (unless on match screen or foreground)
 * - Likes: Batched (3 likes OR 2 hours since first unseen like)
 * - Cooldowns: 2hr for likes, 2-3min global (except messages)
 * - Suppression: Skip if user active in last 10-15 minutes
 */

import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'driplove_notification_queue';
const ACTIVITY_KEY = 'driplove_last_activity';
const COOLDOWN_KEY = 'driplove_notification_cooldowns';

interface NotificationQueueData {
  likeQueue: {
    count: number;
    firstLikeAt: number | null;
    lastNotifiedAt: number | null;
  };
  lastGlobalNotification: number | null;
}

interface CooldownData {
  lastLikeNotification: number | null;
  lastGlobalNotification: number | null;
}

// Default state
const defaultQueueData: NotificationQueueData = {
  likeQueue: {
    count: 0,
    firstLikeAt: null,
    lastNotifiedAt: null,
  },
  lastGlobalNotification: null,
};

const defaultCooldownData: CooldownData = {
  lastLikeNotification: null,
  lastGlobalNotification: null,
};

// Cooldown constants (in milliseconds)
const LIKE_NOTIFICATION_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours
const GLOBAL_COOLDOWN = 2 * 60 * 1000; // 2 minutes (except messages)
const LIKE_BATCH_THRESHOLD = 3; // Send after 3 likes
const LIKE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours timeout for batch
const ACTIVE_SUPPRESSION_WINDOW = 10 * 60 * 1000; // 10 minutes

/**
 * Get queue data from storage
 */
export const getQueueData = (): NotificationQueueData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    void 0;
  }
  return { ...defaultQueueData };
};

/**
 * Save queue data to storage
 */
const saveQueueData = (data: NotificationQueueData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    void 0;
  }
};

/**
 * Get cooldown data
 */
const getCooldownData = (): CooldownData => {
  try {
    const stored = localStorage.getItem(COOLDOWN_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    void 0;
  }
  return { ...defaultCooldownData };
};

/**
 * Save cooldown data
 */
const saveCooldownData = (data: CooldownData): void => {
  try {
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(data));
  } catch (error) {
    void 0;
  }
};

/**
 * Record user activity (call this on meaningful interactions)
 */
export const recordUserActivity = (): void => {
  try {
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  } catch (error) {
    void 0;
  }
};

/**
 * Check if user is currently active
 */
export const isUserActive = (): boolean => {
  try {
    const lastActivity = localStorage.getItem(ACTIVITY_KEY);
    if (!lastActivity) return false;
    
    const timeSinceActivity = Date.now() - parseInt(lastActivity, 10);
    return timeSinceActivity < ACTIVE_SUPPRESSION_WINDOW;
  } catch (error) {
    return false;
  }
};

/**
 * Check if global cooldown has passed (except for messages)
 */
export const hasGlobalCooldownPassed = (): boolean => {
  const cooldown = getCooldownData();
  if (!cooldown.lastGlobalNotification) return true;
  
  const timeSince = Date.now() - cooldown.lastGlobalNotification;
  return timeSince >= GLOBAL_COOLDOWN;
};

/**
 * Check if like notification cooldown has passed (2 hours)
 */
export const hasLikeCooldownPassed = (): boolean => {
  const cooldown = getCooldownData();
  if (!cooldown.lastLikeNotification) return true;
  
  const timeSince = Date.now() - cooldown.lastLikeNotification;
  return timeSince >= LIKE_NOTIFICATION_COOLDOWN;
};

/**
 * Record that a notification was sent
 */
export const recordNotificationSent = (type: 'like' | 'match' | 'message' | 'other'): void => {
  const cooldown = getCooldownData();
  const now = Date.now();
  
  if (type === 'like') {
    cooldown.lastLikeNotification = now;
  }
  
  // Don't set global cooldown for messages
  if (type !== 'message') {
    cooldown.lastGlobalNotification = now;
  }
  
  saveCooldownData(cooldown);
};

/**
 * Queue a like event - returns true if notification should be sent now
 */
export const queueLikeEvent = (): { shouldNotify: boolean; likeCount: number } => {
  const data = getQueueData();
  const now = Date.now();
  
  // Increment like count
  data.likeQueue.count += 1;
  
  // Set first like time if not set
  if (!data.likeQueue.firstLikeAt) {
    data.likeQueue.firstLikeAt = now;
  }
  
  saveQueueData(data);
  
  // Check if we should send notification now
  const shouldNotify = shouldSendLikeNotification();
  
  if (shouldNotify) {
    const likeCount = data.likeQueue.count;
    // Reset queue after notification
    resetLikeQueue();
    return { shouldNotify: true, likeCount };
  }
  
  return { shouldNotify: false, likeCount: data.likeQueue.count };
};

/**
 * Check if like notification should be sent
 */
const shouldSendLikeNotification = (): boolean => {
  const data = getQueueData();
  const now = Date.now();
  
  // No likes queued
  if (data.likeQueue.count === 0) return false;
  
  // Check cooldown (2 hours since last like notification)
  if (!hasLikeCooldownPassed()) return false;
  
  // Check global cooldown
  if (!hasGlobalCooldownPassed()) return false;
  
  // Threshold reached (3+ likes)
  if (data.likeQueue.count >= LIKE_BATCH_THRESHOLD) return true;
  
  // Timeout reached (2 hours since first like)
  if (data.likeQueue.firstLikeAt) {
    const timeSinceFirst = now - data.likeQueue.firstLikeAt;
    if (timeSinceFirst >= LIKE_TIMEOUT && data.likeQueue.count > 0) {
      return true;
    }
  }
  
  return false;
};

/**
 * Reset the like queue after notification is sent
 */
export const resetLikeQueue = (): void => {
  const data = getQueueData();
  data.likeQueue = {
    count: 0,
    firstLikeAt: null,
    lastNotifiedAt: Date.now(),
  };
  saveQueueData(data);
};

/**
 * Get current like queue count
 */
export const getLikeQueueCount = (): number => {
  const data = getQueueData();
  return data.likeQueue.count;
};

/**
 * Check and send batched like notification if conditions are met
 * Call this periodically or on relevant events
 */
export const checkAndSendBatchedLikeNotification = async (
  userId: string,
  sendNotification: (title: string, body: string, userId: string, type: string) => Promise<boolean>
): Promise<boolean> => {
  // Don't notify if user is active
  if (isUserActive()) {
    return false;
  }
  
  const data = getQueueData();
  
  if (!shouldSendLikeNotification()) {
    return false;
  }
  
  const likeCount = data.likeQueue.count;
  
  // Send the batched notification
  const success = await sendNotification(
    'New Interest',
    'People are showing interest in you. Check them out!',
    userId,
    'like'
  );
  
  if (success) {
    recordNotificationSent('like');
    resetLikeQueue();
  }
  
  return success;
};

/**
 * Determine if a match notification should be sent
 */
export const shouldSendMatchNotification = (currentTab?: string): boolean => {
  // Suppress if user is on chat/match screen
  if (currentTab === 'chat') return false;
  
  // Suppress if user is very active (just matched)
  // But matches are high-intent, so we're lenient
  if (isUserActive()) {
    // Still send if it's been at least 1 minute
    const lastActivity = localStorage.getItem(ACTIVITY_KEY);
    if (lastActivity) {
      const timeSince = Date.now() - parseInt(lastActivity, 10);
      if (timeSince < 60000) return false; // < 1 minute, suppress
    }
  }
  
  // Check global cooldown
  if (!hasGlobalCooldownPassed()) return false;
  
  return true;
};

/**
 * Determine if a message notification should be sent
 */
export const shouldSendMessageNotification = (
  currentChatId?: string,
  messageChatId?: string
): boolean => {
  // Suppress if user is in the same chat
  if (currentChatId && messageChatId && currentChatId === messageChatId) {
    return false;
  }
  
  // Messages always bypass global cooldown
  // Messages always bypass activity check (they're high-priority)
  return true;
};

/**
 * Clear all notification queue data
 */
export const clearNotificationQueue = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COOLDOWN_KEY);
  } catch (error) {
    void 0;
  }
};

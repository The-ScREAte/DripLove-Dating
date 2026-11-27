const ACTIVITY_KEY = 'driplove_last_activity';
const COOLDOWN_KEY = 'driplove_notification_cooldowns';

interface CooldownData {
  lastLikeNotification: number | null;
  lastGlobalNotification: number | null;
}

// Default state
const defaultCooldownData: CooldownData = {
  lastLikeNotification: null,
  lastGlobalNotification: null,
};

// Cooldown constants (in milliseconds)
const LIKE_NOTIFICATION_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours
const GLOBAL_COOLDOWN = 2 * 60 * 1000; // 2 minutes (except messages)
const LIKE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours timeout for batch
const ACTIVE_SUPPRESSION_WINDOW = 10 * 60 * 1000; // 10 minutes
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
 * Check if global cooldown has passed (except for messages)
 */
export const hasGlobalCooldownPassed = (): boolean => {
  const cooldown = getCooldownData();
  if (!cooldown.lastGlobalNotification) return true;
  
  const timeSince = Date.now() - cooldown.lastGlobalNotification;
  return timeSince >= GLOBAL_COOLDOWN;
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
 
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { requestNotificationPermission } from '@/services/pushNotifications';
// ⭐ ANDROID FIX: Use platform utils instead of synchronous Capacitor import
import { getPlatformSync } from '@/utils/platformUtils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { chatCache, updateChatCache, isCacheValid, cacheUserName, type CachedChat } from '@/cache/chatCache';
// SafeAreaView removed — use plain divs with env(...) padding where necessary
import UserProfileModal from './UserProfileModal';
import BlockDialog from './BlockDialog';
import ReportDialog from '@/components/ReportDialog';
import DeleteChatDialog from './chat/DeleteChatDialog';
import MessageBubble from './chat/MessageBubble';
import MessageInput from './chat/MessageInput';
import ChatHeader from './chat/ChatHeader';
import ChatUserAvatar from './ChatUserAvatar';
import MatchExpirationAvatar from './chat/MatchExpirationAvatar';
import RatingDialog from './RatingDialog';
import { CurrentUser, ChatMatch, ChatMessage } from '@/types';
import { useTranslation } from 'react-i18next';
import { getRatingData } from '@/utils/ratingStorage';
import { useChatKeyboardFix } from '@/hooks/useChatKeyboardFix';

type WindowWithChatCaches = Window & {
  chatMatchesCache?: typeof chatMatchesCache;
  chatMessagesCache?: typeof chatMessagesCache;
};

interface ChatPageProps {
  currentUser: CurrentUser;
  onUnreadChange?: () => void;
  onDetailViewChange?: (inDetail: boolean) => void;
}

// Dormant conversations constants
const DORMANT_DAYS = 30;
// Auto-delete chats that have remained dormant (in "Earlier conversations") for this many additional days.
// Earlier conversations = DORMANT_DAYS; deletion happens after DORMANT_DAYS + DORMANT_DELETE_AFTER_DAYS_IN_EARLIER.
const DORMANT_DELETE_AFTER_DAYS_IN_EARLIER = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isDormantChat = (match: ChatMatch) => {
  if (!match.last_message_time) return false;

  const lastActivity = new Date(match.last_message_time).getTime();
  return Date.now() - lastActivity > DORMANT_DAYS * MS_PER_DAY;
};

const isAutoDeletableDormantChat = (match: ChatMatch) => {
  // Only delete chats that have actually had messages (i.e., they can enter "Earlier conversations").
  if (!match.last_message) return false;
  if (!match.last_message_time) return false;

  const lastActivity = new Date(match.last_message_time).getTime();
  return Date.now() - lastActivity > (DORMANT_DAYS + DORMANT_DELETE_AFTER_DAYS_IN_EARLIER) * MS_PER_DAY;
};

// Global cache for chat matches - persists across component mounts
const chatMatchesCache = new Map<string, { matches: ChatMatch[], timestamp: number }>();

// Global cache for individual chat messages - NEVER expire, only update
const chatMessagesCache = new Map<string, { messages: ChatMessage[], timestamp: number }>();
const MESSAGE_CACHE_DURATION = Infinity; // Never expire - always show cached messages instantly (capped by MAX_CACHED_MESSAGES)

// Hard cap to prevent WebView/Android memory blowups
const MAX_CACHED_MESSAGES = 500;

const trimCachedMessages = (messages: ChatMessage[]) => {
  if (messages.length <= MAX_CACHED_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_CACHED_MESSAGES);
};

// Make caches globally accessible for preloading
if (typeof window !== 'undefined') {
  const w = window as WindowWithChatCaches;
  w.chatMatchesCache = chatMatchesCache;
  w.chatMessagesCache = chatMessagesCache;
}

const EXPIRING_WARNING_SENT_KEY_PREFIX = 'driplove_match_expiring_warned_v1:';
const wasExpirationWarningSent = (matchId: string): boolean => {
  try {
    return window.localStorage.getItem(`${EXPIRING_WARNING_SENT_KEY_PREFIX}${matchId}`) !== null;
  } catch {
    return false;
  }
};

const markExpirationWarningSent = (matchId: string): void => {
  try {
    window.localStorage.setItem(`${EXPIRING_WARNING_SENT_KEY_PREFIX}${matchId}`, String(Date.now()));
  } catch {
    // ignore
  }
};

const ChatPage = ({ currentUser, onUnreadChange, onDetailViewChange }: ChatPageProps) => {
  const { t } = useTranslation();
  
  // ⭐ INSTANT LOAD: Initialize with cached data (0ms render, like Instagram/Telegram)
  const [matches, setMatches] = useState<ChatMatch[]>(() => {
    if (!currentUser?.id) return [];
    // Show cached chats instantly - no loading spinner
    return isCacheValid() ? (chatCache.chats as ChatMatch[]) : [];
  });
   
  const matchesRef = useRef<ChatMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<ChatMatch | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [userToBlock, setUserToBlock] = useState<ChatMatch | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | undefined>(undefined);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const autoDeletingDormantMatchIdsRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  const { sendMessageNotification, isInitialized, isSupported } = usePushNotifications(currentUser?.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);
  
  // Reply state (must be before virtualizer effect that uses it)
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  
  // ⭐ VIRTUAL SCROLLING: Only render visible messages (90% performance improvement)
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: (index) => {
      // Dynamic height estimation based on message content
      const msg = messages[index];
      if (!msg) return 72;
      
      const hasReply = !!msg.reply_to;
      const messageLength = msg.message?.length || 0;
      
      // Base height for simple message
      let estimatedHeight = 56;
      
      // Add height for longer messages (roughly 45 chars per line)
      const extraLines = Math.floor(messageLength / 45);
      estimatedHeight += extraLines * 20;
      
      // Add height for reply preview
      if (hasReply) {
        estimatedHeight += 56;
      }
      
      // Add spacing
      estimatedHeight += 16;
      
      return estimatedHeight;
    },
    overscan: 8,
  });

  // Force re-measure after messages render (wait for DOM layout + reply preview)
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
  }, [messages, replyingTo?.id, selectedMatch?.id]);

  // Centralized debounced fetchMatches scheduler (prevents realtime burst storms)
  const fetchMatchesDebounceTimerRef = useRef<number | null>(null);

  const scheduleFetchMatches = () => {
    if (!currentUser?.id) return;
    if (fetchMatchesDebounceTimerRef.current) {
      window.clearTimeout(fetchMatchesDebounceTimerRef.current);
    }
    fetchMatchesDebounceTimerRef.current = window.setTimeout(() => {
      fetchMatchesDebounceTimerRef.current = null;
      void fetchMatches();
    }, 300);
  };
  const backgroundFetchingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const matchesNeedsRefreshRef = useRef(false);
  
  // Swipe gesture state for back navigation
  const [swipeStartX, setSwipeStartX] = useState(0);
  const [swipeStartY, setSwipeStartY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  // Rating dialog state
  const [messagesSentCount, setMessagesSentCount] = useState(0);
  
  // Dormant conversations state
  const [showDormant, setShowDormant] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);

  // Highlighted message state (for scroll-to-message)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  // Keyboard handling for chat input
  useChatKeyboardFix();

  // Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    
    // Clear badge count when user opens chat page - dynamic import for Android performance
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          PushNotifications.removeAllDeliveredNotifications().catch(() => {
            // Ignore errors
          });
        }
      } catch {
        // Ignore errors
      }
    })();
    
    // ⭐ Check if we have valid cached data first (instant render)
    if (isCacheValid()) {
      setMatches(chatCache.chats as ChatMatch[]);
      // Still fetch in background to get latest data
      fetchMatchesInBackground();
    } else {
      // No cache or stale cache, fetch immediately
      fetchMatches();
    }
    
    // Force cleanup of expired matches on mount
    setTimeout(() => {
      if (currentUser?.id && chatCache.chats.length > 0) {
        checkExpiredMatches(chatCache.chats as unknown as ChatMatch[]);
      }
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Reliability: listen for incoming unread chats addressed to this user.
  // This keeps unread badges working even if match-level unread counters drift.
  useEffect(() => {
    if (!currentUser?.id) return;

    const channel = supabase
      .channel(`unread-chats:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
        },
        (payload) => {
          const newMsg = payload.new as { match_id?: string; sender_id?: string; is_read?: boolean | null; message?: string; created_at?: string };
          if (!newMsg || newMsg.is_read === true) return;
          const matchId = newMsg.match_id;
          if (!matchId) return;

          // Only treat as incoming if it wasn't sent by the current user
          if (newMsg.sender_id === currentUser.id) return;

          // Only care about matches that exist in our current list
          const isMyMatch = matchesRef.current.some((m) => m.id === matchId);
          if (!isMyMatch) return;

          // If user is currently viewing this chat, it will be marked read immediately; don't increment.
          if (selectedMatch?.id === matchId) return;

          // Update match list immediately (badge + sort + last message)
          setMatches(prev => {
            const updated = prev.map(m => {
              if (m.id !== matchId) return m;
              const currentUnread = Number.isFinite(m.unread_messages) ? Number(m.unread_messages) : 0;
              return {
                ...m,
                unread_messages: currentUnread + 1,
                last_message: newMsg.message || m.last_message,
                last_message_time: (newMsg.created_at || m.last_message_time) as string,
              };
            });

            // Move updated match to the top by most recent activity
            const sorted = [...updated].sort((a, b) => {
              const aTime = new Date(a.last_message_time || a.created_at).getTime();
              const bTime = new Date(b.last_message_time || b.created_at).getTime();
              return bTime - aTime;
            });

            // Update caches for instant render
            chatMatchesCache.set(currentUser.id, { matches: sorted, timestamp: Date.now() });
            updateChatCache(sorted as unknown as CachedChat[]);

            return sorted;
          });

          onUnreadChange?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, selectedMatch?.id, onUnreadChange]);

  // Handle deep linking from notifications - auto-select match if matchId in URL or hash
  useEffect(() => {
    if (!currentUser || !currentUser.id || matches.length === 0) return;
    
    // Check both query params and hash for matchId
    const params = new URLSearchParams(window.location.search);
    let matchIdFromUrl = params.get('matchId');
    
    // Also check hash (set by notification handler)
    if (!matchIdFromUrl && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      matchIdFromUrl = hashParams.get('matchId');
    }
    
    if (matchIdFromUrl && !selectedMatch) {
      const matchToOpen = matches.find(m => m.id === matchIdFromUrl);
      if (matchToOpen) {
        setSelectedMatch(matchToOpen);
        // Clear the URL parameter and hash
        window.history.replaceState({}, '', window.location.pathname);
        window.location.hash = '';
      }
    }
  }, [currentUser, matches, selectedMatch]);

  // Keep matchesRef in sync
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  // Real-time subscription for matches table (filtered to current user)
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;

    const handleMatchesChange = () => {
      scheduleFetchMatches();
      onUnreadChange?.();
    };

    // Supabase realtime filters only support a single condition, so subscribe twice.
    const channelUser1 = supabase
      .channel('chat-matches-user1')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `user1_id=eq.${currentUser.id}`,
        },
        handleMatchesChange
      )
      .subscribe();

    const channelUser2 = supabase
      .channel('chat-matches-user2')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `user2_id=eq.${currentUser.id}`,
        },
        handleMatchesChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelUser1);
      supabase.removeChannel(channelUser2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, onUnreadChange]);

  // ⭐ ANDROID OPTIMIZATION: Reduced polling frequency (5s instead of 2s)
  // Real-time subscription handles instant updates, polling is just a fallback
  useEffect(() => {
    if (!currentUser?.id || selectedMatch) return;
    
    const interval = setInterval(() => {
      // ⭐ Only refresh if cache is stale (prevents unnecessary updates)
      if (!isCacheValid()) {
        fetchMatches();
      }
    }, 5000); // ⭐ ANDROID FIX: Reduced from 2s to 5s - realtime handles instant updates

    return () => {
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, selectedMatch]);

  // ⭐ ANDROID OPTIMIZATION: Lazy preload only top 3 chats, with longer delays
  useEffect(() => {
    if (!currentUser?.id || selectedMatch || matches.length === 0) return;
    
    // ⭐ ANDROID FIX: Only preload top 3 chats (reduced from 5)
    const preloadChats = async () => {
      const topChats = matches.slice(0, 3); // Reduced from 5 to 3
      for (const match of topChats) {
        const cached = chatMessagesCache.get(match.id);
        // Only preload if not cached or cache is very old
        if (!cached || cached.messages.length === 0) {
          await fetchMessagesInBackground(match.id);
          // ⭐ ANDROID FIX: Increased delay between preloads (500ms instead of 200ms)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    };
    
    // ⭐ ANDROID FIX: Start preloading after 2s delay (increased from 1s)
    const timer = setTimeout(preloadChats, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, selectedMatch, matches]);

  // Listen for new match events from DiscoverPage
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    
    const handleNewMatch = (event: CustomEvent) => {
      if (event.detail.userId === currentUser.id) {
        // Clear cache
        chatMatchesCache.delete(currentUser.id);
        // Fetch fresh data in background
        fetchMatchesInBackground();
        // Update unread count
        onUnreadChange?.();
      }
    };
    
    window.addEventListener('newMatch', handleNewMatch as EventListener);
    
    return () => {
      window.removeEventListener('newMatch', handleNewMatch as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, onUnreadChange]);

  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    if (selectedMatch) {
      // ALWAYS load from cache first for instant display
      const cached = chatMessagesCache.get(selectedMatch.id);
      if (cached && cached.messages.length > 0) {
        // Show cached messages instantly - don't filter, let them appear immediately
        const visibleMessages = cached.messages.filter(msg => {
          const isDeletedForMe = msg.deleted_for && msg.deleted_for.includes(currentUser.id);
          return !isDeletedForMe;
        });
        setMessages(visibleMessages);
      } else {
        // No cache yet, show empty state
        setMessages([]);
      }
      
      // ALWAYS fetch new messages in background (even if cache exists)
      fetchMessagesInBackground(selectedMatch.id);
      // Mark messages as read (fire and forget, but log for debugging)
      void markMessagesAsRead();
      onDetailViewChange?.(true);
      
      // Scroll to bottom after messages load
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
          // Reset state: entering a chat should consider us at bottom
          isAtBottomRef.current = true;
        }
      }, 100);
    }
    else {
      onDetailViewChange?.(false);
      // Refresh the matches list when there were changes while inside the conversation
      // OR when we're returning to the chat list view
      if (matchesNeedsRefreshRef.current) {
        scheduleFetchMatches();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch]);

  // Mark messages as read when app goes to background or page is hidden
  useEffect(() => {
    if (!selectedMatch || !currentUser?.id) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Mark as read when user leaves the chat/app
        markMessagesAsRead();
      }
    };
    
    const handleBeforeUnload = () => {
      // Attempt to mark as read before page unloads
      markMessagesAsRead();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      // Also mark as read when unmounting the effect (e.g., when chat is closed)
      markMessagesAsRead();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch, currentUser?.id]);

  // ⭐ ANDROID OPTIMIZATION: Reduced message polling (3s instead of 1s)
  // Real-time subscription handles instant updates, polling is just a fallback
  // NOTE: Message polling removed to avoid UI jank while typing.

  // Ensure on open we always start at the last message unless user scrolls up
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    // If user hasn't scrolled up yet (near bottom or initial open), snap to bottom
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isUserNearBottom = distanceFromBottom < 50; // threshold
    if (isUserNearBottom) {
      // Use a microtask + animation frame to wait for layout
      setTimeout(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }, 0);
    }
  }, [selectedMatch]);

  // On new messages, only keep user at bottom if they are already near bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages]);

  // Single scroll listener: bottom tracking (all platforms) + keyboard dismiss (mobile)
  useEffect(() => {
    const container = messagesContainerRef.current; 
    if (!container) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let lastScrollTop = container.scrollTop;
    let scrollTimeout: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      const threshold = 24;
      const currentScrollTop = container.scrollTop;
      const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
      isAtBottomRef.current = distanceFromBottom <= threshold;

      // Only dismiss keyboard when scrolling up (like iMessages)
      if (isMobile && currentScrollTop < lastScrollTop) {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const activeElement = document.activeElement as HTMLElement;
          if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            activeElement.blur();
          }
        }, 50);
      }

      lastScrollTop = currentScrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [selectedMatch]);

  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    if (selectedMatch) {
      const channel = supabase
        .channel(`chats:${selectedMatch.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chats',
            filter: `match_id=eq.${selectedMatch.id}`,
          },
          (payload) => {
            const newMsg = payload.new as ChatMessage;
            
            // Ensure sent_at is set for proper date display
            if (!newMsg.sent_at && newMsg.created_at) {
              newMsg.sent_at = newMsg.created_at;
            }
            
            // Don't skip deleted messages - they will be displayed as "deleted"
            
            // INSTANT: Populate sender info from partner data for immediate display
            if (!newMsg.sender && selectedMatch.partner) {
              newMsg.sender = {
                first_name: selectedMatch.partner.first_name,
                last_name: selectedMatch.partner.last_name
              };
            }
            
            // Update messages state
              setMessages((prev) => {
                // Dedupe: if message id already exists, ignore (prevents duplicates from optimistic + realtime)
                if (prev.some(m => m.id === newMsg.id)) {
                  return prev;
                }
                
                // Remove any temp message with same content (optimistic update)
                // This handles the case where we added an optimistic message and now the real one arrived
                const withoutTemp = prev.filter(m => {
                  // Keep all non-temp messages
                  if (!m.id.startsWith('temp_')) return true;
                  // Remove temp message if it matches the incoming real message
                  return !(m.message === newMsg.message && m.sender_id === newMsg.sender_id);
                });
                
                const updated = trimCachedMessages([...withoutTemp, newMsg]);
                // Update cache with new message
                chatMessagesCache.set(selectedMatch.id, {
                  messages: updated,
                  timestamp: Date.now()
                });
                return updated;
              });
            
            // INSTANT UPDATE: Update the match list in the background immediately
            updateMatchInBackground(selectedMatch.id, newMsg);
            
            if (newMsg.sender_id !== currentUser.id) {
              markMessagesAsRead();
            } else {
              // If we sent the message, trigger unread count refresh for other matches
              onUnreadChange?.();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chats',
            filter: `match_id=eq.${selectedMatch.id}`,
          },
          (payload) => {
            const updatedMsg = payload.new as ChatMessage;

            // Update the specific message in state (single state update; prevents double renders)
            setMessages((prev) => {
              const updated = trimCachedMessages(
                prev.map(m => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
              );
              chatMessagesCache.set(selectedMatch.id, {
                messages: updated,
                timestamp: Date.now()
              });
              return updated;
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'chats',
            filter: `match_id=eq.${selectedMatch.id}`,
          },
          (payload) => {
            const deletedMsg = payload.old as { id: string };
            
            // Remove the message from state
            setMessages((prev) => {
              const updated = prev.filter(m => m.id !== deletedMsg.id);
              const trimmed = trimCachedMessages(updated);
              // Update cache
              chatMessagesCache.set(selectedMatch.id, {
                messages: trimmed,
                timestamp: Date.now()
              });
              return trimmed;
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch, currentUser?.id, onUnreadChange]);

  type MatchRowProfile = {
    id?: string;
    first_name?: string;
    last_name?: string;
    is_admin?: boolean;
    is_archived?: boolean;
  };

  type MatchRowChat = {
    id: string;
    message: string;
    created_at: string;
    sender_id: string;
  };

  type MatchRow = {
    id: string;
    created_at: string;
    user1_id: string;
    user2_id: string;
    user1?: MatchRowProfile | null;
    user2?: MatchRowProfile | null;
    chats?: MatchRowChat[] | null;
    user1_unread_count?: unknown;
    user2_unread_count?: unknown;
  };

  const processMatchesData = (rows: MatchRow[]): ChatMatch[] => {
    const mapped: ChatMatch[] = (rows || [])
      .map((row) => {
        const partner = row.user1_id === currentUser.id ? row.user2 : row.user1;

        if (partner?.is_archived === true) return null;

        const partnerId = partner?.id;
        const firstName = partner?.first_name || '';
        const lastName = partner?.last_name || '';

        if (partnerId && firstName && lastName) {
          cacheUserName(partnerId, firstName, lastName);
        }

        const lastMessage = row.chats?.[0];
        const isUser1 = row.user1_id === currentUser.id;
        const rawUnread = isUser1 ? row.user1_unread_count : row.user2_unread_count;
        let unreadCount = Number(rawUnread);
        if (!Number.isFinite(unreadCount) || unreadCount < 0) unreadCount = 0;

        const match: ChatMatch = {
          id: row.id,
          created_at: row.created_at,
          user1_id: row.user1_id,
          user2_id: row.user2_id,
          partner: partnerId
            ? {
                id: partnerId,
                first_name: firstName,
                last_name: lastName,
                is_admin: partner?.is_admin === true,
              }
            : undefined,
          first_name: firstName,
          last_name: lastName,
          last_message_obj: lastMessage,
          unread_messages: unreadCount,
          last_message: lastMessage?.message || '',
          last_message_time: lastMessage?.created_at || row.created_at,
        };

        return match;
      })
      .filter((m): m is ChatMatch => Boolean(m))
      .sort((a, b) => {
        const aTime = new Date(a.last_message_time || a.created_at).getTime();
        const bTime = new Date(b.last_message_time || b.created_at).getTime();
        return bTime - aTime;
      });

    return mapped;
  };

  // Optimistically update a specific match in the cached list (for instant UI updates)
  const updateMatchInBackground = (matchId: string, newMessage: ChatMessage) => {
    if (!currentUser?.id) return;
    
    // Update the matches state immediately (optimistic update)
    setMatches(prev => {
      const updated = prev.map(match => {
        if (match.id === matchId) {
          return {
            ...match,
            last_message: newMessage.message,
            last_message_time: newMessage.created_at,
          };
        }
        return match;
      });
      
      // Re-sort by most recent message only if this match isn't already at the top
      let sorted = updated;
      if (sorted.length > 1 && sorted[0]?.id !== matchId) {
        sorted = sorted.sort((a, b) => {
          const aTime = new Date(a.last_message_time || a.created_at).getTime();
          const bTime = new Date(b.last_message_time || b.created_at).getTime();
          return bTime - aTime;
        });
      }
      
      // Update cache with optimistic data
      chatMatchesCache.set(currentUser.id, {
        matches: sorted,
        timestamp: Date.now()
      });
      
      return sorted;
    });
  };

  // ⭐ Background refresh (quiet, no UI lock - like Telegram)
  const fetchMatchesInBackground = async () => {
    if (backgroundFetchingRef.current) return;
    if (!currentUser || !currentUser.id) return;
    backgroundFetchingRef.current = true;

    try {
      const { data: matches, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin, is_archived),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin, is_archived),
          chats(id, message, created_at, sender_id)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false })
        .order('created_at', { foreignTable: 'chats', ascending: false });

      if (error) throw error;

      const processedMatches = processMatchesData((matches || []) as unknown as MatchRow[]);

      const autoDeleteCandidates = processedMatches
        .filter(isAutoDeletableDormantChat)
        .map((m) => m.id)
        .filter((id) => !autoDeletingDormantMatchIdsRef.current.has(id));

      for (const id of autoDeleteCandidates) {
        autoDeletingDormantMatchIdsRef.current.add(id);
      }

      const visibleMatches = processedMatches.filter(
        (m) => !autoDeletingDormantMatchIdsRef.current.has(m.id)
      );

      // Unread counts come from match-level counters (user1_unread_count/user2_unread_count).
      
      // ⭐ OPTIMIZED: Fast shallow comparison instead of expensive JSON.stringify
      const listChanged = visibleMatches.length !== chatCache.chats.length ||
        visibleMatches.some((m, i) =>
          m.id !== chatCache.chats[i]?.id ||
          m.last_message_time !== chatCache.chats[i]?.last_message_time
        );
      
      if (listChanged) {
        updateChatCache(visibleMatches as unknown as CachedChat[]);
        setMatches(visibleMatches);
      }

      if (autoDeleteCandidates.length > 0) {
        void (async () => {
          for (const matchId of autoDeleteCandidates) {
            try {
              const { error: deleteError } = await supabase.rpc('delete_match_with_chats', {
                match_id_param: matchId,
              });

              if (deleteError) throw deleteError;

              chatMessagesCache.delete(matchId);
              autoDeletingDormantMatchIdsRef.current.delete(matchId);
            } catch {
              // If delete fails, allow it to reappear on a future refresh.
              autoDeletingDormantMatchIdsRef.current.delete(matchId);
            }
          }
          // Ensure we don't rehydrate deleted items from the in-memory cache.
          chatMatchesCache.delete(currentUser.id);
        })();
      }
      
      // We've refreshed matches in the background; clear the "needs refresh" flag
      matchesNeedsRefreshRef.current = false;
    } catch (error) {
      // Silently handle background fetch errors
    } finally {
      backgroundFetchingRef.current = false;
    }
  };

  const fetchMatches = async (showLoading = false) => {
    if (showLoading) setIsRefreshing(true);
    if (!currentUser || !currentUser.id) {
      if (showLoading) setIsRefreshing(false);
      return;
    }
    try {
      const { data: matches, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin, is_archived),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin, is_archived),
          chats(id, message, created_at, sender_id)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false })
        .order('created_at', { foreignTable: 'chats', ascending: false });

      if (error) throw error;

      const processedMatches = processMatchesData((matches || []) as unknown as MatchRow[]);

      const autoDeleteCandidates = processedMatches
        .filter(isAutoDeletableDormantChat)
        .map((m) => m.id)
        .filter((id) => !autoDeletingDormantMatchIdsRef.current.has(id));

      for (const id of autoDeleteCandidates) {
        autoDeletingDormantMatchIdsRef.current.add(id);
      }

      const visibleMatches = processedMatches.filter(
        (m) => !autoDeletingDormantMatchIdsRef.current.has(m.id)
      );

      // Unread counts come from match-level counters (user1_unread_count/user2_unread_count).
      
      // ⭐ Update global cache (survives route changes like Instagram)
      updateChatCache(visibleMatches as unknown as CachedChat[]);

      setMatches(visibleMatches);
      // Clear the refresh flag when we've just fetched
      matchesNeedsRefreshRef.current = false;

      if (autoDeleteCandidates.length > 0) {
        void (async () => {
          // If the currently-open chat is being auto-deleted, leave detail view.
          if (selectedMatch?.id && autoDeleteCandidates.includes(selectedMatch.id)) {
            setSelectedMatch(null);
            setMessages([]);
          }

          for (const matchId of autoDeleteCandidates) {
            try {
              const { error: deleteError } = await supabase.rpc('delete_match_with_chats', {
                match_id_param: matchId,
              });

              if (deleteError) throw deleteError;

              chatMessagesCache.delete(matchId);
              autoDeletingDormantMatchIdsRef.current.delete(matchId);
            } catch {
              // If delete fails, allow it to reappear on a future refresh.
              autoDeletingDormantMatchIdsRef.current.delete(matchId);
            }
          }
          // Ensure we don't rehydrate deleted items from the in-memory cache.
          chatMatchesCache.delete(currentUser.id);
        })();
      }
      
      // Check for expired matches and send notifications
      checkExpiredMatches(visibleMatches);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load conversations.',
        variant: 'destructive'
      });
    }
    finally {
      if (showLoading) {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    }
  };

  // Check for expired matches and handle dissolution/notifications
  const checkExpiredMatches = async (matchesList: ChatMatch[]) => {
    if (!currentUser || !currentUser.id) return;

    const EXPIRATION_DAYS = 10;
    const WARNING_DAYS = 9; // Send notification after 9 days (1 day before expiration)
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    
    const expiredMatchIds: string[] = [];

    for (const match of matchesList) {
      const hasMessages = !!match.last_message;
      if (hasMessages) continue; // Skip matches with messages

      const matchCreated = new Date(match.created_at);
      const daysSinceMatch = (now.getTime() - matchCreated.getTime()) / MS_PER_DAY;

      // Dissolve match if 10 days have passed
      if (daysSinceMatch >= EXPIRATION_DAYS) {
        expiredMatchIds.push(match.id);
      }
      // Send warning notification if 9 days have passed
      else if (daysSinceMatch >= WARNING_DAYS && daysSinceMatch < WARNING_DAYS + 0.1) {
        if (wasExpirationWarningSent(match.id)) {
          continue;
        }
        const partnerId = match.user1_id === currentUser.id ? match.user2_id : match.user1_id;
        const partnerName = match.first_name;
        
        try {
          // Send notification via push notification service
          const { sendPushNotification } = await import('@/services/pushNotifications');
          await sendPushNotification({
            title: t('chat.matchExpiringTitle'),
            body: t('chat.matchExpiringBody', { name: partnerName }),
            userId: currentUser.id,
            type: 'match',
            data: { matchId: match.id, partnerId }
          });

          markExpirationWarningSent(match.id);

        } catch (error) {
          console.error('[ChatPage] Error sending expiration notification:', error);
        }
      }
    }
    
    // Delete all expired matches in one batch
    if (expiredMatchIds.length > 0) {
      try {
        const { error } = await supabase
          .from('matches')
          .delete()
          .in('id', expiredMatchIds);

        if (!error) {
          // Clear cache so next fetch gets fresh data without expired matches
          chatMatchesCache.delete(currentUser.id);
          // Refresh the matches list
          fetchMatches();
        } else {
          console.error('[ChatPage] Error deleting expired matches:', error);
        }
      } catch (error) {
        console.error('[ChatPage] Error in checkExpiredMatches:', error);
      }
    }
  };

  const fetchMessages = async () => {
    if (!selectedMatch) {
      return;
    }


    // Check cache first
    const cached = chatMessagesCache.get(selectedMatch.id);
    if (cached && Date.now() - cached.timestamp < MESSAGE_CACHE_DURATION) {
      // Filter out messages deleted for current user
      const visibleMessages = cached.messages.filter(msg => {
        const isDeletedForMe = msg.deleted_for && msg.deleted_for.includes(currentUser.id);
        return !isDeletedForMe;
      });
      setMessages(visibleMessages);
      // Still fetch in background for updates
      fetchMessagesInBackground(selectedMatch.id);
      return;
    }


    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          sender:profiles!chats_sender_id_fkey(first_name, last_name)
        `)
        .eq('match_id', selectedMatch.id)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }


      const mappedMessages = data?.map(msg => ({
        ...msg,
        sent_at: msg.created_at,
        receiver_id: msg.sender_id === currentUser.id 
          ? (selectedMatch.user1_id === currentUser.id ? selectedMatch.user2_id : selectedMatch.user1_id)
          : currentUser.id
      })) || [];

      const processedMessages = mappedMessages as unknown as ChatMessage[];
      
      // Don't filter out deleted messages - mark them instead
      const visibleMessages = processedMessages;
      
      
      // Update cache with all messages (bounded)
      chatMessagesCache.set(selectedMatch.id, {
        messages: trimCachedMessages(processedMessages),
        timestamp: Date.now()
      });

      setMessages(visibleMessages);
    } catch (error) {
      // ignore fetch errors
    }
  };

  const fetchMessagesInBackground = async (matchId: string) => {
    try {
      // Get the latest message ID from cache to only fetch newer messages
      const cached = chatMessagesCache.get(matchId);
      let query = supabase
        .from('chats')
        .select(`
          *,
          sender:profiles!chats_sender_id_fkey(first_name, last_name)
        `)
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      // If we have cached messages, only fetch messages newer than the latest one
      if (cached && cached.messages.length > 0) {
        const latestMessage = cached.messages[cached.messages.length - 1];
        query = query.gt('created_at', latestMessage.created_at);
      }

      const { data, error } = await query;

      if (error) throw error;

      const mappedMessages = data?.map(msg => ({
        ...msg,
        sent_at: msg.created_at,
        receiver_id: msg.sender_id === currentUser.id 
          ? (selectedMatch?.user1_id === currentUser.id ? selectedMatch?.user2_id : selectedMatch?.user1_id)
          : currentUser.id
      })) || [];

      const newMessages = mappedMessages as unknown as ChatMessage[];
      
      // Merge new messages with cached messages
      const allMessages = trimCachedMessages(
        cached ? [...cached.messages, ...newMessages] : newMessages
      );
      
      // Update cache with merged messages
      chatMessagesCache.set(matchId, {
        messages: allMessages,
        timestamp: Date.now()
      });

      // Update state if this is still the selected match and we have new messages
      if (selectedMatch?.id === matchId && newMessages.length > 0) {
        setMessages(allMessages);
        
        // Auto-scroll to bottom if user was already at bottom
        setTimeout(() => {
          if (isAtBottomRef.current) {
            const container = messagesContainerRef.current;
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          }
        }, 50);
      }
    } catch (error) {
      // Silently handle background fetch errors
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedMatch) return;

    const isUser1 = selectedMatch.user1_id === currentUser.id;
    const unreadField = isUser1 ? 'user1_unread_count' : 'user2_unread_count';

    try {
      // Step 1: Mark all incoming chat messages as read
      const { error: chatError } = await supabase
        .from('chats')
        .update({ is_read: true })
        .eq('match_id', selectedMatch.id)
        .neq('sender_id', currentUser.id)
        .or('is_read.is.null,is_read.eq.false');

      if (chatError) {
        console.error('[ChatPage] Failed to mark chats as read:', chatError);
      } else {
        // Update local state to show double checkmarks immediately
        setMessages(prev => prev.map(msg =>
          msg.sender_id !== currentUser.id ? { ...msg, is_read: true } : msg
        ));
      }

      // Step 2: Reset the unread count in the matches table
      const { error: matchError, data: updateData } = await supabase
        .from('matches')
        .update({ [unreadField]: 0 })
        .eq('id', selectedMatch.id)
        .select();

      if (matchError) {
        console.error('[ChatPage] Failed to reset match unread counter:', matchError);
      } else {
        // Update local matches state to reflect zero unread count
        setMatches(prev => prev.map(m =>
          m.id === selectedMatch.id ? { ...m, unread_messages: 0 } : m
        ));

        // Update cache as well
        const cached = chatMatchesCache.get(currentUser.id);
        if (cached) {
          cached.matches = cached.matches.map(m =>
            m.id === selectedMatch.id ? { ...m, unread_messages: 0 } : m
          );
          chatMatchesCache.set(currentUser.id, cached);
        }
      }
    } catch (error) {
      console.error('[ChatPage] markMessagesAsRead unexpected error:', error);
    } finally {
      // Always ask the parent to refresh nav unread badge after a short delay
      // to ensure the DB transaction is fully committed
      setTimeout(() => {
        onUnreadChange?.();
      }, 100);
    }
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms = 12000): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error('timeout')),
        ms);
      }),
    ]);
  };

  const sendMessage = async (rawText: string) => {
    const messageText = rawText.trim();
    if (!messageText || !selectedMatch || isSending) return;

    if (selectedMatch.partner?.is_admin) {
      toast({
        title: t('chat.cannotSendToAdmin'),
        description: t('chat.cannotSendToAdminDesc'),
        variant: 'destructive'
      });
      return;
    }

    setIsSending(true);

    try {
      // Check if either user has blocked the other
      try {
        const partnerId = selectedMatch.user1_id === currentUser.id
          ? selectedMatch.user2_id
          : selectedMatch.user1_id;

        const { data: blockData, error: blockError } = await supabase
          .from('blocks')
          .select('id')
          .or(`and(blocker_id.eq.${currentUser.id},blocked_id.eq.${partnerId}),and(blocker_id.eq.${partnerId},blocked_id.eq.${currentUser.id})`)
          .limit(1);

        if (blockError) throw blockError;

        if (blockData && blockData.length > 0) {
          toast({
            title: t('chat.cannotSend'),
            description: 'Cannot send messages to this user',
            variant: 'destructive'
          });
          return;
        }
      } catch {
        // Continue with sending message if block check fails
      }

    const tempId = `temp_${Date.now()}`;
    
    
    // Optimistic update - show message immediately
    const optimisticMessage: ChatMessage = {
      id: tempId,
      match_id: selectedMatch.id,
      sender_id: currentUser.id,
      message: messageText,
      created_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      is_read: false, // Initially not read - shows single checkmark
      receiver_id: selectedMatch.user1_id === currentUser.id ? selectedMatch.user2_id : selectedMatch.user1_id,
      sender: {
        first_name: currentUser.first_name,
        last_name: currentUser.last_name
      }
    } as ChatMessage;


    // INSTANT OPTIMISTIC UPDATE: Update match list immediately even before server confirms
    updateMatchInBackground(selectedMatch.id, optimisticMessage);

    // Add to messages immediately
    setMessages(prev => {
      const updated = trimCachedMessages([...prev, optimisticMessage]);
      // Update cache
      chatMessagesCache.set(selectedMatch.id, {
        messages: updated,
        timestamp: Date.now()
      });
      return updated;
    });

    // Track messages sent and show rating dialog after 7 messages
    const newCount = messagesSentCount + 1;
    setMessagesSentCount(newCount);
    
    if (newCount === 7) {
      const ratingData = getRatingData();
      if (!ratingData.hasRated) {
        setShowRatingDialog(true);
      }
    }

      try {
      // Send the message to server with timeout
      const queryPromise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
        supabase
          .from('chats')
          .insert({
            match_id: selectedMatch.id,
            sender_id: currentUser.id,
            message: messageText,
            reply_to: replyingTo?.id || null
          })
          .select(`
            *,
            sender:profiles!chats_sender_id_fkey(first_name, last_name)
          `)
          .single()
          .then(resolve);
      });
      
      const { data, error } = await withTimeout(queryPromise, 12000);
      
      // Clear reply state after sending
      setReplyingTo(null);

      if (error) {
        throw error;
      }


      // Replace optimistic message with real one from server
      if (data) {
        const serverData = data as unknown as ChatMessage;
        // INSTANT UPDATE: Update match list immediately with new message
        updateMatchInBackground(selectedMatch.id, serverData);
        
        setMessages(prev => {
          const serverMsg: ChatMessage = {
            id: serverData.id,
            sender_id: serverData.sender_id,
            receiver_id: optimisticMessage.receiver_id,
            message: serverData.message,
            sent_at: serverData.created_at || serverData.sent_at,
            created_at: serverData.created_at,
            is_read: serverData.is_read,
            match_id: serverData.match_id || selectedMatch.id,
            deleted_for: serverData.deleted_for,
            reply_to: serverData.reply_to,
            sender: serverData.sender,
          };

          const hasServer = prev.some(m => m.id === serverData.id);
          const hasTemp = prev.some(m => m.id === tempId);


          // If temp exists, replace it with server message
          if (hasTemp) {
            const replaced = prev.map(m => (m.id === tempId ? serverMsg : m));
            // Ensure uniqueness by id (in case server message was already appended by realtime)
            const unique: ChatMessage[] = [];
            const seen = new Set<string>();
            for (const m of replaced) {
              if (!seen.has(m.id)) {
                unique.push(m);
                seen.add(m.id);
              }
            }
            const trimmed = trimCachedMessages(unique);
            chatMessagesCache.set(selectedMatch.id, { messages: trimmed, timestamp: Date.now() });
            return trimmed;
          }

          // If temp doesn't exist and server message not present, append server message
          if (!hasServer) {
            const updated = trimCachedMessages([...prev, serverMsg]);
            chatMessagesCache.set(selectedMatch.id, { messages: updated, timestamp: Date.now() });
            return updated;
          }

          // Server message already present and no temp to replace — keep as-is
          return prev;
        });
      }
      } catch (error) {
      // Remove optimistic message on error
      setMessages(prev => {
        const updated = trimCachedMessages(prev.filter(msg => msg.id !== tempId));
        chatMessagesCache.set(selectedMatch.id, {
          messages: updated,
          timestamp: Date.now()
        });
        return updated;
      });
      
      toast({
        title: t('chat.error'),
        description: t('chat.failedToSend'),
        variant: 'destructive'
      });
      return;
      }

      // Send push notification (non-blocking)
      // These operations should not block message sending or show errors to user
      (async () => {
        try {
          // Send push notification to the recipient
          const recipientId = selectedMatch.user1_id === currentUser.id
            ? selectedMatch.user2_id
            : selectedMatch.user1_id;
          const senderName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';

          try {
            await sendMessageNotification(senderName, messageText, recipientId, selectedMatch.id);
          } catch {
            // ignore notification errors
          }

          onUnreadChange?.();

          // IMPORTANT: Refresh matches immediately when first message is sent
          // This moves the match from "New Matches" to "Conversations" instantly
          chatMatchesCache.delete(currentUser.id);
          await fetchMatches();
        } catch {
          // ignore post-send side effects
        }
      })();
    } finally {
      setIsSending(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!selectedMatch) return;

    try {
      // Delete from database permanently (only for sender's own messages)
      const { error: deleteError } = await supabase
        .from('chats')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', currentUser.id); // Only allow deleting own messages

      if (deleteError) throw deleteError;

      // Clear cache to force fresh fetch next time
      chatMessagesCache.delete(selectedMatch.id);

      // Remove from UI immediately
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (error) {
      // ignore delete errors
    }
  };

  const deleteMessageForMe = async (messageId: string) => {
    if (!selectedMatch) return;

    try {
      // Fetch fresh data from database
      const { data: currentMsg, error: fetchError } = await supabase
        .from('chats')
        .select('*')
        .eq('id', messageId)
        .single();

      if (fetchError) {
        throw fetchError;
      }
      if (!currentMsg) {
        return;
      }

      // Get current deleted_for array or initialize empty
      const deletedFor = (currentMsg.deleted_for || []) as string[];
      // Add current user to deleted_for array if not already there
      if (!deletedFor.includes(currentUser.id)) {
        deletedFor.push(currentUser.id);
      }

      // Get the other user ID
      const otherUserId = selectedMatch.user1_id === currentUser.id 
        ? selectedMatch.user2_id 
        : selectedMatch.user1_id;

      // If both users have deleted, remove from database completely
      if (deletedFor.includes(otherUserId)) {
        const { error: deleteError } = await supabase
          .from('chats')
          .delete()
          .eq('id', messageId);
        if (deleteError) {
          throw deleteError;
        }
        // Remove from UI completely
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
        chatMessagesCache.delete(selectedMatch.id);
      } else {
        // Otherwise just update the deleted_for field
        const { error: updateError } = await supabase
          .from('chats')
          .update({ deleted_for: deletedFor })
          .eq('id', messageId);
        if (updateError) {
          throw updateError;
        }
        
        // Update message in UI to show as deleted
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, deleted_for: deletedFor } : msg
        ));
        
        // Update cache
        const cachedData = chatMessagesCache.get(selectedMatch.id);
        if (cachedData) {
          const updatedMessages = trimCachedMessages(cachedData.messages.map(m =>
            m.id === messageId ? { ...m, deleted_for: deletedFor } : m
          ));
          chatMessagesCache.set(selectedMatch.id, {
            messages: updatedMessages,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      // ignore delete errors
    }
  };

  const deleteMessageForEveryone = async (messageId: string) => {
    if (!selectedMatch) return;

    try {
      // Get the message to check if user is the sender
      const message = messages.find(msg => msg.id === messageId);
      if (!message || message.sender_id !== currentUser.id) {
        return;
      }
      // Delete from database completely
      const { error: deleteError } = await supabase
        .from('chats')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', currentUser.id); // Double-check it's their message
      
      if (deleteError) {
        throw deleteError;
      }
      
      // Remove from UI completely for everyone
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      
      // Clear cache
      chatMessagesCache.delete(selectedMatch.id);
    } catch (error) {
      // ignore delete errors
    }
  };

  const handleScrollToMessage = (messageId: string) => {
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Scroll to the message using the virtualizer
    rowVirtualizer.scrollToIndex(messageIndex, {
      align: 'center',
      behavior: 'smooth',
    });

    // Highlight the message briefly
    setHighlightedMessageId(messageId);

    // Clear previous timeout if any
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    // Auto-remove highlight after 2 seconds
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId(null);
    }, 2000);
  };

  // NOTE: This handles user feedback prompts (separate from dormant conversations feature).
  // The "heading somewhere" prompt asks users if they're progressing with a conversation.
  const handleDormancyResponse = async (response: boolean) => {
    if (!selectedMatch) return;

    try {
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const updateField = isUser1 ? 'user1_heading_somewhere' : 'user2_heading_somewhere';
      
      const { error } = await supabase
        .from('matches')
        .update({ [updateField]: response })
        .eq('id', selectedMatch.id);

      if (error) throw error;

      toast({
        title: response ? t('chat.thankYouYes') : t('chat.thankYouNo'),
        description: response 
          ? t('chat.keepTheConversationGoing') 
          : t('chat.weWillCleanThingsUp'),
      });

    } catch (error) {
      // ignore update errors
    }
  };

  const testNotification = async () => {
    try {
      // First check if browser supports notifications
      if (!('Notification' in window)) {
        toast({
          title: t('chat.notSupported'),
          description: t('chat.notSupportedDesc'),
          variant: 'destructive'
        });
        return;
      }

      // Check current permission
      if (Notification.permission === 'denied') {
        toast({
          title: t('chat.permissionDenied'),
          description: t('chat.permissionDeniedDesc'),
          variant: 'destructive'
        });
        return;
      }

      // Request permission if not granted
      if (Notification.permission === 'default') {
        const granted = await requestNotificationPermission();
        if (!granted) {
          toast({
            title: t('chat.permissionRequired'),
            description: t('chat.permissionRequiredDesc'),
            variant: 'destructive'
          });
          return;
        }
      }

      // Send test notification
      if (Notification.permission === 'granted') {
        new Notification('DripLove Test 🔔', {
          body: 'Notifications are working! You\'ll receive alerts for new messages.',
          icon: '/favicon.ico'
        });
        
        toast({
          title: t('chat.testSuccessful'),
          description: t('chat.testSuccessfulDesc'),
        });
      }
    } catch (error) {
      toast({
        title: t('chat.testFailed'),
        description: t('chat.testFailedDesc'),
        variant: 'destructive'
      });
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  // Pull to refresh handlers for the matches list
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only start pull when at top of scroll and not currently in a conversation
    const container = e.currentTarget as HTMLElement;
    if (container.scrollTop === 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY > 0 && !isRefreshing) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, Math.min(100, currentY - startY));
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 50 && !isRefreshing) {
      // Trigger a user-visible refresh
      void fetchMatches(true);
    } else {
      setPullDistance(0);
    }
    setStartY(0);
  };

  const handleUserProfileClick = (userId?: string) => {
    if (userId) {
      setSelectedUserId(userId);
      setIsUserProfileOpen(true);
    }
  };

  // Swipe gesture handlers for back navigation
  const handleSwipeStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    // Only start swipe tracking if touch starts from the left edge (first 50px)
    if (touch.clientX < 50) {
      setSwipeStartX(touch.clientX);
      setSwipeStartY(touch.clientY);
      setIsSwiping(true);
    }
  };

  const handleSwipeMove = async (e: React.TouchEvent) => {
    if (!isSwiping) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;
    
    // If horizontal swipe is dominant and moving right
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 50) {
      // Trigger back navigation
      setIsSwiping(false);
      // Mark messages as read before leaving
      await markMessagesAsRead();
      setSelectedMatch(null);
    }
  };

  const handleSwipeEnd = () => {
    setIsSwiping(false);
    setSwipeStartX(0);
    setSwipeStartY(0);
  };

  // If there's no authenticated user yet, render a light loading state to avoid
  // dereferencing `currentUser.id` in JSX/handlers. Hooks above must remain
  // unconditionally called (so don't early-return before them).
  if (!currentUser || !currentUser.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading chats...</p>
        </div>
      </div>
    );
  }

  const handleBlockClick = () => {
    if (selectedMatch?.partner) {
      setUserToBlock(selectedMatch as ChatMatch);
      setIsBlockDialogOpen(true);
    }
  };

  const handleBlockSuccess = () => {
    setMatches(prev => prev.filter(match => match.id !== selectedMatch?.id));
    setSelectedMatch(null);
    toast({
      title: "User blocked",
      description: "This user has been blocked and removed from your matches.",
    });
  };

  const handleDeleteChatClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteChatConfirm = async () => {
    if (!selectedMatch) return;

    try {
      // Use the database function to delete match and all related chats
      const { error } = await supabase.rpc('delete_match_with_chats', {
        match_id_param: selectedMatch.id
      });

      if (error) throw error;

      // Remove from local state
      setMatches(prev => prev.filter(match => match.id !== selectedMatch.id));
      setSelectedMatch(null);

      // Clear cache
      chatMatchesCache.delete(currentUser.id);
      chatMessagesCache.delete(selectedMatch.id);

      toast({
        title: t('chat.chatDeleted'),
        description: t('chat.chatDeletedDescription'),
      });
    } catch (error) {
      toast({
        title: t('chat.error'),
        description: t('chat.failedToDeleteChat'),
        variant: 'destructive'
      });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  if (!selectedMatch) {
    // Dedupe new matches by partner ID to prevent duplicate profiles
    const seenPartnerIds = new Set<string>();
    const newMatchList = matches.filter(m => {
      if (m.last_message) return false; // Only show matches without messages
      const partnerId = m.partner?.id || (m.user1_id === currentUser.id ? m.user2_id : m.user1_id);
      if (seenPartnerIds.has(partnerId)) return false; // Skip duplicates
      seenPartnerIds.add(partnerId);
      return true;
    });
    
    // NOTE: Dormancy applies only to active (non-archived) users.
    // Archived users are filtered earlier in processMatchesData.
    const activeConversations = matches.filter(
      m => m.last_message && !isDormantChat(m)
    );
    const dormantConversations = matches.filter(
      m => m.last_message && isDormantChat(m)
    );
    
    return (
  <div className="fixed inset-0 flex flex-col bg-gray-50">
        {/* Header (safe area respected via env padding) */}
        <div 
          className="sticky top-0 z-30 bg-white text-gray-900 shadow-sm border-b border-gray-100" 
          style={{ 
            paddingTop: getPlatformSync() === 'web' 
              ? '64px' 
              : getPlatformSync() === 'ios' 
                ? '44px' 
                : '64px'
          }}
        >
          <div 
            className="px-4"
            style={{
              paddingTop: getPlatformSync() === 'ios' ? '4px' : '12px',
              paddingBottom: getPlatformSync() === 'ios' ? '6px' : '12px'
            }}
          >
            <h2 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
              💧 DripChat
            </h2>
          </div>
        </div>
        
        {/* New Matches Section */}
        {newMatchList.length > 0 && (
          <div 
            className="px-4 py-3 border-b bg-white"
            style={{
              marginTop: getPlatformSync() === 'ios' ? '54px' : '0px'
            }}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('chat.newMatches')}</h3>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {newMatchList.map((match) => {
                const partnerId = match.partner?.id || 
                                 (match.user1_id === currentUser.id ? match.user2_id : match.user1_id);
                const hasMessages = !!match.last_message;
                
                return (
                  <div
                    key={match.id}
                    className="flex flex-col items-center min-w-[70px] cursor-pointer"
                    onClick={() => setSelectedMatch(match)}
                  >
                    <div className="relative mb-2">
                      <MatchExpirationAvatar
                        userId={partnerId}
                        matchId={match.id}
                        matchCreatedAt={match.created_at}
                        hasMessages={hasMessages}
                        firstName={match.first_name}
                        lastName={match.last_name}
                        size="md"
                        onClick={() => handleUserProfileClick(partnerId)}
                      />
                    </div>
                    <span className="text-xs text-gray-900 text-center truncate w-full">
                      {match.first_name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

  {/* Scrollable Chat List (only this area scrolls) */}
  <div
    className="flex-1 overflow-y-auto pb-44 sm:pb-35"
    style={{ 
      WebkitOverflowScrolling: 'touch',
      paddingTop: getPlatformSync() === 'android' ? '0px' : (newMatchList.length > 0 ? '0px' : '54px')
    }}
    onTouchStart={handleTouchStart}
    onTouchMove={handleTouchMove}
    onTouchEnd={handleTouchEnd}
  >
    {/* Pull to refresh indicator */}
    {pullDistance > 0 && (
      <div
        className="flex items-center justify-center bg-pink-50 transition-all duration-200"
        style={{ height: `${pullDistance}px` }}
      >
        <div className="text-pink-600 text-sm">
          {pullDistance > 50 ? (isRefreshing ? `🔄 ${t('chat.refreshing')}` : `↓ ${t('chat.releaseToRefresh')}`) : `↓ ${t('chat.pullToRefresh')}`}
        </div>
      </div>
    )}
          {activeConversations.length === 0 && dormantConversations.length === 0 && newMatchList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center mt-20">
              <div className="mb-6">
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center">
                  <span className="text-5xl">💬</span>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3">
                {t('chat.noMatchesYet')}
              </h3>
              <p className="text-gray-600 mb-2 max-w-sm">
                {t('chat.swipeRightInDripCheck')}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {t('chat.moreYouSwipe')}
              </p>
              <div className="flex items-center gap-2 text-pink-600 font-medium">
                <span>💧</span>
                <span>{t('chat.startSwipingInDripCheck')}</span>
              </div>
            </div>
          ) : activeConversations.length === 0 && dormantConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center mt-12">
              <div className="mb-6">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center">
                  <span className="text-4xl">✨</span>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">
                {t('chat.newMatchesWaiting')}
              </h3>
              <p className="text-gray-600 max-w-sm">
                {t('chat.tapMatchToMessage')}
              </p>
            </div>
          ) : (
            <>
            {activeConversations.map((match, index) => {
              // Determine the correct partner ID for avatar
              const partnerId = match.partner?.id || 
                               (match.user1_id === currentUser.id ? match.user2_id : match.user1_id);
              
              return (
                <div
                  key={match.id}
                  className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors ${
                    selectedMatch?.id === match.id ? 'bg-pink-50 border-pink-200' : 'bg-white'
                  } ${match.unread_messages > 0 ? 'font-bold bg-purple-50' : ''}`}
                  style={{
                    marginTop: index === 0 && newMatchList.length === 0 && getPlatformSync() === 'ios' 
                      ? '0px'
                      : undefined
                  }}
                  onClick={() => setSelectedMatch(match)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <ChatUserAvatar
                        userId={partnerId}
                        firstName={match.first_name}
                        lastName={match.last_name}
                        onClick={() => handleUserProfileClick(partnerId)}
                        size="md"
                      />
                      {match.unread_messages > 0 && (
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {match.unread_messages > 9 ? '9+' : match.unread_messages}
                        </div>
                      )}
                    </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className={`font-semibold truncate ${match.unread_messages > 0 ? 'text-purple-700' : 'text-gray-900'}`}
                        >
                        {match.first_name} {match.last_name}
                      </h3>
                      {match.last_message_time && (
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(match.last_message_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                    {match.last_message && (
                      <p className="text-sm text-gray-600 truncate mt-1">
                        {match.last_message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
            
            {/* Dormant Conversations Section */}
            {dormantConversations.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowDormant(v => !v)}
                  className="w-full text-sm text-gray-500 px-4 py-2 flex justify-between items-center hover:bg-gray-50 transition-colors"
                >
                  <span>Earlier conversations ({dormantConversations.length})</span>
                  <span>{showDormant ? '▲' : '▼'}</span>
                </button>

                {showDormant && (
                  <div className="opacity-70">
                    {dormantConversations.map(match => {
                      const partnerId = match.partner?.id || 
                                       (match.user1_id === currentUser.id ? match.user2_id : match.user1_id);
                      
                      return (
                        <div
                          key={match.id}
                          className="p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors bg-white"
                          onClick={() => setSelectedMatch(match)}
                        >
                          <div className="flex items-center space-x-3">
                            <ChatUserAvatar
                              userId={partnerId}
                              firstName={match.first_name}
                              lastName={match.last_name}
                              onClick={() => handleUserProfileClick(partnerId)}
                              size="md"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                <h3 className="font-medium text-gray-700 truncate">
                                  {match.first_name} {match.last_name}
                                </h3>
                                {match.last_message_time && (
                                  <span className="text-xs text-gray-400 ml-2">
                                    {new Date(match.last_message_time).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 truncate mt-1">
                                {match.last_message}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>

        <UserProfileModal
          isOpen={isUserProfileOpen}
          onClose={() => setIsUserProfileOpen(false)}
          userId={selectedUserId}
        />

        <BlockDialog
          isOpen={isBlockDialogOpen}
          onClose={() => setIsBlockDialogOpen(false)}
          userToBlock={userToBlock}
          currentUserId={currentUser?.id}
          onBlockSuccess={handleBlockSuccess}
        />
      </div>
    );
  }

  const handleBackClick = async () => {
    // Mark messages as read before leaving
    await markMessagesAsRead();
    // Clear cache to force fresh data
    chatMatchesCache.delete(currentUser.id);
    // Refresh matches immediately
    fetchMatches();
    // Close the chat
    setSelectedMatch(null);
  };

  return (
  <div className="fixed inset-0 flex flex-col bg-gray-50">
      {/* Chat Header (below global header) */}
  <div className="shrink-0 bg-white border-b border-gray-200 shadow-sm z-20 m-0 p-0">
        <ChatHeader
          selectedMatch={selectedMatch}
          onBack={handleBackClick}
          onUserProfileOpen={handleUserProfileClick}
          onBlockUser={handleBlockClick}
          onDeleteChat={handleDeleteChatClick}
          onReport={(messageId?: string) => {
            setReportMessageId(messageId);
            setIsReportDialogOpen(true);
          }}
          onTestNotification={testNotification}
          isMobile={true}
          currentUserId={currentUser?.id ?? ''}
        />
      </div>

      {/* Scrollable Messages Area (only this area scrolls) */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 bg-gray-50 chat-messages-container"
        style={{ 
          WebkitOverflowScrolling: 'touch', 
          paddingTop: getPlatformSync() === 'ios' 
            ? 'clamp(160px, calc(env(safe-area-inset-top, 10px) + 140px), 180px)'
            : getPlatformSync() === 'web'
              ? '140px'
              : '140px'
        }}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pt-20">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center">
                <span className="text-4xl">👋</span>
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              {t('chat.startConversation')}
            </h3>
            <p className="text-gray-600 text-center px-6 max-w-sm mb-4">
              {t('chat.sayHelloTo', { name: selectedMatch?.first_name })}
            </p>
            <div className="text-sm text-gray-500 text-center px-6">
              {t('chat.conversationTip')}
            </div>
          </div>
        ) : (
          <>
            {/* ⭐ VIRTUAL SCROLLING: Only render visible messages */}
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const message = messages[virtualRow.index];
                const prevMessage = messages[virtualRow.index - 1];
                const isConsecutive = prevMessage &&
                  prevMessage.sender_id === message.sender_id &&
                  new Date(message.created_at || message.sent_at || '').getTime() -
                  new Date(prevMessage.created_at || prevMessage.sent_at || '').getTime() < 300000;

                // Find the replied-to message if this message is a reply
                const repliedMessage = message.reply_to
                  ? messages.find(m => m.id === message.reply_to)
                  : null;
                // Spacing between messages
                const spacing = isConsecutive ? 4 : 12;

                return (
                  <div
                    key={message.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingTop: spacing,
                    }}
                  >
                    <MessageBubble
                      message={message}
                      currentUser={currentUser}
                      isConsecutive={isConsecutive}
                      onDeleteForMe={deleteMessageForMe}
                      onDeleteForEveryone={deleteMessageForEveryone}
                      onDormancyResponse={handleDormancyResponse}
                      onReply={setReplyingTo}
                      repliedMessage={repliedMessage}
                      onReplyClick={handleScrollToMessage}
                      isHighlighted={message.id === highlightedMessageId}
                    />
                  </div>
                );
              })}
            </div>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input (fixed, non-scrolling). MessageInput now owns its container so it can control safe-area and stacking */}
      <div className="shrink-0 z-20">
        <MessageInput
          matchId={selectedMatch?.id || null}
          onSendMessage={sendMessage}
          disabled={isSending}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </div>

      {/* Modals */}
      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        userId={selectedUserId}
      />

      <BlockDialog
        isOpen={isBlockDialogOpen}
        onClose={() => setIsBlockDialogOpen(false)}
        userToBlock={userToBlock}
        currentUserId={currentUser?.id}
        onBlockSuccess={handleBlockSuccess}
      />

      <ReportDialog
        isOpen={isReportDialogOpen}
        onClose={() => { setIsReportDialogOpen(false); setReportMessageId(undefined); }}
        reporterId={currentUser?.id ?? ''}
        reportedUserId={
          selectedMatch?.partner?.id ||
          (selectedMatch?.user1_id === currentUser?.id ? selectedMatch?.user2_id : selectedMatch?.user1_id) ||
          ''
        }
        messageId={reportMessageId}
        onReportSuccess={() => {
          // optional: any post-report actions
        }}
      />

      <DeleteChatDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteChatConfirm}
        matchName={selectedMatch ? `${selectedMatch.first_name} ${selectedMatch.last_name}` : ''}
      />

      <RatingDialog 
        show={showRatingDialog}
        onClose={() => setShowRatingDialog(false)}
        onRatingComplete={() => setShowRatingDialog(false)}
      />
    </div>
  );
};

export default React.memo(ChatPage);

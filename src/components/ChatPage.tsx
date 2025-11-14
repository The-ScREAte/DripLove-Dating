import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { requestNotificationPermission, sendPushNotification } from '@/services/pushNotifications';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
// SafeAreaView removed — use plain divs with env(...) padding where necessary
import UserProfileModal from './UserProfileModal';
import BlockDialog from './BlockDialog';
import ReportDialog from '@/components/ReportDialog';
import DeleteChatDialog from './chat/DeleteChatDialog';
import ChatUserList from './chat/ChatUserList';
import MessageBubble from './chat/MessageBubble';
import MessageInput from './chat/MessageInput';
import ChatHeader from './chat/ChatHeader';
import ChatUserAvatar from './ChatUserAvatar';
import MatchExpirationAvatar from './chat/MatchExpirationAvatar';
import { CurrentUser, ChatMatch, ChatMessage } from '@/types';
import { useTranslation } from 'react-i18next';

interface ChatPageProps {
  currentUser: CurrentUser;
  onUnreadChange?: () => void;
  onDetailViewChange?: (inDetail: boolean) => void;
}

// Global cache for chat matches - persists across component mounts
const chatMatchesCache = new Map<string, { matches: ChatMatch[], timestamp: number }>();
const CACHE_DURATION = 10000; // 10 seconds - faster updates for live feel

// Global cache for individual chat messages
const chatMessagesCache = new Map<string, { messages: ChatMessage[], timestamp: number }>();
const MESSAGE_CACHE_DURATION = 30000; // 30 seconds

// Make caches globally accessible for preloading
if (typeof window !== 'undefined') {
  (window as any).chatMatchesCache = chatMatchesCache;
  (window as any).chatMessagesCache = chatMessagesCache;
}

const ChatPage = ({ currentUser, onUnreadChange, onDetailViewChange }: ChatPageProps) => {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<ChatMatch[]>(() => {
    // If there's no current user yet (e.g. during app bootstrap), don't try to access id
    if (!currentUser || !currentUser.id) return [];
    // Initialize with cached data immediately if available
    const cached = chatMatchesCache.get(currentUser.id);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.matches;
    }
    return [];
  });
  const matchesRef = useRef<ChatMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<ChatMatch | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [userToBlock, setUserToBlock] = useState<ChatMatch | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | undefined>(undefined);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const { sendMessageNotification, isInitialized, isSupported } = usePushNotifications(currentUser?.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const backgroundFetchingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const matchesNeedsRefreshRef = useRef(false);
  
  // Swipe gesture state for back navigation
  const [swipeStartX, setSwipeStartX] = useState(0);
  const [swipeStartY, setSwipeStartY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    
    // Clear badge count when user opens chat page
    if (Capacitor.isNativePlatform()) {
      PushNotifications.removeAllDeliveredNotifications().catch(() => {
        // Ignore errors
      });
    }
    
    // Check if we have fresh cached data first
    const cached = chatMatchesCache.get(currentUser.id);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setMatches(cached.matches);
      // Still fetch in background to get latest data
      fetchMatchesInBackground();
    } else {
      // No cache or stale cache, fetch immediately but don't show loading
      fetchMatches();
    }
    
    // Force cleanup of expired matches on mount
    setTimeout(() => {
      if (currentUser?.id) {
        const cachedData = chatMatchesCache.get(currentUser.id);
        if (cachedData?.matches) {
          checkExpiredMatches(cachedData.matches);
        }
      }
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

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

  // Real-time subscription for matches table
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    
    const channel = supabase
      .channel('chat-matches')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        (payload) => {
            console.log('[ChatPage] 🔄 Matches table changed - refreshing immediately');
            // Clear cache and refresh immediately for instant updates
            chatMatchesCache.delete(currentUser.id);
            fetchMatches();
            // Update unread count badge in tab bar
            onUnreadChange?.();
          }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
        },
        (payload) => {
          console.log('[ChatPage] 📨 New message detected - refreshing match list');
          // When a new message is inserted, refresh the match list immediately
          // to update the last message preview in the chat list
          chatMatchesCache.delete(currentUser.id);
          fetchMatches();
          onUnreadChange?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chats',
        },
        (payload) => {
          console.log('[ChatPage] 🔄 Message updated - refreshing match list');
          // When a message is updated (deleted_for, etc), refresh match list
          chatMatchesCache.delete(currentUser.id);
          fetchMatches();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chats',
        },
        (payload) => {
          console.log('[ChatPage] 🗑️ Message deleted - refreshing match list');
          // When a message is deleted, refresh match list
          chatMatchesCache.delete(currentUser.id);
          fetchMatches();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  // Periodic refresh for live updates when NOT in a chat
  useEffect(() => {
    if (!currentUser?.id || selectedMatch) return;
    
    console.log('[ChatPage] 🔄 Starting periodic refresh (every 5 seconds)');
    const interval = setInterval(() => {
      console.log('[ChatPage] ⏰ Periodic refresh triggered');
      // Only refresh if cache is stale
      const cached = chatMatchesCache.get(currentUser.id);
      if (!cached || Date.now() - cached.timestamp > CACHE_DURATION) {
        fetchMatches();
      }
    }, 5000); // Refresh every 5 seconds when viewing match list

    return () => {
      console.log('[ChatPage] 🛑 Stopping periodic refresh');
      clearInterval(interval);
    };
  }, [currentUser?.id, selectedMatch]);

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
  }, [currentUser?.id, onUnreadChange]);

  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    if (selectedMatch) {
      fetchMessages();
      markMessagesAsRead();
      onDetailViewChange?.(true);
    }
    else {
      onDetailViewChange?.(false);
      // Refresh the matches list when there were changes while inside the conversation
      // OR when we're returning to the chat list view
      if (matchesNeedsRefreshRef.current) {
        void fetchMatches();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
            console.log('[ChatPage] 📨 Realtime INSERT event received:', payload);
            const newMsg = payload.new as ChatMessage;
            
            // Ensure sent_at is set for proper date display
            if (!newMsg.sent_at && newMsg.created_at) {
              newMsg.sent_at = newMsg.created_at;
            }
            
            // Check if message is deleted for current user
            if (newMsg.deleted_for && newMsg.deleted_for.includes(currentUser.id)) {
              console.log('[ChatPage] ⚠️ Message deleted for current user, skipping');
              return;
            }
            
            console.log('[ChatPage] 💬 Processing realtime message:', { id: newMsg.id, sender: newMsg.sender_id, message: newMsg.message });
            
            // Update messages state
              setMessages((prev) => {
                // Dedupe: if message id already exists, ignore (prevents duplicates from optimistic + realtime)
                if (prev.some(m => m.id === newMsg.id)) {
                  console.log('[ChatPage] ⚠️ Message already exists, skipping realtime update');
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
                
                console.log('[ChatPage] ✅ Adding realtime message to state');
                const updated = [...withoutTemp, newMsg];
                // Update cache with new message
                chatMessagesCache.set(selectedMatch.id, {
                  messages: updated,
                  timestamp: Date.now()
                });
                console.log('[ChatPage] 📊 Messages after realtime update:', updated.length);
                return updated;
              });
            
            // INSTANT UPDATE: Update the match list in the background immediately
            console.log('[ChatPage] 🔄 Updating match list with new message...');
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
            console.log('[ChatPage] 🔄 Realtime UPDATE event received:', payload);
            const updatedMsg = payload.new as ChatMessage;
            console.log('[ChatPage] 🔍 Updated message deleted_for:', updatedMsg.deleted_for);
            
            // Always update the message in the cache (store full data)
            const cachedData = chatMessagesCache.get(selectedMatch.id);
            if (cachedData) {
              const updatedCacheMessages = cachedData.messages.map(m =>
                m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m
              );
              chatMessagesCache.set(selectedMatch.id, {
                messages: updatedCacheMessages,
                timestamp: Date.now()
              });
              console.log('[ChatPage] 📦 Cache updated with message change');
            }
            
            // Check if message was deleted for current user
            if (updatedMsg.deleted_for && updatedMsg.deleted_for.includes(currentUser.id)) {
              console.log('[ChatPage] 🗑️ Message deleted for me - removing from UI:', updatedMsg.id);
              setMessages((prev) => {
                const updated = prev.filter(m => m.id !== updatedMsg.id);
                console.log('[ChatPage] ✅ Messages after delete for me:', updated.length);
                return updated;
              });
              return;
            }
            
            console.log('[ChatPage] 📝 Updating message in state:', updatedMsg.id);
            // Update the specific message in state
            setMessages((prev) => {
              const updated = prev.map(m => 
                m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m
              );
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
            console.log('[ChatPage] 🗑️ Realtime DELETE event received:', payload);
            const deletedMsg = payload.old as { id: string };
            console.log('[ChatPage] 🔄 Removing deleted message from UI:', deletedMsg.id);
            
            // Remove the message from state
            setMessages((prev) => {
              const updated = prev.filter(m => m.id !== deletedMsg.id);
              console.log('[ChatPage] ✅ Message removed, remaining:', updated.length);
              // Update cache
              chatMessagesCache.set(selectedMatch.id, {
                messages: updated,
                timestamp: Date.now()
              });
              return updated;
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

  const processMatchesData = (matches: any[]) => {
    const matchesWithPartner = (matches?.map(match => {
      const partner = match.user1_id === currentUser.id ? match.user2 : match.user1;
      // Since chats are ordered DESC by created_at, the first one is the most recent
      const lastMessage = match.chats?.[0];
      let unreadCount = 0;
      if ('user1_unread_count' in match && 'user2_unread_count' in match) {
        unreadCount = match.user1_id === currentUser.id ? Number(match.user1_unread_count) : Number(match.user2_unread_count);
      }
      if (!Number.isFinite(unreadCount) || unreadCount < 0) unreadCount = 0;
      return {
        ...match,
        partner,
        last_message_obj: lastMessage,
        unread_messages: unreadCount,
        id: match.id,
        first_name: partner?.first_name || '',
        last_name: partner?.last_name || '',
        last_message: lastMessage?.message || '',
        last_message_time: lastMessage?.created_at || match.created_at
      };
    }) || [])
      // Sort by most recent message time (desc)
      .sort((a, b) => {
        const aTime = new Date(a.last_message_time || a.created_at).getTime();
        const bTime = new Date(b.last_message_time || b.created_at).getTime();
        return bTime - aTime;
      });

    return matchesWithPartner as unknown as ChatMatch[];
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
      
      // Re-sort by most recent message
      const sorted = updated.sort((a, b) => {
        const aTime = new Date(a.last_message_time || a.created_at).getTime();
        const bTime = new Date(b.last_message_time || b.created_at).getTime();
        return bTime - aTime;
      });
      
      // Update cache with optimistic data
      chatMatchesCache.set(currentUser.id, {
        matches: sorted,
        timestamp: Date.now()
      });
      
      console.log('[ChatPage] ⚡ Match list updated instantly with new message');
      return sorted;
    });
  };

  const fetchMatchesInBackground = async () => {
    if (backgroundFetchingRef.current) return;
    if (!currentUser || !currentUser.id) return;
    backgroundFetchingRef.current = true;

    try {
      const { data: matches, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin),
          chats(id, message, created_at, sender_id)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false })
        .order('created_at', { foreignTable: 'chats', ascending: false });

      if (error) throw error;

      const processedMatches = processMatchesData(matches || []);
      
      // Update cache
      chatMatchesCache.set(currentUser.id, {
        matches: processedMatches,
        timestamp: Date.now()
      });

  // Update state with fresh data
  setMatches(processedMatches);
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
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin),
          chats(id, message, created_at, sender_id)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false })
        .order('created_at', { foreignTable: 'chats', ascending: false });

      if (error) throw error;

      const processedMatches = processMatchesData(matches || []);
      
      // Update cache
      chatMatchesCache.set(currentUser.id, {
        matches: processedMatches,
        timestamp: Date.now()
      });

      setMatches(processedMatches);
      // Clear the refresh flag when we've just fetched
      matchesNeedsRefreshRef.current = false;
      
      // Check for expired matches and send notifications
      checkExpiredMatches(processedMatches);
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
        const partnerId = match.user1_id === currentUser.id ? match.user2_id : match.user1_id;
        const partnerName = match.first_name;
        
        try {
          // Send notification via push notification service
          await sendPushNotification({
            title: t('chat.matchExpiringTitle'),
            body: t('chat.matchExpiringBody', { name: partnerName }),
            userId: currentUser.id,
            type: 'match',
            data: { matchId: match.id, partnerId }
          });

        } catch (error) {
          console.error('Error sending expiration notification:', error);
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
        } else {
          console.error('Error deleting expired matches:', error);
        }
      } catch (error) {
        console.error('Error in batch deletion:', error);
      }
    }
  };

  const fetchMessages = async () => {
    if (!selectedMatch) {
      console.log('[ChatPage] ⚠️ fetchMessages called but no selectedMatch');
      return;
    }

    console.log('[ChatPage] 📥 Fetching messages for match:', selectedMatch.id);

    // Check cache first
    const cached = chatMessagesCache.get(selectedMatch.id);
    if (cached && Date.now() - cached.timestamp < MESSAGE_CACHE_DURATION) {
      console.log('[ChatPage] 💾 Using cached messages:', cached.messages.length);
      console.log('[ChatPage] 🔍 Current user ID:', currentUser.id);
      // Filter out messages deleted for current user
      const visibleMessages = cached.messages.filter(msg => {
        const isDeletedForMe = msg.deleted_for && msg.deleted_for.includes(currentUser.id);
        if (msg.deleted_for && msg.deleted_for.length > 0) {
          console.log('[ChatPage] 🔍 Cached message', msg.id, 'deleted_for:', msg.deleted_for, 'isDeletedForMe:', isDeletedForMe);
        }
        return !isDeletedForMe;
      });
      console.log('[ChatPage] ✅ Visible messages from cache:', visibleMessages.length);
      setMessages(visibleMessages);
      // Still fetch in background for updates
      fetchMessagesInBackground(selectedMatch.id);
      return;
    }

    console.log('[ChatPage] 🔄 Cache miss or stale, fetching from database...');

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
        console.error('[ChatPage] ❌ Error fetching messages:', error);
        throw error;
      }

      console.log('[ChatPage] 📨 Fetched messages from DB:', data?.length || 0);
      console.log('[ChatPage] 🔍 Current user ID:', currentUser.id);

      const mappedMessages = data?.map(msg => ({
        ...msg,
        sent_at: msg.created_at,
        receiver_id: msg.sender_id === currentUser.id 
          ? (selectedMatch.user1_id === currentUser.id ? selectedMatch.user2_id : selectedMatch.user1_id)
          : currentUser.id
      })) || [];

      const processedMessages = mappedMessages as unknown as ChatMessage[];
      
      // Filter out messages deleted for current user
      const visibleMessages = processedMessages.filter(msg => {
        const isDeletedForMe = msg.deleted_for && msg.deleted_for.includes(currentUser.id);
        if (msg.deleted_for && msg.deleted_for.length > 0) {
          console.log('[ChatPage] 🔍 Message', msg.id, 'deleted_for:', msg.deleted_for, 'isDeletedForMe:', isDeletedForMe);
        }
        return !isDeletedForMe;
      });
      
      console.log('[ChatPage] 📊 Processed messages:', processedMessages.length, 'Visible:', visibleMessages.length);
      
      // Update cache with all messages
      chatMessagesCache.set(selectedMatch.id, {
        messages: processedMessages,
        timestamp: Date.now()
      });

      console.log('[ChatPage] ✅ Setting messages to state');
      setMessages(visibleMessages);
    } catch (error) {
      console.error('[ChatPage] ❌ Error in fetchMessages:', error);
    }
  };

  const fetchMessagesInBackground = async (matchId: string) => {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          sender:profiles!chats_sender_id_fkey(first_name, last_name)
        `)
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mappedMessages = data?.map(msg => ({
        ...msg,
        sent_at: msg.created_at,
        receiver_id: msg.sender_id === currentUser.id 
          ? (selectedMatch?.user1_id === currentUser.id ? selectedMatch?.user2_id : selectedMatch?.user1_id)
          : currentUser.id
      })) || [];

      const processedMessages = mappedMessages as unknown as ChatMessage[];
      
      // Filter out messages deleted for current user
      const visibleMessages = processedMessages.filter(msg => 
        !msg.deleted_for || !msg.deleted_for.includes(currentUser.id)
      );
      
      // Update cache with all messages
      chatMessagesCache.set(matchId, {
        messages: processedMessages,
        timestamp: Date.now()
      });

      // Update state if this is still the selected match
      if (selectedMatch?.id === matchId) {
        setMessages(visibleMessages);
      }
    } catch (error) {
      // Silently handle background fetch errors
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedMatch) return;

    try {
      // Try to check if unread fields exist in matches table
      const { data: schemaCheck } = await supabase
        .from('matches')
        .select('id')
        .limit(1)
        .single();

      if (schemaCheck) {
        // Try updating unread count with proper error handling
        try {
          const isUser1 = selectedMatch.user1_id === currentUser.id;
          const unreadField = isUser1 ? 'user1_unread_count' : 'user2_unread_count';
          const updateData = { [unreadField]: 0 };
          await supabase
            .from('matches')
            .update(updateData)
            .eq('id', selectedMatch.id);
        } catch (unreadError) {
          // Silently handle if unread fields don't exist
        }
      }

      // Try to update chat messages as read with proper error handling
      try {
        const { error } = await supabase
          .from('chats')
          .update({ is_read: true })
          .eq('match_id', selectedMatch.id)
          .neq('sender_id', currentUser.id);
        
        if (!error) {
          // Update local state to show double checkmarks immediately
          setMessages(prev => prev.map(msg => 
            msg.sender_id !== currentUser.id ? { ...msg, is_read: true } : msg
          ));
        }
      } catch (chatError) {
        // Silently handle if is_read field doesn't exist
      }

      onUnreadChange?.();
    } catch (error) {
      // Silently handle any schema-related errors
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedMatch || isSending) return;
    setIsSending(true);

    if (selectedMatch.partner?.is_admin) {
      toast({
        title: t('chat.cannotSendToAdmin'),
        description: t('chat.cannotSendToAdminDesc'),
        variant: "destructive"
      });
      setIsSending(false);
      return;
    }

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
          variant: "destructive"
        });
        setIsSending(false);
        return;
      }
    } catch (error) {
      console.error('Error checking blocks:', error);
      // Continue with sending message if block check fails
    }

    const messageText = newMessage.trim();
    const tempId = `temp_${Date.now()}`;
    
    console.log('[ChatPage] 📤 Sending message:', { messageText, tempId, matchId: selectedMatch.id });
    
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

    console.log('[ChatPage] 💬 Optimistic message created:', optimisticMessage);

    // INSTANT OPTIMISTIC UPDATE: Update match list immediately even before server confirms
    updateMatchInBackground(selectedMatch.id, optimisticMessage);

    // Add to messages immediately
    setMessages(prev => {
      const updated = [...prev, optimisticMessage];
      // Update cache
      chatMessagesCache.set(selectedMatch.id, {
        messages: updated,
        timestamp: Date.now()
      });
      console.log('[ChatPage] ✅ Optimistic message added to state, total messages:', updated.length);
      return updated;
    });

    // Clear input immediately
    setNewMessage('');

    try {
      console.log('[ChatPage] 🔄 Inserting message to database...');
      // Send the message to server
      const { data, error } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: messageText
        })
        .select(`
          *,
          sender:profiles!chats_sender_id_fkey(first_name, last_name)
        `)
        .single();

      if (error) {
        console.error('[ChatPage] ❌ Supabase insert error:', error);
        throw error;
      }

      console.log('[ChatPage] ✅ Message inserted successfully, server data:', data);

      // Replace optimistic message with real one from server
      if (data) {
        // INSTANT UPDATE: Update match list immediately with new message
        console.log('[ChatPage] ⚡ Updating match list instantly...');
        updateMatchInBackground(selectedMatch.id, data);
        
        setMessages(prev => {
          const serverMsg: ChatMessage = { 
            ...data, 
            sent_at: data.created_at, 
            receiver_id: optimisticMessage.receiver_id 
          } as ChatMessage;

          const hasServer = prev.some(m => m.id === data.id);
          const hasTemp = prev.some(m => m.id === tempId);

          console.log('[ChatPage] 🔄 Replacing temp message:', { hasServer, hasTemp, serverId: data.id, tempId });

          // If temp exists, replace it with server message
          if (hasTemp) {
            console.log('[ChatPage] ♻️ Replacing temp message with server message');
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
            chatMessagesCache.set(selectedMatch.id, { messages: unique, timestamp: Date.now() });
            console.log('[ChatPage] ✅ Temp replaced, unique messages:', unique.length);
            return unique;
          }

          // If temp doesn't exist and server message not present, append server message
          if (!hasServer) {
            console.log('[ChatPage] ➕ Adding server message (temp not found)');
            const updated = [...prev, serverMsg];
            chatMessagesCache.set(selectedMatch.id, { messages: updated, timestamp: Date.now() });
            return updated;
          }

          // Server message already present and no temp to replace — keep as-is
          console.log('[ChatPage] ⚠️ Server message already exists, keeping current state');
          return prev;
        });
      }
    } catch (error) {
      // Remove optimistic message on error
      console.error('[ChatPage] ❌ Error sending message, removing optimistic message:', error);
      setMessages(prev => {
        const updated = prev.filter(msg => msg.id !== tempId);
        chatMessagesCache.set(selectedMatch.id, {
          messages: updated,
          timestamp: Date.now()
        });
        return updated;
      });
      
      console.error('Error sending message:', error);
      toast({
        title: t('chat.error'),
        description: t('chat.failedToSend'),
        variant: 'destructive'
      });
      setIsSending(false);
      return;
    }

    console.log('[ChatPage] 🔔 Starting notification and unread count updates...');
    // Send push notification and update unread count (non-blocking)
    // These operations should not block message sending or show errors to user
    (async () => {
      try {
        // Send push notification to the recipient
        const recipientId = selectedMatch.user1_id === currentUser.id 
          ? selectedMatch.user2_id 
          : selectedMatch.user1_id;
        const senderName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';

        console.log('[ChatPage] 📲 Sending push notification to:', recipientId, 'from:', senderName);

        // Use the proper notification service
        try {
          const result = await sendMessageNotification(senderName, messageText, recipientId, selectedMatch.id);
          console.log('[ChatPage] ✅ Push notification sent successfully:', result);
        } catch (notificationError) {
          console.error('[ChatPage] ❌ Message notification error:', notificationError);
        }

        // Try to update unread count (only if field exists)
        try {
          const isUser1 = selectedMatch.user1_id === currentUser.id;
          const unreadField = isUser1 ? 'user2_unread_count' : 'user1_unread_count';
          console.log('[ChatPage] 🔢 Updating unread count for field:', unreadField);
          
          // Get current unread count for the other user
          const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select(unreadField)
            .eq('id', selectedMatch.id)
            .single();
          
          let newCount = 1;
          if (!matchError && matchData && typeof matchData[unreadField] === 'number') {
            newCount = matchData[unreadField] + 1;
          }
          console.log('[ChatPage] 📊 Current unread:', matchData?.[unreadField], 'New count:', newCount);
          
          const updateData = { [unreadField]: newCount };
          await supabase
            .from('matches')
            .update(updateData)
            .eq('id', selectedMatch.id);
          
          console.log('[ChatPage] ✅ Unread count updated successfully');
        } catch (unreadError) {
          // Silently handle if unread fields don't exist
        }

        onUnreadChange?.();
        
        // IMPORTANT: Refresh matches immediately when first message is sent
        // This moves the match from "New Matches" to "Conversations" instantly
        chatMatchesCache.delete(currentUser.id);
        await fetchMatches();
      } catch (error) {
        // Log but don't show error to user - message was already sent successfully
        console.error('Post-send operations error:', error);
      }
    })();

    setIsSending(false);
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
      console.error('Error deleting message:', error);
    }
  };

  const deleteMessageForMe = async (messageId: string) => {
    if (!selectedMatch) return;

    try {
      console.log('[ChatPage] 🗑️ Delete for me requested', { messageId });
      
      // Fetch fresh data from database
      const { data: currentMsg, error: fetchError } = await supabase
        .from('chats')
        .select('*')
        .eq('id', messageId)
        .single();

      if (fetchError) {
        console.error('[ChatPage] ❌ Error fetching message:', fetchError);
        throw fetchError;
      }
      if (!currentMsg) {
        console.log('[ChatPage] ⚠️ Message not found');
        return;
      }

      console.log('[ChatPage] 📝 Current message:', { 
        id: currentMsg.id, 
        deleted_for: currentMsg.deleted_for 
      });

      // Get current deleted_for array or initialize empty
      const deletedFor = (currentMsg.deleted_for || []) as string[];
      
      // Add current user to deleted_for array if not already there
      if (!deletedFor.includes(currentUser.id)) {
        deletedFor.push(currentUser.id);
      }

      console.log('[ChatPage] 📋 Updated deleted_for array:', deletedFor);

      // Get the other user ID
      const otherUserId = selectedMatch.user1_id === currentUser.id 
        ? selectedMatch.user2_id 
        : selectedMatch.user1_id;

      // If both users have deleted, remove from database completely
      if (deletedFor.includes(otherUserId)) {
        console.log('[ChatPage] 🗑️ Both users deleted - removing from DB completely');
        const { error: deleteError } = await supabase
          .from('chats')
          .delete()
          .eq('id', messageId);

        if (deleteError) {
          console.error('[ChatPage] ❌ Delete error:', deleteError);
          throw deleteError;
        }
        console.log('[ChatPage] ✅ Message deleted from DB');
      } else {
        console.log('[ChatPage] 🔄 Updating deleted_for field');
        // Otherwise just update the deleted_for field
        const { error: updateError } = await supabase
          .from('chats')
          .update({ deleted_for: deletedFor })
          .eq('id', messageId);

        if (updateError) {
          console.error('[ChatPage] ❌ Update error:', updateError);
          throw updateError;
        }
        console.log('[ChatPage] ✅ Message updated with deleted_for');
      }

      // Clear cache to force fresh fetch next time
      chatMessagesCache.delete(selectedMatch.id);
      console.log('[ChatPage] 🔄 Cache cleared');

      // Remove from UI immediately
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      console.log('[ChatPage] ✅ Message removed from UI');
    } catch (error) {
      console.error('Error deleting message for me:', error);
    }
  };

  const deleteMessageForEveryone = async (messageId: string) => {
    if (!selectedMatch) return;

    try {
      console.log('[ChatPage] 🗑️ Delete for everyone requested', { messageId });
      
      // Get the message to check if user is the sender
      const message = messages.find(msg => msg.id === messageId);
      console.log('[ChatPage] 📝 Message found', { 
        found: !!message, 
        isSender: message?.sender_id === currentUser.id,
        messageId,
        senderId: message?.sender_id,
        currentUserId: currentUser.id
      });
      
      if (!message || message.sender_id !== currentUser.id) {
        console.log('[ChatPage] ❌ Cannot delete - not sender or message not found');
        return;
      }

      console.log('[ChatPage] 🔄 Deleting from database...');
      // Delete from database completely
      const { error: deleteError, data } = await supabase
        .from('chats')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', currentUser.id) // Double-check it's their message
        .select(); // Return deleted rows to confirm deletion

      if (deleteError) {
        console.error('[ChatPage] ❌ Delete error:', deleteError);
        throw deleteError;
      }

      console.log('[ChatPage] ✅ Message deleted from DB', { deletedCount: data?.length || 0, data });

      // Clear cache to force fresh fetch next time
      chatMessagesCache.delete(selectedMatch.id);

      // Remove from UI immediately
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      console.log('[ChatPage] ✅ Message removed from UI');
    } catch (error) {
      console.error('[ChatPage] ❌ Error deleting message for everyone:', error);
    }
  };

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
      console.error('Error recording dormancy response:', error);
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const handleSwipeMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;
    
    // If horizontal swipe is dominant and moving right
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 50) {
      // Trigger back navigation
      setIsSwiping(false);
      setSelectedMatch(null);
    }
  };

  const handleSwipeEnd = () => {
    setIsSwiping(false);
    setSwipeStartX(0);
    setSwipeStartY(0);
  };


  const filteredMatches = matches.filter(match => {
    const partnerName = `${match.partner?.first_name || ''} ${match.partner?.last_name || ''}`.toLowerCase();
    return match.last_message; // Only show conversations with messages
  });

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
      console.error('Error deleting chat:', error);
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
    const newMatchList = matches.filter(m => !m.last_message);
    const conversationList = matches.filter(m => m.last_message);
    
    return (
  <div className="fixed inset-0 flex flex-col bg-gray-50">
        {/* Header (safe area respected via env padding) */}
        <div 
          className="sticky top-0 z-30 bg-white text-gray-900 shadow-sm" 
          style={{ 
            paddingTop: Capacitor.getPlatform() === 'web' 
              ? '0px' 
              : Capacitor.getPlatform() === 'ios' 
                ? 'clamp(30px, calc(env(safe-area-inset-top, 30px) + 15px), 00px)' 
                : '5px' 
          }}
        >
          <div className="px-2 pb-1 pt-2">
            <h2 className="text-xl font-bold m-1 bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
              💧 DripChat
            </h2>
          </div>
        </div>
        
        {/* New Matches Section */}
        {newMatchList.length > 0 && (
          <div 
            className="px-4 py-3 border-b bg-white"
            style={{
              marginTop: Capacitor.getPlatform() === 'web'
                ? '8px'
                : Capacitor.getPlatform() === 'ios'
                  ? 'clamp(30px, calc(env(safe-area-inset-top, 30px) + 15px), 45px)'
                  : '0px'
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
    className="flex-1 overflow-y-auto pb-35"
    style={{ 
      WebkitOverflowScrolling: 'touch',
      paddingTop: newMatchList.length > 0 
        ? '0px'
        : Capacitor.getPlatform() === 'ios'
          ? 'calc(0px + env(safe-area-inset-top))'
          : '50px'
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
          {conversationList.length === 0 && newMatchList.length === 0 ? (
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
          ) : conversationList.length === 0 ? (
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
            conversationList.map((match, index) => {
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
                    marginTop: index === 0 && newMatchList.length === 0 && Capacitor.getPlatform() === 'ios' 
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
            })
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

  const handleBackClick = () => {
    console.log('[ChatPage] 🔙 Back button clicked - refreshing match list');
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
        className="flex-1 overflow-y-auto px-4 space-y-2 bg-gray-50 pb-1"
        style={{ 
          WebkitOverflowScrolling: 'touch', 
          paddingTop: Capacitor.getPlatform() === 'ios' 
            ? 'clamp(160px, calc(env(safe-area-inset-top, 10px) + 140px), 180px)'
            : Capacitor.getPlatform() === 'web'
              ? '120px'
              : '120px'
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
            {messages.map((message, index) => {
              const prevMessage = messages[index - 1];
              const isConsecutive = prevMessage &&
                prevMessage.sender_id === message.sender_id &&
                new Date(message.created_at || message.sent_at || '').getTime() -
                new Date(prevMessage.created_at || prevMessage.sent_at || '').getTime() < 300000;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  currentUser={currentUser}
                  isConsecutive={isConsecutive}
                  onDeleteForMe={deleteMessageForMe}
                  onDeleteForEveryone={deleteMessageForEveryone}
                  onDormancyResponse={handleDormancyResponse}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input (fixed, non-scrolling). MessageInput now owns its container so it can control safe-area and stacking */}
      <div className="shrink-0 z-20">
        <MessageInput
          newMessage={newMessage}
          onMessageChange={setNewMessage}
          onSendMessage={sendMessage}
          disabled={isSending}
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
    </div>
  );
};

export default ChatPage;

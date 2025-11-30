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
import RatingDialog from './RatingDialog';
import { CurrentUser, ChatMatch, ChatMessage } from '@/types';
import { useTranslation } from 'react-i18next';
import { getRatingData } from '@/utils/ratingStorage';

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
const MESSAGE_CACHE_DURATION = 15000; // 15 seconds - faster message updates

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
  
  // Rating dialog state
  const [messagesSentCount, setMessagesSentCount] = useState(0);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  
  // Reply state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

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
          const newMsg = payload.new as ChatMessage;
          
          // INSTANT UPDATE: Update specific match in the list immediately
          if (newMsg.match_id) {
            setMatches(prev => {
              const updated = prev.map(match => {
                if (match.id === newMsg.match_id) {
                  return {
                    ...match,
                    last_message: newMsg.message,
                    last_message_time: newMsg.created_at,
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
              
              // Update cache with new data
              chatMatchesCache.set(currentUser.id, {
                matches: sorted,
                timestamp: Date.now()
              });
              
              return sorted;
            });
          }
          
          // Also trigger unread count update
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
    
    const interval = setInterval(() => {
      // Only refresh if cache is stale
      const cached = chatMatchesCache.get(currentUser.id);
      if (!cached || Date.now() - cached.timestamp > CACHE_DURATION) {
        fetchMatches();
      }
    }, 2000); // Ultra-fast refresh every 2 seconds for instant updates

    return () => {
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
                
                const updated = [...withoutTemp, newMsg];
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
            }
            
            // Update message even if deleted - it will show as "deleted"
            setMessages((prev) => 
              prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)
            );
            
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
            const deletedMsg = payload.old as { id: string };
            
            // Remove the message from state
            setMessages((prev) => {
              const updated = prev.filter(m => m.id !== deletedMsg.id);
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
        }
      } catch (error) {
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
        if (msg.deleted_for && msg.deleted_for.length > 0) {
        }
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
      
      
      // Update cache with all messages
      chatMessagesCache.set(selectedMatch.id, {
        messages: processedMessages,
        timestamp: Date.now()
      });

      setMessages(visibleMessages);
    } catch (error) {
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
      
      // Don't filter out deleted messages - mark them instead
      const visibleMessages = processedMessages;
      
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
      // Continue with sending message if block check fails
    }

    const messageText = newMessage.trim();
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
      const updated = [...prev, optimisticMessage];
      // Update cache
      chatMessagesCache.set(selectedMatch.id, {
        messages: updated,
        timestamp: Date.now()
      });
      return updated;
    });

    // Clear input immediately
    setNewMessage('');

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
      // Send the message to server
      const { data, error } = await supabase
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
        .single();
      
      // Clear reply state after sending
      setReplyingTo(null);

      if (error) {
        throw error;
      }


      // Replace optimistic message with real one from server
      if (data) {
        // INSTANT UPDATE: Update match list immediately with new message
        updateMatchInBackground(selectedMatch.id, data);
        
        setMessages(prev => {
          const serverMsg: ChatMessage = { 
            ...data, 
            sent_at: data.created_at, 
            receiver_id: optimisticMessage.receiver_id 
          } as ChatMessage;

          const hasServer = prev.some(m => m.id === data.id);
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
            chatMessagesCache.set(selectedMatch.id, { messages: unique, timestamp: Date.now() });
            return unique;
          }

          // If temp doesn't exist and server message not present, append server message
          if (!hasServer) {
            const updated = [...prev, serverMsg];
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
        const updated = prev.filter(msg => msg.id !== tempId);
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
      setIsSending(false);
      return;
    }

    // Send push notification and update unread count (non-blocking)
    // These operations should not block message sending or show errors to user
    (async () => {
      try {
        // Send push notification to the recipient
        const recipientId = selectedMatch.user1_id === currentUser.id 
          ? selectedMatch.user2_id 
          : selectedMatch.user1_id;
        const senderName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';


        // Use the proper notification service
        try {
          const result = await sendMessageNotification(senderName, messageText, recipientId, selectedMatch.id);
        } catch (notificationError) {
        }

        // Try to update unread count (only if field exists)
        try {
          const isUser1 = selectedMatch.user1_id === currentUser.id;
          const unreadField = isUser1 ? 'user2_unread_count' : 'user1_unread_count';
          
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
          
          const updateData = { [unreadField]: newCount };
          await supabase
            .from('matches')
            .update(updateData)
            .eq('id', selectedMatch.id);
          
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
          const updatedMessages = cachedData.messages.map(m =>
            m.id === messageId ? { ...m, deleted_for: deletedFor } : m
          );
          chatMessagesCache.set(selectedMatch.id, {
            messages: updatedMessages,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {}
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
    } catch (error) {}
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
          className="sticky top-0 z-30 bg-white text-gray-900 shadow-sm border-b border-gray-100" 
          style={{ 
            paddingTop: Capacitor.getPlatform() === 'web' 
              ? '64px' 
              : Capacitor.getPlatform() === 'ios' 
                ? '44px' 
                : '64px' 
          }}
        >
          <div 
            className="px-4"
            style={{
              paddingTop: Capacitor.getPlatform() === 'ios' ? '4px' : '12px',
              paddingBottom: Capacitor.getPlatform() === 'ios' ? '6px' : '12px'
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
              marginTop: Capacitor.getPlatform() === 'ios' ? '54px' : '0px'
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
      paddingTop: Capacitor.getPlatform() === 'android' ? '0px' : (newMatchList.length > 0 ? '0px' : '54px')
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

              // Find the replied-to message if this message is a reply
              const repliedMessage = message.reply_to 
                ? messages.find(m => m.id === message.reply_to)
                : null;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  currentUser={currentUser}
                  isConsecutive={isConsecutive}
                  onDeleteForMe={deleteMessageForMe}
                  onDeleteForEveryone={deleteMessageForEveryone}
                  onDormancyResponse={handleDormancyResponse}
                  onReply={setReplyingTo}
                  repliedMessage={repliedMessage}
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
        forceShow={showRatingDialog}
        onRatingComplete={() => setShowRatingDialog(false)}
      />
    </div>
  );
};

export default ChatPage;

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { requestNotificationPermission } from '@/services/pushNotifications';
import { Capacitor } from '@capacitor/core';
// SafeAreaView removed — use plain divs with env(...) padding where necessary
import UserProfileModal from './UserProfileModal';
import BlockDialog from './BlockDialog';
import ReportDialog from '@/components/ReportDialog';
import ChatUserList from './chat/ChatUserList';
import MessageBubble from './chat/MessageBubble';
import MessageInput from './chat/MessageInput';
import ChatHeader from './chat/ChatHeader';
import ChatUserAvatar from './ChatUserAvatar';
import { CurrentUser, ChatMatch, ChatMessage } from '@/types';

interface ChatPageProps {
  currentUser: CurrentUser;
  onUnreadChange?: () => void;
  onDetailViewChange?: (inDetail: boolean) => void;
}

// Global cache for chat matches - persists across component mounts
const chatMatchesCache = new Map<string, { matches: ChatMatch[], timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

// Global cache for individual chat messages
const chatMessagesCache = new Map<string, { messages: ChatMessage[], timestamp: number }>();
const MESSAGE_CACHE_DURATION = 60000; // 1 minute

// Make caches globally accessible for preloading
if (typeof window !== 'undefined') {
  (window as any).chatMatchesCache = chatMatchesCache;
  (window as any).chatMessagesCache = chatMessagesCache;
}

const ChatPage = ({ currentUser, onUnreadChange, onDetailViewChange }: ChatPageProps) => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Keep matchesRef in sync
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  // Real-time subscription for matches table
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    
    console.log('[ChatPage] 🔔 Setting up matches realtime subscription');
    
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
            console.log('[ChatPage] 📨 Realtime match change:', payload.eventType, payload.new);
            // Mark that matches have changed. We'll refresh the UI only when appropriate.
            matchesNeedsRefreshRef.current = true;
            // Still update cache in background so data is fresh when the user returns
            fetchMatchesInBackground();
            // Update unread count badge in tab bar
            onUnreadChange?.();
          }
      )
      .subscribe((status) => {
        console.log('[ChatPage] 🔌 Matches subscription status:', status);
      });

    return () => {
      console.log('[ChatPage] 🔌 Cleaning up matches subscription');
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    if (selectedMatch) {
      fetchMessages();
      markMessagesAsRead();
      onDetailViewChange?.(true);
    }
    else {
      onDetailViewChange?.(false);
      // Only refresh the matches list when there were changes while inside the conversation.
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
      console.log('[ChatPage] 🔔 Setting up chats realtime subscription for match:', selectedMatch.id);
      
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
            console.log('[ChatPage] 📨 Realtime new message:', payload.new);
            const newMsg = payload.new as ChatMessage;
            
            // Ensure sent_at is set for proper date display
            if (!newMsg.sent_at && newMsg.created_at) {
              newMsg.sent_at = newMsg.created_at;
            }
            
            // Check if message is deleted for current user
            if (newMsg.deleted_for && newMsg.deleted_for.includes(currentUser.id)) {
              console.log('[ChatPage] ⚠️ New message is deleted for current user, skipping');
              return;
            }
            
            // Update messages state
              setMessages((prev) => {
                // Dedupe: if message id already exists, ignore (prevents duplicates from optimistic + realtime)
                if (prev.some(m => m.id === newMsg.id)) {
                  console.log('[ChatPage] ⚠️ Duplicate message detected, skipping');
                  return prev;
                }
                console.log('[ChatPage] ✅ Adding new message to state');
                const updated = [...prev, newMsg];
                // Update cache with new message
                chatMessagesCache.set(selectedMatch.id, {
                  messages: updated,
                  timestamp: Date.now()
                });
                return updated;
              });
            
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
            console.log('[ChatPage] 📝 Realtime message update:', payload.new);
            const updatedMsg = payload.new as ChatMessage;
            
            // Check if message was deleted for current user
            if (updatedMsg.deleted_for && updatedMsg.deleted_for.includes(currentUser.id)) {
              console.log('[ChatPage] 🗑️ Message deleted for current user, removing from UI');
              setMessages((prev) => {
                const updated = prev.filter(m => m.id !== updatedMsg.id);
                // Update cache
                chatMessagesCache.set(selectedMatch.id, {
                  messages: updated,
                  timestamp: Date.now()
                });
                return updated;
              });
              return;
            }
            
            // Update the specific message in state
            setMessages((prev) => {
              const updated = prev.map(m => 
                m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m
              );
              // Update cache
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
            console.log('[ChatPage] 🗑️ Realtime message delete:', payload.old);
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
        .subscribe((status) => {
          console.log('[ChatPage] 🔌 Chats subscription status:', status);
        });

      return () => {
        console.log('[ChatPage] 🔌 Cleaning up chats subscription for match:', selectedMatch.id);
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

  const fetchMessages = async () => {
    if (!selectedMatch) return;

    // Check cache first
    const cached = chatMessagesCache.get(selectedMatch.id);
    if (cached && Date.now() - cached.timestamp < MESSAGE_CACHE_DURATION) {
      // Filter out messages deleted for current user
      const visibleMessages = cached.messages.filter(msg => 
        !msg.deleted_for || !msg.deleted_for.includes(currentUser.id)
      );
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

      if (error) throw error;

      const mappedMessages = data?.map(msg => ({
        ...msg,
        sent_at: msg.created_at,
        receiver_id: msg.sender_id === currentUser.id 
          ? (selectedMatch.user1_id === currentUser.id ? selectedMatch.user2_id : selectedMatch.user1_id)
          : currentUser.id
      })) || [];

      const processedMessages = mappedMessages as unknown as ChatMessage[];
      
      // Filter out messages deleted for current user
      const visibleMessages = processedMessages.filter(msg => 
        !msg.deleted_for || !msg.deleted_for.includes(currentUser.id)
      );
      
      // Update cache with all messages
      chatMessagesCache.set(selectedMatch.id, {
        messages: processedMessages,
        timestamp: Date.now()
      });

      setMessages(visibleMessages);
    } catch (error) {
      // ...removed log...
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
        title: "Cannot send message",
        description: "You cannot send messages to admin accounts.",
        variant: "destructive"
      });
      return;
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

    try {
      // Send the message to server
      const { data, error } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: messageText
        })
        .select()
        .single();

      if (error) throw error;

      // Replace optimistic message with real one
      if (data) {
        setMessages(prev => {
          const serverMsg: ChatMessage = { ...data, sent_at: data.created_at, receiver_id: optimisticMessage.receiver_id } as ChatMessage;

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
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive'
      });
      return;
    }

    try {

      // Send push notification to the recipient
      const recipientId = selectedMatch.user1_id === currentUser.id 
        ? selectedMatch.user2_id 
        : selectedMatch.user1_id;
      const senderName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';

      // Use the proper notification service
      try {
        console.log('💬 Sending message notification to:', recipientId, 'from:', senderName);
        const result = await sendMessageNotification(senderName, messageText, recipientId, selectedMatch.id);
        console.log('💬 Message notification result:', result);
      } catch (notificationError) {
        console.error('💬 Message notification error:', notificationError);
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
    } catch (error) {
  // ...removed log...
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive'
      });
    }
    finally {
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
      console.error('Error deleting message:', error);
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

      if (fetchError) throw fetchError;
      if (!currentMsg) return;

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

        if (deleteError) throw deleteError;
      } else {
        // Otherwise just update the deleted_for field
        const { error: updateError } = await supabase
          .from('chats')
          .update({ deleted_for: deletedFor })
          .eq('id', messageId);

        if (updateError) throw updateError;
      }

      // Clear cache to force fresh fetch next time
      chatMessagesCache.delete(selectedMatch.id);

      // Remove from UI immediately
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (error) {
      console.error('Error deleting message for me:', error);
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

      if (deleteError) throw deleteError;

      // Clear cache to force fresh fetch next time
      chatMessagesCache.delete(selectedMatch.id);

      // Remove from UI immediately
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (error) {
      console.error('Error deleting message for everyone:', error);
    }
  };

  const testNotification = async () => {
    try {
      // First check if browser supports notifications
      if (!('Notification' in window)) {
        toast({
          title: 'Not Supported',
          description: 'This browser does not support notifications.',
          variant: 'destructive'
        });
        return;
      }

      // Check current permission
      if (Notification.permission === 'denied') {
        toast({
          title: 'Permission Denied',
          description: 'Notifications are blocked. Please enable them in your browser settings.',
          variant: 'destructive'
        });
        return;
      }

      // Request permission if not granted
      if (Notification.permission === 'default') {
        const granted = await requestNotificationPermission();
        if (!granted) {
          toast({
            title: 'Permission Required',
            description: 'Please allow notifications to receive message alerts.',
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
          title: 'Test Successful! 🎉',
          description: 'You should see a notification. Message alerts are now enabled.',
        });
      }
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: 'Something went wrong testing notifications.',
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
                ? 'clamp(30px, calc(env(safe-area-inset-top, 10px) + 15px), 40px)' 
                : '40px' 
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
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">New Matches</h3>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {newMatchList.map((match) => {
                const partnerId = match.partner?.id || 
                                 (match.user1_id === currentUser.id ? match.user2_id : match.user1_id);
                
                return (
                  <div
                    key={match.id}
                    className="flex flex-col items-center min-w-[70px] cursor-pointer"
                    onClick={() => setSelectedMatch(match)}
                  >
                    <div className="relative mb-2">
                      <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                        <div className="w-full h-full rounded-full overflow-hidden bg-white">
                          <ChatUserAvatar
                            userId={partnerId}
                            firstName={match.first_name}
                            lastName={match.last_name}
                            size="custom"
                            className="w-full h-full"
                            onClick={() => handleUserProfileClick(partnerId)}
                          />
                        </div>
                      </div>
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
      marginTop: '0px'
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
          {pullDistance > 50 ? (isRefreshing ? '🔄 Refreshing...' : '↓ Release to refresh') : '↓ Pull to refresh'}
        </div>
      </div>
    )}
          {conversationList.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No conversations yet
            </div>
          ) : (
            conversationList.map((match) => {
              // Determine the correct partner ID for avatar
              const partnerId = match.partner?.id || 
                               (match.user1_id === currentUser.id ? match.user2_id : match.user1_id);
              
              return (
                <div
                  key={match.id}
                  className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors ${
                    selectedMatch?.id === match.id ? 'bg-pink-50 border-pink-200' : 'bg-white'
                  } ${match.unread_messages > 0 ? 'font-bold bg-purple-50' : ''}`}
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

  return (
  <div className="fixed inset-0 flex flex-col bg-gray-50">
      {/* Chat Header (below global header) */}
  <div className="shrink-0 bg-white border-b border-gray-200 shadow-sm z-20 m-0 p-0">
        <ChatHeader
          selectedMatch={selectedMatch}
          onBack={() => setSelectedMatch(null)}
          onUserProfileOpen={handleUserProfileClick}
          onBlockUser={handleBlockClick}
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
            ? 'clamp(130px, calc(env(safe-area-inset-top, 10px) + 100px), 140px)'
            : '80px'
        }}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
      >
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
            />
          );
        })}
        <div ref={messagesEndRef} />
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
    </div>
  );
};

export default ChatPage;


import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useChatNotifications = (userId: string | null) => {
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!userId) {
      setUnreadChatCount(0);
      return;
    }

    fetchUnreadCount();
    
    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    // Subscribe to chat updates
    const channel = supabase
      .channel(`chat-notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chats'
      }, () => {
        fetchUnreadCount();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches'
      }, () => {
        fetchUnreadCount();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  const fetchUnreadCount = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('matches')
        .select('user1_unread_count, user2_unread_count, user1_id, user2_id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

      if (error) throw error;

      const totalUnread = data?.reduce((total, match) => {
        const isUser1 = match.user1_id === userId;
        const unreadCount = isUser1 ? match.user1_unread_count : match.user2_unread_count;
        return total + (unreadCount || 0);
      }, 0) || 0;

      setUnreadChatCount(totalUnread);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  return { unreadChatCount, refetchUnreadCount: fetchUnreadCount };
};

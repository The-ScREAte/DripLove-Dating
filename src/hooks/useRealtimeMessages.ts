
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseRealtimeMessagesProps {
  onNewMessage?: () => void;
  onUnreadCountChange?: () => void;
}

export const useRealtimeMessages = ({ onNewMessage, onUnreadCountChange }: UseRealtimeMessagesProps) => {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Clean up existing channel if it exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create new channel
    channelRef.current = supabase
      .channel('global-messages-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chats',
      }, () => {
        onNewMessage?.();
        onUnreadCountChange?.();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chats',
      }, () => {
        onUnreadCountChange?.();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
      }, () => {
        onUnreadCountChange?.();
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [onNewMessage, onUnreadCountChange]);
};

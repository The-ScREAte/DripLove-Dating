
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseRealtimeMessagesProps {
  onNewMessage?: () => void;
  onUnreadCountChange?: () => void;
}

export const useRealtimeMessages = ({ onNewMessage, onUnreadCountChange }: UseRealtimeMessagesProps) => {
  useEffect(() => {
    const messageChannel = supabase
      .channel('messages-updates')
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
      .subscribe();

    const matchChannel = supabase
      .channel('matches-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
      }, () => {
        onUnreadCountChange?.();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(matchChannel);
    };
  }, [onNewMessage, onUnreadCountChange]);
};

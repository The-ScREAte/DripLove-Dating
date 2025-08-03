import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import UserProfileModal from './UserProfileModal';
import BlockDialog from './BlockDialog';
import ChatUserList from './chat/ChatUserList';
import MessageBubble from './chat/MessageBubble';
import MessageInput from './chat/MessageInput';
import ChatHeader from './chat/ChatHeader';
import { CurrentUser, ChatMatch, ChatMessage } from '@/types';

interface ChatPageProps {
  currentUser: CurrentUser;
  onUnreadChange?: () => void;
}

const ChatPage = ({ currentUser, onUnreadChange }: ChatPageProps) => {
  const [matches, setMatches] = useState<ChatMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<ChatMatch | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [userToBlock, setUserToBlock] = useState<ChatMatch | null>(null);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMatches();
  }, [currentUser]);

  useEffect(() => {
    if (selectedMatch) {
      fetchMessages();
      markMessagesAsRead();
    }
  }, [selectedMatch]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Listen for changes to any chats to update unread indicators in real-time
    const chatChannel = supabase
      .channel('chat-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chats',
      }, () => {
        console.log('🔄 Chat update detected, refreshing matches...');
        fetchMatches();
        onUnreadChange?.();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [currentUser.id, onUnreadChange]);

  useEffect(() => {
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
            const newMsg = payload.new as any;
            setMessages((prev) => [...prev, newMsg]);
            
            if (newMsg.sender_id !== currentUser.id) {
              markMessagesAsRead();
            }

            onUnreadChange?.();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedMatch, currentUser.id, onUnreadChange]);

  const fetchMatches = async () => {
    try {
      const { data: matches, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin),
          chats!chats_match_id_fkey(id, message, created_at, sender_id, is_read)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('📨 Raw matches data:', matches);

      const matchesWithPartner = matches?.map(match => {
        const partner = match.user1_id === currentUser.id ? match.user2 : match.user1;
        const sortedChats = match.chats?.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ) || [];
        const lastMessage = sortedChats[sortedChats.length - 1];
        
        // Count unread messages for current user (messages sent by others that are unread)
        const unreadCount = sortedChats.filter(msg => {
          const isFromOther = msg.sender_id !== currentUser.id;
          const isUnread = !msg.is_read;
          return isFromOther && isUnread;
        }).length || 0;

        console.log(`💬 Match ${match.id}: ${partner?.first_name} has ${unreadCount} unread messages`);

        return {
          ...match,
          partner,
          last_message: lastMessage?.message || '',
          last_message_obj: lastMessage,
          unread_messages: unreadCount, // Use unread_messages for consistency
          // For compatibility with ChatMatch interface
          id: match.id,
          first_name: partner?.first_name || '',
          last_name: partner?.last_name || '',
          last_message_time: lastMessage?.created_at
        };
      }) || [];

      console.log('📋 Final matches with unread counts:', matchesWithPartner.map(m => ({ 
        name: `${m.first_name} ${m.last_name}`, 
        unread: m.unread_messages 
      })));

      setMatches(matchesWithPartner as ChatMatch[]);
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversations.',
        variant: 'destructive'
      });
    }
  };

  const fetchMessages = async () => {
    if (!selectedMatch) return;

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

      // Map to match ChatMessage interface
      const mappedMessages = data?.map(msg => ({
        ...msg,
        sent_at: msg.created_at,
        receiver_id: msg.sender_id === currentUser.id 
          ? (selectedMatch.user1_id === currentUser.id ? selectedMatch.user2_id : selectedMatch.user1_id)
          : currentUser.id
      })) || [];

      setMessages(mappedMessages as ChatMessage[]);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedMatch) return;

    try {
      // Mark chat messages as read
      await supabase
        .from('chats')
        .update({ is_read: true })
        .eq('match_id', selectedMatch.id)
        .neq('sender_id', currentUser.id);

      // Mark notifications as read for messages from this match
      const partnerId = selectedMatch.user1_id === currentUser.id 
        ? selectedMatch.user2_id 
        : selectedMatch.user1_id;

      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUser.id)
        .eq('related_user_id', partnerId)
        .eq('type', 'message')
        .eq('is_read', false);

      // Update unread count in matches table
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const unreadField = isUser1 ? 'user1_unread_count' : 'user2_unread_count';

      await supabase
        .from('matches')
        .update({ [unreadField]: 0 })
        .eq('id', selectedMatch.id);

      onUnreadChange?.();
      
      // Refresh matches to update unread indicators
      fetchMatches();
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedMatch) return;

    // Check if trying to message an admin
    if (selectedMatch.partner?.is_admin) {
      toast({
        title: "Cannot send message",
        description: "You cannot send messages to admin accounts.",
        variant: "destructive"
      });
      return;
    }

    try {
      const recipientId = selectedMatch.user1_id === currentUser.id 
        ? selectedMatch.user2_id 
        : selectedMatch.user1_id;

      // Send the message
      const { data: messageData, error: messageError } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: newMessage.trim(),
          is_read: false
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Update unread count in matches table
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const unreadField = isUser1 ? 'user2_unread_count' : 'user1_unread_count';

      await supabase.rpc('increment_unread_count', { 
        match_id_input: selectedMatch.id, 
        field_name: unreadField 
      });

      // Create notification for recipient (handled by database trigger)
      // But we can also manually ensure notification is created
      const senderName = `${currentUser.first_name} ${currentUser.last_name}`.trim();
      
      await supabase
        .from('notifications')
        .insert({
          user_id: recipientId,
          title: 'New Message',
          message: `${senderName} sent you a message`,
          type: 'message',
          related_user_id: currentUser.id,
          is_read: false
        });

      // Send push notification via edge function
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            title: `💬 ${senderName}`,
            body: newMessage.trim(),
            userId: recipientId,
            type: 'message',
            data: { 
              chatId: selectedMatch.id,
              senderId: currentUser.id
            }
          }
        });
      } catch (pushError) {
        console.warn('Push notification failed:', pushError);
        // Don't block message sending if push notification fails
      }

      setNewMessage('');
      onUnreadChange?.();
      fetchMatches(); // Refresh to update unread counts
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUserProfileClick = (userId?: string) => {
    if (userId) {
      setSelectedUserId(userId);
      setIsUserProfileOpen(true);
    }
  };

  const filteredMatches = matches.filter(match => {
    const partnerName = `${match.partner?.first_name || ''} ${match.partner?.last_name || ''}`.toLowerCase();
    return partnerName.includes(searchTerm.toLowerCase());
  });

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

  // Show chat list view
  if (!selectedMatch) {
    return (
      <div className="flex flex-col h-screen max-h-screen overflow-hidden">
        <ChatUserList
          matches={filteredMatches}
          selectedMatch={selectedMatch}
          searchTerm={searchTerm}
          onMatchSelect={setSelectedMatch}
          onUserProfileOpen={handleUserProfileClick}
          onSearchChange={setSearchTerm}
          currentUserId={currentUser.id}
        />

        {/* User Profile Modal */}
        <UserProfileModal
          isOpen={isUserProfileOpen}
          onClose={() => setIsUserProfileOpen(false)}
          userId={selectedUserId}
        />

        {/* Block Dialog */}
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
    <div className="flex h-screen max-h-screen overflow-hidden"
         style={{ 
           touchAction: 'pan-x pan-y',
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none'
         }}>
      <div className="flex-1 flex flex-col">
        <ChatHeader
          selectedMatch={selectedMatch}
          onBack={() => setSelectedMatch(null)}
          onUserProfileOpen={handleUserProfileClick}
          onBlockUser={handleBlockClick}
          isMobile={true}
        />

        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-2"
        >
          {messages.map((message, index) => {
            const prevMessage = messages[index - 1];
            const isConsecutive = prevMessage && 
              prevMessage.sender_id === message.sender_id &&
              new Date(message.created_at || message.sent_at || '').getTime() - 
              new Date(prevMessage.created_at || prevMessage.sent_at || '').getTime() < 300000; // 5 minutes

            return (
              <MessageBubble
                key={message.id}
                message={message}
                currentUser={currentUser}
                isConsecutive={isConsecutive}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <MessageInput
          newMessage={newMessage}
          onMessageChange={setNewMessage}
          onSendMessage={sendMessage}
        />
      </div>

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        userId={selectedUserId}
      />

      {/* Block Dialog */}
      <BlockDialog
        isOpen={isBlockDialogOpen}
        onClose={() => setIsBlockDialogOpen(false)}
        userToBlock={userToBlock}
        currentUserId={currentUser?.id}
        onBlockSuccess={handleBlockSuccess}
      />
    </div>
  );
};

export default ChatPage;

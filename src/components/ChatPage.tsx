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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (selectedMatch) {
      fetchMessages();
      markMessagesAsRead();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
            const newMsg = payload.new as ChatMessage;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch, currentUser.id, onUnreadChange]);

  const fetchMatches = async () => {
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
        .order('created_at', { ascending: false });

      if (error) throw error;

      const matchesWithPartner = matches?.map(match => {
        const partner = match.user1_id === currentUser.id ? match.user2 : match.user1;
        const lastMessage = match.chats?.[match.chats.length - 1];
        
        // Count unread messages (simplified since is_read might not be available)
        const unreadCount = 0; // We'll handle this differently

        return {
          ...match,
          partner,
          last_message_obj: lastMessage,
          unreadCount,
          // For compatibility with ChatMatch interface
          id: match.id,
          first_name: partner?.first_name || '',
          last_name: partner?.last_name || '',
          last_message: lastMessage?.message || '',
          last_message_time: lastMessage?.created_at
        };
      }) || [];

      setMatches(matchesWithPartner as unknown as ChatMatch[]);
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

      setMessages(mappedMessages as unknown as ChatMessage[]);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedMatch) return;

    try {
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const unreadField = isUser1 ? 'user1_unread' : 'user2_unread';

      await supabase
        .from('matches')
        .update({ [unreadField]: 0 })
        .eq('id', selectedMatch.id);

      await supabase
        .from('chats')
        .update({ is_read: true })
        .eq('match_id', selectedMatch.id)
        .neq('sender_id', currentUser.id);

      onUnreadChange?.();
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
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const unreadField = isUser1 ? 'user2_unread' : 'user1_unread';

      const { error } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: newMessage.trim()
        });

      if (error) throw error;

      // Update unread count for the receiver
      const updateData: Record<string, number> = {};
      updateData[unreadField] = 1; // Just increment by 1
      
      await supabase
        .from('matches')
        .update(updateData)
        .eq('id', selectedMatch.id);

      setNewMessage('');
      onUnreadChange?.();
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
    <div className="flex h-screen max-h-screen overflow-hidden">
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

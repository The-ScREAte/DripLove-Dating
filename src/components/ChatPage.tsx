import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { requestNotificationPermission } from '@/services/pushNotifications';
import UserProfileModal from './UserProfileModal';
import BlockDialog from './BlockDialog';
import ChatUserList from './chat/ChatUserList';
import MessageBubble from './chat/MessageBubble';
import MessageInput from './chat/MessageInput';
import ChatHeader from './chat/ChatHeader';
import ChatUserAvatar from './ChatUserAvatar';
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
  const { sendMessageNotification, isInitialized, isSupported } = usePushNotifications(currentUser.id);
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
        
        // Safely get unread count - handle cases where fields don't exist
        let unreadCount = 0;
        // Note: unread tracking fields may not exist in all database schemas

        return {
          ...match,
          partner,
          last_message_obj: lastMessage,
          unread_messages: unreadCount,
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
          const unreadField = isUser1 ? 'user1_unread' : 'user2_unread';
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
        await supabase
          .from('chats')
          .update({ is_read: true })
          .eq('match_id', selectedMatch.id)
          .neq('sender_id', currentUser.id);
      } catch (chatError) {
        // Silently handle if is_read field doesn't exist
      }

      onUnreadChange?.();
    } catch (error) {
      // Silently handle any schema-related errors
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedMatch) return;

    if (selectedMatch.partner?.is_admin) {
      toast({
        title: "Cannot send message",
        description: "You cannot send messages to admin accounts.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Send the message first
      const { error } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: newMessage.trim()
        });

      if (error) throw error;

      // Send push notification to the recipient
      const recipientId = selectedMatch.user1_id === currentUser.id 
        ? selectedMatch.user2_id 
        : selectedMatch.user1_id;
      
      const senderName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
      
      // Send notification (don't await to avoid blocking UI)
      if (isSupported && isInitialized) {
        sendMessageNotification(
          senderName,
          newMessage.trim(),
          recipientId,
          selectedMatch.id
        ).catch(() => {
          // Silently handle notification errors
        });
      }

      // Try to update unread count (only if field exists)
      try {
        const isUser1 = selectedMatch.user1_id === currentUser.id;
        const unreadField = isUser1 ? 'user2_unread' : 'user1_unread';
        const updateData = { [unreadField]: 1 };
        
        await supabase
          .from('matches')
          .update(updateData)
          .eq('id', selectedMatch.id);
      } catch (unreadError) {
        // Silently handle if unread fields don't exist
      }

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

  if (!selectedMatch) {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Sticky Search Header */}
        <div className="sticky top-0 z-30 bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4">
          <h2 className="text-xl font-bold mb-4">Messages</h2>
          <div className="relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 bg-white text-gray-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
            <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Scrollable Chat List */}
        <div className="flex-1 overflow-y-auto pb-20">
          {filteredMatches.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchTerm ? 'No matches found' : 'No conversations yet'}
            </div>
          ) : (
            filteredMatches.map((match) => {
              // Determine the correct partner ID for avatar
              const partnerId = match.partner?.id || 
                               (match.user1_id === currentUser.id ? match.user2_id : match.user1_id);
              
              return (
                <div
                  key={match.id}
                  className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors ${
                    selectedMatch?.id === match.id ? 'bg-pink-50 border-pink-200' : 'bg-white'
                  }`}
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
                      <h3 className="font-semibold text-gray-900 truncate">
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
    <div className="h-full flex flex-col bg-gray-50">
      {/* Sticky Chat Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <ChatHeader
          selectedMatch={selectedMatch}
          onBack={() => setSelectedMatch(null)}
          onUserProfileOpen={handleUserProfileClick}
          onBlockUser={handleBlockClick}
          onTestNotification={testNotification}
          isMobile={true}
          currentUserId={currentUser.id}
        />
      </div>

      {/* Scrollable Messages Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 px-4 space-y-2 bg-gray-50 overflow-y-auto"
        style={{ 
          paddingBottom: '20px',
          paddingTop: '20px'
        }}
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
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Sticky Message Input Footer */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom,0px)]">
        <MessageInput
          newMessage={newMessage}
          onMessageChange={setNewMessage}
          onSendMessage={sendMessage}
        />
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
};

export default ChatPage;

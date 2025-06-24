import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile, Send, Search, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import EmojiPicker from './EmojiPicker';
import ChatUserAvatar from './ChatUserAvatar';
import UserProfileModal from './UserProfileModal';

interface ChatPageProps {
  currentUser: any;
  onUnreadChange?: () => void;
}

const ChatPage = ({ currentUser, onUnreadChange }: ChatPageProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMatches = async () => {
    if (!currentUser?.id) return;
  
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name, is_admin),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name, is_admin),
          chats(id, message, created_at, sender_id)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
  
      if (error) throw error;
  
      const matchesWithPartner = (data || [])
        .map(match => {
          const isUser1 = match.user1_id === currentUser.id;
          const partner = isUser1 ? match.user2 : match.user1;
  
          // Get most recent chat if any
          const sortedChats = match.chats?.length
            ? [...match.chats].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            : [];
  
          const lastMessage = sortedChats[0] || null;
          const unreadCount = isUser1 ? match.user1_unread_count : match.user2_unread_count;
  
          return {
            ...match,
            partner,
            unreadCount,
            last_message: lastMessage,
          };
        })
        .filter(match => match.partner && !match.partner.is_admin)
        .sort((a, b) => {
          const aTime = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
          const bTime = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
          return bTime - aTime;
        });
  
      setMatches(matchesWithPartner);
    } catch (error) {
      console.error('Error fetching matches:', error);
    }
  };
  

  const fetchMessages = async () => {
    if (!selectedMatch?.id) return;

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
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedMatch?.id || !currentUser?.id) return;

    try {
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const updateField = isUser1 ? 'user1_unread_count' : 'user2_unread_count';

      await supabase
        .from('matches')
        .update({ [updateField]: 0 })
        .eq('id', selectedMatch.id);

      fetchMatches();
      onUnreadChange?.();
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedMatch?.id) return;
  
    if (selectedMatch.partner?.is_admin) {
      toast({
        title: "Action not allowed",
        description: "You cannot send messages to admin users.",
        variant: "destructive",
      });
      return;
    }
  
    try {
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const unreadField = isUser1 ? 'user2_unread_count' : 'user1_unread_count';
  
      // Insert message
      const { error: insertError } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: newMessage.trim(),
        });
  
      if (insertError) throw insertError;
  
      // 🔐 Prevent race condition by waiting before increment
      await new Promise(resolve => setTimeout(resolve, 100)); // wait 100ms
  
      // Increment unread count for recipient only
      const { error: rpcError } = await supabase.rpc('increment_unread_count', {
        match_id_input: selectedMatch.id,
        field_name: unreadField,
      });
  
      if (rpcError) throw rpcError;
  
      setNewMessage('');
      await fetchMessages();
      await fetchMatches(); // call once, after all is done
      onUnreadChange?.();
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filteredMatches = matches.filter(match => {
    const partnerName = `${match.partner?.first_name || ''} ${match.partner?.last_name || ''}`.toLowerCase();
    return partnerName.includes(searchTerm.toLowerCase());
  });

  const handleUserProfileClick = (userId: string) => {
    setSelectedUserId(userId);
    setIsUserProfileOpen(true);
  };

  const handleUserAvatarClick = (userId: string) => {
    handleUserProfileClick(userId);
  };

  // Show chat list view
  if (!selectedMatch) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white border-b p-4 flex-shrink-0">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Messages</h1>
          <div className="relative">
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
  {filteredMatches.length === 0 ? (
    <div className="flex items-center justify-center h-full">
      <p className="text-center text-gray-500 p-4">
        {searchTerm ? 'No matches found' : 'No matches yet'}
      </p>
    </div>
  ) : (
    <div className="divide-y">
      {filteredMatches.map((match) => (
        <div
          key={match.id}
          onClick={() => setSelectedMatch(match)}
          className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center space-x-3">
  <div className="relative">
    <ChatUserAvatar 
      userId={match.partner?.id}
      firstName={match.partner?.first_name}
      lastName={match.partner?.last_name}
      onClick={() => handleUserProfileClick(match.partner?.id)}
      size="lg"
    />
    {/* Unread dot if message is from partner and not yet read */}
    {match.unreadCount > 0 && (
  <span className="absolute -top-1 -right-1 h-3 w-3 bg-blue-600 rounded-full border-2 border-white z-10" />
)}
  </div>

  <div className="flex-1 min-w-0">
    <div className="flex justify-between items-center">
      <span className="font-semibold text-gray-900 truncate">
        {match.partner?.first_name} {match.partner?.last_name}
      </span>
    </div>
    <p
  className={`text-sm truncate ${
    match.unreadCount > 0 ? 'font-bold text-gray-900' : 'text-gray-500'
  }`}
>
  {match.last_message?.message
    ? `${match.last_message.sender_id === currentUser.id ? 'You: ' : ''}${match.last_message.message}`
    : 'Tap to start chatting'}
</p>
  </div>
</div>

        </div>
      ))}
    </div>
  )}
</div>
      </div>
    );
  }

  // Show individual chat view
  return (
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="bg-white border-b p-4 flex items-center space-x-3 flex-shrink-0">
        <Button
          onClick={() => setSelectedMatch(null)}
          variant="ghost"
          size="sm"
          className="p-1"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <ChatUserAvatar
          userId={selectedMatch.partner?.id}
          firstName={selectedMatch.partner?.first_name}
          lastName={selectedMatch.partner?.last_name}
          onClick={() => handleUserProfileClick(selectedMatch.partner?.id)}
          size="md"
        />
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">
            {selectedMatch.partner?.first_name} {selectedMatch.partner?.last_name}
          </h2>
        </div>
      </div>

      {/* Messages - scrollable area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-center text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                  message.sender_id === currentUser.id
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input - Fixed at bottom */}
      <div className="border-t p-4 bg-white flex-shrink-0 pb-2">
      <div className="flex space-x-2 relative">
          <div className="flex-1 relative">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="pr-12 rounded-full"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1"
            >
              <Smile className="w-4 h-4" />
            </Button>
          </div>
          <Button 
            onClick={sendMessage} 
            disabled={!newMessage.trim()}
            className="rounded-full w-12 h-12 p-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        {showEmojiPicker && (
          <div className="absolute bottom-28 right-4 z-10">
            <EmojiPicker onEmojiSelect={handleEmojiSelect} />
          </div>
        )}
      </div>

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        userId={selectedUserId}
      />
    </div>
  );
};

export default ChatPage;

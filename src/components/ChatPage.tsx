
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile, Send, Search } from 'lucide-react';
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
  const lastMessageHeight = useRef<number>(0);

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
          user1:profiles!matches_user1_id_fkey(id, first_name, last_name),
          user2:profiles!matches_user2_id_fkey(id, first_name, last_name)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const matchesWithPartner = data?.map(match => {
        const isUser1 = match.user1_id === currentUser.id;
        return {
          ...match,
          partner: isUser1 ? match.user2 : match.user1,
          unreadCount: isUser1 ? match.user1_unread_count : match.user2_unread_count
        };
      }) || [];

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

    try {
      const { error } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage('');
      fetchMessages();
      fetchMatches();
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

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-6xl mx-auto">
      {/* Matches Sidebar */}
      <Card className="flex flex-col md:flex-row h-full">
        <div className="w-full md:w-1/3 md:border-r">
          <CardHeader className="pb-2">
            <CardTitle>Your Matches</CardTitle>
            <div className="relative mt-2">
              <Input
                type="text"
                placeholder="Search matches..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto h-[calc(100%-80px)]">
            <div className="max-h-full">
              {filteredMatches.length === 0 ? (
                <p className="text-center text-gray-500 p-4">
                  {searchTerm ? 'No matches found' : 'No matches yet'}
                </p>
              ) : (
                filteredMatches.map((match) => (
                  <div
                    key={match.id}
                    onClick={() => setSelectedMatch(match)}
                    className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedMatch?.id === match.id ? 'bg-pink-50 border-pink-200' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <ChatUserAvatar 
                        userId={match.partner?.id}
                        firstName={match.partner?.first_name}
                        lastName={match.partner?.last_name}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUserProfileClick(match.partner?.id);
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">
                            {match.partner?.first_name} {match.partner?.last_name}
                          </span>
                          {match.unreadCount > 0 && (
                            <span className="bg-pink-600 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                              {match.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedMatch ? (
            <>
              <CardHeader className="border-b flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <ChatUserAvatar
                    userId={selectedMatch.partner?.id}
                    firstName={selectedMatch.partner?.first_name}
                    lastName={selectedMatch.partner?.last_name}
                    onClick={() => handleUserProfileClick(selectedMatch.partner?.id)}
                    size="lg"
                  />
                  <CardTitle>
                    {selectedMatch.partner?.first_name} {selectedMatch.partner?.last_name}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col h-full p-0">
                {/* Messages */}
                <div 
                  ref={messagesContainerRef} 
                  className="flex-1 p-4 overflow-y-auto"
                  style={{ maxHeight: 'calc(100vh - 350px)' }}
                >
                  {messages.length === 0 ? (
                    <p className="text-center text-gray-500">No messages yet. Start the conversation!</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`mb-4 flex ${
                          message.sender_id === currentUser.id ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {message.sender_id !== currentUser.id && (
                          <div className="mr-2 flex-shrink-0">
                            <ChatUserAvatar 
                              userId={message.sender_id}
                              firstName={message.sender.first_name}
                              lastName={message.sender.last_name}
                              size="sm"
                              onClick={() => handleUserProfileClick(message.sender_id)}
                            />
                          </div>
                        )}
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            message.sender_id === currentUser.id
                              ? 'bg-pink-600 text-white'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                        {message.sender_id === currentUser.id && (
                          <div className="ml-2 flex-shrink-0">
                            <ChatUserAvatar 
                              userId={message.sender_id}
                              firstName={message.sender.first_name}
                              lastName={message.sender.last_name}
                              size="sm"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="border-t p-4 mt-auto">
                  <div className="flex space-x-2 relative">
                    <div className="flex-1 relative">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="pr-12"
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
                    <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {showEmojiPicker && (
                    <div className="absolute bottom-20 right-4 z-10">
                      <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                    </div>
                  )}
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-full">
              <p className="text-gray-500">Select a match to start chatting</p>
            </CardContent>
          )}
        </div>
      </Card>

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

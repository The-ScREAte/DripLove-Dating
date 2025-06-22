
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
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';

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

  useRealtimeMessages({
    onNewMessage: () => {
      if (selectedMatch) {
        fetchMessages();
      }
    },
    onUnreadCountChange: () => {
      fetchMatches();
      onUnreadChange?.();
    }
  });

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
      // Get matches excluding those older than 3 weeks and blocked users
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id,
          user1_id,
          user2_id,
          user1_unread_count,
          user2_unread_count,
          last_msg_at,
          created_at
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .or(`last_msg_at.is.null,last_msg_at.gt.${new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()}`);

      if (matchesError) throw matchesError;

      // Get profile data for partners
      const matchesWithPartners = await Promise.all(
        (matchesData || []).map(async (match) => {
          const partnerId = match.user1_id === currentUser.id ? match.user2_id : match.user1_id;
          
          const { data: partnerProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('id', partnerId)
            .single();

          if (profileError) {
            console.error('Error fetching partner profile:', profileError);
            return null;
          }

          return {
            ...match,
            partner: partnerProfile,
            unreadCount: match.user1_id === currentUser.id ? match.user1_unread_count : match.user2_unread_count
          };
        })
      );

      const validMatches = matchesWithPartners.filter(match => match !== null);
      setMatches(validMatches);
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
      // Mark messages as read
      await supabase
        .from('chats')
        .update({ is_read: true })
        .eq('match_id', selectedMatch.id)
        .neq('sender_id', currentUser.id)
        .eq('is_read', false);

      // Reset unread count in matches
      const updateData = selectedMatch.user1_id === currentUser.id 
        ? { user1_unread_count: 0 }
        : { user2_unread_count: 0 };

      await supabase
        .from('matches')
        .update(updateData)
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
      const { error } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: newMessage.trim(),
          is_read: false
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
                {searchTerm ? 'No matches found' : 'No active chats'}
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
                      {match.unreadCount > 0 && (
                        <>
                          <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center z-10">
                            {match.unreadCount}
                          </span>
                          <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></div>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900 truncate">
                          {match.partner?.first_name} {match.partner?.last_name}
                        </span>
                        {match.last_msg_at && (
                          <span className="text-xs text-gray-500">
                            {new Date(match.last_msg_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {match.unreadCount > 0 ? `${match.unreadCount} unread messages` : 'Tap to start chatting'}
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
        <div className="relative">
          <ChatUserAvatar
            userId={selectedMatch.partner?.id}
            firstName={selectedMatch.partner?.first_name}
            lastName={selectedMatch.partner?.last_name}
            onClick={() => handleUserProfileClick(selectedMatch.partner?.id)}
            size="md"
          />
          {selectedMatch.unreadCount > 0 && (
            <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border border-white"></div>
          )}
        </div>
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
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs opacity-70">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {message.sender_id === currentUser.id && (
                    <span className={`text-xs ${message.is_read ? 'opacity-70' : 'opacity-50'}`}>
                      {message.is_read ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input - Fixed at bottom */}
      <div className="border-t p-4 bg-white flex-shrink-0 pb-24">
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

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, ArrowLeft, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BlockDialog from './BlockDialog';

interface ChatPageProps {
  currentUser: any;
}

const ChatPage = ({ currentUser }: ChatPageProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMatches();
  }, [currentUser]);

  useEffect(() => {
    if (selectedMatch) {
      fetchMessages();
      markMessagesAsRead();
      
      // Subscribe to new messages with improved real-time performance
      const channel = supabase
        .channel(`chat-messages-${selectedMatch.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chats',
            filter: `match_id=eq.${selectedMatch.id}`
          },
          (payload) => {
            console.log('New message received:', payload.new);
            setMessages(prev => [...prev, payload.new]);
            
            // Mark as read if it's not from current user
            if (payload.new.sender_id !== currentUser.id) {
              markMessagesAsRead();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedMatch]);

  const fetchMatches = async () => {
    if (!currentUser?.id) return;

    try {
      // Get blocked users to filter them out
      const { data: blockedUsers } = await supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);
      
      const blockedIds = blockedUsers?.map(block => 
        block.blocker_id === currentUser.id ? block.blocked_id : block.blocker_id
      ) || [];

      const { data: matchesData, error } = await supabase
        .from('matches')
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(*),
          user2:profiles!matches_user2_id_fkey(*)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter out blocked users and get the other user for each match
      const matchesWithOtherUser = matchesData?.filter(match => {
        const otherUserId = match.user1_id === currentUser.id ? match.user2_id : match.user1_id;
        return !blockedIds.includes(otherUserId);
      }).map(match => {
        const isUser1 = match.user1_id === currentUser.id;
        return {
          ...match,
          otherUser: isUser1 ? match.user2 : match.user1,
          unreadCount: isUser1 ? match.user1_unread_count : match.user2_unread_count
        };
      }) || [];

      setMatches(matchesWithOtherUser);
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast({
        title: "Error",
        description: "Failed to load matches",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedMatch) return;

    try {
      const isUser1 = selectedMatch.user1_id === currentUser.id;
      const updateField = isUser1 ? 'user1_unread_count' : 'user2_unread_count';
      
      const { error } = await supabase
        .from('matches')
        .update({ [updateField]: 0 })
        .eq('id', selectedMatch.id);

      if (error) throw error;

      // Update local state
      setMatches(prev => prev.map(match => 
        match.id === selectedMatch.id 
          ? { ...match, unreadCount: 0 }
          : match
      ));
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedMatch) return;

    const messageText = newMessage.trim();
    setNewMessage(''); // Clear immediately for better UX

    try {
      const { error } = await supabase
        .from('chats')
        .insert({
          match_id: selectedMatch.id,
          sender_id: currentUser.id,
          message: messageText
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageText); // Restore message on error
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleBlock = () => {
    setBlockDialogOpen(true);
  };

  const handleBlockSuccess = () => {
    // Remove from matches list and go back to matches view
    setMatches(prev => prev.filter(match => match.id !== selectedMatch.id));
    setSelectedMatch(null);
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (selectedMatch) {
    return (
      <div className="max-w-4xl mx-auto h-full flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button
                  onClick={() => setSelectedMatch(null)}
                  variant="ghost"
                  size="sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="w-10 h-10 bg-gradient-to-br from-pink-200 to-purple-200 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold">
                    {selectedMatch.otherUser.first_name?.[0]}{selectedMatch.otherUser.last_name?.[0]}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">
                    {selectedMatch.otherUser.first_name} {selectedMatch.otherUser.last_name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {calculateAge(selectedMatch.otherUser.date_of_birth)} years old
                  </p>
                </div>
              </div>
              
              <Button
                onClick={handleBlock}
                variant="outline"
                size="sm"
              >
                <Shield className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-96">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.sender_id === currentUser.id
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <p className="text-sm">{message.message}</p>
                    <p className={`text-xs mt-1 ${
                      message.sender_id === currentUser.id ? 'text-pink-100' : 'text-gray-500'
                    }`}>
                      {new Date(message.created_at).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex space-x-2">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="bg-pink-500 hover:bg-pink-600"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <BlockDialog
          isOpen={blockDialogOpen}
          onClose={() => setBlockDialogOpen(false)}
          userToBlock={selectedMatch.otherUser}
          currentUserId={currentUser.id}
          onBlockSuccess={handleBlockSuccess}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="w-6 h-6 text-pink-600" />
            <span>Your Matches ({matches.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">No matches yet</h3>
              <p className="text-gray-600">Start swiping to find matches and begin conversations!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <Card 
                  key={match.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedMatch(match)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-pink-200 to-purple-200 rounded-full flex items-center justify-center">
                        <span className="text-lg font-semibold">
                          {match.otherUser.first_name?.[0]}{match.otherUser.last_name?.[0]}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800">
                          {match.otherUser.first_name} {match.otherUser.last_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {calculateAge(match.otherUser.date_of_birth)} years old • {match.otherUser.city}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Matched {new Date(match.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {match.unreadCount > 0 && (
                          <div className="bg-pink-500 text-white rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 text-xs font-semibold">
                            {match.unreadCount}
                          </div>
                        )}
                        <MessageCircle className="w-5 h-5 text-pink-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatPage;

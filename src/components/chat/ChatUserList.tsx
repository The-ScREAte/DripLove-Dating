import React from 'react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface ChatUserListProps {
  matches: ChatMatch[];
  selectedMatch: ChatMatch | null;
  searchTerm: string;
  onMatchSelect: (match: ChatMatch) => void;
  onUserProfileOpen: (userId: string) => void;
  onSearchChange?: (searchTerm: string) => void;
}

const ChatUserList: React.FC<ChatUserListProps> = ({
  matches,
  selectedMatch,
  searchTerm,
  onMatchSelect,
  onUserProfileOpen,
  onSearchChange
}) => {
  const [localSearchTerm, setLocalSearchTerm] = React.useState(searchTerm);

  const handleSearchChange = (value: string) => {
    setLocalSearchTerm(value);
    onSearchChange?.(value);
  };

  const filteredMatches = matches.filter(match =>
    `${match.first_name} ${match.last_name}`.toLowerCase().includes(localSearchTerm.toLowerCase())
  );

  return (
    <div className="w-full h-full flex flex-col">
      {/* Sticky Header with gradient background */}
      <div className="sticky top-0 z-10 p-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white flex-shrink-0">
        <h2 className="text-xl font-bold mb-4">Messages</h2>
        <div className="relative">
          <Input
            type="text"
            placeholder="Search conversations..."
            value={localSearchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pr-10 bg-white text-gray-900"
          />
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        </div>
      </div>
      
      {/* Scrollable conversations list */}
      <div className="flex-1 overflow-y-auto">
        {filteredMatches.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {localSearchTerm ? 'No matches found' : 'No conversations yet'}
          </div>
        ) : (
          filteredMatches.map((match) => (
            <div
              key={match.id}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedMatch?.id === match.id ? 'bg-pink-50 border-pink-200' : ''
              }`}
              onClick={() => onMatchSelect(match)}
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <ChatUserAvatar
                    userId={match.id}
                    firstName={match.first_name}
                    lastName={match.last_name}
                    onClick={() => onUserProfileOpen(match.id)}
                  />
                  {match.unread_messages && match.unread_messages > 0 && (
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
          ))
        )}
      </div>
    </div>
  );
};

export default ChatUserList;

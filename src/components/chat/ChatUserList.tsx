import React from 'react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';
import NewMatches from './NewMatches';

interface ChatUserListProps {
  matches: ChatMatch[];
  newMatches: ChatMatch[];
  selectedMatch: ChatMatch | null;
  onMatchSelect: (match: ChatMatch) => void;
  onUserProfileOpen: (userId: string) => void;
  currentUserId?: string;
}

const ChatUserList: React.FC<ChatUserListProps> = ({
  matches,
  newMatches,
  selectedMatch,
  onMatchSelect,
  onUserProfileOpen,
  currentUserId
}) => {
  // env(safe-area-inset-top) is now reliable on Android too (see
  // @capacitor-community/safe-area setup in src/main.tsx), so one formula covers
  // native (iOS/Android) and web instead of a platform-branched guess.
  const paddingTopValue = 'clamp(32px, calc(env(safe-area-inset-top, 0px) + 32px), 80px)';

  return (
    <div className="w-full h-full flex flex-col bg-black">
      {/* Sticky Header with gradient background */}
      <div
        className="sticky top-0 z-10 p-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white flex-shrink-0"
        style={{ paddingTop: paddingTopValue }}
      >
        <h2 className="text-xl font-bold">DripChat</h2>
      </div>
      
      {/* New Matches Section */}
      <NewMatches
        matches={newMatches}
        onMatchSelect={onMatchSelect}
        onUserProfileOpen={onUserProfileOpen}
        currentUserId={currentUserId}
      />
      
      {/* Scrollable conversations list */}
      <div className="flex-1 overflow-y-auto pb-24 bg-black">
        {matches.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            No conversations yet
          </div>
        ) : (
          matches.map((match) => {
            // Determine the correct partner ID for avatar
            const partnerId = match.partner?.id || 
                             (currentUserId && match.user1_id === currentUserId ? match.user2_id : match.user1_id);
            
            return (
                <div
                  key={match.id}
                  className={`p-4 border-b border-pink-500/20 cursor-pointer hover:bg-pink-500/10 transition-colors ${
                    selectedMatch?.id === match.id ? 'bg-pink-500/15 border-pink-500/40' : 'bg-black'
                  } ${match.unread_messages > 0 ? 'bg-pink-500/5' : ''}`}
                  onClick={() => onMatchSelect(match)}
                >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <ChatUserAvatar
                      userId={partnerId}
                      firstName={match.first_name}
                      lastName={match.last_name}
                      onClick={() => onUserProfileOpen(partnerId)}
                    />
                     {match.unread_messages > 0 && (
                       <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                         {match.unread_messages > 9 ? '9+' : match.unread_messages}
                       </div>
                     )}
                  </div>
                 <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-start">
                     <h3 className={`truncate ${match.unread_messages > 0 ? 'font-bold text-white' : 'font-semibold text-gray-100'}`}>
                       {match.first_name} {match.last_name}
                     </h3>
                    {match.last_message_time && (
                      <span className="text-xs text-gray-400 ml-2">
                        {new Date(match.last_message_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                     {match.last_message && (
                       <p className={`text-sm truncate mt-1 ${match.unread_messages > 0 ? 'font-bold text-gray-200' : 'text-gray-400'}`}>
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
    </div>
  );
};

// ⭐ REACT.MEMO: Prevent re-renders when props haven't changed
export default React.memo(ChatUserList);

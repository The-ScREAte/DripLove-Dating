import React from 'react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';

interface NewMatchesProps {
  matches: ChatMatch[];
  onMatchSelect: (match: ChatMatch) => void;
  onUserProfileOpen: (userId: string) => void;
  currentUserId?: string;
}

const NewMatches: React.FC<NewMatchesProps> = ({
  matches,
  onMatchSelect,
  onUserProfileOpen,
  currentUserId
}) => {
  if (matches.length === 0) return null;

  return (
    <div className="px-4 pt-2 pb-3 border-b bg-background">
      <h3 className="text-sm font-semibold text-foreground mb-2">New Matches</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {matches.map((match) => {
          const partnerId = match.partner?.id || 
                           (currentUserId && match.user1_id === currentUserId ? match.user2_id : match.user1_id);
          
          return (
            <div
              key={match.id}
              className="flex flex-col items-center min-w-[70px] cursor-pointer"
              onClick={() => onMatchSelect(match)}
            >
              <div className="relative mb-2">
                <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-br from-blue-400 to-blue-600">
                  <div onClick={(e) => {
                    e.stopPropagation();
                    onUserProfileOpen(partnerId);
                  }}>
                    <ChatUserAvatar
                      userId={partnerId}
                      firstName={match.first_name}
                      lastName={match.last_name}
                      size="md"
                    />
                  </div>
                </div>
              </div>
              <span className="text-xs text-foreground text-center truncate w-full">
                {match.first_name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NewMatches;

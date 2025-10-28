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
    <div className="px-4 py-3 border-b bg-background">
      <h3 className="text-sm font-semibold text-foreground mb-3">New Matches</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {matches.map((match) => {
          const partnerId = match.partner?.id || 
                          (currentUserId && match.user1_id === currentUserId ? match.user2_id : match.user1_id);
          
          return (
            <div 
              key={match.id} 
              className="flex flex-col items-center flex-shrink-0 cursor-pointer"
              onClick={() => onMatchSelect(match)}
            >
               <div className="relative w-16 h-16">
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    onUserProfileOpen(partnerId);
                  }}
                >
                  <ChatUserAvatar
                    userId={partnerId}
                    firstName={match.first_name}
                    lastName={match.last_name}
                    size="lg"
                  />
                </div>
                {/* Blue ring for new matches */}
                <div className="absolute inset-0 rounded-full border-3 border-blue-500 pointer-events-none"></div>
              </div>
              <span className="text-xs text-foreground mt-1 max-w-[70px] truncate">
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

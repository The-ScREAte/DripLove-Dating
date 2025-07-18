import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHeaderProps {
  selectedMatch: ChatMatch;
  onBack: () => void;
  onUserProfileOpen: (userId: string) => void;
  onBlockUser: (user: ChatMatch) => void;
  onTestNotification?: () => void;
  isMobile?: boolean;
  currentUserId?: string;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedMatch,
  onBack,
  onUserProfileOpen,
  onBlockUser,
  onTestNotification,
  isMobile = false,
  currentUserId
}) => {
  // Determine partner ID correctly
  const partnerId = selectedMatch.partner?.id || 
                   (selectedMatch.user1_id === currentUserId ? selectedMatch.user2_id : selectedMatch.user1_id);

  return (
    <div className="p-6 border-b bg-white flex items-center justify-between">
      <div className="flex items-center space-x-3">
        {isMobile && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="p-2"
            aria-label="Go back to chat list"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <ChatUserAvatar
          userId={partnerId}
          firstName={selectedMatch.first_name}
          lastName={selectedMatch.last_name}
          onClick={() => onUserProfileOpen(partnerId)}
        />
        <div>
          <h3 className="font-semibold text-gray-900">
            {selectedMatch.first_name} {selectedMatch.last_name}
          </h3>
          <p className="text-sm text-gray-500">Active on DripLove</p>
        </div>
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="p-2">
            <span className="sr-only">More options</span>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem 
            onClick={() => onBlockUser(selectedMatch)}
            className="text-red-600"
          >
            Block User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default ChatHeader;

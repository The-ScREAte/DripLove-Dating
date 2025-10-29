import React, { useState } from 'react';
import { ChatMessage, CurrentUser } from '@/types';
import MessageOptionsMenu from './MessageOptionsMenu';
import DeleteConfirmDialog from './DeleteConfirmDialog';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUser: CurrentUser;
  isConsecutive: boolean;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isConsecutive,
  onDeleteForMe,
  onDeleteForEveryone
}) => {
  const isOwnMessage = message.sender_id === currentUser.id;
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'me' | 'everyone'>('me');
  
  const handleDeleteForMe = () => {
    setDeleteType('me');
    setShowConfirm(true);
  };

  const handleDeleteForEveryone = () => {
    setDeleteType('everyone');
    setShowConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (deleteType === 'me' && onDeleteForMe && message.id) {
      onDeleteForMe(message.id);
    } else if (deleteType === 'everyone' && onDeleteForEveryone && message.id) {
      onDeleteForEveryone(message.id);
    }
  };
  
  return (
    <>
      <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isConsecutive ? 'mt-1' : 'mt-4'}`}>
        <div
          className={`relative max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
            isOwnMessage
              ? 'bg-primary text-primary-foreground'
              : 'bg-gray-200 text-gray-900'
          } ${isConsecutive ? '' : 'shadow-sm'}`}
        >
          {/* Three-dot menu in top corner inside bubble */}
          <div className={`absolute top-0 ${isOwnMessage ? 'right-1' : 'left-1'}`}>
            <MessageOptionsMenu
              isOwnMessage={isOwnMessage}
              onDeleteForMe={handleDeleteForMe}
              onDeleteForEveryone={handleDeleteForEveryone}
            />
          </div>

          <p className="text-sm break-words pr-6">{message.message}</p>
          <div className={`flex items-center gap-1 text-xs mt-1 ${isOwnMessage ? 'text-primary-foreground/70' : 'text-gray-500'}`}>
            <span>
              {new Date(message.sent_at || message.created_at || '').toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
            {isOwnMessage && (
              <span className={`text-sm font-semibold text-primary-foreground/90`}>
                {message.is_read ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmDelete}
        deleteType={deleteType}
      />
    </>
  );
};

export default MessageBubble;

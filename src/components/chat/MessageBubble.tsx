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
  onDormancyResponse?: (response: boolean) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isConsecutive,
  onDeleteForMe,
  onDeleteForEveryone,
  onDormancyResponse
}) => {
  const isOwnMessage = message.sender_id === currentUser.id;
  const isSystemMessage = message.sender_id === '00000000-0000-0000-0000-000000000000';
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'me' | 'everyone'>('me');
  const [hasResponded, setHasResponded] = useState(false);
  
  // Check if message is deleted for current user
  const isDeletedForMe = message.deleted_for && message.deleted_for.includes(currentUser.id);
  
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

  const handleDormancyResponse = (response: boolean) => {
    if (onDormancyResponse) {
      onDormancyResponse(response);
      setHasResponded(true);
    }
  };
  
  // Render system message (dormancy check)
  if (isSystemMessage) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 max-w-md shadow-sm">
          <p className="text-sm text-amber-900 text-center mb-3">{message.message}</p>
          {!hasResponded && onDormancyResponse && (
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => handleDormancyResponse(true)}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Yes ✓
              </button>
              <button
                onClick={() => handleDormancyResponse(false)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                No ✗
              </button>
            </div>
          )}
          {hasResponded && (
            <p className="text-xs text-amber-700 text-center">Response recorded</p>
          )}
        </div>
      </div>
    );
  }
  
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
          {!isSystemMessage && (
            <div className={`absolute -top-1 ${isOwnMessage ? 'right-1' : 'left-1'}`}>
              <MessageOptionsMenu
                isOwnMessage={isOwnMessage}
                onDeleteForMe={handleDeleteForMe}
                onDeleteForEveryone={handleDeleteForEveryone}
              />
            </div>
          )}

          <p className={`text-sm break-words pr-6 ${isDeletedForMe ? 'italic opacity-70' : ''}`}>
            {isDeletedForMe ? 'deleted' : message.message}
          </p>
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

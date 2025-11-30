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
  onReply?: (message: ChatMessage) => void;
  repliedMessage?: ChatMessage | null;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isConsecutive,
  onDeleteForMe,
  onDeleteForEveryone,
  onDormancyResponse,
  onReply,
  repliedMessage
}) => {
  const isOwnMessage = message.sender_id === currentUser.id;
  const isSystemMessage = message.sender_id === '00000000-0000-0000-0000-000000000000';
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'me' | 'everyone'>('me');
  const [hasResponded, setHasResponded] = useState(false);
  
  // Swipe gesture state
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  
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
  
  // Swipe gesture handlers for touch
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    setIsSwiping(true);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchX - touchStart.x;
    const deltaY = touchY - touchStart.y;
    
    // Only trigger swipe if horizontal movement is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Own messages: swipe left to reply
      // Other's messages: swipe right to reply
      if ((isOwnMessage && deltaX < 0) || (!isOwnMessage && deltaX > 0)) {
        setSwipeOffset(Math.abs(deltaX));
      }
    }
  };
  
  const handleTouchEnd = () => {
    const threshold = window.innerWidth * 0.3; // 30% of screen width
    if (swipeOffset > threshold && onReply) {
      onReply(message);
    }
    setSwipeOffset(0);
    setIsSwiping(false);
  };
  
  // Mouse gesture handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setTouchStart({ x: e.clientX, y: e.clientY });
    setIsMouseDown(true);
    setIsSwiping(true);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSwiping || !isMouseDown) return;
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const deltaX = mouseX - touchStart.x;
    const deltaY = mouseY - touchStart.y;
    
    // Only trigger swipe if horizontal movement is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Own messages: swipe left to reply
      // Other's messages: swipe right to reply
      if ((isOwnMessage && deltaX < 0) || (!isOwnMessage && deltaX > 0)) {
        setSwipeOffset(Math.abs(deltaX));
      }
    }
  };
  
  const handleMouseUp = () => {
    const threshold = window.innerWidth * 0.3; // 30% of screen width
    if (swipeOffset > threshold && onReply) {
      onReply(message);
    }
    setSwipeOffset(0);
    setIsSwiping(false);
    setIsMouseDown(false);
  };
  
  const handleMouseLeave = () => {
    // Reset if mouse leaves the bubble while dragging
    if (isMouseDown) {
      setSwipeOffset(0);
      setIsSwiping(false);
      setIsMouseDown(false);
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
      <div 
        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isConsecutive ? 'mt-1' : 'mt-4'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: swipeOffset > 0 ? `translateX(${isOwnMessage ? -swipeOffset * 0.3 : swipeOffset * 0.3}px)` : 'none',
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
          cursor: isMouseDown ? 'grabbing' : 'grab'
        }}
      >
        <div
          className={`relative max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
            isOwnMessage
              ? 'bg-primary text-primary-foreground'
              : 'bg-gray-200 text-gray-900'
          } ${isConsecutive ? '' : 'shadow-sm'}`}
        >
          {/* Reply thread indicator */}
          {repliedMessage && (
            <div className={`mb-2 pb-2 border-b ${isOwnMessage ? 'border-primary-foreground/20' : 'border-gray-400/20'}`}>
              <div className="flex items-start space-x-1">
                <div className={`w-1 h-full rounded-full ${isOwnMessage ? 'bg-primary-foreground/40' : 'bg-primary/40'}`}></div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${isOwnMessage ? 'text-primary-foreground/80' : 'text-gray-600'}`}>
                    {repliedMessage.sender_id === currentUser.id ? 'You' : repliedMessage.sender?.first_name}
                  </p>
                  <p className={`text-xs truncate ${isOwnMessage ? 'text-primary-foreground/70' : 'text-gray-500'}`}>
                    {repliedMessage.message}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Three-dot menu in top corner inside bubble */}
          {!isSystemMessage && (
            <div className={`absolute -top-1 ${isOwnMessage ? 'right-1' : 'left-1'}`}>
              <MessageOptionsMenu
                isOwnMessage={isOwnMessage}
                onDeleteForMe={handleDeleteForMe}
                onDeleteForEveryone={handleDeleteForEveryone}
                onReply={onReply ? () => onReply(message) : undefined}
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

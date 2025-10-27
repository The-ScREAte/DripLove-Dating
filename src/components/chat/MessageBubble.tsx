import React, { useState } from 'react';
import { ChatMessage, CurrentUser } from '@/types';
import { Trash2 } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUser: CurrentUser;
  isConsecutive: boolean;
  onDelete?: (messageId: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isConsecutive,
  onDelete
}) => {
  const isOwnMessage = message.sender_id === currentUser.id;
  const [showDelete, setShowDelete] = useState(false);
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  
  const handlePressStart = () => {
    const timer = setTimeout(() => {
      setShowDelete(true);
    }, 500); // Long press for 500ms
    setPressTimer(timer);
  };
  
  const handlePressEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };
  
  const handleDelete = () => {
    if (onDelete && message.id) {
      onDelete(message.id);
    }
  };
  
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isConsecutive ? 'mt-1' : 'mt-4'}`}>
      <div
        className={`relative max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isOwnMessage
            ? 'bg-blue-500 text-white'
            : 'bg-gray-200 text-gray-900'
        } ${isConsecutive ? '' : 'shadow-sm'}`}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        <p className="text-sm">{message.message}</p>
        <div className={`flex items-center gap-1 text-xs mt-1 ${isOwnMessage ? 'text-blue-100' : 'text-gray-500'}`}>
          <span>
            {new Date(message.sent_at || message.created_at || '').toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          {isOwnMessage && (
            <span className={`text-sm font-semibold ${message.is_read ? 'text-blue-200' : 'text-blue-300'}`}>
              {message.is_read ? '✓✓' : '✓'}
            </span>
          )}
        </div>
        
        {/* Delete button (shows on long press) */}
        {showDelete && isOwnMessage && (
          <button
            onClick={handleDelete}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-colors"
            aria-label="Delete message"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;

import React from 'react';
import { ChatMessage, CurrentUser } from '@/types';
import ReportButton from '../ReportButton';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUser: CurrentUser;
  isConsecutive: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isConsecutive
}) => {
  const isOwnMessage = message.sender_id === currentUser.id;
  
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isConsecutive ? 'mt-1' : 'mt-4'}`}>
      <div
        className={`relative max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isOwnMessage
            ? 'bg-blue-500 text-white'
            : 'bg-gray-200 text-gray-900'
        } ${isConsecutive ? '' : 'shadow-sm'}`}
      >
        <p className="text-sm">{message.message}</p>
        <div className={`text-xs mt-1 ${isOwnMessage ? 'text-blue-100' : 'text-gray-500'}`}>
          {new Date(message.sent_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
          {isOwnMessage && (
            <span className="ml-2">
              {message.is_read ? '✓✓' : '✓'}
            </span>
          )}
        </div>
        {/* Only allow reporting messages from others */}
        {!isOwnMessage && (
          <div className="absolute top-1 right-1">
            <ReportButton
              reporterId={currentUser.id}
              reportedUserId={message.sender_id}
              contentType="message"
              contentId={message.id}
              className="z-10"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;

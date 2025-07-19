import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile, Send } from 'lucide-react';
import EmojiPicker from '../EmojiPicker';

interface MessageInputProps {
  newMessage: string;
  onMessageChange: (message: string) => void;
  onSendMessage: () => void;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  newMessage,
  onMessageChange,
  onSendMessage,
  disabled = false
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEmojiSelect = (emoji: string) => {
    onMessageChange(newMessage + emoji);
    setShowEmojiPicker(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  // Handle focus and blur to manage viewport on mobile
  const handleFocus = () => {
    // Small delay to ensure keyboard is shown
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 300);
  };

  const handleBlur = () => {
    // Reset viewport zoom after input loses focus (iOS fix)
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 100);
  };

  return (
    <div 
      ref={containerRef}
      className="p-4 border-t bg-white relative keyboard-aware"
      style={{ 
        paddingBottom: `max(16px, env(safe-area-inset-bottom))`,
        position: 'sticky',
        bottom: 0,
        zIndex: 10
      }}
    >
      <div className="flex items-center space-x-2">
        <div className="flex-1 flex items-center space-x-2 bg-gray-100 rounded-full px-4 py-2">
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Type a message..."
            className="flex-1 border-none bg-transparent focus:ring-0 p-0"
            style={{ 
              fontSize: '16px',
              outline: 'none'
            }}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 hover:bg-gray-200 rounded-full"
            aria-label="Add emoji"
          >
            <Smile className="w-4 h-4" />
          </Button>
        </div>
        <Button 
          onClick={onSendMessage} 
          disabled={!newMessage.trim() || disabled}
          className="rounded-full w-12 h-12 p-0"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
      
      {showEmojiPicker && (
        <div className="absolute bottom-28 right-4 z-10">
          <EmojiPicker onEmojiSelect={handleEmojiSelect} />
        </div>
      )}
    </div>
  );
};

export default MessageInput;

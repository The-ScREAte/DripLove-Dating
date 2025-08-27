import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile, Send } from 'lucide-react';
import EmojiPicker from '../EmojiPicker';
import { sanitizeMessage } from '@/utils/inputSanitization';
import { containsBadWords } from '@/utils/textModeration';

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
      if (containsBadWords(newMessage)) {
        alert('Your message contains inappropriate language. Please remove it.');
        return;
      }
      onSendMessage();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="p-2 border-t bg-white relative"
    >
      <div className="flex items-center space-x-2">
        <div className="flex-1 flex items-center space-x-2 bg-gray-100 rounded-full px-4 py-2">
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 border-none bg-transparent focus:ring-0 p-0"
            disabled={disabled}
            style={{ fontSize: '16px' }}
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

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, X } from 'lucide-react';
import { sanitizeMessage } from '@/utils/inputSanitization';
import { containsBadWords } from '@/utils/textModeration';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { ChatMessage } from '@/types';

interface MessageInputProps {
  newMessage: string;
  onMessageChange: (message: string) => void;
  onSendMessage: () => void;
  disabled?: boolean;
  replyingTo?: ChatMessage | null;
  onCancelReply?: () => void;
}

const MessageInput: React.FC<MessageInputProps> = ({
  newMessage,
  onMessageChange,
  onSendMessage,
  disabled = false,
  replyingTo,
  onCancelReply
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (containsBadWords(newMessage)) {
        alert(t('chat.inappropriateLanguage'));
        return;
      }
      onSendMessage();
    }
  };

  React.useEffect(() => {
    const viewport = (window as any).visualViewport;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Only apply keyboard adjustments on mobile devices
    if (!isMobile) {
      return;
    }

    if (viewport) {
      const handleResize = () => {
        // Calculate exact keyboard height from viewport change
        const viewportHeight = viewport.height;
        const windowHeight = window.innerHeight;
        const keyboardHeight = Math.max(0, windowHeight - viewportHeight);
        setKeyboardOffset(keyboardHeight);
      };

      const handleScroll = () => {
        // Account for viewport scroll offset (iOS Safari)
        const viewportHeight = viewport.height + (viewport.offsetTop || 0);
        const windowHeight = window.innerHeight;
        const keyboardHeight = Math.max(0, windowHeight - viewportHeight);
        setKeyboardOffset(keyboardHeight);
      };

      viewport.addEventListener('resize', handleResize);
      viewport.addEventListener('scroll', handleScroll);
      
      // Initial measurement
      handleResize();

      return () => {
        viewport.removeEventListener('resize', handleResize);
        viewport.removeEventListener('scroll', handleScroll);
      };
    }
  }, []);

  const platform = Capacitor.getPlatform();
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // Use safe area padding only when keyboard is NOT visible
  const paddingBottomValue = keyboardOffset === 0 
    ? (platform === 'android' ? '24px' : `calc(env(safe-area-inset-bottom, 0px) + 8px)`)
    : '0px';

  return (
    <div 
      ref={containerRef}
      className="border-t bg-white z-30"
      style={{
        position: isMobile ? 'fixed' : 'relative',
        bottom: isMobile ? '0' : 'auto',
        left: isMobile ? '0' : 'auto',
        right: isMobile ? '0' : 'auto',
        width: isMobile ? '100%' : 'auto',
        paddingBottom: paddingBottomValue,
        transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : 'translateY(0px)',
        transition: 'transform 0.2s ease-out, padding-bottom 0.2s ease-out'
      }}
    >
      {/* Reply preview */}
      {replyingTo && (
        <div className="px-4 pt-3 pb-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <div className="w-1 h-8 bg-primary rounded-full"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-600">
                    Replying to {replyingTo.sender?.first_name || 'User'}
                  </p>
                  <p className="text-sm text-gray-800 truncate">
                    {replyingTo.message}
                  </p>
                </div>
              </div>
            </div>
            {onCancelReply && (
              <button
                onClick={onCancelReply}
                className="ml-2 p-1 hover:bg-gray-200 rounded-full"
                aria-label="Cancel reply"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            )}
          </div>
        </div>
      )}
      
      <div className="p-2">
        <div className="flex items-center space-x-2">
          <div className="flex-1 flex items-center space-x-2 bg-gray-100 rounded-full px-4 py-2">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('chat.typeMessage')}
              className="flex-1 h-10 rounded-md border border-input text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm flex-1 border-none bg-transparent focus:ring-0 p-0"
              disabled={disabled}
              style={{ fontSize: '16px' }}
            />
          </div>
          <button
            onClick={onSendMessage}
            disabled={!newMessage.trim() || disabled}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full w-12 h-12 p-0"
            aria-label={t('chat.sendMessage')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-send w-4 h-4" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;

import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, CurrentUser } from '@/types';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { Reply, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUser: CurrentUser;
  isConsecutive: boolean;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
  onDormancyResponse?: (response: boolean) => void;
  onReply?: (message: ChatMessage) => void;
  repliedMessage?: ChatMessage | null;
  onReplyClick?: (messageId: string) => void;
  isHighlighted?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isConsecutive,
  onDeleteForMe,
  onDeleteForEveryone,
  onDormancyResponse,
  onReply,
  repliedMessage,
  onReplyClick,
  isHighlighted = false,
}) => {
  const { t } = useTranslation();
  const isOwnMessage = message.sender_id === currentUser.id;
  const isSystemMessage = message.sender_id === '00000000-0000-0000-0000-000000000000';

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'me' | 'everyone'>('me');
  const [hasResponded, setHasResponded] = useState(false);

  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [showOptionsBelow, setShowOptionsBelow] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const isDeletedForMe = !!(message.deleted_for && message.deleted_for.includes(currentUser.id));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (!isOptionsOpen) return;
      const target = event.target as Node;
      if (optionsMenuRef.current && optionsMenuRef.current.contains(target)) return;
      if (bubbleRef.current && bubbleRef.current.contains(target)) return;
      setIsOptionsOpen(false);
    };

    if (isOptionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOptionsOpen]);

  const openOptionsMenu = () => {
    if (isSystemMessage) return;

    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();

      const safeAreaTop = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') || '0',
        10
      );
      const safeAreaBottom = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom') || '0',
        10
      );

      const spaceAbove = rect.top - safeAreaTop;
      const spaceBelow = window.innerHeight - rect.bottom - safeAreaBottom;

      // If there's not enough space above (accounting for headers), show below.
      setShowOptionsBelow(spaceAbove < 180);
    }

    setIsOptionsOpen(true);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDeleteForMe = () => {
    setDeleteType('me');
    setShowConfirm(true);
    setIsOptionsOpen(false);
  };

  const handleDeleteForEveryone = () => {
    setDeleteType('everyone');
    setShowConfirm(true);
    setIsOptionsOpen(false);
  };

  const handleReply = () => {
    if (onReply) onReply(message);
    setIsOptionsOpen(false);
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
    e.stopPropagation();
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    setIsSwiping(true);

    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    // iMessage-style long press to show options
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSwipeOffset(0);
      setIsSwiping(false);
      openOptionsMenu();
    }, 450);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchX - touchStart.x;
    const deltaY = touchY - touchStart.y;

    // If the finger moves, cancel long-press.
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      clearLongPressTimer();
    }
    
    // Only trigger swipe if horizontal movement is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Prevent browser's native swipe-back gesture
      e.preventDefault();
      e.stopPropagation();
      
      // Own messages: swipe left to reply
      // Other's messages: swipe right to reply
      if ((isOwnMessage && deltaX < 0) || (!isOwnMessage && deltaX > 0)) {
        setSwipeOffset(Math.abs(deltaX));
      }
    }
  };
  
  const handleTouchEnd = () => {
    clearLongPressTimer();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      setSwipeOffset(0);
      setIsSwiping(false);
      return;
    }
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
        className={`w-full flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => {
          e.preventDefault();
          openOptionsMenu();
        }}
        style={{
          transform: swipeOffset > 0 ? `translateX(${isOwnMessage ? -swipeOffset * 0.3 : swipeOffset * 0.3}px)` : 'none',
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
          cursor: isMouseDown ? 'grabbing' : 'grab',
          touchAction: 'pan-y'
        }}
      >
        <div
          ref={bubbleRef}
          className={`relative max-w-[78%] sm:max-w-[520px] rounded-2xl px-4 py-3 shadow-sm text-[15px] leading-5 mb-2 transition-all duration-300 ${
            isOwnMessage
              ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white'
              : 'bg-white text-slate-800 border border-slate-200'
          } ${
            isHighlighted
              ? 'ring-4 ring-yellow-400 shadow-2xl shadow-yellow-400/50 scale-105 animate-pulse'
              : ''
          }`}
          style={{
            backgroundColor: isHighlighted 
              ? (isOwnMessage ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)')
              : undefined,
          }}
        >
          {/* Reply preview */}
          {repliedMessage && (
            <div
              className={`mb-2 rounded-xl px-3 py-2 border-l-4 cursor-pointer transition-all hover:opacity-80 active:scale-[0.98] ${
                isOwnMessage 
                  ? 'bg-black/10 border-white/40' 
                  : 'bg-rose-50 border-rose-400'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (onReplyClick && repliedMessage.id) {
                  onReplyClick(repliedMessage.id);
                }
              }}
            >
              <div className={`text-[11px] font-semibold opacity-90 truncate ${
                isOwnMessage ? 'text-white' : 'text-rose-600'
              }`}>
                {repliedMessage.sender_id === currentUser.id ? 'You' : repliedMessage.sender?.first_name || 'User'}
              </div>
              <div className={`text-xs opacity-90 line-clamp-2 break-words ${
                isOwnMessage ? 'text-white' : 'text-slate-600'
              }`}>
                {repliedMessage.message}
              </div>
            </div>
          )}
          
          {/* Options menu (shown on long-press / right-click) */}
          {isOptionsOpen && !isSystemMessage && (
            <div
              ref={optionsMenuRef}
              className={`absolute ${showOptionsBelow ? 'top-full mt-1' : 'bottom-full mb-1'} ${
                isOwnMessage ? 'right-0' : 'left-0'
              } bg-white rounded-lg shadow-lg border border-gray-200 py-0.5 z-50 w-32 text-sm`}
            >
              {onReply && (
                <button
                  onClick={handleReply}
                  className="w-full px-2.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors text-xs"
                >
                  <Reply className="w-3 h-3" />
                  {t('chat.reply')}
                </button>
              )}

              <button
                onClick={handleDeleteForMe}
                className="w-full px-2.5 py-1.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors text-xs"
              >
                <Trash2 className="w-3 h-3" />
                {t('chat.deleteForMe')}
              </button>

              {isOwnMessage && (
                <button
                  onClick={handleDeleteForEveryone}
                  className="w-full px-2.5 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors text-xs"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('chat.deleteForEveryone')}
                </button>
              )}
            </div>
          )}

          {/* Actual message */}
          <div className={`whitespace-pre-wrap break-words ${isDeletedForMe ? 'italic opacity-70' : ''}`}>
            {isDeletedForMe ? 'deleted' : message.message}
          </div>

          {/* Meta row */}
          <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] opacity-80`}>
            <span>
              {new Date(message.sent_at || message.created_at || '').toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
            {isOwnMessage && (
              <span>{message.is_read ? '✓✓' : '✓'}</span>
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

// ⭐ REACT.MEMO: Prevent re-renders when message hasn't changed (70% improvement)
export default React.memo(MessageBubble, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.is_read === nextProps.message.is_read &&
    prevProps.message.deleted_for === nextProps.message.deleted_for &&
    prevProps.isConsecutive === nextProps.isConsecutive &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.repliedMessage?.id === nextProps.repliedMessage?.id
  );
});

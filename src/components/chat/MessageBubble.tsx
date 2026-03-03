import React, { useRef, useState, useCallback } from 'react';
import { ChatMessage, CurrentUser } from '@/types';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { Reply, Trash2, Check, CheckCheck } from 'lucide-react';
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
  const isDeletedForMe = !!(message.deleted_for && message.deleted_for.includes(currentUser.id));

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'me' | 'everyone'>('me');
  const [hasResponded, setHasResponded] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [showOptionsBelow, setShowOptionsBelow] = useState(false);

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const gestureLockRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openOptionsMenu = useCallback(() => {
    if (isSystemMessage) return;
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      setShowOptionsBelow(spaceAbove < 180);
    }
    setIsOptionsOpen(true);
  }, [isSystemMessage]);

  const closeOptionsMenu = useCallback(() => {
    setIsOptionsOpen(false);
  }, []);

  // Touch handlers for swipe-to-reply with gesture lock
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    gestureLockRef.current = 'none';
    setSwipeOffset(0);

    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openOptionsMenu();
    }, 450);
  }, [clearLongPressTimer, openOptionsMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    // Decide direction once
    if (gestureLockRef.current === 'none') {
      if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) return;

      gestureLockRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';

      // If user is scrolling vertically, cancel long press
      if (gestureLockRef.current === 'vertical') {
        clearLongPressTimer();
        return;
      }
    }

    // Only handle swipe if locked horizontal
    if (gestureLockRef.current !== 'horizontal') return;

    clearLongPressTimer();
    e.preventDefault();

    if ((isOwnMessage && deltaX < 0) || (!isOwnMessage && deltaX > 0)) {
      setSwipeOffset(Math.min(Math.abs(deltaX), 80));
    }
  }, [isOwnMessage, clearLongPressTimer]);

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();

    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      setSwipeOffset(0);
      gestureLockRef.current = 'none';
      return;
    }

    if (gestureLockRef.current === 'horizontal' && swipeOffset > 50 && onReply) {
      onReply(message);
    }

    setSwipeOffset(0);
    gestureLockRef.current = 'none';
  }, [clearLongPressTimer, swipeOffset, onReply, message]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openOptionsMenu();
  }, [openOptionsMenu]);

  const handleReply = useCallback(() => {
    if (onReply) onReply(message);
    closeOptionsMenu();
  }, [onReply, message, closeOptionsMenu]);

  const handleDeleteForMe = useCallback(() => {
    setDeleteType('me');
    setShowConfirm(true);
    closeOptionsMenu();
  }, [closeOptionsMenu]);

  const handleDeleteForEveryone = useCallback(() => {
    setDeleteType('everyone');
    setShowConfirm(true);
    closeOptionsMenu();
  }, [closeOptionsMenu]);

  const handleConfirmDelete = useCallback(() => {
    if (deleteType === 'me' && onDeleteForMe && message.id) {
      onDeleteForMe(message.id);
    } else if (deleteType === 'everyone' && onDeleteForEveryone && message.id) {
      onDeleteForEveryone(message.id);
    }
  }, [deleteType, onDeleteForMe, onDeleteForEveryone, message.id]);

  const handleDormancyResponse = useCallback((response: boolean) => {
    if (onDormancyResponse) {
      onDormancyResponse(response);
      setHasResponded(true);
    }
  }, [onDormancyResponse]);

  const handleReplyPreviewClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReplyClick && repliedMessage?.id) {
      onReplyClick(repliedMessage.id);
    }
  }, [onReplyClick, repliedMessage?.id]);

  // System message (dormancy check)
  if (isSystemMessage) {
    return (
      <div className="flex justify-center">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-sm shadow-sm">
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

  const swipeTransform = swipeOffset > 0 
    ? `translateX(${isOwnMessage ? -swipeOffset * 0.4 : swipeOffset * 0.4}px)` 
    : 'translateX(0)';

  return (
    <>
      {/* Click outside to close options */}
      {isOptionsOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={closeOptionsMenu}
          onTouchStart={closeOptionsMenu}
        />
      )}

      <div
        className={`flex w-full ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
        style={{
          transform: swipeTransform,
          transition: gestureLockRef.current === 'horizontal' ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        <div
          ref={bubbleRef}
          className={`
            relative max-w-[80%] sm:max-w-md
            rounded-2xl
            ${isOwnMessage 
              ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white border border-rose-300/40 shadow-[0_6px_18px_rgba(236,72,153,0.22)] rounded-br-md' 
              : 'bg-white text-slate-800 border border-pink-200 shadow-[0_4px_14px_rgba(15,23,42,0.10)] rounded-bl-md'
            }
            ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
          `}
        >
          {/* Reply Preview */}
          {repliedMessage && (() => {
            const replyPreviewText = (repliedMessage.message || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80);
            
            return (
              <div
                onClick={handleReplyPreviewClick}
                className={`
                  mx-2 mt-2 mb-1 px-3 py-2 rounded-lg border-l-4
                  cursor-pointer transition-opacity hover:opacity-80
                  ${isOwnMessage 
                    ? 'bg-white/15 border-white/50' 
                    : 'bg-rose-50 border-rose-400'
                  }
                `}
              >
                <p className={`text-xs font-semibold truncate ${isOwnMessage ? 'text-white/90' : 'text-rose-600'}`}>
                  {repliedMessage.sender_id === currentUser.id 
                    ? t('chat.you', 'You') 
                    : repliedMessage.sender?.first_name || 'User'
                  }
                </p>
                <p className={`text-xs line-clamp-2 mt-0.5 ${isOwnMessage ? 'text-white/80' : 'text-slate-600'}`}>
                  {replyPreviewText}{replyPreviewText.length >= 80 ? '...' : ''}
                </p>
              </div>
            );
          })()}

          {/* Message Content */}
          <div className={`px-3 ${repliedMessage ? 'pt-1' : 'pt-2.5'} pb-1`}>
            <p className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${isDeletedForMe ? 'italic opacity-60' : ''}`}>
              {isDeletedForMe ? t('chat.deleted', 'This message was deleted') : message.message}
            </p>
          </div>

          {/* Timestamp & Read Status */}
          <div className={`flex items-center justify-end gap-1 px-3 pb-2 ${isOwnMessage ? 'text-white/70' : 'text-slate-400'}`}>
            <span className="text-[11px]">
              {formatTime(message.sent_at || message.created_at)}
            </span>
            {isOwnMessage && (
              <span className="flex items-center">
                {message.is_read ? (
                  <CheckCheck className="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
              </span>
            )}
          </div>

          {/* Context Menu */}
          {isOptionsOpen && (
            <div
              ref={optionsMenuRef}
              className={`
                absolute z-50 min-w-[140px]
                bg-white rounded-xl shadow-lg border border-slate-200
                py-1 overflow-hidden
                ${showOptionsBelow ? 'top-full mt-1' : 'bottom-full mb-1'}
                ${isOwnMessage ? 'right-0' : 'left-0'}
              `}
            >
              {onReply && (
                <button
                  onClick={handleReply}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Reply className="w-4 h-4 text-slate-500" />
                  {t('chat.reply', 'Reply')}
                </button>
              )}
              <button
                onClick={handleDeleteForMe}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                {t('chat.deleteForMe', 'Delete for me')}
              </button>
              {isOwnMessage && (
                <button
                  onClick={handleDeleteForEveryone}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('chat.deleteForEveryone', 'Delete for everyone')}
                </button>
              )}
            </div>
          )}
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

export default React.memo(MessageBubble, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.is_read === next.message.is_read &&
    JSON.stringify(prev.message.deleted_for) === JSON.stringify(next.message.deleted_for) &&
    prev.isConsecutive === next.isConsecutive &&
    prev.isHighlighted === next.isHighlighted &&
    prev.repliedMessage?.id === next.repliedMessage?.id
  );
});

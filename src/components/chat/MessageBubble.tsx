import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessage, CurrentUser } from '@/types';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { Reply, Trash2, Check, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUser: CurrentUser;
  isConsecutive: boolean;
  /** True when this is the last bubble of a consecutive run from the same
   * sender (or a standalone message with no run at all) - the only bubble in
   * a group that gets the group's avatar, timestamp, and "tail" corner. */
  isLastInGroup: boolean;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
  onDormancyResponse?: (response: boolean) => void;
  onReply?: (message: ChatMessage) => void;
  repliedMessage?: ChatMessage | null;
  onReplyClick?: (messageId: string) => void;
  isHighlighted?: boolean;
  /** Only rendered for the other person's messages, only on the last bubble
   * of their group - initials fall back when there's no photo. */
  partnerAvatarUrl?: string | null;
  partnerInitials?: string;
  /** The scrollable conversation area (ChatPage's messagesContainerRef) -
   * the selection overlay dims/blurs exactly this region, not the header or
   * the input bar above/below it. Falls back to the full viewport if not
   * provided. */
  conversationAreaRef?: React.RefObject<HTMLElement>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isConsecutive,
  isLastInGroup,
  onDeleteForMe,
  onDeleteForEveryone,
  onDormancyResponse,
  onReply,
  repliedMessage,
  onReplyClick,
  isHighlighted = false,
  partnerAvatarUrl,
  partnerInitials = '',
  conversationAreaRef,
}) => {
  const { t } = useTranslation();
  const isOwnMessage = message.sender_id === currentUser.id;
  const isSystemMessage = message.sender_id === '00000000-0000-0000-0000-000000000000';
  const isDeletedForMe = !!(message.deleted_for && message.deleted_for.includes(currentUser.id));

  const [showConfirm, setShowConfirm] = useState(false);
  // "Delete for all" only within 24h of sending, same window the delete RLS
  // policy enforces server-side - past it, only "Delete for me" is offered.
  // Computed once, when the menu is opened (see openOptionsMenu) rather
  // than on every render, so a still-mounted bubble doesn't read the clock
  // during render itself.
  const [canDeleteForAll, setCanDeleteForAll] = useState(false);
  const [deleteType, setDeleteType] = useState<'me' | 'everyone'>('me');
  const [hasResponded, setHasResponded] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [showOptionsBelow, setShowOptionsBelow] = useState(false);
  // Where the bubble was on screen at the moment it was selected - the
  // floating "selected message" clone and the menu are positioned from this,
  // not from the (now-hidden) original bubble, since the original lives
  // inside the virtualized message list's transformed rows and can't escape
  // that stacking context on its own (see openOptionsMenu).
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);
  // The conversation area's own bounds at the moment of opening - the dim/
  // blur backdrop is sized to exactly this, so the header and the message
  // input stay clear instead of the whole screen dimming.
  const [areaRect, setAreaRect] = useState<DOMRect | null>(null);
  // Drives the pop-in/out transition for the backdrop, clone and menu -
  // false on the first paint after opening, flipped true a frame later so
  // the transition actually has something to animate from.
  const [menuVisible, setMenuVisible] = useState(false);

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const gestureLockRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const bubbleRef = useRef<HTMLDivElement>(null);

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
      setMenuAnchorRect(rect);
      // Enough vertical room above the bubble (within the viewport, not just
      // below the header) to open upward without getting clipped.
      setShowOptionsBelow(rect.top < 160);
    }
    const baseAreaRect = conversationAreaRef?.current?.getBoundingClientRect() ?? null;
    // The message input bar is `position: fixed` (.chat-input-container in
    // index.css, needed to stay pinned above the keyboard), so it doesn't
    // actually shrink the scrollable area's own box - that box's layout
    // height still extends the full remaining space behind the input, just
    // with bottom padding reserved so the last message isn't hidden under
    // it. Clip the blur to the input's real on-screen top edge so it stops
    // there instead of bleeding underneath the input.
    let clippedAreaRect = baseAreaRect;
    if (baseAreaRect) {
      const inputEl = document.querySelector('.chat-input-container');
      const inputTop = inputEl?.getBoundingClientRect().top;
      if (inputTop !== undefined && inputTop >= baseAreaRect.top && inputTop < baseAreaRect.bottom) {
        clippedAreaRect = new DOMRect(baseAreaRect.left, baseAreaRect.top, baseAreaRect.width, inputTop - baseAreaRect.top);
      }
    }
    setAreaRect(clippedAreaRect);
    const messageTimestamp = message.created_at || message.sent_at;
    setCanDeleteForAll(
      isOwnMessage && !!messageTimestamp
        && (Date.now() - new Date(messageTimestamp).getTime()) < DAY_MS
    );
    setIsOptionsOpen(true);
  }, [isSystemMessage, conversationAreaRef, isOwnMessage, message.created_at, message.sent_at]);

  const closeOptionsMenu = useCallback(() => {
    setIsOptionsOpen(false);
  }, []);

  // Play the pop-in transition once the menu actually opens, and make sure
  // scrolling the conversation while it's open closes it instead of leaving
  // the floating clone hanging in a stale position (native 'scroll' events
  // on the messages list don't bubble, so this listens on the capture phase
  // to still catch them from a plain window listener).
  useEffect(() => {
    if (!isOptionsOpen) {
      setMenuVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setMenuVisible(true));
    const handleScroll = () => closeOptionsMenu();
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOptionsOpen, closeOptionsMenu]);

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
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl px-4 py-3 max-w-sm shadow-sm">
          <p className="text-sm text-amber-200 text-center mb-3">{message.message}</p>
          {!hasResponded && onDormancyResponse && (
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => handleDormancyResponse(true)}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-full text-sm font-medium transition-colors"
              >
                Yes ✓
              </button>
              <button
                onClick={() => handleDormancyResponse(false)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm font-medium transition-colors"
              >
                No ✗
              </button>
            </div>
          )}
          {hasResponded && (
            <p className="text-xs text-amber-300 text-center">Response recorded</p>
          )}
        </div>
      </div>
    );
  }

  const swipeTransform = swipeOffset > 0
    ? `translateX(${isOwnMessage ? -swipeOffset * 0.4 : swipeOffset * 0.4}px)`
    : 'translateX(0)';

  // Shared between the real (in-flow) bubble and its floating clone in the
  // selection overlay, so the two always look identical.
  const bubbleClasses = `
    relative max-w-[82%] sm:max-w-lg
    rounded-2xl
    ${isOwnMessage
      ? `bg-gradient-to-br from-rose-500 to-pink-600 text-white border border-rose-300/40 shadow-[0_6px_18px_rgba(236,72,153,0.22)] ${isLastInGroup ? 'rounded-br-md' : ''}`
      : `bg-black/80 text-gray-100 border border-pink-500/30 shadow-[0_3px_10px_rgba(0,0,0,0.4)] ${isLastInGroup ? 'rounded-bl-md' : ''}`
    }
    ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
  `;

  const renderBubbleContent = () => (
    <>
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
              mx-2 mt-0 mb-1 px-3 py-2 rounded-lg border-l-4
              cursor-pointer transition-opacity hover:opacity-80
              ${isOwnMessage
                ? 'bg-white/15 border-white/50'
                : 'bg-pink-500/10 border-pink-400'
              }
            `}
          >
            <p className={`text-[11px] font-semibold truncate ${isOwnMessage ? 'text-white/90' : 'text-pink-300'}`}>
              {repliedMessage.sender_id === currentUser.id
                ? t('chat.you', 'You')
                : repliedMessage.sender?.first_name || 'User'
              }
            </p>
            <p className={`text-[10.5px] leading-snug line-clamp-2 mt-0.5 ${isOwnMessage ? 'text-white/60' : 'text-gray-400'}`}>
              {replyPreviewText}{replyPreviewText.length >= 80 ? '...' : ''}
            </p>
          </div>
        );
      })()}

      {/* Message Content */}
      <div className="px-2.5 pt-1 pb-1">
        <p className={`text-[15px] leading-[1.3] whitespace-pre-wrap break-words ${isDeletedForMe ? 'italic opacity-60' : ''}`}>
          {isDeletedForMe ? t('chat.deleted', 'This message was deleted') : message.message}
        </p>
      </div>

      {/* Timestamp & Read Status - only on the last bubble of a group,
          matching every mainstream chat app's grouping convention (no
          point repeating the same-minute timestamp on every bubble). */}
      {isLastInGroup && (
        <div className={`flex items-center justify-end gap-1 px-2.5 pb-1 pt-0.5 ${isOwnMessage ? 'text-white/70' : 'text-gray-400'}`}>
          <span className="text-[11px]">
            {formatTime(message.sent_at || message.created_at)}
          </span>
          {isOwnMessage && (
            <span className={`flex items-center ${message.is_read ? 'text-white' : 'text-rose-100/80'}`}>
              {message.is_read ? (
                <CheckCheck className="w-3.5 h-3.5" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </span>
          )}
        </div>
      )}
    </>
  );

  // One consistent, clean look for every option - tighter vertical rhythm
  // than before (each row was py-2.5, which read as oversized gaps between
  // Reply/Delete), and no more singling "Delete for everyone" out in red -
  // every option is the same neutral white/gray now.
  const menuItemClass = 'w-full flex items-center gap-2 px-3 py-2 text-[14px] text-gray-100 hover:bg-white/10 active:bg-white/15 transition-colors';

  return (
    <>
      <div
        className={`flex w-full items-end gap-1.5 ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isConsecutive ? 'mt-0.5' : 'mt-2.5'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
        style={{
          transform: swipeTransform,
          transition: gestureLockRef.current === 'horizontal' ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Avatar slot - received messages only. A fixed-width spacer holds
            the bubble's alignment on every bubble in the group; the actual
            avatar only paints on the group's last bubble, exactly like
            iMessage/WhatsApp group threads. */}
        {!isOwnMessage && (
          <div className="w-6 h-6 shrink-0 self-end">
            {isLastInGroup && (
              partnerAvatarUrl ? (
                <img
                  src={partnerAvatarUrl}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-[9px] font-semibold text-pink-300">
                  {partnerInitials}
                </div>
              )
            )}
          </div>
        )}

        {/* The real bubble - hidden (not unmounted, so layout/scroll position
            never jumps) while the selection overlay below shows a floating
            clone of it instead. */}
        <div
          ref={bubbleRef}
          className={bubbleClasses}
          style={isOptionsOpen ? { visibility: 'hidden' } : undefined}
        >
          {renderBubbleContent()}
        </div>
      </div>

      {/* Selection overlay: dims/blurs the conversation area (not the header
          or the message input) and lifts a floating copy of this bubble
          above it, iOS-style. Rendered through a portal straight onto
          <body> - the real bubble lives inside the virtualized message
          list, where a `transform` on every row (needed for react-virtual's
          positioning) creates its own stacking context, so no z-index on
          the menu could ever escape that and clear the chat header above
          it. A portal sidesteps the problem entirely instead of chasing
          z-index numbers.
          The outer div is an invisible full-screen tap-catcher (tapping the
          header or the input while a message is selected should still
          close it, same as tapping anywhere else) - only the inner div,
          sized to the conversation area's own bounds, actually paints the
          dim+blur. */}
      {isOptionsOpen && menuAnchorRect && createPortal(
        <div
          className="fixed inset-0 z-[9999]"
          onClick={closeOptionsMenu}
          onTouchStart={closeOptionsMenu}
        >
          <div
            className={`absolute bg-black/60 backdrop-blur-md transition-opacity duration-200 ease-out ${menuVisible ? 'opacity-100' : 'opacity-0'}`}
            style={
              areaRect
                ? { top: areaRect.top, left: areaRect.left, width: areaRect.width, height: areaRect.height }
                : { top: 0, left: 0, right: 0, bottom: 0 }
            }
          />

          <div
            className="absolute"
            style={{
              top: menuAnchorRect.top,
              left: menuAnchorRect.left,
              width: menuAnchorRect.width,
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* The selected message, lifted above the dimmed backdrop */}
            <div
              className={`${bubbleClasses} transition-all duration-200 ease-out ${menuVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              style={{ transformOrigin: `bottom ${isOwnMessage ? 'right' : 'left'}` }}
            >
              {renderBubbleContent()}
            </div>

            {/* Context Menu */}
            <div
              className={`
                absolute min-w-[168px]
                bg-neutral-900 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.55)] border border-white/10
                py-1 overflow-hidden
                transition-all duration-200 ease-out
                ${menuVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                ${showOptionsBelow ? 'top-full mt-2' : 'bottom-full mb-2'}
                ${isOwnMessage ? 'right-0' : 'left-0'}
              `}
              style={{ transformOrigin: `${showOptionsBelow ? 'top' : 'bottom'} ${isOwnMessage ? 'right' : 'left'}` }}
            >
              {onReply && (
                <button onClick={handleReply} className={menuItemClass}>
                  <Reply className="w-4 h-4 text-gray-300" />
                  {t('chat.reply', 'Reply')}
                </button>
              )}
              {/* "Delete for me" removes it from only your own view - the
                  other person still sees it, on every message regardless of
                  who sent it or how old it is. */}
              <button onClick={handleDeleteForMe} className={menuItemClass}>
                <Trash2 className="w-4 h-4 text-gray-300" />
                {t('chat.deleteForMe', 'Delete for me')}
              </button>
              {/* "Delete for all" removes it for both people - only ever
                  offered for your own messages, and only within 24h of
                  sending (the delete policy enforces the same window
                  server-side, so this button never lingers past what it can
                  actually do). */}
              {canDeleteForAll && (
                <button onClick={handleDeleteForEveryone} className={menuItemClass}>
                  <Trash2 className="w-4 h-4 text-gray-300" />
                  {t('chat.deleteForAll', 'Delete for all')}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

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
    prev.isLastInGroup === next.isLastInGroup &&
    prev.isHighlighted === next.isHighlighted &&
    prev.repliedMessage?.id === next.repliedMessage?.id &&
    prev.partnerAvatarUrl === next.partnerAvatarUrl &&
    prev.partnerInitials === next.partnerInitials
  );
});

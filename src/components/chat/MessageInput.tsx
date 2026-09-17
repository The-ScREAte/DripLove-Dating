import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { X, Smile } from 'lucide-react';
import { containsBadWords } from '@/utils/textModeration';
import { useTranslation } from 'react-i18next';
import { ChatMessage } from '@/types';

// A small, curated set rather than a full emoji-picker library - enough to
// react quickly without pulling in a picker dependency for what's meant to
// be a lightweight one-tap add.
const QUICK_EMOJIS = ['😂', '❤️', '😍', '👍', '🔥', '😢', '😮', '🙏'];

interface MessageInputProps {
  matchId: string | null;
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  replyingTo?: ChatMessage | null;
  onCancelReply?: () => void;
  /** Fired on every draft keystroke (already throttled by the caller) so the
   * partner's header can show "typing...". Purely a broadcast side effect -
   * nothing here depends on its result. */
  onTyping?: () => void;
}

const MessageInput: React.FC<MessageInputProps> = ({
  matchId,
  onSendMessage,
  disabled = false,
  replyingTo,
  onCancelReply,
  onTyping
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close the emoji picker on any tap outside it - same convention as every
  // other popover in the chat UI (message options menu, header's ⋮ menu).
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Clear draft when switching conversations
  useEffect(() => {
    setDraft('');
  }, [matchId]);

  // Keep CSS var --input-bar-height in sync with actual input container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setHeightVar = () => {
      const h = el.offsetHeight;
      document.documentElement.style.setProperty('--input-bar-height', `${h}px`);
    };

    setHeightVar();

    // Observe size changes (reply preview opens/closes, orientation changes, etc.)
    const ro = new ResizeObserver(() => setHeightVar());
    ro.observe(el);

    // Also handle viewport/orientation changes that might affect layout
    const onResize = () => setHeightVar();
    window.addEventListener('resize', onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (containsBadWords(draft)) {
        alert(t('chat.inappropriateLanguage'));
        return;
      }
      if (draft.trim()) {
        onSendMessage(draft.trim());
        setDraft('');
      }
    }
  };

  const handleSend = () => {
    if (containsBadWords(draft)) {
      alert(t('chat.inappropriateLanguage'));
      return;
    }
    if (draft.trim()) {
      onSendMessage(draft.trim());
      setDraft('');
    }
  };

  return (
    <div 
      ref={containerRef}
      className="chat-input-container bg-black border-t border-pink-500/30 shadow-[0_-4px_12px_rgba(0,0,0,0.4)]"
    >
      {/* Reply preview */}
      {replyingTo && (
        <div className="px-4 pt-3 pb-2 bg-black border-b border-pink-500/20">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <div className="w-1 h-8 bg-pink-500 rounded-full"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-300">
                    Replying to {replyingTo.sender?.first_name || 'User'}
                  </p>
                  <p className="text-sm text-gray-100 truncate">
                    {replyingTo.message}
                  </p>
                </div>
              </div>
            </div>
            {onCancelReply && (
              <button
                onClick={onCancelReply}
                className="ml-2 p-1 hover:bg-white/10 rounded-full"
                aria-label="Cancel reply"
              >
                <X className="w-4 h-4 text-gray-300" />
              </button>
            )}
          </div>
        </div>
      )}
      
      <div className="p-1.5 relative">
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className="absolute bottom-full left-1.5 mb-2 flex gap-1 p-2 bg-black border border-pink-500/30 rounded-2xl shadow-lg"
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setDraft((prev) => prev + emoji);
                  setShowEmojiPicker(false);
                  inputRef.current?.focus();
                }}
                className="text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center space-x-2">
          <div className="flex-1 flex items-center space-x-1.5 bg-black rounded-full pl-2 pr-4 py-0.5 border-2 border-pink-600 shadow-sm">
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              disabled={disabled}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-pink-400 hover:bg-pink-500/10 transition-colors disabled:opacity-50"
              aria-label={t('chat.addEmoji')}
            >
              <Smile className="w-[18px] h-[18px]" />
            </button>
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value.trim()) onTyping?.();
              }}
              onKeyPress={handleKeyPress}
              placeholder={t('chat.typeMessage')}
              className="flex-1 h-7 rounded-md border-none text-base text-white file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-gray-400 outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm bg-transparent p-0"
              disabled={disabled}
              style={{ fontSize: '16px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!draft.trim() || disabled}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 rounded-full w-9 h-9 p-0 shrink-0 ${
              draft.trim() && !disabled
                ? 'bg-pink-600 border-2 border-pink-600 text-white hover:bg-pink-700 shadow-[0_2px_10px_rgba(236,72,153,0.5)]'
                : 'bg-transparent border-2 border-gray-700 text-gray-600'
            }`}
            aria-label={t('chat.sendMessage')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-send w-4 h-4" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ⭐ REACT.MEMO: Prevent re-renders when props haven't changed
export default React.memo(MessageInput);

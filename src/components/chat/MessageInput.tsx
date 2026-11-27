import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Send, Smile, X } from 'lucide-react';
import { containsBadWords } from '@/utils/textModeration';
import { useTranslation } from 'react-i18next';
import { ChatMessage } from '@/types';
import { useBackClose } from '@/utils/backStack';

// A small, curated set rather than a full emoji-picker library - enough to
// react quickly without pulling in a picker dependency for what's meant to
// be a lightweight one-tap add.
const QUICK_EMOJIS = ['😂', '❤️', '😍', '👍', '🔥', '😢', '😮', '🙏'];

// The field grows with what's typed, up to about five lines, then scrolls.
const MAX_FIELD_HEIGHT_PX = 120;

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
  /** Puts text into the draft (e.g. a tapped icebreaker). The nonce makes the
   * same text applicable twice. It is never sent automatically. */
  prefill?: { text: string; nonce: number } | null;
}

const MessageInput: React.FC<MessageInputProps> = ({
  matchId,
  onSendMessage,
  disabled = false,
  replyingTo,
  onCancelReply,
  onTyping,
  prefill,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  // Android hardware back closes the emoji picker first.
  useBackClose(showEmojiPicker, () => setShowEmojiPicker(false));

  // Clear the draft when switching conversations. (State is adjusted during
  // render rather than in an effect, so the old draft never paints in the new chat.)
  const [draftMatchId, setDraftMatchId] = useState<string | null>(matchId);
  if (draftMatchId !== matchId) {
    setDraftMatchId(matchId);
    setDraft('');
    setWarning(null);
  }

  // Apply a prefill (icebreaker) to the draft - once per nonce.
  const [appliedPrefillNonce, setAppliedPrefillNonce] = useState<number | null>(null);
  if (prefill && prefill.nonce !== appliedPrefillNonce) {
    setAppliedPrefillNonce(prefill.nonce);
    setDraft(prefill.text);
  }

  // ...then focus the field with the cursor at the end.
  useEffect(() => {
    if (!prefill) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = prefill.text.length;
    const id = requestAnimationFrame(() => el.setSelectionRange(end, end));
    return () => cancelAnimationFrame(id);
  }, [prefill]);

  // Auto-grow the field with its content (capped), before paint so it never flashes.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_FIELD_HEIGHT_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_FIELD_HEIGHT_PX ? 'auto' : 'hidden';
  }, [draft]);

  // The language warning clears itself.
  useEffect(() => {
    if (!warning) return;
    const id = window.setTimeout(() => setWarning(null), 3500);
    return () => window.clearTimeout(id);
  }, [warning]);

  // Keep CSS var --input-bar-height in sync with actual input container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setHeightVar = () => {
      const h = el.offsetHeight;
      document.documentElement.style.setProperty('--input-bar-height', `${h}px`);
    };

    setHeightVar();

    // Observe size changes (reply preview opens/closes, the field grows, orientation changes, etc.)
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

  const submit = () => {
    if (containsBadWords(draft)) {
      setWarning(t('chat.inappropriateLanguage'));
      return;
    }
    if (draft.trim()) {
      onSendMessage(draft.trim());
      setDraft('');
      setWarning(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter makes a new line (the IME composition Enter must not send).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = !!draft.trim() && !disabled;

  return (
    <div
      ref={containerRef}
      className="chat-input-container bg-black border-t border-white/10 shadow-[0_-4px_12px_rgba(0,0,0,0.4)]"
    >
      {/* Reply preview */}
      {replyingTo && (
        <div className="dl-rise border-b border-white/10 bg-white/[0.03] px-4 pb-2 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="h-9 w-1 shrink-0 rounded-full bg-brand-gradient" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-brand-ink">
                  {t('chat.replyingTo', { name: replyingTo.sender?.first_name || 'User' })}
                </p>
                <p className="truncate text-sm text-white/80">{replyingTo.message}</p>
              </div>
            </div>
            {onCancelReply && (
              <button
                type="button"
                onClick={onCancelReply}
                className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10"
                aria-label={t('chat.cancelReply')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {warning && (
        <p role="alert" className="dl-rise px-4 pt-2 text-xs font-medium text-danger">
          {warning}
        </p>
      )}

      <div className="relative py-2" style={{ paddingLeft: 'max(0.5rem, env(safe-area-inset-left))', paddingRight: 'max(0.5rem, env(safe-area-inset-right))' }}>
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className="dl-pop absolute bottom-full left-2 mb-2 flex gap-0.5 rounded-2xl border border-white/10 bg-neutral-950 p-1.5 shadow-lg"
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
                className="dl-press grid h-10 w-10 place-items-center rounded-full text-xl transition-colors hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 items-end gap-1 rounded-[22px] border border-white/15 bg-white/[0.06] pl-1 pr-3 transition-colors focus-within:border-brand/70">
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              disabled={disabled}
              className="dl-press grid h-11 w-11 shrink-0 place-items-center rounded-full text-brand-ink transition-colors hover:bg-brand/10 disabled:opacity-50"
              aria-label={t('chat.addEmoji')}
              aria-expanded={showEmojiPicker}
            >
              <Smile className="h-5 w-5" />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value.trim()) onTyping?.();
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.typeMessage')}
              aria-label={t('chat.typeMessage')}
              enterKeyHint="send"
              autoComplete="off"
              className="min-h-[44px] flex-1 resize-none appearance-none select-text self-center rounded-none bg-transparent py-[11px] text-base leading-[22px] text-white outline-none placeholder:text-white/40 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"
              disabled={disabled}
              style={{ fontSize: '16px', outline: 'none' }}
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            key={canSend ? 'send-on' : 'send-off'}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow,color] duration-150 disabled:pointer-events-none [&_svg]:pointer-events-none ${
              canSend
                ? 'dl-pop dl-press bg-brand-gradient text-white shadow-dl-brand'
                : 'border border-white/15 bg-white/[0.04] text-white/35'
            }`}
            aria-label={t('chat.sendMessage')}
          >
            <Send className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ⭐ REACT.MEMO: Prevent re-renders when props haven't changed
export default React.memo(MessageInput);

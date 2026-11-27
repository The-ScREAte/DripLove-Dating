import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Ban, BadgeCheck, Flag, MoreVertical, Trash2, User } from 'lucide-react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';
import { calculateAgeOrNull } from '@/utils/dateUtils';
import { useBackClose } from '@/utils/backStack';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

interface ChatHeaderProps {
  selectedMatch: ChatMatch;
  onBack: () => void;
  onUserProfileOpen: (userId: string) => void;
  onBlockUser: (user: ChatMatch) => void;
  onDeleteChat: () => void;
  onReport?: (messageId?: string) => void;
  onTestNotification?: () => void;
  isMobile?: boolean;
  currentUserId?: string;
  /** True while the partner is actively typing in this conversation - takes
   * over the status line ("typing...") the same way every mainstream chat
   * app does, so it doesn't need its own separate slot in the header. */
  isPartnerTyping?: boolean;
}

// Anything logged in within this window reads as "Active now" - matches the
// same order-of-magnitude window Circle uses for its own "recently active"
// signal (see CirclePage's ACTIVE_WINDOW_MS), just much tighter since this is
// meant to approximate real presence, not "used the app recently at all".
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedMatch,
  onBack,
  onUserProfileOpen,
  onBlockUser,
  onDeleteChat,
  onReport,
  onTestNotification,
  isMobile = false,
  currentUserId,
  isPartnerTyping = false
}) => {
  const { t } = useTranslation();
  // Determine partner ID correctly
  const partnerId = selectedMatch.partner?.id ||
                   (selectedMatch.user1_id === currentUserId ? selectedMatch.user2_id : selectedMatch.user1_id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [partnerLastLoginAt, setPartnerLastLoginAt] = useState<string | null>(null);
  // Recomputed every 30s so "Active now" correctly ages into "Last seen Xm
  // ago" while the conversation stays open, instead of freezing at whatever
  // it read on first fetch.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Fetch partner's last-login timestamp - the only real presence signal
  // this app tracks (there's no live "online" flag/presence channel), so
  // "Active now" is an approximation: logged in within the last few minutes.
  useEffect(() => {
    const fetchPartnerStatus = async () => {
      if (!partnerId) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('last_login_at')
          .eq('id', partnerId)
          .single();

        if (!error && data?.last_login_at) {
          setPartnerLastLoginAt(data.last_login_at);
        }
      } catch (err) {
        console.error('Error fetching partner status:', err);
      }
    };

    fetchPartnerStatus();
  }, [partnerId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const { statusText, isOnline } = React.useMemo(() => {
    if (!partnerLastLoginAt) return { statusText: t('chat.activeOnDripLove'), isOnline: false };
    const diffMs = nowTick - new Date(partnerLastLoginAt).getTime();
    if (diffMs < ONLINE_WINDOW_MS) return { statusText: t('chat.activeNow'), isOnline: true };
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return { statusText: t('chat.lastSeenMinutesAgo', { minutes }), isOnline: false };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { statusText: t('chat.lastSeenHoursAgo', { hours }), isOnline: false };
    const days = Math.floor(hours / 24);
    if (days < 7) return { statusText: t('chat.lastSeenDaysAgo', { days }), isOnline: false };
    return { statusText: t('chat.lastSeenLongAgo'), isOnline: false };
  }, [partnerLastLoginAt, nowTick, t]);
  // Android hardware back (and Escape on the web) closes the overflow menu first.
  useBackClose(menuOpen, () => setMenuOpen(false));
  // Click outside to close menu
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const age = calculateAgeOrNull(selectedMatch.date_of_birth);
  const fullName = `${selectedMatch.first_name} ${selectedMatch.last_name}`.trim();

  const menuItem =
    'flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm text-white/90 transition-colors hover:bg-white/10 active:bg-white/15 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-white/60';

  return (
    <div className="relative" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.9))' }}>
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <div className="flex min-w-0 items-center gap-1">
          {isMobile && (
            <Button variant="quiet" size="iconMd" className="shrink-0 text-white" onClick={onBack} aria-label={t('chat.goBack')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <button
            type="button"
            onClick={() => onUserProfileOpen(partnerId)}
            className="dl-press flex min-w-0 items-center gap-3 rounded-2xl py-1 pl-1 pr-3 text-left outline-none focus-visible:bg-white/[0.06]"
            aria-label={t('chat.viewProfile')}
          >
            <span className="relative shrink-0">
              <ChatUserAvatar userId={partnerId} firstName={selectedMatch.first_name} lastName={selectedMatch.last_name} size="custom" className="h-11 w-11" />
              {isOnline && (
                <span
                  className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-black bg-success"
                  role="img"
                  aria-label={t('chat.activeNow')}
                />
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold text-white sm:text-base">
                  {fullName}
                  {age !== null && <span className="font-normal text-white/70">, {age}</span>}
                </span>
                {selectedMatch.is_verified && (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-brand" aria-label={t('chat.verified')} />
                )}
              </span>
              <span
                className={`mt-0.5 block truncate text-xs ${isPartnerTyping ? 'font-medium text-brand-ink' : isOnline ? 'text-success' : 'text-white/50'}`}
                aria-live="polite"
              >
                {isPartnerTyping ? t('chat.typing') : statusText}
              </span>
            </span>
          </button>
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <Button
            variant="quiet"
            size="iconMd"
            className="text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            onContextMenu={(e) => e.preventDefault()}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
          >
            <span className="sr-only">{t('chat.moreOptions')}</span>
            <MoreVertical className="h-5 w-5" />
          </Button>

          {menuOpen && (
            <div role="menu" className="dl-pop absolute right-1 top-12 z-[999999] w-56 origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
              <button
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onUserProfileOpen(partnerId);
                }}
              >
                <User />
                {t('chat.viewProfile')}
              </button>
              <button
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  // delegate to parent to open the report dialog; allow undefined message id
                  onReport?.(selectedMatch.last_message_obj?.id);
                }}
              >
                <Flag />
                {t('chat.report')}
              </button>
              <button
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteChat();
                }}
              >
                <Trash2 />
                {t('chat.deleteChat')}
              </button>
              <div className="my-1 h-px bg-white/10" />
              <button
                role="menuitem"
                className={`${menuItem} !text-danger hover:!bg-danger/10 [&_svg]:!text-danger`}
                onClick={() => {
                  onBlockUser(selectedMatch);
                  setMenuOpen(false);
                }}
              >
                <Ban />
                {t('chat.blockUser')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ⭐ REACT.MEMO: Prevent re-renders when props haven't changed
export default React.memo(ChatHeader);

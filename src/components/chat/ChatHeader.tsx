import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';
import { createPortal } from 'react-dom';
import ReportModal from '@/components/ReportModal';
import { useToast } from '@/hooks/use-toast';
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
  const [openReport, setOpenReport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [partnerLastLoginAt, setPartnerLastLoginAt] = useState<string | null>(null);
  // Recomputed every 30s so "Active now" correctly ages into "Last seen Xm
  // ago" while the conversation stays open, instead of freezing at whatever
  // it read on first fetch.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const { toast } = useToast();
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
  // Click outside to close menu
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as any);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as any);
    };
  }, [menuOpen]);

  return (
    <div
      className="relative border-b border-pink-500/30 shadow-[0_6px_14px_rgba(0,0,0,0.4)]"
      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.9))' }}
    >
      <div className="flex items-center px-4 py-2.5 sm:py-3 justify-between">
      <div className="flex items-center space-x-3">
        {isMobile && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="p-2 rounded-full text-white hover:bg-pink-500/20"
            aria-label={t('chat.goBack')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div className="relative shrink-0">
          <ChatUserAvatar
            userId={partnerId}
            firstName={selectedMatch.first_name}
            lastName={selectedMatch.last_name}
            onClick={() => onUserProfileOpen(partnerId)}
          />
          {isOnline && (
            <span
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-black"
              aria-label={t('chat.activeNow')}
            />
          )}
        </div>
        <div className="leading-tight">
          <h3 className="font-semibold text-white text-[15px] sm:text-base">
            {selectedMatch.first_name} {selectedMatch.last_name}
          </h3>
          <p className={`text-xs sm:text-sm mt-0.5 ${isPartnerTyping ? 'text-pink-400 font-medium' : isOnline ? 'text-green-400' : 'text-gray-400'}`}>
            {isPartnerTyping ? t('chat.typing') : statusText}
          </p>
        </div>
  </div>
      
      <div ref={menuRef}>
        <Button
          variant="ghost"
          size="sm"
          className="p-2 rounded-full text-white hover:bg-pink-500/20"
          onClick={() => setMenuOpen(!menuOpen)}
          onContextMenu={(e) => e.preventDefault()}
          style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
        >
          <span className="sr-only">{t('chat.moreOptions')}</span>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </Button>

        {menuOpen && (
          <div className="absolute top-14 right-3 z-[999999]">
              <div className="w-max overflow-hidden rounded-md border border-pink-500/30 bg-black p-1.5 shadow-lg divide-y divide-pink-500/20">
                <button
                  className="block text-left px-2 py-2 text-sm text-gray-100 hover:bg-pink-500/15 whitespace-nowrap"
                  onClick={() => {
                    setMenuOpen(false);
                    // delegate to parent to open the report dialog; allow undefined message id
                    onReport?.(selectedMatch.last_message_obj?.id);
                  }}
                >
                  {t('chat.report')}
                </button>
                <button
                  className="block text-left px-2 py-2 text-sm text-gray-100 hover:bg-pink-500/15 whitespace-nowrap"
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteChat();
                  }}
                >
                  {t('chat.deleteChat')}
                </button>
                <button
                  className="block text-left px-2 py-2 text-sm text-red-400 hover:bg-red-500/10 whitespace-nowrap"
                  onClick={() => { onBlockUser(selectedMatch); setMenuOpen(false); }}
                >
                  {t('chat.blockUser')}
                </button>
              </div>
            </div>
          )}

        <ReportModal
          open={Boolean(openReport)}
          onClose={() => setOpenReport(false)}
          reporterId={currentUserId || ''}
          reportedUserId={partnerId || ''}
          contentId={selectedMatch.last_message_obj?.id}
        />
      </div>
      </div>
    </div>
  );
};

// ⭐ REACT.MEMO: Prevent re-renders when props haven't changed
export default React.memo(ChatHeader);

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';
import { createPortal } from 'react-dom';
import ReportModal from '@/components/ReportModal';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { getLanguageName } from '@/utils/languageNames';

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
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedMatch,
  onBack,
  onUserProfileOpen,
  onBlockUser,
  onDeleteChat,
  onReport,
  onTestNotification,
  isMobile = false,
  currentUserId
}) => {
  const { t } = useTranslation();
  // Determine partner ID correctly
  const partnerId = selectedMatch.partner?.id ||
                   (selectedMatch.user1_id === currentUserId ? selectedMatch.user2_id : selectedMatch.user1_id);
  const [openReport, setOpenReport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [partnerLanguage, setPartnerLanguage] = useState<string | null>(null);
  const { toast } = useToast();
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Fetch partner's preferred language
  useEffect(() => {
    const fetchPartnerLanguage = async () => {
      if (!partnerId) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('preferred_language')
          .eq('id', partnerId)
          .single();
        
        if (!error && data?.preferred_language) {
          const languageName = getLanguageName(data.preferred_language);
          setPartnerLanguage(languageName);
        }
      } catch (err) {
        console.error('Error fetching partner language:', err);
      }
    };

    fetchPartnerLanguage();
  }, [partnerId]);
  // Platform-specific safe area padding
  const platform = Capacitor.getPlatform();
  const paddingTopValue = platform === 'ios' 
    ? 'clamp(70px, calc(env(safe-area-inset-top, 10px) + 50px), 90px)' 
    : platform === 'android' 
    ? '72px' 
    : '72px'; // Increased from 56px to 72px for better visibility on web

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
      className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-pink-200 shadow-[0_6px_14px_rgba(15,23,42,0.10)]"
      style={{ paddingTop: paddingTopValue }}
    >
      <div className="flex items-center px-4 py-3 justify-between">
      <div className="flex items-center space-x-3">
        {isMobile && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="p-2"
            aria-label={t('chat.goBack')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <ChatUserAvatar
          userId={partnerId}
          firstName={selectedMatch.first_name}
          lastName={selectedMatch.last_name}
          onClick={() => onUserProfileOpen(partnerId)}
        />
        <div>
          <h3 className="font-semibold text-gray-900">
            {selectedMatch.first_name} {selectedMatch.last_name}
          </h3>
          <p className="text-sm text-gray-500">
            {partnerLanguage ? t('chat.speaks', { language: partnerLanguage }) : t('chat.activeOnDripLove')}
          </p>
        </div>
  </div>
      
      <div ref={menuRef}>
        <Button
          variant="ghost"
          size="sm"
          className="p-2"
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
            <div className="absolute top-16 right-4 z-[999999]">
              <div className="w-max overflow-hidden rounded-md border border-pink-200 bg-white p-1.5 shadow-lg divide-y divide-pink-200">
                <button
                  className="block text-left px-2 py-2 text-sm hover:bg-pink-100 whitespace-nowrap"
                  onClick={() => {
                    setMenuOpen(false);
                    // delegate to parent to open the report dialog; allow undefined message id
                    onReport?.(selectedMatch.last_message_obj?.id);
                  }}
                >
                  {t('chat.report')}
                </button>
                <button
                  className="block text-left px-2 py-2 text-sm hover:bg-pink-100 whitespace-nowrap"
                  onClick={() => { 
                    setMenuOpen(false);
                    onDeleteChat();
                  }}
                >
                  {t('chat.deleteChat')}
                </button>
                <button
                  className="block text-left px-2 py-2 text-sm text-red-600 hover:bg-red-50 whitespace-nowrap"
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

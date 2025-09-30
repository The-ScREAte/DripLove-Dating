import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ChatMatch } from '@/types';
import ChatUserAvatar from '../ChatUserAvatar';
import { createPortal } from 'react-dom';
import ReportModal from '@/components/ReportModal';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ChatHeaderProps {
  selectedMatch: ChatMatch;
  onBack: () => void;
  onUserProfileOpen: (userId: string) => void;
  onBlockUser: (user: ChatMatch) => void;
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
  onReport,
  onTestNotification,
  isMobile = false,
  currentUserId
}) => {
  // Determine partner ID correctly
  const partnerId = selectedMatch.partner?.id ||
                   (selectedMatch.user1_id === currentUserId ? selectedMatch.user2_id : selectedMatch.user1_id);
  const [openReport, setOpenReport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast } = useToast();
  // Globally clamp the safe-area inset so we have a sensible minimum and
  // maximum across platforms. This gives a minimum breathing room on
  // Android/web and prevents extremely tall headers on devices with very
  // large safe insets.
  // Use reasonable min/max for the top inset
  const paddingTopValue = 'clamp(50px, env(safe-area-inset-top, 0px), 24px)';

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200"
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
            aria-label="Go back to chat list"
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
          <p className="text-sm text-gray-500">Active on DripLove</p>
        </div>
  </div>
      
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          onContextMenu={(e) => e.preventDefault()}
          style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
        >
          <span className="sr-only">More options</span>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </Button>

        {menuOpen &&
          createPortal(
            <div className="fixed top-20 right-4 z-[999999]">
              <div className="min-w-[160px] overflow-hidden rounded-md border bg-white p-4 shadow-lg space-y-1">
                <button
                  className="w-full text-left px-4 py-3 text-sm"
                  onClick={() => {
                    setMenuOpen(false);
                    // delegate to parent to open the report dialog; allow undefined message id
                    onReport?.(selectedMatch.last_message_obj?.id);
                  }}
                >
                  Report
                </button>
                <button
                  className="w-full text-left px-4 py-3 text-sm text-red-600"
                  onClick={() => { onBlockUser(selectedMatch); setMenuOpen(false); }}
                >
                  Block User
                </button>
              </div>
            </div>,
            document.body
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

export default ChatHeader;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import ChatUserAvatar from '@/components/ChatUserAvatar';

interface ChatEmptyConversationProps {
  currentUserId: string;
  currentFirstName?: string;
  currentLastName?: string;
  partnerId: string;
  partnerFirstName: string;
  partnerLastName?: string;
  /** Fills the composer with the chosen opener - never sends on its own. */
  onPickIcebreaker: (text: string) => void;
}

const ICEBREAKER_KEYS = ['chat.icebreaker1', 'chat.icebreaker2', 'chat.icebreaker3'] as const;

/**
 * Shown for a brand-new match with no messages yet: a "you matched" card with
 * both photos and a few tasteful openers the user can tap to start from.
 */
const ChatEmptyConversation: React.FC<ChatEmptyConversationProps> = ({
  currentUserId,
  currentFirstName,
  currentLastName,
  partnerId,
  partnerFirstName,
  partnerLastName,
  onPickIcebreaker,
}) => {
  const { t } = useTranslation();
  return (
    <div className="dl-rise mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center px-4 py-6 text-center">
      <div className="relative mb-5 flex items-center justify-center" aria-hidden="true">
        <ChatUserAvatar
          userId={currentUserId}
          firstName={currentFirstName}
          lastName={currentLastName}
          size="custom"
          className="h-20 w-20 ring-2 ring-brand/60 ring-offset-2 ring-offset-black"
        />
        <span className="dl-pop z-10 -mx-3 grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-brand-gradient text-white shadow-dl-brand">
          <Heart className="h-4 w-4 fill-current" />
        </span>
        <ChatUserAvatar
          userId={partnerId}
          firstName={partnerFirstName}
          lastName={partnerLastName}
          size="custom"
          className="h-20 w-20 ring-2 ring-brand/60 ring-offset-2 ring-offset-black"
        />
      </div>

      <h3 className="text-lg font-bold text-white">{t('chat.matchedWith', { name: partnerFirstName })}</h3>
      <p className="mt-1 text-sm text-white/65">{t('chat.matchedAgo')}</p>

      <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-white/45">{t('chat.icebreakersTitle')}</p>
      <div className="flex w-full flex-col gap-2">
        {ICEBREAKER_KEYS.map((key) => {
          const text = t(key, { name: partnerFirstName });
          return (
            <Chip
              key={key}
              onClick={() => onPickIcebreaker(text)}
              className="h-auto min-h-[44px] w-full justify-start whitespace-normal rounded-2xl px-4 py-2.5 text-left leading-snug"
            >
              {text}
            </Chip>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(ChatEmptyConversation);

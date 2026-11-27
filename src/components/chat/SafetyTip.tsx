import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, X } from 'lucide-react';

const KEY_PREFIX = 'driplove_chat_safety_tip_dismissed_v1:';

const isDismissed = (matchId: string): boolean => {
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${matchId}`) !== null;
  } catch {
    return false;
  }
};

/**
 * A quiet "stay safe" reminder above the conversation. Dismissing it is
 * remembered per match, so it never nags twice in the same chat.
 */
const SafetyTip: React.FC<{ matchId: string }> = ({ matchId }) => {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState<boolean>(() => isDismissed(matchId));
  // On short screens the tip is one line (tap to read it all) so it never eats the conversation.
  const [expanded, setExpanded] = useState(false);

  // Each conversation has its own dismissal.
  useEffect(() => {
    setHidden(isDismissed(matchId));
  }, [matchId]);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(`${KEY_PREFIX}${matchId}`, String(Date.now()));
    } catch {
      // storage unavailable - it just shows again next time
    }
  };

  return (
    <div
      role="note"
      className="dl-rise flex shrink-0 [@media(max-height:500px)]:hidden items-start gap-2.5 border-b border-white/10 bg-brand/[0.07] px-4 py-2 [@media(min-height:760px)]:py-2.5"
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden="true" />
      <p
        className={`min-w-0 flex-1 text-xs leading-snug text-white/75 ${expanded ? '' : 'line-clamp-1 [@media(min-height:760px)]:line-clamp-none'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-semibold text-white">{t('chat.staySafeTitle')}.</span> {t('chat.staySafeBody')}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('chat.dismiss')}
        className="-mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default React.memo(SafetyTip);

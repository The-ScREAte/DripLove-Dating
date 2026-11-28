import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { getIcebreakerForMatch, type MatchIcebreaker } from '@/services/icebreaker';
import { formatCountdown, msUntil } from '@/utils/icebreaker';
import './icebreaker.css';

// One shared once-a-second clock (stops when no timer is on screen).
let now = Date.now();
let timer: number | null = null;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  if (timer === null) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
};
export const useNow = (): number => useSyncExternalStore(subscribe, () => now, () => now);

/** A hello chat: the sender may send this many messages (the hello included) before the other person replies. */
export const ICEBREAKER_MAX_UNANSWERED = 2;

const Pill: React.FC<{ info: MatchIcebreaker; mySentCount: number }> = ({ info, mySentCount }) => {
  const { t } = useTranslation();
  const left = msUntil(info.expiresAt, useNow());
  if (left <= 0) return null; // the server removes the unanswered chat a few minutes later
  const time = formatCountdown(left);
  const label = info.mine
    ? t('icebreaker.chatTimer.waitingAria', 'Waiting for a reply, {{time}} left', { time })
    : t('icebreaker.chatTimer.toReplyAria', '{{time}} left to reply', { time });
  return (
    <div className="ice-chat-timer-row">
      <span className={`ice-chat-timer ${left < 3600_000 ? 'is-urgent' : ''}`.trim()} role="timer" aria-label={label}>
        <Clock aria-hidden="true" />
        {info.mine ? (
          <>
            <span aria-hidden="true">{t('icebreaker.chatTimer.waiting', 'Waiting for a reply')}</span>
            <span className="ice-chat-timer-dot" aria-hidden="true" />
            <span className="ice-chat-timer-time" aria-hidden="true">{time}</span>
          </>
        ) : (
          <>
            <span className="ice-chat-timer-time" aria-hidden="true">{time}</span>
            <span aria-hidden="true">{t('icebreaker.chatTimer.toReply', 'to reply')}</span>
          </>
        )}
      </span>
      {info.mine && (
        <span className="ice-chat-timer-note">
          {mySentCount >= ICEBREAKER_MAX_UNANSWERED
            ? t('icebreaker.chatTimer.waitNote', 'You can send more once they reply')
            : t('icebreaker.chatTimer.oneMore', 'You can send 1 more message until they reply')}
        </span>
      )}
    </div>
  );
};

/**
 * The 24 hour clock of a conversation that a "Break the ice" hello opened: one small centred pill under the chat
 * header. Re-checked whenever the number of messages changes, so it disappears as soon as the other person replies.
 * Renders nothing when there is no running clock or the backend doesn't have it yet.
 */
export const IcebreakerChatTimer: React.FC<{ matchId: string; myId?: string | null; messageCount: number; mySentCount?: number }> = ({ matchId, myId, messageCount, mySentCount = 0 }) => {
  const [info, setInfo] = useState<{ matchId: string; value: MatchIcebreaker | null } | null>(null);
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setResumeTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    let alive = true;
    void getIcebreakerForMatch(matchId, myId).then((value) => {
      if (alive) setInfo({ matchId, value });
    });
    return () => {
      alive = false;
    };
  }, [matchId, myId, messageCount, resumeTick]);

  const value = info && info.matchId === matchId ? info.value : null;
  if (!value || !value.pending || !value.expiresAt) return null;
  return <Pill info={value} mySentCount={mySentCount} />;
};

export default IcebreakerChatTimer;

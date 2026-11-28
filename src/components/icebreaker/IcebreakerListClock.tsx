import React, { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCountdown, msUntil } from '@/utils/icebreaker';
import { useNow } from './IcebreakerChatTimer';
import './icebreaker.css';

// Running 24h clocks for the Chat list: one small query for every hello chat I'm in (RLS returns only rows where I'm
// the sender or the recipient), refreshed every minute and when the app comes back to the front.
type Clock = { expiresAt: string; mine: boolean };
let clocks = new Map<string, Clock>();
let loadedFor: string | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function refresh(myId: string) {
  try {
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { gt: (k: string, v: string) => Promise<{ data: Array<{ match_id: string | null; expires_at: string; sender_id: string }> | null; error: unknown }> } } };
    })
      .from('icebreakers')
      .select('match_id, expires_at, sender_id')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    if (error || !data) return;
    const next = new Map<string, Clock>();
    for (const r of data) if (r.match_id) next.set(r.match_id, { expiresAt: r.expires_at, mine: r.sender_id === myId });
    clocks = next;
    emit();
  } catch {
    /* the list simply shows no clocks */
  }
}

function useClocks(myId: string): Map<string, Clock> {
  useEffect(() => {
    if (!myId) return undefined;
    if (loadedFor !== myId) {
      loadedFor = myId;
      clocks = new Map();
    }
    void refresh(myId);
    if (timer === null) timer = window.setInterval(() => void refresh(myId), 60_000);
    const onVisible = () => {
      if (!document.hidden) void refresh(myId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
  }, [myId]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => clocks,
    () => clocks
  );
}

/** Loads the clocks once for the whole list (render once near the top of the Chat list). */
export const IcebreakerClocksLoader: React.FC<{ myId: string }> = ({ myId }) => {
  useClocks(myId);
  return null;
};

/** The small running clock on one Chat list row (renders nothing for normal chats). */
export const IcebreakerListClock: React.FC<{ matchId: string }> = ({ matchId }) => {
  const { t } = useTranslation();
  const all = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => clocks,
    () => clocks
  );
  const c = all.get(matchId);
  const now = useNow();
  if (!c) return null;
  const left = msUntil(c.expiresAt, now);
  if (left <= 0) return null;
  const time = formatCountdown(left);
  return (
    <span
      className={`ice-list-clock ${left < 3600_000 ? 'is-urgent' : ''}`.trim()}
      role="timer"
      aria-label={c.mine ? t('icebreaker.chatTimer.waitingAria', 'Waiting for a reply, {{time}} left', { time }) : t('icebreaker.chatTimer.toReplyAria', '{{time}} left to reply', { time })}
    >
      <Clock aria-hidden="true" />
      <span aria-hidden="true">{time}</span>
    </span>
  );
};

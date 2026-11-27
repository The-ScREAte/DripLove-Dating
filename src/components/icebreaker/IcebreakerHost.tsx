import React, { Suspense, lazy, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { uniqueTopic } from '@/utils/realtime';
import { requestPopup } from '@/popups';
import { refreshInbox, useIcebreakerAvailable, getInbox } from '@/services/icebreaker';
import { setIcebreakerHandlers, useIcebreakerUi } from './store';

const IcebreakerSheet = lazy(() => import('./IcebreakerSheet'));
const IcebreakerInbox = lazy(() => import('./IcebreakerInbox'));

interface Props {
  userId?: string | null;
  openChat: (matchId?: string | null) => void;
  openPremium: () => void;
  isPremium?: boolean;
}

/**
 * Mounted ONCE in MainApp. Draws the composer sheet and the inbox, keeps the inbox fresh
 * (realtime) and asks the popup coordinator for the "someone broke the ice" heads-up.
 * Does nothing at all while the backend migration isn't applied.
 */
const IcebreakerHost: React.FC<Props> = ({ userId, openChat, openPremium, isPremium }) => {
  const ui = useIcebreakerUi();
  const available = useIcebreakerAvailable();

  useEffect(() => {
    setIcebreakerHandlers({ openChat, openPremium, isPremium });
  }, [openChat, openPremium, isPremium]);

  // First fetch (also probes whether the backend exists).
  useEffect(() => {
    if (!userId) return;
    void refreshInbox();
  }, [userId]);

  // Live updates once we know the table exists.
  useEffect(() => {
    if (!userId || available !== true) return undefined;
    const known = new Set(getInbox().items.map((i) => i.id));
    // Re-reads the inbox and announces anything we hadn't seen (realtime push OR coming back to the app).
    const check = () => {
      void refreshInbox().then((items) => {
        const fresh = items.find((i) => !known.has(i.id));
        items.forEach((i) => known.add(i.id));
        if (fresh) requestPopup('icebreaker-received', { name: fresh.firstName, photoUrl: fresh.photoUrl }, { ttlMs: 60_000 });
      });
    };
    // Realtime events are lost while the socket sleeps in the background: re-check on resume.
    let lastResume = 0;
    const onResume = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      if (now - lastResume < 20_000) return;
      lastResume = now;
      check();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', onResume);
    const resumeHandle = CapacitorApp.addListener('resume', onResume);
    const channel = supabase
      .channel(uniqueTopic(`icebreakers-in-${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'icebreakers', filter: `recipient_id=eq.${userId}` }, check)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'icebreakers', filter: `recipient_id=eq.${userId}` }, () => {
        void refreshInbox();
      })
      .subscribe();
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', onResume);
      resumeHandle.then((l) => l.remove()).catch(() => {});
      void supabase.removeChannel(channel);
    };
  }, [userId, available]);

  // Backend not applied yet: no inbox, no live updates - but "Say hi" still opens the composer, which
  // then runs in copy mode ("Copy message"), so the flow is usable and nothing errors.
  if (available === false) {
    return ui.target ? (
      <Suspense fallback={null}>
        <IcebreakerSheet key={ui.target.id} target={ui.target} />
      </Suspense>
    ) : null;
  }
  return (
    <Suspense fallback={null}>
      {ui.target && <IcebreakerSheet key={ui.target.id} target={ui.target} />}
      {ui.inboxOpen && <IcebreakerInbox />}
    </Suspense>
  );
};

export default IcebreakerHost;

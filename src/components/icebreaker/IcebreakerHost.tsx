import React, { Suspense, lazy, useEffect } from 'react';
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
}

/**
 * Mounted ONCE in MainApp. Draws the composer sheet and the inbox, keeps the inbox fresh
 * (realtime) and asks the popup coordinator for the "someone broke the ice" heads-up.
 * Does nothing at all while the backend migration isn't applied.
 */
const IcebreakerHost: React.FC<Props> = ({ userId, openChat, openPremium }) => {
  const ui = useIcebreakerUi();
  const available = useIcebreakerAvailable();

  useEffect(() => {
    setIcebreakerHandlers({ openChat, openPremium });
  }, [openChat, openPremium]);

  // First fetch (also probes whether the backend exists).
  useEffect(() => {
    if (!userId) return;
    void refreshInbox();
  }, [userId]);

  // Live updates once we know the table exists.
  useEffect(() => {
    if (!userId || available !== true) return undefined;
    const known = new Set(getInbox().items.map((i) => i.id));
    const channel = supabase
      .channel(uniqueTopic(`icebreakers-in-${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'icebreakers', filter: `recipient_id=eq.${userId}` }, () => {
        void refreshInbox().then((items) => {
          const fresh = items.find((i) => !known.has(i.id));
          items.forEach((i) => known.add(i.id));
          if (fresh) requestPopup('icebreaker-received', { name: fresh.firstName, photoUrl: fresh.photoUrl }, { ttlMs: 60_000 });
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'icebreakers', filter: `recipient_id=eq.${userId}` }, () => {
        void refreshInbox();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, available]);

  if (available === false) return null;
  return (
    <Suspense fallback={null}>
      {ui.target && <IcebreakerSheet key={ui.target.id} target={ui.target} />}
      {ui.inboxOpen && <IcebreakerInbox />}
    </Suspense>
  );
};

export default IcebreakerHost;

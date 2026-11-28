import React, { Suspense, lazy, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { loadPendingTargets, loadQuota } from '@/services/icebreaker';
import { setIcebreakerHandlers, useIcebreakerUi } from './store';

const IcebreakerSheet = lazy(() => import('./IcebreakerSheet'));

interface Props {
  userId?: string | null;
  openChat: (matchId?: string | null) => void;
  openPremium: () => void;
  isPremium?: boolean;
}

/**
 * Mounted ONCE in MainApp. Draws the "Break the ice" composer sheet and keeps the quota + the people kept out of the
 * queue fresh. A sent hello is a normal chat (Chat list, normal chat screen, normal message notification), so there is
 * no inbox and no extra popup here.
 */
const IcebreakerHost: React.FC<Props> = ({ userId, openChat, openPremium, isPremium }) => {
  const ui = useIcebreakerUi();

  useEffect(() => {
    setIcebreakerHandlers({ openChat, openPremium, isPremium });
  }, [openChat, openPremium, isPremium]);

  useEffect(() => {
    if (!userId) return undefined;
    void loadQuota();
    void loadPendingTargets();
    // Coming back to the app: the week may have renewed, a hello may have run out (the person is back in the queue).
    let last = 0;
    const onResume = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      if (now - last < 20_000) return;
      last = now;
      void loadQuota(true);
      void loadPendingTargets();
    };
    document.addEventListener('visibilitychange', onResume);
    const resumeHandle = CapacitorApp.addListener('resume', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      resumeHandle.then((l) => l.remove()).catch(() => {});
    };
  }, [userId]);

  return ui.target ? (
    <Suspense fallback={null}>
      <IcebreakerSheet key={ui.target.id} target={ui.target} />
    </Suspense>
  ) : null;
};

export default IcebreakerHost;

/**
 * Has the signed-in user already rated DripLove? Combines the state saved on this device with the account's
 * profiles.has_rated_app flag (so someone who rated on another phone, or before a reinstall, is not asked again).
 *
 * `ready` stays false until the account check has answered (or 3 s passed / it failed), so the Rate card never flashes up
 * for somebody who has in fact rated. A user the device already knows has rated is ready immediately.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hasUserRated } from './ratingEngine';
import { loadRatingState } from './ratingStore';
import { mutateRatingState } from './ratingMoments';

const CHECK_TIMEOUT_MS = 3000;

export const useHasRated = (): { rated: boolean; ready: boolean; markRated: () => void } => {
  const localRated = hasUserRated(loadRatingState());
  const [rated, setRated] = useState<boolean>(localRated);
  const [ready, setReady] = useState<boolean>(localRated);

  useEffect(() => {
    if (localRated) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => { if (!cancelled) setReady(true); }, CHECK_TIMEOUT_MS);
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('profiles').select('has_rated_app').eq('id', user.id).maybeSingle();
          if (!cancelled && data?.has_rated_app) {
            mutateRatingState((s) => ({ ...s, hasRated: true }));
            setRated(true);
          }
        }
      } catch {
        // offline / error: fall back to what this device knows
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [localRated]);

  const markRated = useCallback(() => setRated(true), []);
  return { rated, ready, markRated };
};

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DailyStreakResult {
  currentStreak: number;
  longestStreak: number;
  isNewDay: boolean;
}

/**
 * Records today's login once per app session (see record_daily_login in
 * supabase/migrations/20260920180000_daily_login_streak.sql) and surfaces
 * the result so MainApp can show the streak flash. The RPC itself is
 * idempotent per calendar day (UTC) - is_new_day comes back false on a
 * second call the same day - but we also guard client-side so remounts
 * within one session (tab switches, etc.) never call it twice.
 */
export const useDailyStreak = (userId: string | undefined) => {
  const [streak, setStreak] = useState<DailyStreakResult | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!userId || hasRunRef.current) return;
    hasRunRef.current = true;

    (async () => {
      try {
        const { data, error } = await supabase.rpc('record_daily_login', {
          p_user_id: userId,
        });
        if (error || !data || data.length === 0) return;

        const row = data[0];
        setStreak({
          currentStreak: row.current_streak,
          longestStreak: row.longest_streak,
          isNewDay: row.is_new_day,
        });
      } catch {
        // Silently fail - the streak is a nice-to-have, never block login on it.
        void 0;
      }
    })();
  }, [userId]);

  // Called by the flash UI once it's done showing, so it never reappears
  // for the rest of this session even if something re-renders MainApp.
  const dismiss = () => setStreak((prev) => (prev ? { ...prev, isNewDay: false } : prev));

  return { streak, dismiss };
};

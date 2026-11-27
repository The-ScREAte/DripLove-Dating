import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { recordRatingMoment } from '@/rating/ratingMoments';

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
  // The UTC day the streak was last recorded for. Re-checked when the app returns to the foreground and
  // once a minute, so an app that simply stays open across midnight (or is resumed the next day) still
  // records the new day - it used to be once per session, i.e. until the app was closed.
  const lastDayRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!userId) return undefined;
    lastDayRef.current = null;

    const record = async () => {
      if (inFlightRef.current) return;
      const day = new Date().toISOString().slice(0, 10);
      if (lastDayRef.current === day) return;
      inFlightRef.current = true;
      try {
        const { data, error } = await supabase.rpc('record_daily_login', {
          p_user_id: userId,
        });
        if (error || !data || data.length === 0) return;
        lastDayRef.current = day;

        const row = data[0];
        // A 7 / 14 / 30 day streak is a proud moment - a good time (after the
        // flash) for the store-review engine to consider asking.
        if (row.is_new_day && [7, 14, 30].includes(row.current_streak)) {
          recordRatingMoment('streak_milestone');
        }
        setStreak({
          currentStreak: row.current_streak,
          longestStreak: row.longest_streak,
          isNewDay: row.is_new_day,
        });
      } catch {
        // Silently fail - the streak is a nice-to-have, never block login on it.
        void 0;
      } finally {
        inFlightRef.current = false;
      }
    };

    void record();
    const onVisible = () => {
      if (!document.hidden) void record();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(onVisible, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [userId]);

  // Called by the flash UI once it's done showing, so it never reappears
  // for the rest of this session even if something re-renders MainApp.
  const dismiss = () => setStreak((prev) => (prev ? { ...prev, isNewDay: false } : prev));

  return { streak, dismiss };
};

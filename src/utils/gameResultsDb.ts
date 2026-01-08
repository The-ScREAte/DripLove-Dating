import { supabase } from '@/integrations/supabase/client';
import type { GameType } from '@/utils/gameStorage';

export const saveFinalGameResultToDb = async (params: {
  gameType: GameType;
  level: number;
  percentage: number;
  playedAt: string;
}) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { saved: false, reason: 'not_authenticated' as const };

    const { error } = await sb
      // Minimal DB footprint: one row per completed play. Local storage keeps best-3.
      .from('game_results')
      .insert({
        user_id: userId,
        game_type: params.gameType,
        level: params.level,
        percentage: params.percentage,
        played_at: params.playedAt,
      });

    if (error) {
      // Fail-safe: if table isn't deployed yet, don't break gameplay.
      console.warn('[games] saveFinalGameResultToDb failed:', error);
      return { saved: false, reason: 'db_error' as const };
    }

    return { saved: true };
  } catch (err) {
    console.warn('[games] saveFinalGameResultToDb exception:', err);
    return { saved: false, reason: 'exception' as const };
  }
};

export const clearGameResultsFromDb = async (gameType: GameType) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { cleared: false, reason: 'not_authenticated' as const };

    const { error } = await sb
      .from('game_results')
      .delete()
      .eq('user_id', userId)
      .eq('game_type', gameType);

    if (error) {
      console.warn('[games] clearGameResultsFromDb failed:', error);
      return { cleared: false, reason: 'db_error' as const };
    }

    return { cleared: true };
  } catch (err) {
    console.warn('[games] clearGameResultsFromDb exception:', err);
    return { cleared: false, reason: 'exception' as const };
  }
};

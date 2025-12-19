import { useCallback, useEffect, useRef, useState } from 'react';
import { getDiscoverFeed, type DiscoverFeedRow } from '@/services/discover.service';

const feedCache = new Map<string, { profiles: DiscoverFeedRow[]; fetchedAt: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000;
const REFILL_THRESHOLD = 5;
const REFILL_BATCH_SIZE = 15;

export interface UseDiscoverFeedResult {
  profiles: DiscoverFeedRow[];
  isLoading: boolean;
  error: unknown;
  current: DiscoverFeedRow | null;
  swipeNext: () => void;
  refresh: (opts?: { limit?: number; force?: boolean }) => Promise<void>;
}

export function useDiscoverFeed(userId: string | null | undefined): UseDiscoverFeedResult {
  const indexRef = useRef(0);
  const isRefillingRef = useRef(false);

  const [profiles, setProfiles] = useState<DiscoverFeedRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(
    async (opts?: { limit?: number; force?: boolean }) => {
      if (!userId) return;

      const limit = opts?.limit ?? REFILL_BATCH_SIZE;
      const force = opts?.force ?? false;

      const cached = feedCache.get(userId);
      if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        setProfiles(cached.profiles);
        indexRef.current = 0;
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const rows = await getDiscoverFeed(userId, limit);
        feedCache.set(userId, { profiles: rows, fetchedAt: Date.now() });
        setProfiles(rows);
        indexRef.current = 0;
      } catch (e) {
        setError(e);
        setProfiles([]);
      } finally {
        setIsLoading(false);
      }
    },
    [userId]
  );

  // INITIAL LOAD
  useEffect(() => {
    if (!userId) return;
    void refresh({ limit: REFILL_BATCH_SIZE });
  }, [userId, refresh]);

  // REFILL LOGIC (STEP 2)
  const refillIfNeeded = useCallback(async () => {
    if (!userId || isRefillingRef.current) return;

    const remaining = profiles.length - indexRef.current - 1;
    if (remaining > REFILL_THRESHOLD) return;

    isRefillingRef.current = true;

    try {
      const newRows = await getDiscoverFeed(userId, REFILL_BATCH_SIZE);
      if (!newRows?.length) return;

      setProfiles((prev) => {
        const existingIds = new Set(prev.map((p: any) => p?.id).filter(Boolean));
        const deduped = newRows.filter((p: any) => !existingIds.has(p?.id));
        const merged = [...prev, ...deduped];

        feedCache.set(userId, {
          profiles: merged,
          fetchedAt: Date.now(),
        });

        return merged;
      });
    } catch {
      // Silent fail — user never sees refill errors
    } finally {
      isRefillingRef.current = false;
    }
  }, [userId, profiles.length]);

  const swipeNext = useCallback(() => {
    indexRef.current += 1;
    void refillIfNeeded();
  }, [refillIfNeeded]);

  const current = indexRef.current < profiles.length ? profiles[indexRef.current] ?? null : null;

  return {
    profiles,
    isLoading,
    error,
    current,
    swipeNext,
    refresh,
  };
}

-- Fix #7 from the scale audit: LikedMePage fetched every liker for an
-- account in one unbounded query (plus unbounded blocks/matches queries to
-- compute exclusions), then joined/sorted/filtered all of it client-side.
-- For a popular profile with thousands of likers this is a large, slow
-- fetch on every page open.
--
-- Doing the block/match exclusion in SQL (rather than fetching everything
-- and filtering in JS) is what makes real pagination possible here - it
-- lets the database return a correctly-sized page directly, instead of
-- paging the raw `likes` rows and then finding out after the fact that some
-- of that page's likers should have been excluded.

CREATE INDEX IF NOT EXISTS idx_likes_liked_id_created_at ON public.likes (liked_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON public.blocks (blocked_id);

CREATE OR REPLACE FUNCTION public.get_likers_page(
  p_user_id uuid,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (liker_id uuid, liked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.liker_id, l.created_at AS liked_at
  FROM public.likes l
  WHERE l.liked_id = p_user_id
    AND l.liker_id <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = l.liker_id)
         OR (b.blocker_id = l.liker_id AND b.blocked_id = p_user_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.matches m
      WHERE (m.user1_id = p_user_id AND m.user2_id = l.liker_id)
         OR (m.user2_id = p_user_id AND m.user1_id = l.liker_id)
    )
  ORDER BY l.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_likers_page(uuid, integer, integer) TO authenticated;

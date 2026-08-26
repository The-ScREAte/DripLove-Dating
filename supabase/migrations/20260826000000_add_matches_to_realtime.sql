-- Enable realtime for the matches table.
--
-- ChatPage.tsx subscribes to postgres_changes on public.matches (filtered by
-- user1_id/user2_id) so it can pick up new matches while already mounted in
-- the background (MainApp keeps tabs alive via display:none rather than
-- unmounting them once visited). That subscription has been silently inert
-- because matches was never added to the supabase_realtime publication -
-- unlike public.chats and public.likes, which already were (see
-- 20250617095818_*.sql and 20251229085239_*.sql). Wrapped in a guard since
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'matches'
  ) THEN
    ALTER TABLE public.matches REPLICA IDENTITY FULL;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
END $$;

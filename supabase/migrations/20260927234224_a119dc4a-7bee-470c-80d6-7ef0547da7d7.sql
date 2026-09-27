ALTER TABLE public.circle_up_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.circle_up_queue REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='circle_up_sessions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_up_sessions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='circle_up_queue') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_up_queue';
  END IF;
END $$;
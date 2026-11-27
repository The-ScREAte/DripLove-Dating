-- Replace reliance on the PUBLIC anon key for server-to-server calls with a private cron secret.
-- Every database function / pg_cron job that calls an edge function keeps its Authorization bearer (the gateway
-- still needs a JWT when verify_jwt=true) and now ALSO sends `x-cron-secret`. Once these are live,
-- ALLOW_LEGACY_ANON_CRON=false (edge-function secret) makes the public anon key stop working as a credential.
INSERT INTO public.internal_secrets (key, value)
SELECT 'worker_cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (SELECT 1 FROM public.internal_secrets WHERE key = 'worker_cron_secret');
INSERT INTO public.internal_secrets (key, value)
SELECT 'subscription_cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (SELECT 1 FROM public.internal_secrets WHERE key = 'subscription_cron_secret');

-- 1) database functions that call send-push-notification / workers with notification_cron_anon_key
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc ILIKE '%http_post%' AND p.prosrc ILIKE '%notification_cron_anon_key%'
  LOOP
    def := pg_get_functiondef(r.oid);
    IF def LIKE '%x-cron-secret%' THEN CONTINUE; END IF;
    EXECUTE regexp_replace(def,
      '''Authorization'',\s*''Bearer ''\s*\|\|',
      '''x-cron-secret'', (select value from public.internal_secrets where key = ''worker_cron_secret''), ''Authorization'', ''Bearer '' ||',
      'g');
  END LOOP;
END $$;

-- 2) pg_cron jobs
DO $$
DECLARE j record; cmd text; wsec text; ssec text;
BEGIN
  SELECT value INTO wsec FROM public.internal_secrets WHERE key = 'worker_cron_secret';
  SELECT value INTO ssec FROM public.internal_secrets WHERE key = 'subscription_cron_secret';
  FOR j IN SELECT jobid, jobname, command FROM cron.job WHERE command ILIKE '%functions/v1/%' AND command NOT ILIKE '%x-cron-secret%' AND username = current_user LOOP
    cmd := j.command;
    IF cmd ILIKE '%notification_cron_anon_key%' THEN
      cmd := regexp_replace(cmd, '''Authorization'',\s*''Bearer ''\s*\|\|',
        '''x-cron-secret'', (select value from public.internal_secrets where key = ''worker_cron_secret''), ''Authorization'', ''Bearer '' ||', 'g');
    ELSIF cmd ILIKE '%"Authorization"%' THEN
      cmd := replace(cmd, '"Authorization"', '"x-cron-secret": "' || CASE WHEN j.jobname ILIKE 'subscription-checker%' THEN ssec ELSE wsec END || '", "Authorization"');
    END IF;
    IF cmd <> j.command THEN PERFORM cron.alter_job(j.jobid, command := cmd); END IF;
  END LOOP;
END $$;

-- 3) two daily jobs are owned by a different role (supabase_read_only_user) and cannot be altered: replace them
--    with postgres-owned jobs that carry the secret (the old ones are unscheduled when possible).
DO $$
DECLARE hdr text := $h$headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.internal_secrets where key = 'worker_cron_secret'), 'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key'))$h$;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-matches-daily-v2') THEN
    PERFORM cron.schedule('cleanup-expired-matches-daily-v2', '0 2 * * *',
      'select net.http_post(url := ''https://tgjsyyihabsovironesw.supabase.co/functions/v1/cleanup-expired-matches'', ' || hdr || ', body := ''{}''::jsonb)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-dormant-chats-daily-v2') THEN
    PERFORM cron.schedule('check-dormant-chats-daily-v2', '0 3 * * *',
      'select net.http_post(url := ''https://tgjsyyihabsovironesw.supabase.co/functions/v1/check-dormant-chats'', ' || hdr || ', body := ''{}''::jsonb)');
  END IF;
  BEGIN PERFORM cron.unschedule('cleanup-expired-matches-daily'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'could not unschedule old cleanup job: %', SQLERRM; END;
  BEGIN PERFORM cron.unschedule('check-dormant-chats-daily'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'could not unschedule old dormant-chats job: %', SQLERRM; END;
END $$;

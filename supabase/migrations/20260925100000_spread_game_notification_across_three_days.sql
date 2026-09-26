-- Spreads the weekly game notification across 3 days (Tue/Thu/Sun) instead
-- of always Sunday, with each user landing on a genuinely random one of the
-- three - not "runs 3x and whoever's still eligible gets extra chances",
-- which would bias toward Sunday since it's simply the last opportunity to
-- catch stragglers.
--
-- Mechanic: each run is told how many chances remain THIS WEEK, including
-- itself (p_remaining_days: 3 on Tuesday, 2 on Thursday, 1 on Sunday). For
-- every still-unsent-this-week user, it sends with probability
-- 1/p_remaining_days. That makes each of the 3 days equally likely (1/3
-- each) while guaranteeing everyone gets exactly one by the end of the week -
-- Sunday's run (p_remaining_days = 1) always sends to whoever's left, so
-- nobody is ever skipped for the week.

DROP FUNCTION IF EXISTS public.send_game_notifications();

CREATE OR REPLACE FUNCTION public.send_game_notifications(p_remaining_days integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  rec record;
  v_title text;
  v_body text;
  v_pick integer;
  v_week_start date := date_trunc('week', (now() AT TIME ZONE 'utc'))::date;
BEGIN
  IF p_remaining_days < 1 THEN
    p_remaining_days := 1;
  END IF;

  FOR rec IN
    SELECT p.id, p.gender
    FROM public.profiles p
    WHERE p.account_status = 'active'
      AND p.is_admin IS NOT TRUE
      AND EXISTS (SELECT 1 FROM public.push_tokens pt WHERE pt.user_id = p.id)
      AND p.last_game_notification_sent_week IS DISTINCT FROM v_week_start
    LIMIT 20000
  LOOP
    BEGIN
      -- Skip this run for this user with probability (p_remaining_days-1)/
      -- p_remaining_days, so they get another shot on a later day this week
      -- instead of being forced into today specifically. On the last
      -- remaining day (p_remaining_days = 1) this is always true.
      IF random() >= 1.0 / p_remaining_days THEN
        CONTINUE;
      END IF;

      v_pick := floor(random() * 4)::int;

      CASE v_pick
        WHEN 0 THEN
          v_title := 'Level up 🎮';
          v_body := 'Test your toast game and see how smooth your lines really are.';
        WHEN 1 THEN
          v_title := 'One shot 🎯';
          v_body := 'You get one message and one chance - take Shoot Your Shot.';
        WHEN 2 THEN
          v_title := 'Red flag or green flag? 🚩';
          v_body := 'Put your dating instincts to the test and see how you score.';
        ELSE
          v_title := 'Practice makes perfect 💬';
          v_body := 'Improve your toast to get the ' ||
            CASE rec.gender
              WHEN 'male' THEN 'girl'
              WHEN 'female' THEN 'man'
              ELSE 'person'
            END || ' of your dreams.';
      END CASE;

      PERFORM net.http_post(
        url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.internal_secrets where key = 'notification_cron_anon_key')
        ),
        body := jsonb_build_object(
          'title', v_title,
          'body', v_body,
          'userId', rec.id,
          'type', 'system',
          'data', jsonb_build_object('action', 'open_games')
        )
      );

      UPDATE public.profiles
      SET last_game_notification_sent_week = v_week_start
      WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_game_notifications: skipping user % after error: %', rec.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;

SELECT cron.unschedule('send-game-notifications-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-game-notifications-weekly');

-- Tuesday (dow 2): 3 chances remain (today, Thursday, Sunday) -> ~1/3 sent today.
SELECT cron.schedule(
  'send-game-notifications-tuesday',
  '30 15 * * 2',
  $$SELECT public.send_game_notifications(3);$$
);

-- Thursday (dow 4): 2 chances remain (today, Sunday) -> ~1/2 of what's left.
SELECT cron.schedule(
  'send-game-notifications-thursday',
  '30 15 * * 4',
  $$SELECT public.send_game_notifications(2);$$
);

-- Sunday (dow 0): last chance this week -> everyone still unsent gets it now.
SELECT cron.schedule(
  'send-game-notifications-sunday',
  '30 15 * * 0',
  $$SELECT public.send_game_notifications(1);$$
);

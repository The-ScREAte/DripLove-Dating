-- TEMPORARY: one send time per schedule until the updated
-- process-scheduled-broadcasts edge function (one History entry per day AND
-- send time) is deployed. The deployed version keeps one entry per day, so a
-- second time on the same day would collide with the first and be lost.
-- Drop this constraint right after deploying that function:
--   alter table public.scheduled_broadcasts drop constraint scheduled_broadcasts_one_send_time_tmp;
alter table public.scheduled_broadcasts drop constraint if exists scheduled_broadcasts_one_send_time_tmp;
alter table public.scheduled_broadcasts add constraint scheduled_broadcasts_one_send_time_tmp
  check (send_times is null or cardinality(send_times) <= 1);

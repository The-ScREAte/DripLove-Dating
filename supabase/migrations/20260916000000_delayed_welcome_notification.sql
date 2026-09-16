-- Welcome push used to fire the instant a user finished profile
-- setup/terms acceptance - the product ask is to delay it 10 minutes after
-- account creation instead, so it lands once someone's actually had a
-- moment to explore rather than the second they land in the app. Since a
-- client-side setTimeout can't survive the app being backgrounded/killed
-- for 10 minutes, this queues a row here and a cron job (below) sends it
-- once due - same pattern already used for process-email-queue.

create table if not exists public.pending_welcome_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  send_at timestamptz not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pending_welcome_notifications_due_idx
  on public.pending_welcome_notifications (send_at)
  where sent = false;

alter table public.pending_welcome_notifications enable row level security;

-- A signed-in user may only queue their own welcome notification - no
-- select/update/delete policies are defined, so clients can't read, edit,
-- or cancel any row (including their own) once inserted; only the
-- SECURITY DEFINER function below (running as its owner) can do that.
create policy "Users can schedule their own welcome notification"
  on public.pending_welcome_notifications
  for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.process_pending_welcome_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select id, user_id
    from public.pending_welcome_notifications
    where sent = false and send_at <= now()
    order by send_at
    limit 50
  loop
    perform net.http_post(
      url := 'https://tgjsyyihabsovironesw.supabase.co/functions/v1/send-push-notification',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8"}'::jsonb,
      body := jsonb_build_object(
        'title', 'Welcome to DripLove 💕',
        'body', 'You''re all set! Complete your profile and let the right people find you.',
        'userId', rec.user_id,
        'type', 'system',
        'data', jsonb_build_object('action', 'open_discover')
      )
    );

    update public.pending_welcome_notifications
      set sent = true
      where id = rec.id;
  end loop;
end;
$$;

select cron.schedule(
  'process-welcome-notifications-every-minute',
  '* * * * *',
  $$select public.process_pending_welcome_notifications();$$
);

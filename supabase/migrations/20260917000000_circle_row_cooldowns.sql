-- Tracks when a user finishes their current "Recommended for you" /
-- "Similar interests" batch on Circle, so the row can go into a cooldown
-- (24h for premium, 7 days for free) instead of silently refilling from the
-- pool the instant someone's swiped. One row per (user, row), upserted by
-- the client the moment the last card in the current batch is swiped.
create table if not exists public.circle_row_cooldowns (
  user_id uuid not null references auth.users(id) on delete cascade,
  row_key text not null check (row_key in ('recommended', 'similar')),
  exhausted_at timestamptz not null default now(),
  primary key (user_id, row_key)
);

alter table public.circle_row_cooldowns enable row level security;

create policy "Users can view their own circle row cooldowns"
  on public.circle_row_cooldowns
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can set their own circle row cooldowns"
  on public.circle_row_cooldowns
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own circle row cooldowns"
  on public.circle_row_cooldowns
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

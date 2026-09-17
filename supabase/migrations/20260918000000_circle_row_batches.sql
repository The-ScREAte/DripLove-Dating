-- Persists the exact set of profile ids currently shown in a user's
-- "Recommended for you" / "Similar interests" row, so re-opening Circle (or
-- reloading the app) shows the SAME people rather than a freshly re-ranked
-- top-4 that could swap someone undecided out just because the pool shifted.
-- A person only ever leaves this list because the client found them already
-- decided (liked/passed/matched/blocked, from Circle or anywhere else in the
-- app) - never because a recompute happened to rank them lower. One row per
-- (user, row), upserted by the client whenever the list changes.
create table if not exists public.circle_row_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  row_key text not null check (row_key in ('recommended', 'similar')),
  profile_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, row_key)
);

alter table public.circle_row_batches enable row level security;

create policy "Users can view their own circle row batches"
  on public.circle_row_batches
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can set their own circle row batches"
  on public.circle_row_batches
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own circle row batches"
  on public.circle_row_batches
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own circle row batches"
  on public.circle_row_batches
  for delete
  to authenticated
  using (user_id = auth.uid());

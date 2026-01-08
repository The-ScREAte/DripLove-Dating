-- Stores only minimal completed-game summaries.
-- Detailed progress/history is stored on-device (localStorage).

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_type text not null,
  level integer not null check (level >= 1 and level <= 5),
  percentage numeric not null check (percentage >= 0 and percentage <= 100),
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists game_results_user_id_idx on public.game_results(user_id);
create index if not exists game_results_user_game_idx on public.game_results(user_id, game_type);

alter table public.game_results enable row level security;

-- Users can read their own results
create policy "Users can read own game results"
on public.game_results
for select
to authenticated
using (auth.uid() = user_id);

-- Users can insert their own results
create policy "Users can insert own game results"
on public.game_results
for insert
to authenticated
with check (auth.uid() = user_id);

-- Users can delete their own results (supports "Clear results")
create policy "Users can delete own game results"
on public.game_results
for delete
to authenticated
using (auth.uid() = user_id);

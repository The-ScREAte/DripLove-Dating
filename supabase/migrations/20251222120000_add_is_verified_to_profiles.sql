-- Add precomputed verification flag to profiles.
-- DiscoverPage reads this as `profile.is_verified`.

alter table public.profiles
add column if not exists is_verified boolean not null default false;

alter table public.profiles
add column if not exists profile_completion integer not null default 0;

create index if not exists profiles_is_verified_idx
on public.profiles (is_verified);

create index if not exists profiles_profile_completion_idx
on public.profiles (profile_completion);

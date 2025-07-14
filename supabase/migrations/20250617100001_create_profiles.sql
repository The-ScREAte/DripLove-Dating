-- Create profiles table with comprehensive location and moderation support
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  date_of_birth date,
  country text,
  city varchar,
  bio text,
  preference text,
  interests text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  gender text,
  relationship_intent text,
  smoking text,
  drinking text,
  exercise_level text,
  sleeping_schedule text,
  occupation text,
  industry text,
  education_level text,
  zip_code text,
  introvert_extrovert int,
  spontaneous_planner int,
  messy_organized int,
  fun_fact text,
  perfect_first_date text,
  last_googled text,
  distance_preference int,
  is_admin boolean default false,
  -- Location-based matching fields
  country_code varchar(2),
  latitude decimal(10, 8),
  longitude decimal(11, 8),
  max_distance integer default 50,
  -- Photo moderation fields
  profile_photo_url text,
  profile_photo_status text default 'pending' check (profile_photo_status in ('pending', 'approved', 'rejected')),
  profile_photo_moderated_at timestamptz,
  profile_photo_moderation_notes text,
  additional_photos jsonb default '[]'::jsonb,
  photo_moderation_enabled boolean default true
);

-- Add indexes for location-based queries
create index if not exists idx_profiles_location on profiles (country_code, latitude, longitude);
create index if not exists idx_profiles_max_distance on profiles (max_distance);
create index if not exists idx_profiles_photo_status on profiles (profile_photo_status);

-- Add RLS policies
alter table profiles enable row level security;

-- Users can view their own profile
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Users can insert their own profile
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- Users can view other profiles (for matching)
create policy "Users can view other profiles for matching" on profiles
  for select using (true);

-- Function to calculate distance between two points using Haversine formula
create or replace function calculate_distance(
  lat1 decimal,
  lon1 decimal,
  lat2 decimal,
  lon2 decimal
) returns decimal as $$
declare
  r decimal := 6371; -- Earth's radius in kilometers
  dlat decimal;
  dlon decimal;
  a decimal;
  c decimal;
begin
  if lat1 is null or lon1 is null or lat2 is null or lon2 is null then
    return null;
  end if;
  
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat/2) * sin(dlat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2) * sin(dlon/2);
  c := 2 * asin(sqrt(a));
  return r * c;
end;
$$ language plpgsql immutable;

-- Function to find users within distance
create or replace function find_users_within_distance(
  user_lat decimal,
  user_lon decimal,
  max_dist integer default 50,
  exclude_user_id uuid default null
) returns table (
  user_id uuid,
  distance_km decimal,
  first_name text,
  country text,
  city varchar
) as $$
begin
  return query
  select 
    p.id as user_id,
    calculate_distance(user_lat, user_lon, p.latitude, p.longitude) as distance_km,
    p.first_name,
    p.country,
    p.city
  from profiles p
  where 
    p.latitude is not null 
    and p.longitude is not null
    and (exclude_user_id is null or p.id != exclude_user_id)
    and calculate_distance(user_lat, user_lon, p.latitude, p.longitude) <= max_dist
  order by distance_km asc;
end;
$$ language plpgsql;

-- Create view for location-based matching
create or replace view profile_locations as
select 
  id,
  first_name,
  date_of_birth,
  extract(year from age(date_of_birth)) as age,
  city,
  country_code,
  latitude,
  longitude,
  max_distance,
  created_at
from profiles
where 
  country_code is not null 
  and city is not null 
  and city != '';

-- Create function to find potential matches within distance
create or replace function find_matches_by_location(
  user_id uuid,
  max_distance_km integer default null
) returns table (
  profile_id uuid,
  distance_km decimal,
  city varchar,
  country_code varchar
) as $$
declare
  user_lat decimal;
  user_lon decimal;
  user_max_dist integer;
  search_distance integer;
begin
  -- Get user's location and preferences
  select latitude, longitude, max_distance 
  into user_lat, user_lon, user_max_dist
  from profiles 
  where id = user_id;
  
  -- Use provided distance or user's preference
  search_distance := coalesce(max_distance_km, user_max_dist, 50);
  
  -- Return matches within distance (if coordinates available)
  if user_lat is not null and user_lon is not null then
    return query
    select 
      p.id,
      calculate_distance(user_lat, user_lon, p.latitude, p.longitude) as distance_km,
      p.city,
      p.country_code
    from profiles p
    where 
      p.id != user_id
      and p.latitude is not null 
      and p.longitude is not null
      and calculate_distance(user_lat, user_lon, p.latitude, p.longitude) <= search_distance
    order by distance_km;
  else
    -- Fallback to city/country matching if no coordinates
    return query
    select 
      p.id,
      999.0 as distance_km, -- Placeholder distance
      p.city,
      p.country_code
    from profiles p
    where 
      p.id != user_id
      and p.country_code = (select country_code from profiles where id = user_id)
    order by 
      case when p.city = (select city from profiles where id = user_id) then 1 else 2 end,
      p.created_at desc;
  end if;
end;
$$ language plpgsql;

-- Grant necessary permissions
grant select on profile_locations to authenticated;
grant execute on function calculate_distance to authenticated;
grant execute on function find_users_within_distance to authenticated;
grant execute on function find_matches_by_location to authenticated;

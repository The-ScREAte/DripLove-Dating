create table if not exists auth.api_keys (
  id uuid not null primary key default gen_random_uuid(),
  key text not null unique,
  created_at timestamptz not null default now()
);

-- Insert our specific API key for public access
insert into auth.api_keys (key) values ('public-paystack-redirect-key') on conflict do nothing;

-- Create a policy to allow our redirect function
create policy "Allow public redirect access" on auth.api_keys for select using (key = 'public-paystack-redirect-key');

-- Create a table for storing payment config (methods and price)
create table if not exists payment_config (
  id uuid primary key default gen_random_uuid(),
  payment_methods jsonb not null,
  premium_price numeric(10,2) not null default 50,
  updated_at timestamptz not null default now()
);

-- Only allow one row (singleton config)
create unique index if not exists only_one_payment_config on payment_config((true));

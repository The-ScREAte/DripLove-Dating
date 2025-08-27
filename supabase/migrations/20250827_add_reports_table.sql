-- Supabase table for reporting any content (profiles, messages, images, etc.)
create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references profiles(id) on delete set null,
  reported_user_id uuid references profiles(id) on delete set null,
  content_type text not null, -- 'profile', 'message', 'image', etc.
  content_id text, -- id of the reported content (message id, image url, etc.)
  reason text not null, -- spam, nudity, abuse, hate, etc.
  description text, -- optional user-provided details
  status text default 'pending', -- 'pending', 'resolved', 'ignored'
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- Add index for fast lookup
create index if not exists idx_reports_content on reports(content_type, content_id);

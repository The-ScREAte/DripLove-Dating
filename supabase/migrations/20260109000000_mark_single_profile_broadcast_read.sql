-- Mark a single profile broadcast message as read when expanded
-- This avoids client-side UPDATE failures due to RLS returning 0-row updates.

create or replace function public.mark_my_profile_broadcast_message_read(p_recipient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.broadcast_recipients
    set profile_read_at = coalesce(profile_read_at, now())
  where id = p_recipient_id
    and user_id = auth.uid()
    and profile_deleted_at is null;

  return found;
end;
$$;

grant execute on function public.mark_my_profile_broadcast_message_read(uuid) to authenticated;

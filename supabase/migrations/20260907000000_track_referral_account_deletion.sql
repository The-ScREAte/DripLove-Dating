-- Lets an admin see, per promoter, which of their leads later deleted their
-- own account - referrals.user_id already gets set to NULL when a profile
-- is deleted (ON DELETE SET NULL, see 20260128001606), which keeps the
-- promoter's signup COUNT correct, but gives no way to tell "this lead
-- deleted their account" apart from "this lead's user_id happens to be
-- null for some other reason" - there wasn't one. This adds an explicit,
-- timestamped flag set at the moment of deletion, independent of the FK
-- nulling that happens right after in the same transaction.

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS user_deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.delete_user_and_data(user_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email TEXT;
  v_country_code TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to delete this account';
  END IF;

  IF auth.uid() != user_id_to_delete AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this account';
  END IF;

  -- Capture the email (and country, for basic segmentation later) before anything
  -- about this account is deleted.
  SELECT email, country_code INTO v_email, v_country_code
  FROM public.profiles
  WHERE id = user_id_to_delete;

  IF v_email IS NOT NULL THEN
    INSERT INTO public.deleted_account_emails (email, former_user_id, country_code)
    VALUES (v_email, user_id_to_delete, v_country_code);
  END IF;

  -- Mark any referral(s) that brought this user in as "the lead deleted
  -- their account" BEFORE the profile delete below nulls out user_id via
  -- the FK's ON DELETE SET NULL - otherwise there'd be no way to tell this
  -- case apart from a referral whose user_id was simply never set.
  UPDATE public.referrals
  SET user_deleted_at = now()
  WHERE user_id = user_id_to_delete AND user_deleted_at IS NULL;

  -- Delete user images from storage and database
  DELETE FROM public.user_images WHERE user_id = user_id_to_delete;

  -- Delete chats where user is involved
  DELETE FROM public.chats WHERE sender_id = user_id_to_delete;

  -- Delete matches where user is involved
  DELETE FROM public.matches WHERE user1_id = user_id_to_delete OR user2_id = user_id_to_delete;

  -- Delete likes given and received by user
  DELETE FROM public.likes WHERE liker_id = user_id_to_delete OR liked_id = user_id_to_delete;

  -- Delete blocks involving user
  DELETE FROM public.blocks WHERE blocker_id = user_id_to_delete OR blocked_id = user_id_to_delete;

  -- Delete user profile
  DELETE FROM public.profiles WHERE id = user_id_to_delete;

  -- Finally delete the auth user (this will cascade to other tables if needed)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$function$;

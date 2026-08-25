-- Keep a minimal, admin-only record of a user's email when their account is
-- deleted. Everything else about them (images, chats, matches, likes, blocks,
-- the profile row, and the auth.users row itself) is still fully erased by
-- delete_user_and_data exactly as before -- this table intentionally captures
-- nothing except the email address and when the account left, so it can be
-- used later for things like a deliberate win-back campaign or basic
-- record-keeping of "who used to have an account here."
--
-- NOTE (read before wiring this into any broadcast): a user who deletes their
-- account is reasonably assumed to want to stop hearing from the product, so
-- this table is NOT read by any broadcast/scheduled-broadcast code path --
-- it's a passive record for an admin to consult or export deliberately, not
-- an automatic marketing list. If it's ever used to email someone, make sure
-- that use honors any prior unsubscribe/do-not-contact preference they had
-- and is defensible under your applicable privacy law (e.g. GDPR/CCPA) --
-- "the user asked to be deleted" and "we kept emailing them anyway" is a bad
-- combination. Treat this as storage of last resort, not a mailing list.

CREATE TABLE IF NOT EXISTS public.deleted_account_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  former_user_id UUID NOT NULL, -- not a FK: the profiles/auth.users rows are gone by the time this is read
  country_code TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_account_emails_email ON public.deleted_account_emails (email);

ALTER TABLE public.deleted_account_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view deleted account emails"
ON public.deleted_account_emails
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);
-- No client INSERT/UPDATE/DELETE policy: only delete_user_and_data (SECURITY
-- DEFINER, runs as the deleting user but writes here before anything is gone)
-- and the service role write to this table.

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
  -- BUG FIX: the prior version of this check (auth.uid() = user_id_to_delete only)
  -- was correct for closing the "any user can delete any other user" vulnerability,
  -- but it also silently broke the admin panel's own "delete user" actions
  -- (AdminPage.tsx and UserPoolDebugger.tsx both call this RPC with a *different*
  -- user's id) -- every admin-initiated deletion has been throwing "Not authorized"
  -- ever since. Allow it for the account owner OR a verified admin.
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

GRANT EXECUTE ON FUNCTION public.delete_user_and_data(uuid) TO authenticated;

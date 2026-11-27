-- get_influencer_full_stats(uuid) was SECURITY DEFINER with no auth check: any signed-in user holding a promo id
-- could read that promoter's earnings. influencer_login / request_influencer_payout call it internally (owner
-- rights, unaffected by this revoke); admins now use a guarded wrapper.
CREATE OR REPLACE FUNCTION public.admin_get_influencer_full_stats(p_promo_code_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() IN ('anon','authenticated')
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN public.get_influencer_full_stats(p_promo_code_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_influencer_full_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_influencer_full_stats(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_influencer_full_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_influencer_full_stats(uuid) TO service_role;

-- Admin moderation deletes of user photos were silently ignored by storage RLS (owner-only delete).
DROP POLICY IF EXISTS "Admins can delete user photos" ON storage.objects;
CREATE POLICY "Admins can delete user photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'user-photos' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE));
DROP POLICY IF EXISTS "Admins can view user photos" ON storage.objects;
CREATE POLICY "Admins can view user photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-photos' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE));

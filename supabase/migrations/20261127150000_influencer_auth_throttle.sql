-- Brute-force protection for the anon-callable influencer portal endpoints:
-- max 15 attempts per code (or setup-link id) per 15 minutes.
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_key_created_idx ON public.auth_attempts (key, created_at DESC);
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;  -- deny-all; only the function below writes

CREATE OR REPLACE FUNCTION public._throttle(p_key text, p_max integer DEFAULT 15, p_window interval DEFAULT interval '15 minutes')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.auth_attempts WHERE created_at < now() - interval '1 day';
  SELECT count(*) INTO n FROM public.auth_attempts WHERE key = p_key AND created_at > now() - p_window;
  IF n >= p_max THEN
    RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.auth_attempts(key) VALUES (p_key);
END $$;
REVOKE EXECUTE ON FUNCTION public._throttle(text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._throttle(text, integer, interval) TO service_role;

DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('influencer_login','lower(code_input)'),
      ('request_influencer_payout','lower(p_code)'),
      ('accept_influencer_terms','lower(p_code)'),
      ('get_influencer_lead_demographics','lower(p_code)'),
      ('set_influencer_password','p_promo_code_id::text'),
      ('validate_promo_code_setup_link','p_promo_code_id::text')
    ) AS t(fn, expr)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=r.fn LIMIT 1;
    IF def IS NULL OR def LIKE '%_throttle%' THEN CONTINUE; END IF;
    EXECUTE regexp_replace(def, '\mBEGIN\M', replace(format($g$BEGIN PERFORM public._throttle('inf:%s:'||%s); $g$, r.fn, r.expr), '\', '\\'), 'i');
  END LOOP;
END $$;

-- Replaces the per-name "who used your code" list (redundant with the leads
-- count already shown, and unnecessarily exposes individual names) with an
-- aggregate gender/age-group breakdown of everyone who signed up with the
-- promoter's code - every referral row (the leads), not just subscribers.
CREATE OR REPLACE FUNCTION public.get_influencer_lead_demographics(
  p_code text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_promo_code RECORD;
  v_password_ok boolean;
  v_gender json;
  v_age json;
BEGIN
  SELECT * INTO v_promo_code
  FROM public.promo_codes
  WHERE UPPER(code) = UPPER(p_code)
    AND deleted_at IS NULL;

  IF v_promo_code.id IS NULL OR v_promo_code.password_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_promo_code.password_hash LIKE '$2%' THEN
    v_password_ok := (extensions.crypt(p_password, v_promo_code.password_hash) = v_promo_code.password_hash);
  ELSE
    v_password_ok := (v_promo_code.password_hash = p_password);
  END IF;

  IF NOT v_password_ok THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_promo_code.status = 'blocked' THEN
    RETURN json_build_object('success', false, 'error', 'This account has been blocked');
  END IF;

  SELECT COALESCE(json_agg(json_build_object('label', label, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
  INTO v_gender
  FROM (
    SELECT
      COALESCE(NULLIF(INITCAP(p.gender), ''), 'Unspecified') AS label,
      COUNT(*) AS cnt
    FROM public.referrals r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.promo_code_id = v_promo_code.id
    GROUP BY 1
  ) g;

  SELECT COALESCE(json_agg(json_build_object('label', label, 'count', cnt) ORDER BY sort_order), '[]'::json)
  INTO v_age
  FROM (
    SELECT
      CASE
        WHEN p.date_of_birth IS NULL THEN 'Unspecified'
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 18 AND 24 THEN '18-24'
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 25 AND 34 THEN '25-34'
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 35 AND 44 THEN '35-44'
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 45 AND 54 THEN '45-54'
        ELSE '55+'
      END AS label,
      CASE
        WHEN p.date_of_birth IS NULL THEN 9
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 18 AND 24 THEN 1
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 25 AND 34 THEN 2
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 35 AND 44 THEN 3
        WHEN DATE_PART('year', AGE(p.date_of_birth)) BETWEEN 45 AND 54 THEN 4
        ELSE 5
      END AS sort_order,
      COUNT(*) AS cnt
    FROM public.referrals r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.promo_code_id = v_promo_code.id
    GROUP BY 1, 2
  ) a;

  RETURN json_build_object('success', true, 'gender', v_gender, 'age_groups', v_age);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_influencer_lead_demographics(text, text) TO authenticated, anon;

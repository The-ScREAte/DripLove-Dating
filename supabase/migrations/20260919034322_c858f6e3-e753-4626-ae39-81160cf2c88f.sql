ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.circle_like_and_usage_batched(
  liker_id_param uuid,
  liked_id_param uuid,
  premium_param boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_limit integer := CASE WHEN premium_param THEN 100 ELSE 20 END;
  v_used integer;
  v_like_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> liker_id_param THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF liker_id_param = liked_id_param THEN
    RAISE EXCEPTION 'You cannot like your own profile';
  END IF;

  INSERT INTO public.user_usage (user_id, date, circle_likes_used)
  VALUES (liker_id_param, CURRENT_DATE, 0)
  ON CONFLICT (user_id, date) DO NOTHING;

  SELECT circle_likes_used
  INTO v_used
  FROM public.user_usage
  WHERE user_id = liker_id_param AND date = CURRENT_DATE
  FOR UPDATE;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'limit_reached', true,
      'current_usage', v_used,
      'limit', v_limit,
      'remaining', 0
    );
  END IF;

  SELECT public.like_and_usage_batched(liker_id_param, liked_id_param, premium_param)
  INTO v_like_result;

  UPDATE public.user_usage
  SET circle_likes_used = circle_likes_used + 1,
      updated_at = now()
  WHERE user_id = liker_id_param AND date = CURRENT_DATE
  RETURNING circle_likes_used INTO v_used;

  RETURN COALESCE(v_like_result, '{}'::jsonb) || jsonb_build_object(
    'success', true,
    'limit_reached', false,
    'current_usage', v_used,
    'limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.circle_like_and_usage_batched(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.circle_like_and_usage_batched(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.circle_like_and_usage_batched(uuid, uuid, boolean) TO service_role;
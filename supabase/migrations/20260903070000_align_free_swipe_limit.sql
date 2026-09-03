-- Align the server-side free daily swipe cap with the client (29), which had
-- drifted out of sync (server still enforced 12). The client is the actual
-- gate today - update_user_usage's own success/limit fields aren't checked by
-- callers - but keeping the two in sync avoids a second silent cap if any
-- caller ever starts trusting this RPC's response again.
CREATE OR REPLACE FUNCTION public.update_user_usage(user_id_param uuid, usage_type text, increment_by integer DEFAULT 1)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_usage INTEGER := 0;
  usage_limit INTEGER := 0;
  subscription_data RECORD;
  result JSON;
BEGIN
  -- Get user subscription info using the existing function
  SELECT * INTO subscription_data
  FROM public.get_user_subscription(user_id_param)
  LIMIT 1;

  -- Set limits based on subscription plan
  IF subscription_data.plan_name = 'premium' THEN
    usage_limit := -1; -- Unlimited for premium
  ELSE
    -- Free plan limits
    CASE usage_type
      WHEN 'swipe' THEN
        usage_limit := 29;
      WHEN 'reverse_dislike' THEN
        usage_limit := 1;
      ELSE
        usage_limit := 0;
    END CASE;
  END IF;

  -- Get current usage for today
  SELECT COALESCE(
    CASE usage_type
      WHEN 'swipe' THEN swipes_used
      WHEN 'reverse_dislike' THEN reverse_dislikes_used
      ELSE 0
    END, 0
  )
  INTO current_usage
  FROM public.user_usage
  WHERE user_id = user_id_param
    AND date = CURRENT_DATE;

  -- If no record exists, current_usage will be NULL, so set to 0
  current_usage := COALESCE(current_usage, 0);

  -- Check if user has exceeded limit (skip check for premium users)
  IF usage_limit != -1 AND (current_usage + increment_by) > usage_limit THEN
    result := json_build_object(
      'success', false,
      'message', 'Daily limit reached. Upgrade to Premium for unlimited access!',
      'current_usage', current_usage,
      'limit', usage_limit
    );
    RETURN result;
  END IF;

  -- Update usage (insert or update)
  INSERT INTO public.user_usage (user_id, date, swipes_used, reverse_dislikes_used)
  VALUES (
    user_id_param,
    CURRENT_DATE,
    CASE WHEN usage_type = 'swipe' THEN increment_by ELSE 0 END,
    CASE WHEN usage_type = 'reverse_dislike' THEN increment_by ELSE 0 END
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    swipes_used = CASE
      WHEN usage_type = 'swipe' THEN public.user_usage.swipes_used + increment_by
      ELSE public.user_usage.swipes_used
    END,
    reverse_dislikes_used = CASE
      WHEN usage_type = 'reverse_dislike' THEN public.user_usage.reverse_dislikes_used + increment_by
      ELSE public.user_usage.reverse_dislikes_used
    END,
    updated_at = NOW();

  -- Get updated usage
  SELECT COALESCE(
    CASE usage_type
      WHEN 'swipe' THEN swipes_used
      WHEN 'reverse_dislike' THEN reverse_dislikes_used
      ELSE 0
    END, 0
  )
  INTO current_usage
  FROM public.user_usage
  WHERE user_id = user_id_param
    AND date = CURRENT_DATE;

  result := json_build_object(
    'success', true,
    'message', 'Usage updated successfully',
    'current_usage', current_usage,
    'limit', usage_limit
  );

  RETURN result;
END;
$function$;

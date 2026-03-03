-- CRITICAL SECURITY FIX: Continue fixing remaining database functions with SET search_path

-- Fix calculate_distance function
CREATE OR REPLACE FUNCTION public.calculate_distance(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
BEGIN
    RETURN (
        6371 * acos(
            cos(radians(lat1)) * 
            cos(radians(lat2)) * 
            cos(radians(lon2) - radians(lon1)) + 
            sin(radians(lat1)) * 
            sin(radians(lat2))
        )
    );
END;
$function$;

-- Fix increment_unread_count function
CREATE OR REPLACE FUNCTION public.increment_unread_count(match_id_input uuid, field_name text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
declare
  query text;
begin
  query := format('
    update public.matches
    set %I = coalesce(%I, 0) + 1
    where id = $1
  ', field_name, field_name);

  execute query using match_id_input;
end;
$function$;

-- Fix find_matches_by_location function
CREATE OR REPLACE FUNCTION public.find_matches_by_location(user_id uuid, max_distance_km integer DEFAULT NULL::integer)
RETURNS TABLE(profile_id uuid, distance_km numeric, city character varying, country_code character varying)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    user_lat DECIMAL;
    user_lon DECIMAL;
    user_max_dist INTEGER;
    search_distance INTEGER;
BEGIN
    -- Get user's location and preferences
    SELECT latitude, longitude, max_distance 
    INTO user_lat, user_lon, user_max_dist
    FROM public.profiles 
    WHERE id = user_id;
    
    -- Use provided distance or user's preference
    search_distance := COALESCE(max_distance_km, user_max_dist, 50);
    
    -- Return matches within distance (if coordinates available)
    IF user_lat IS NOT NULL AND user_lon IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            p.id,
            public.calculate_distance(user_lat, user_lon, p.latitude, p.longitude) as distance_km,
            p.city,
            p.country_code
        FROM public.profiles p
        WHERE 
            p.id != user_id
            AND p.latitude IS NOT NULL 
            AND p.longitude IS NOT NULL
            AND public.calculate_distance(user_lat, user_lon, p.latitude, p.longitude) <= search_distance
        ORDER BY distance_km;
    ELSE
        -- Fallback to city/country matching if no coordinates
        RETURN QUERY
        SELECT 
            p.id,
            999.0 as distance_km, -- Placeholder distance
            p.city,
            p.country_code
        FROM public.profiles p
        WHERE 
            p.id != user_id
            AND p.country_code = (SELECT country_code FROM public.profiles WHERE id = user_id)
        ORDER BY 
            CASE WHEN p.city = (SELECT city FROM public.profiles WHERE id = user_id) THEN 1 ELSE 2 END,
            p.created_at DESC;
    END IF;
END;
$function$;

-- Fix update_last_message_time function
CREATE OR REPLACE FUNCTION public.update_last_message_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- Update the last_msg_at timestamp in matches table
  UPDATE public.matches 
  SET last_msg_at = NEW.created_at
  WHERE id = NEW.match_id;
  
  RETURN NEW;
END;
$function$;

-- Fix approve_image function
CREATE OR REPLACE FUNCTION public.approve_image(image_id uuid, admin_notes text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update image status
  UPDATE public.user_images 
  SET 
    is_approved = true,
    moderation_status = 'approved',
    moderation_notes = admin_notes,
    moderated_by = auth.uid(),
    moderated_at = now()
  WHERE id = image_id;
  
  RETURN true;
END;
$function$;

-- Fix handle_subscription_payment function
CREATE OR REPLACE FUNCTION public.handle_subscription_payment(p_user_id uuid, p_transaction_id text, p_amount numeric, p_currency text DEFAULT 'GHS'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_subscription_id UUID;
  v_next_billing_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate next billing date (30 days from now)
  v_next_billing_date := NOW() + INTERVAL '30 days';
  
  -- Check if user already has a subscription
  SELECT id INTO v_subscription_id
  FROM public.user_subscriptions
  WHERE user_id = p_user_id;
  
  IF v_subscription_id IS NOT NULL THEN
    -- Update existing subscription
    UPDATE public.user_subscriptions
    SET 
      plan_name = 'premium',
      status = 'active',
      starts_at = NOW(),
      expires_at = v_next_billing_date,
      next_billing_date = v_next_billing_date,
      flutterwave_transaction_id = p_transaction_id,
      auto_renew = true,
      country = 'GH',
      payment_method = 'momo',
      updated_at = NOW()
    WHERE id = v_subscription_id;
  ELSE
    -- Create new subscription
    INSERT INTO public.user_subscriptions (
      user_id,
      plan_name,
      status,
      starts_at,
      expires_at,
      next_billing_date,
      flutterwave_transaction_id,
      auto_renew,
      country,
      payment_method
    ) VALUES (
      p_user_id,
      'premium',
      'active',
      NOW(),
      v_next_billing_date,
      v_next_billing_date,
      p_transaction_id,
      true,
      'GH',
      'momo'
    );
  END IF;
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$function$;

-- Fix reject_image function
CREATE OR REPLACE FUNCTION public.reject_image(image_id uuid, admin_notes text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Delete the image completely instead of just marking as rejected
  DELETE FROM public.user_images 
  WHERE id = image_id;
  
  RETURN true;
END;
$function$;

-- Fix update_push_tokens_updated_at function
CREATE OR REPLACE FUNCTION public.update_push_tokens_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix check_subscription_expiry function
CREATE OR REPLACE FUNCTION public.check_subscription_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- If subscription has expired and auto_renew is false, set status to expired
  IF NEW.expires_at <= NOW() AND NEW.auto_renew = false THEN
    NEW.status = 'expired';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix get_user_subscription function
CREATE OR REPLACE FUNCTION public.get_user_subscription(user_id_param uuid)
RETURNS TABLE(plan_name text, status text, expires_at timestamp with time zone, next_billing_date timestamp with time zone, auto_renew boolean, features jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(us.plan_name, 'free') as plan_name,
    COALESCE(us.status, 'active') as status,
    us.expires_at,
    us.next_billing_date,
    COALESCE(us.auto_renew, false) as auto_renew,
    sp.features
  FROM public.user_subscriptions us
  RIGHT JOIN public.subscription_plans sp ON sp.name = COALESCE(us.plan_name, 'free')
  WHERE us.user_id = user_id_param OR us.user_id IS NULL
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$function$;

-- Fix admin_create_match function
CREATE OR REPLACE FUNCTION public.admin_create_match(user1_id uuid, user2_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Create the match
  INSERT INTO public.matches (user1_id, user2_id)
  VALUES (
    LEAST(user1_id, user2_id),
    GREATEST(user1_id, user2_id)
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;
  
  -- Log the admin action
  INSERT INTO public.admin_actions (admin_id, action_type, target_user_id, target_user_id_2)
  VALUES (auth.uid(), 'match', user1_id, user2_id);
END;
$function$;

-- Fix admin_update_account_status function
CREATE OR REPLACE FUNCTION public.admin_update_account_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update account status
  UPDATE public.profiles 
  SET account_status = new_status 
  WHERE id = target_user_id;
  
  -- Log the admin action
  INSERT INTO public.admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (auth.uid(), new_status, target_user_id, json_build_object('previous_status', 'active'));
END;
$function$;

-- Fix create_admin_user function
CREATE OR REPLACE FUNCTION public.create_admin_user(admin_email text, admin_password text, admin_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_user_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- This function would need to be called from an edge function
  -- since we can't create auth users directly from SQL
  RAISE EXCEPTION 'This function should be called via edge function';
END;
$function$;

-- Fix test_subscription_info function
CREATE OR REPLACE FUNCTION public.test_subscription_info(user_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  subscription_info JSON;
  features_json JSONB;
BEGIN
  -- Get subscription info
  SELECT public.get_user_subscription(user_id_param) INTO subscription_info;
  
  -- Log the subscription info for debugging
  RAISE LOG 'Subscription info: %', subscription_info;
  
  -- Try to extract features
  features_json := subscription_info->'features';
  
  RAISE LOG 'Features: %', features_json;
  
  -- Return the data for inspection
  RETURN json_build_object(
    'subscription_info', subscription_info,
    'features', features_json,
    'daily_swipes', features_json->>'daily_swipes'
  );
END;
$function$;;

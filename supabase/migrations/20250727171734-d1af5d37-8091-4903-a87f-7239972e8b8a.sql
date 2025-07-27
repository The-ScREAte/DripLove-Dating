-- CRITICAL SECURITY FIX: Enable RLS on passes table
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for passes table
CREATE POLICY "Users can view their own passes" ON public.passes
FOR SELECT
USING (auth.uid() = passer_id);

CREATE POLICY "Users can create their own passes" ON public.passes
FOR INSERT
WITH CHECK (auth.uid() = passer_id);

-- CRITICAL SECURITY FIX: Add SET search_path to all database functions to prevent SQL injection

-- Fix create_default_subscription function
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_name)
  VALUES (NEW.id, 'free');
  RETURN NEW;
END;
$function$;

-- Fix update_payment_config_updated_at function
CREATE OR REPLACE FUNCTION public.update_payment_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix create_match_on_mutual_like function
CREATE OR REPLACE FUNCTION public.create_match_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- Check if the liked user has already liked the liker
  IF EXISTS (
    SELECT 1 FROM public.likes 
    WHERE liker_id = NEW.liked_id AND liked_id = NEW.liker_id
  ) THEN
    -- Create a match (ensure consistent ordering)
    INSERT INTO public.matches (user1_id, user2_id)
    VALUES (
      LEAST(NEW.liker_id, NEW.liked_id),
      GREATEST(NEW.liker_id, NEW.liked_id)
    )
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix update_unread_count function
CREATE OR REPLACE FUNCTION public.update_unread_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- Update unread count for the receiver
  UPDATE public.matches 
  SET 
    user1_unread_count = CASE 
      WHEN user1_id != NEW.sender_id THEN user1_unread_count + 1 
      ELSE user1_unread_count 
    END,
    user2_unread_count = CASE 
      WHEN user2_id != NEW.sender_id THEN user2_unread_count + 1 
      ELSE user2_unread_count 
    END
  WHERE id = NEW.match_id;
  
  RETURN NEW;
END;
$function$;

-- Fix delete_user_and_data function
CREATE OR REPLACE FUNCTION public.delete_user_and_data(user_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
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

-- Fix update_user_usage function
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
        usage_limit := 12;
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

-- Fix create_message_notification function
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  receiver_id UUID;
  sender_name TEXT;
BEGIN
  -- Get the receiver (the other user in the match)
  SELECT CASE 
    WHEN m.user1_id = NEW.sender_id THEN m.user2_id 
    ELSE m.user1_id 
  END INTO receiver_id
  FROM public.matches m 
  WHERE m.id = NEW.match_id;
  
  -- Get sender name
  SELECT CONCAT(first_name, ' ', last_name) INTO sender_name
  FROM public.profiles 
  WHERE id = NEW.sender_id;
  
  -- Create notification for receiver
  INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
  VALUES (
    receiver_id, 
    'message', 
    'New Message', 
    sender_name || ' sent you a message',
    NEW.sender_id
  );
  
  RETURN NEW;
END;
$function$;

-- Fix delete_old_messages function
CREATE OR REPLACE FUNCTION public.delete_old_messages()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.chats 
  WHERE created_at < NOW() - INTERVAL '36 hours';
END;
$function$;

-- Fix get_app_stats function
CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'active'),
    'total_matches', (SELECT COUNT(*) FROM public.matches),
    'total_likes', (SELECT COUNT(*) FROM public.likes),
    'total_blocks', (SELECT COUNT(*) FROM public.blocks),
    'total_messages', (SELECT COUNT(*) FROM public.chats),
    'active_users_today', (
      SELECT COUNT(DISTINCT sender_id) 
      FROM public.chats 
      WHERE created_at >= CURRENT_DATE
    ),
    'new_users_this_week', (
      SELECT COUNT(*) 
      FROM public.profiles 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      AND account_status = 'active'
    ),
    'matches_this_week', (
      SELECT COUNT(*) 
      FROM public.matches 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'blocked_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'blocked'),
    'users_on_hold', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'on_hold'),
    'total_admins', (SELECT COUNT(*) FROM public.profiles WHERE is_admin = TRUE)
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, first_name, last_name, email, date_of_birth, country, city, zip_code,
    gender, preference, relationship_intent, occupation, industry, education_level,
    interests, account_status
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email,
    (NEW.raw_user_meta_data->>'date_of_birth')::date,
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'zip_code',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'preference',
    NEW.raw_user_meta_data->>'relationship_intent',
    NEW.raw_user_meta_data->>'occupation',
    NEW.raw_user_meta_data->>'industry',
    NEW.raw_user_meta_data->>'education_level',
    '{}',
    'active'
  );
  RETURN NEW;
END;
$function$;
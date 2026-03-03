-- Create table to track all-time premium users (historical tracking)
CREATE TABLE IF NOT EXISTS public.premium_users_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  first_premium_at timestamp with time zone NOT NULL DEFAULT now(),
  last_premium_at timestamp with time zone NOT NULL DEFAULT now(),
  total_subscription_count integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.premium_users_history ENABLE ROW LEVEL SECURITY;

-- Only admins can view this table
CREATE POLICY "Admins can manage premium history" ON public.premium_users_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Create function to record premium subscription (called when user becomes premium)
CREATE OR REPLACE FUNCTION public.record_premium_subscription(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.premium_users_history (user_id, first_premium_at, last_premium_at, total_subscription_count)
  VALUES (p_user_id, now(), now(), 1)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    last_premium_at = now(),
    total_subscription_count = premium_users_history.total_subscription_count + 1;
END;
$$;

-- Create function to get all-time premium count
CREATE OR REPLACE FUNCTION public.get_all_time_premium_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (SELECT COUNT(*)::integer FROM public.premium_users_history);
END;
$$;

-- Trigger to record when a subscription becomes premium
CREATE OR REPLACE FUNCTION public.trigger_record_premium()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only record when plan_name becomes 'premium' and status is 'active'
  IF NEW.plan_name = 'premium' AND NEW.status = 'active' THEN
    -- Check if this is a new premium subscription (not already premium)
    IF OLD IS NULL OR OLD.plan_name != 'premium' OR OLD.status != 'active' THEN
      PERFORM public.record_premium_subscription(NEW.user_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on user_subscriptions
DROP TRIGGER IF EXISTS on_premium_subscription ON public.user_subscriptions;
CREATE TRIGGER on_premium_subscription
  AFTER INSERT OR UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_record_premium();

-- Backfill existing premium users into history
INSERT INTO public.premium_users_history (user_id, first_premium_at, last_premium_at, total_subscription_count)
SELECT DISTINCT 
  sp.user_id,
  COALESCE(us.starts_at, us.created_at, now()),
  COALESCE(us.updated_at, now()),
  1
FROM public.subscription_payments sp
JOIN public.user_subscriptions us ON sp.user_id = us.user_id
WHERE us.plan_name = 'premium'
ON CONFLICT (user_id) DO NOTHING;;


-- Create subscription plans table
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  features JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default plans
INSERT INTO public.subscription_plans (name, price, currency, features) VALUES
('free', 0.00, 'USD', '{"daily_swipes": 12, "reverse_dislikes": 2, "liked_me_visible": 1}'),
('premium', 9.99, 'USD', '{"daily_swipes": -1, "reverse_dislikes": -1, "liked_me_visible": -1}');

-- Create user subscriptions table
CREATE TABLE public.user_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL REFERENCES subscription_plans(name),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  flutterwave_transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user usage tracking table
CREATE TABLE public.user_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  swipes_used INTEGER NOT NULL DEFAULT 0,
  reverse_dislikes_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Add RLS policies for subscription tables
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

-- Policies for subscription_plans (publicly readable)
CREATE POLICY "Anyone can view subscription plans" 
  ON public.subscription_plans 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- Policies for user_subscriptions
CREATE POLICY "Users can view their own subscription" 
  ON public.user_subscriptions 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscription" 
  ON public.user_subscriptions 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription" 
  ON public.user_subscriptions 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Policies for user_usage
CREATE POLICY "Users can view their own usage" 
  ON public.user_usage 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage" 
  ON public.user_usage 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage" 
  ON public.user_usage 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Function to create default free subscription for new users
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_name)
  VALUES (NEW.id, 'free');
  RETURN NEW;
END;
$$;

-- Trigger to create default subscription when profile is created
CREATE TRIGGER on_profile_created_subscription
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_subscription();

-- Function to get user's current subscription with features
CREATE OR REPLACE FUNCTION public.get_user_subscription(user_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'plan_name', us.plan_name,
    'status', us.status,
    'expires_at', us.expires_at,
    'features', sp.features
  ) INTO result
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON us.plan_name = sp.name
  WHERE us.user_id = user_id_param
    AND us.status = 'active'
    AND (us.expires_at IS NULL OR us.expires_at > now())
  ORDER BY us.created_at DESC
  LIMIT 1;
  
  IF result IS NULL THEN
    -- Return free plan as default
    SELECT json_build_object(
      'plan_name', 'free',
      'status', 'active',
      'expires_at', NULL,
      'features', features
    ) INTO result
    FROM public.subscription_plans
    WHERE name = 'free';
  END IF;
  
  RETURN result;
END;
$$;

-- Function to check and update user usage
CREATE OR REPLACE FUNCTION public.update_user_usage(
  user_id_param UUID,
  usage_type TEXT,
  increment_by INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_usage RECORD;
  subscription_info JSON;
  daily_limit INTEGER;
  current_count INTEGER;
BEGIN
  -- Get current subscription info
  SELECT public.get_user_subscription(user_id_param) INTO subscription_info;
  
  -- Get or create today's usage record
  INSERT INTO public.user_usage (user_id, date, swipes_used, reverse_dislikes_used)
  VALUES (user_id_param, CURRENT_DATE, 0, 0)
  ON CONFLICT (user_id, date) DO NOTHING;
  
  -- Get current usage
  SELECT * INTO current_usage
  FROM public.user_usage
  WHERE user_id = user_id_param AND date = CURRENT_DATE;
  
  -- Check limits based on usage type
  IF usage_type = 'swipe' THEN
    daily_limit := (subscription_info->>'features')::jsonb->>'daily_swipes';
    current_count := current_usage.swipes_used;
    
    -- -1 means unlimited for premium
    IF daily_limit != -1 AND current_count >= daily_limit THEN
      RETURN json_build_object(
        'success', false, 
        'message', 'Daily swipe limit reached',
        'current_usage', current_count,
        'limit', daily_limit
      );
    END IF;
    
    -- Update swipes
    UPDATE public.user_usage 
    SET swipes_used = swipes_used + increment_by, updated_at = now()
    WHERE user_id = user_id_param AND date = CURRENT_DATE;
    
  ELSIF usage_type = 'reverse_dislike' THEN
    daily_limit := (subscription_info->>'features')::jsonb->>'reverse_dislikes';
    current_count := current_usage.reverse_dislikes_used;
    
    IF daily_limit != -1 AND current_count >= daily_limit THEN
      RETURN json_build_object(
        'success', false, 
        'message', 'Daily reverse dislike limit reached',
        'current_usage', current_count,
        'limit', daily_limit
      );
    END IF;
    
    -- Update reverse dislikes
    UPDATE public.user_usage 
    SET reverse_dislikes_used = reverse_dislikes_used + increment_by, updated_at = now()
    WHERE user_id = user_id_param AND date = CURRENT_DATE;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'current_usage', current_count + increment_by,
    'limit', daily_limit
  );
END;
$$;
;

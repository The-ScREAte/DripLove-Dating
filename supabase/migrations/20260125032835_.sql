
-- Fix user who was wrongly expired despite having future expires_at
UPDATE public.user_subscriptions
SET 
  plan_name = 'premium',
  status = 'active',
  updated_at = NOW()
WHERE user_id = 'f40ebc70-7bfe-4ae2-b95e-f32833b77590'
  AND expires_at > NOW();
;

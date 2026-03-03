-- Add unique constraint on user_id for user_subscriptions table
-- This ensures each user can only have one subscription record
ALTER TABLE public.user_subscriptions
ADD CONSTRAINT user_subscriptions_user_id_unique UNIQUE (user_id);;

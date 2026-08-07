-- Rating funnel: profile visibility boost + internal feedback capture

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visibility_boost_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visibility_boost_multiplier NUMERIC DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'rating_funnel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feedback" ON public.app_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own feedback" ON public.app_feedback
  FOR SELECT USING (auth.uid() = user_id);

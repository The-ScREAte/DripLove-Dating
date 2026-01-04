-- Add Paystack mode setting (test/live toggle)
INSERT INTO public.app_settings (id, value) 
VALUES ('paystack_mode', '{"mode": "test"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Create trigger function to automatically create referral when user signs up with a promo code
CREATE OR REPLACE FUNCTION public.create_referral_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  promo_record RECORD;
BEGIN
  -- Only process if promo_code_used is set
  IF NEW.promo_code_used IS NOT NULL AND NEW.promo_code_used != '' THEN
    -- Find the promo code
    SELECT * INTO promo_record
    FROM public.promo_codes
    WHERE UPPER(code) = UPPER(NEW.promo_code_used)
      AND is_active = true
      AND status = 'active'
      AND deleted_at IS NULL
    LIMIT 1;
    
    IF FOUND THEN
      -- Create referral record (ignore if already exists)
      INSERT INTO public.referrals (user_id, promo_code_id)
      VALUES (NEW.id, promo_record.id)
      ON CONFLICT (user_id) DO NOTHING;
      
      -- Update total_signups on promo_codes
      UPDATE public.promo_codes
      SET total_signups = COALESCE(total_signups, 0) + 1,
          updated_at = NOW()
      WHERE id = promo_record.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table for new signups
DROP TRIGGER IF EXISTS trigger_create_referral_on_signup ON public.profiles;
CREATE TRIGGER trigger_create_referral_on_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_referral_on_signup();

-- Also create trigger for when promo_code_used is updated (in case it wasn't set during initial insert)
DROP TRIGGER IF EXISTS trigger_create_referral_on_update ON public.profiles;
CREATE TRIGGER trigger_create_referral_on_update
  AFTER UPDATE OF promo_code_used ON public.profiles
  FOR EACH ROW
  WHEN (OLD.promo_code_used IS DISTINCT FROM NEW.promo_code_used AND NEW.promo_code_used IS NOT NULL AND NEW.promo_code_used != '')
  EXECUTE FUNCTION public.create_referral_on_signup();

-- Create trigger to keep total_signups accurate when referrals are deleted
CREATE OR REPLACE FUNCTION public.update_promo_code_signups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.promo_codes
    SET total_signups = GREATEST(COALESCE(total_signups, 0) - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.promo_code_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_promo_code_signups ON public.referrals;
CREATE TRIGGER trigger_update_promo_code_signups
  AFTER DELETE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_promo_code_signups();
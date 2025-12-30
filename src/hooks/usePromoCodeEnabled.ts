import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PromoCodeSetting {
  enabled: boolean;
}

export const usePromoCodeEnabled = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('id', 'promo_code_enabled')
          .single();

        if (error) {
          // Default to disabled if setting doesn't exist
          setIsEnabled(false);
        } else {
          const setting = data?.value as unknown as PromoCodeSetting;
          setIsEnabled(setting?.enabled ?? false);
        }
      } catch (err) {
        setIsEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    fetchSetting();
  }, []);

  return { isEnabled, loading };
};

export const togglePromoCodeEnabled = async (enabled: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        id: 'promo_code_enabled',
        value: { enabled },
        updated_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
    return true;
  } catch (err) {
    return false;
  }
};

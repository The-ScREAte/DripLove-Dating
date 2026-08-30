import { supabase } from '@/integrations/supabase/client';

// Mirrors getPaystackPublicKey in PaystackPaymentModal.tsx - reads the
// stripe_mode row from app_settings (toggled in Admin > Ads Management)
// to decide which of the two bundled publishable keys to actually use.
export const getStripePublishableKey = async (): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('id', 'stripe_mode')
      .single();

    if (error || !data) {
      console.warn('Failed to fetch stripe_mode, defaulting to test key');
      return (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST as string | undefined) || '';
    }

    const mode = (data.value as { mode?: string })?.mode || 'test';
    const key = mode === 'live'
      ? (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_LIVE as string | undefined)
      : (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST as string | undefined);

    if (!key) {
      console.warn(`Missing VITE_STRIPE_PUBLISHABLE_KEY_${mode.toUpperCase()}, falling back to test key`);
      return (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST as string | undefined) || '';
    }

    return key;
  } catch (err) {
    console.error('Error fetching Stripe mode:', err);
    return (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST as string | undefined) || '';
  }
};

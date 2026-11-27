import { supabase } from '@/integrations/supabase/client';

export type EmailAccountKind = 'free' | 'email' | 'google' | 'apple' | 'unknown';

/**
 * Does this email already have a DripLove account, and how does it sign in? Uses the same public
 * `check-auth-provider` function the Forgot Password screen uses. Fails OPEN ('unknown') on any error so a
 * network hiccup never blocks sign-up - the final sign-up call still reports a taken email.
 */
export async function checkEmailAccount(email: string): Promise<EmailAccountKind> {
  try {
    const { data, error } = await supabase.functions.invoke('check-auth-provider', { body: { email: email.trim().toLowerCase() } });
    if (error || !data || (data as { error?: string }).error) return 'unknown';
    const providers: string[] = (data as { providers?: string[] }).providers || [];
    if (providers.length === 0) return 'free';
    if (providers.includes('email')) return 'email';
    if (providers.includes('google')) return 'google';
    if (providers.includes('apple')) return 'apple';
    return 'email';
  } catch {
    return 'unknown';
  }
}
